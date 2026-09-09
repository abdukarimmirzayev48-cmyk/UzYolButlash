from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from shutil import copyfileobj
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.api.inventory import link_stock_allocation_to_batch, mark_stock_delivered_for_batch, mark_stock_picked_up_for_batch
from backend.app.core.paths import UPLOADS_DIR
from backend.app.models.client import Client
from backend.app.models.contract import Contract
from backend.app.models.delivery import (
    BatchStatus,
    BatchDocumentType,
    DeliveryBatch,
    DeliveryBatchDocument,
    DeliveryBatchItem,
    DeliveryBatchNote,
    Logistics,
    LogisticsDocument,
    LogisticsNote,
    LogisticsStatus,
    PaidBy,
)
from backend.app.models.finance import CustomerInvoice
from backend.app.models.inventory import StockAllocation
from backend.app.models.user import User
from backend.app.models.order import FulfillmentType, Order, OrderItem
from backend.app.models.transport import Transport, TransportEvent, TransportEventCheckResult, TransportEventType, UNAVAILABLE_STATUSES
from backend.app.services import delivery_stats
from backend.app.services import fuel_watch
from backend.app.services import delivery_method as delivery_method_service
from backend.app.api.transports import live_payload as transport_live_payload
from backend.app.api.transports import transports_live
from backend.app.services import point_distance
from backend.app.services import smn
from backend.app.services import track_distance
from backend.app.services import transport_choice
from backend.app.services import trip_completion_check
from backend.app.services.delivery_method import default_method_for
from backend.app.services.auth import get_current_user, require_edit
from backend.app.services.order_status import sync_order_status
from backend.app.services.telegram_bot import notify_driver_of_trip
from backend.app.services.product_summary import product_summary
from backend.app.services import batch_difference, batch_transport_check, logistics_cargo, logistics_fuel, logistics_timeline, transport_events
from backend.app.schemas.client import Page
from backend.app.schemas.delivery import (
    DeliveryBatchAcceptanceConfirm,
    DeliveryBatchCreate,
    DeliveryBatchCompletionConfirm,
    DeliveryBatchDeliveryConfirm,
    DeliveryBatchDetail,
    DeliveryBatchDifferenceRead,
    DeliveryBatchDocumentCreate,
    DeliveryBatchDocumentRead,
    DeliveryBatchDocumentUpdate,
    DeliveryBatchItemCreate,
    DeliveryBatchItemRead,
    DeliveryBatchItemUpdate,
    DeliveryBatchListItem,
    DeliveryBatchLoadingConfirm,
    DeliveryBatchNoteCreate,
    DeliveryBatchNoteRead,
    DeliveryBatchNoteUpdate,
    DeliveryBatchSummary,
    DeliveryBatchTransportCheck,
    DeliveryBatchUpdate,
    LogisticsCreate,
    LogisticsDetail,
    LogisticsDocumentCreate,
    LogisticsDocumentRead,
    LogisticsDocumentUpdate,
    LogisticsListItem,
    LogisticsNoteCreate,
    LogisticsNoteRead,
    LogisticsNoteUpdate,
    LogisticsRead,
    LogisticsUpdate,
    OrderItemBatchBalance,
)


router = APIRouter(prefix="/api/delivery-batches", tags=["delivery-batches"])
logistics_router = APIRouter(prefix="/api/logistics", tags=["logistics"])
overview_router = APIRouter(prefix="/api/delivery", tags=["delivery-overview"])


@overview_router.get("/overview")
def delivery_overview(
    db: Session = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
    client_id: int | None = None,
    route: str | None = None,
):
    """Everything the Yetkazib berish section is responsible for, in one call.

    Batches carry their items and logistics record, so the quantities, the trip
    status and the truck all come from the same objects the detail pages show.
    client_id/route narrow the whole page; the date range narrows only the
    results (see delivery_stats).
    """
    batches = list(
        db.scalars(
            select(DeliveryBatch).options(
                selectinload(DeliveryBatch.items),
                selectinload(DeliveryBatch.trips),
                selectinload(DeliveryBatch.client),
                selectinload(DeliveryBatch.order),
            )
        ).all()
    )
    options = delivery_stats.filter_options(batches)
    if client_id:
        batches = [b for b in batches if b.client_id == client_id]
    if route:
        batches = [b for b in batches if b.logistics and b.logistics.route_name == route]

    transports = list(
        db.scalars(
            select(Transport).options(selectinload(Transport.driver), selectinload(Transport.check_ins))
        ).all()
    )
    data = delivery_stats.build_overview(batches, transports, date_from=date_from, date_to=date_to)
    data["filter_options"] = options
    return data
UPLOAD_DIR = UPLOADS_DIR / "delivery-batches"
QTY = Decimal("0.001")
MANUAL_LOGISTICS_STATUSES = {
    LogisticsStatus.issue,
    LogisticsStatus.cancelled,
    LogisticsStatus.in_transit,
    LogisticsStatus.unloading,
    LogisticsStatus.completed,
}


def qty(value: Decimal | None) -> Decimal:
    return Decimal(value or 0).quantize(QTY)


def money(value: Decimal | float | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def blank(value: str | None) -> bool:
    return value is None or str(value).strip() == ""


def generate_logistics_number(batch: DeliveryBatch) -> str:
    if batch.batch_number.startswith("BAT-"):
        return batch.batch_number.replace("BAT-", "LOG-", 1)
    return f"LOG-{batch.batch_number}"


def unique_logistics_number(db: Session, batch: DeliveryBatch) -> str:
    base = generate_logistics_number(batch)
    if not db.scalar(select(Logistics.id).where(Logistics.logistics_number == base)):
        return base
    counter = 2
    while db.scalar(select(Logistics.id).where(Logistics.logistics_number == f"{base}-{counter}")):
        counter += 1
    return f"{base}-{counter}"


def apply_delivery_point_address(db: Session, batch: DeliveryBatch, logistics: Logistics) -> None:
    """Nuqta ko'rsatilgan bo'lsa, yetkazish manzili o'shandan.

    Manzil avval mijoz kartochkasidan to'ldirilgan bo'lishi mumkin -- u
    ko'pincha yuridik manzil, ya'ni haydovchi bormaydigan joy. Nuqta
    tanlangach u ustun turadi va manzil qayta yoziladi.
    """
    address = delivery_point_address(db, batch.delivery_point_id)
    if address:
        logistics.delivery_address = address
    # Yuklash tomoni ham xuddi shunday: nuqta tanlangan bo'lsa, manzil
    # ma'lumotnomadan olinadi va ta'minotchi kartochkasidagi erkin matn
    # ustidan yoziladi.
    loading = delivery_point_address(db, batch.loading_point_id)
    if loading:
        logistics.loading_address = loading
    apply_planned_distance(db, batch, logistics)


def apply_planned_distance(db: Session, batch: DeliveryBatch, logistics: Logistics) -> None:
    """Ikki nuqta orasidagi masofani o'lchab, reja masofasiga yozadi.

    Reja masofasi qo'lda yozilardi va odatda bo'sh qolardi, holbuki yoqilg'i
    hisobida «rejadan ortiq yurilgan» aynan shunga solishtiriladi. Qo'lda
    kiritilgan qiymat ustun turadi: o'lchov taxminiy, operator bilgani aniq.
    """
    if logistics.planned_distance_km is not None:
        return
    from backend.app.models.delivery_point import DeliveryPoint

    origin = db.get(DeliveryPoint, batch.loading_point_id) if batch.loading_point_id else None
    destination = db.get(DeliveryPoint, batch.delivery_point_id) if batch.delivery_point_id else None
    measured = point_distance.between_points(origin, destination)
    if measured["road_km"] is not None:
        logistics.planned_distance_km = measured["road_km"]


def delivery_point_address(db: Session, point_id: int | None) -> str | None:
    """ABZ nuqtasining to'liq manzili -- mas'ul va telefoni bilan.

    Haydovchiga «Buxoro viloyati» degan manzil yetmaydi: u yerga borgach
    kimni topishini ham bilishi kerak.
    """
    if not point_id:
        return None
    from backend.app.api.delivery_points import full_address_of
    from backend.app.models.delivery_point import DeliveryPoint

    point = db.get(DeliveryPoint, point_id)
    if not point:
        return None
    parts = [point.name, full_address_of(point)]
    contact = ", ".join(part for part in (point.responsible_name, point.responsible_phone) if part)
    if contact:
        parts.append(contact)
    return " · ".join(part for part in parts if part) or None


# Yuklash va yetkazish manzili faqat nuqta ma'lumotnomasidan olinadi.
#
# Ilgari nuqta bo'lmasa manzil mijoz yoki ta'minotchi kartochkasidan
# to'ldirilardi. U esa yuridik manzil -- haydovchi bormaydigan joy, va
# ko'pincha butunlay boshqa viloyatda. Ishlab chiqarishda 41 ta reysdan
# 39 tasining ikkala manzili ham aynan shu yo'l bilan yozilgan edi.
#
# Mijoz bilan bog'liqlik nuqtaning o'zida turadi: ABZ yoki stansiya
# mijozga biriktiriladi (`DeliveryPoint.client_id`), ya'ni bog'lanish
# manzil matni orqali emas, ma'lumotnoma orqali bo'ladi.


MSG_TIMELINE_ORDER = "Reys vaqtlari ketma-ketligi buzilgan: keyingi nuqta oldingisidan erta bo'lishi mumkin emas."
MSG_TRANSPORT_NOT_FOUND = "Tanlangan mashina topilmadi."
MSG_TRANSPORT_UNAVAILABLE = "Mashina hozir yo'lga chiqa olmaydi"

# Yetkazib berish modeli endi haqiqiy qoida, shunchaki yorliq emas.
#
# Ilgari model faqat bitta narsani qilardi -- buyurtmadagi logistika
# narxini nolga tushirardi. Qolgan hamma joyda ikkala model bir xil
# ishlardi: har qanday partiyaga to'liq logistika yozuvi ochilardi va
# istalganiga o'z mashinamizni biriktirsa bo'lardi. Natijada 26 ta
# «ta'minotchi yetkazadi» partiyasidan 23 tasiga o'z transportimiz
# biriktirilgan edi -- ya'ni yozuv bir narsani, amaldagi ish boshqa
# narsani ko'rsatardi.
#
# Endi model transportni belgilaydi: ta'minotchi yetkazadigan partiyaga
# mashina biriktirilmaydi. O'zimiz tashiydigan bo'lsak, avval model
# to'g'rilanadi -- shunda hujjat ham, hisob ham haqiqatga mos keladi.
MSG_DIRECT_NO_TRANSPORT = (
    "Bu import buyurtmasi: mol ta'minotchidan mijozga to'g'ridan-to'g'ri "
    "boradi va unga transport biriktirilmaydi. O'zimiz tashiydigan "
    "bo'lsak, buyurtmada manbani «Mahalliy ta'minotchidan» qiling."
)


def guard_transport_model(batch: DeliveryBatch | None, transport_id) -> None:
    """Ta'minotchi yetkazadigan partiyaga o'z mashinamiz biriktirilmaydi."""
    if transport_id and not is_company_managed(batch):
        raise HTTPException(status_code=422, detail=MSG_DIRECT_NO_TRANSPORT)


def guard_transport_available(db: Session, transport_id) -> None:
    """Ta'mirdagi yoki faol bo'lmagan mashinaga reys berilmaydi.

    Xabar allaqachon yozilgan edi (`MSG_TRANSPORT_UNAVAILABLE`), lekin
    hech qayerda tekshirilmasdi -- ya'ni ta'mirda turgan mashinani reysga
    chiqarib yuborish mumkin edi.
    """
    if not transport_id:
        return
    transport = db.get(Transport, transport_id)
    if not transport:
        raise HTTPException(status_code=422, detail=MSG_TRANSPORT_NOT_FOUND)
    if transport.status in UNAVAILABLE_STATUSES:
        label = transport_choice.MSG_UNAVAILABLE.get(transport.status, transport.status.value)
        raise HTTPException(
            status_code=422,
            detail=f"{MSG_TRANSPORT_UNAVAILABLE}: {label}",
        )


def is_company_managed(batch: DeliveryBatch | None) -> bool:
    """Partiyani o'zimiz tashiymizmi.

    Model partiyada saqlanadi (buyurtmadan meros bo'lib tushadi), chunki
    bitta buyurtmaning bir partiyasini o'zimiz, ikkinchisini ta'minotchi
    yetkazishi mumkin.
    """
    return bool(batch) and batch.fulfillment_type == FulfillmentType.company_managed_delivery.value


def apply_measurements(logistics: Logistics, payload, fields: tuple[str, ...]) -> None:
    """Bosqich oynasida o'lchangan raqamlarni reysga ko'chiradi.

    Faqat yuborilgani yoziladi: bo'sh qoldirilgan maydon avvalgi qiymatni
    o'chirib yubormasligi kerak -- xuddi shu bosqich ikkinchi marta
    ochilganda avval kiritilgani yo'qolardi.
    """
    given = payload.model_dump(exclude_unset=True)
    for name in fields:
        if name in given and given[name] is not None:
            setattr(logistics, name, given[name])


def apply_transport_to_logistics(db: Session, logistics: Logistics, provided: set[str] | None = None) -> None:
    """Mashina tanlangach, raqam va haydovchi shundan to'ldiriladi.

    Bu maydonlarni qo'lda ham yozish mumkin edi va aynan shu sababli bazada
    bir xil mashina uch xil raqam ostida yurardi. Endi mashina tanlansa,
    matn maydonlari uning kartochkasidan ko'chiriladi -- manba bitta.

    Haydovchi bundan mustasno. Bitta mashinada smenaga qarab boshqa odam
    chiqadi, shuning uchun so'rovda haydovchi aniq ko'rsatilgan bo'lsa,
    mashina kartochkasidagi ism uni bosib ketmaydi -- ilgari qo'lda
    kiritilgan haydovchi jimgina yo'qolardi.
    """
    if logistics.transport_id is None:
        return
    transport = db.get(Transport, logistics.transport_id)
    if not transport:
        raise HTTPException(status_code=422, detail=MSG_TRANSPORT_NOT_FOUND)
    given = provided if provided is not None else set()
    logistics.vehicle_number = transport.vehicle_number
    logistics.trailer_number = transport.trailer_number
    # Mashina kartochkasidagi haydovchi -- boshlang'ich qiymat, doimiy bog'
    # emas. U faqat maydon bo'sh bo'lganda yoki mashina shu so'rovda
    # almashtirilganda qo'yiladi; aks holda keyingi har qanday saqlash qo'lda
    # yozilgan haydovchini mashinanikiga qaytarib yuborardi.
    fill = lambda name: name not in given and ("transport_id" in given or blank(getattr(logistics, name)))
    if transport.driver_name and fill("driver_name"):
        logistics.driver_name = transport.driver_name
    if transport.driver_phone and fill("driver_phone"):
        logistics.driver_phone = transport.driver_phone


def sync_fuel_and_distance(logistics: Logistics) -> None:
    """Bak hisobi va odometr kiritilgan bo'lsa, sarf va masofa shundan olinadi.

    `fuel_consumption_liters` va `distance_km` ilgari qo'lda yoziladigan
    yakka maydonlar edi. Ular o'chirilmadi -- hisobot va foyda hisobi
    ularga bog'langan -- lekin o'lchovdan chiqadigan qiymat ustun turadi:
    ikkita manba bir narsani boshqa-boshqa aytmasin.
    """
    position = logistics_fuel.build_position(
        fuel_before=logistics.fuel_before_liters,
        fuel_added=logistics.fuel_added_liters,
        fuel_after=logistics.fuel_after_liters,
        recorded_consumption=None,
        loaded_km=None,
        empty_km=None,
        distance_km=None,
        odometer_start=logistics.odometer_start_km,
        odometer_end=logistics.odometer_end_km,
        gps_distance=None,
        planned_distance=None,
        norm_loaded=None,
        norm_empty=None,
    )
    if position.actual_liters is not None:
        logistics.fuel_consumption_liters = position.actual_liters
    if position.odometer_distance_km is not None:
        logistics.distance_km = position.odometer_distance_km


def open_siphoning_event(db: Session, logistics: Logistics) -> None:
    """Reys hisobi ortiqcha sarf topsa, hodisalar jurnalida yozuv ochiladi.

    Raqamni tizim topadi, javobni odam beradi. Uni operator qo'lda qayta
    yozishini kutish -- eng ishonchsiz joy: hisob ekranda ko'rinib turadi,
    lekin hech qayerda qolmaydi va bir haftadan keyin uni hech kim eslay
    olmaydi.

    Bitta reysga bitta hodisa: takroriy saqlash yangi yozuv ochmaydi,
    faqat miqdorni yangilaydi -- va faqat odam hali tegmagan bo'lsa.
    """
    if not logistics.transport_id:
        return
    position = logistics_fuel_position(logistics)
    suspected = position.suspected_liters
    existing = db.scalars(
        select(TransportEvent).where(
            TransportEvent.logistics_id == logistics.id,
            TransportEvent.event_type == TransportEventType.suspected_siphoning,
        )
    ).first()
    if not suspected or suspected <= 0:
        # Ma'lumot to'g'rilanib, shubha yo'qolsa, hali hech kim tekshirmagan
        # yozuv o'chiriladi. Tekshirilganiga tegilmaydi -- unda odamning
        # xulosasi bor.
        if existing and existing.check_result == TransportEventCheckResult.not_checked and not (existing.decision or "").strip():
            db.delete(existing)
        return
    if existing:
        if existing.check_result == TransportEventCheckResult.not_checked:
            existing.possible_loss_liters = suspected
            existing.odometer_km = logistics.odometer_end_km
        return
    fields = transport_events.siphoning_event_fields(logistics=logistics, suspected_liters=suspected)
    if fields["occurred_at"] is None:
        fields["occurred_at"] = datetime.now()
    event = TransportEvent(**fields)
    day = event.occurred_at.date()
    prefix = f"EV-{day.strftime('%Y%m%d')}"
    taken = set(db.scalars(select(TransportEvent.event_number).where(TransportEvent.event_number.like(f"{prefix}%"))).all())
    event.event_number = transport_events.next_event_number(taken, day)
    db.add(event)


def sync_actual_dates_from_timeline(logistics: Logistics) -> None:
    """Aniq vaqt kiritilsa, eski sana maydonlari shundan to'ldiriladi.

    Sanalar o'chirilmadi -- ularga partiya holati va hisob-faktura
    bog'langan. Lekin ikkita manba bir narsani aytmasligi uchun, aniq vaqt
    bo'lsa u ustun turadi.
    """
    if logistics.departed_at:
        logistics.actual_pickup_date = logistics.departed_at.date()
    if logistics.arrived_at:
        logistics.actual_delivery_date = logistics.arrived_at.date()


def logistics_fuel_position(logistics: Logistics) -> logistics_fuel.FuelPosition:
    """Norma mashina kartochkasidan olinadi.

    Reysga norma nusxalanmaydi: mashina normasi o'zgarsa, eski reysdagi
    nusxa qolib ketardi va ikkovi bir-biriga zid raqam ko'rsatardi.
    """
    transport = logistics.transport
    return logistics_fuel.build_position(
        fuel_before=logistics.fuel_before_liters,
        fuel_added=logistics.fuel_added_liters,
        fuel_after=logistics.fuel_after_liters,
        recorded_consumption=logistics.fuel_consumption_liters,
        loaded_km=logistics.loaded_mileage_km,
        empty_km=logistics.empty_mileage_km,
        distance_km=logistics.distance_km,
        odometer_start=logistics.odometer_start_km,
        odometer_end=logistics.odometer_end_km,
        gps_distance=logistics.gps_distance_km,
        planned_distance=logistics.planned_distance_km,
        norm_loaded=transport.fuel_norm_loaded if transport else None,
        norm_empty=transport.fuel_norm_empty if transport else None,
        sensor_before=logistics.sensor_fuel_before_liters,
        sensor_after=logistics.sensor_fuel_after_liters,
        sensor_drop=logistics.sensor_fuel_drop_liters,
        measured_distance=logistics.measured_distance_km,
    )


def logistics_document_quantity(logistics: Logistics) -> Decimal | None:
    """Hujjatdagi yuklangan miqdor -- partiya bandlaridan.

    Tarozi ko'rsatkichi shu raqamga solishtiriladi: ikkovi mos kelmasa, yo
    tarozi, yo hujjat noto'g'ri.
    """
    batch = logistics.batch
    if not batch or not batch.items:
        return None
    loaded = [item.loaded_quantity for item in batch.items if item.loaded_quantity is not None]
    if not loaded:
        return None
    return sum((Decimal(value) for value in loaded), Decimal("0"))


def logistics_read(logistics: Logistics) -> LogisticsRead:
    """Reys vaqt chizig'i, yoqilg'i va yuk hisobi saqlanmaydi, har o'qishda
    hisoblanadi -- shunda mashina normasi yoki partiya miqdori o'zgarsa,
    hisob ham yangilanadi."""
    result = LogisticsRead.model_validate(logistics)
    return result.model_copy(
        update={
            "timeline": logistics_timeline.build_timeline(logistics),
            "fuel": logistics_fuel_position(logistics),
            "cargo": logistics_cargo.build_position(
                logistics=logistics, document_quantity=logistics_document_quantity(logistics)
            ),
        }
    )


def validate_logistics_dates(data: dict[str, Any]) -> None:
    planned_pickup = data.get("planned_pickup_date")
    planned_delivery = data.get("planned_delivery_date")
    actual_pickup = data.get("actual_pickup_date")
    actual_delivery = data.get("actual_delivery_date")
    if planned_pickup and planned_delivery and planned_delivery < planned_pickup:
        raise HTTPException(status_code=422, detail="Reja yetkazish sanasi reja yuklash sanasidan oldin bo'lishi mumkin emas.")
    if actual_pickup and actual_delivery and actual_delivery < actual_pickup:
        raise HTTPException(status_code=422, detail="Haqiqiy yetkazish sanasi haqiqiy yuklash sanasidan oldin bo'lishi mumkin emas.")
    # Reys nuqtalari o'sib borishi kerak. Buni faqat interfeysda tekshirish
    # yetmaydi: teskari tartibdagi vaqtdan chiqadigan «manfiy davomiylik»
    # keyin hisobotga tushib ketadi.
    known = [(key, data[key]) for key, _ in logistics_timeline.POINTS if data.get(key)]
    for (_, earlier), (_, later) in zip(known, known[1:]):
        if later < earlier:
            raise HTTPException(status_code=422, detail=MSG_TIMELINE_ORDER)


def trip_check_for(logistics: Logistics | None) -> trip_completion_check.TripCheck:
    """Reys yopishga tayyormi -- yoqilg'i va yuk raqamlari kiritilganmi."""
    if not logistics:
        return trip_completion_check.TripCheck()
    return trip_completion_check.check_trip(
        own_vehicle=bool(logistics.transport_id),
        odometer_start=logistics.odometer_start_km,
        odometer_end=logistics.odometer_end_km,
        fuel_before=logistics.fuel_before_liters,
        fuel_after=logistics.fuel_after_liters,
        gross_weight=logistics.gross_weight_tons,
        tare_weight=logistics.tare_weight_tons,
    )


def sync_logistics_status(logistics: Logistics, batch: DeliveryBatch, requested_status: LogisticsStatus | None = None) -> None:
    if batch.status == BatchStatus.completed:
        logistics.status = LogisticsStatus.completed
        return
    if requested_status in {LogisticsStatus.issue, LogisticsStatus.cancelled, LogisticsStatus.unloading, LogisticsStatus.completed}:
        logistics.status = requested_status
        return
    if batch.accepted_date or any(item.accepted_quantity is not None for item in batch.items):
        logistics.status = LogisticsStatus.accepted
        return
    if logistics.actual_delivery_date:
        logistics.status = LogisticsStatus.delivered
        return
    if requested_status == LogisticsStatus.in_transit:
        logistics.status = LogisticsStatus.in_transit
        return
    if logistics.actual_pickup_date:
        logistics.status = LogisticsStatus.loaded
        return
    if not blank(logistics.vehicle_number):
        logistics.status = LogisticsStatus.vehicle_assigned
        return
    if not blank(logistics.carrier_name) or not blank(logistics.driver_name):
        logistics.status = LogisticsStatus.carrier_assigned
        return
    logistics.status = LogisticsStatus.not_assigned


# Reys qanchalik oldinga ketgani. Partiya holati shu darajalardan
# hisoblanadi.
TRIP_RANK = {
    LogisticsStatus.not_assigned: 0,
    LogisticsStatus.carrier_search: 0,
    LogisticsStatus.carrier_assigned: 1,
    LogisticsStatus.vehicle_assigned: 1,
    LogisticsStatus.loading: 2,
    LogisticsStatus.loaded: 3,
    LogisticsStatus.in_transit: 4,
    LogisticsStatus.arrived: 5,
    LogisticsStatus.unloading: 5,
    LogisticsStatus.delivered: 6,
    LogisticsStatus.accepted: 7,
    LogisticsStatus.completed: 8,
    LogisticsStatus.cancelled: 0,
    LogisticsStatus.issue: 0,
}


def trip_of(batch: DeliveryBatch, logistics_id: int | None):
    """So'ralgan reys, yoki birinchisi.

    Partiya bitta reysli bo'lgan davrdagi chaqiruvlar reys raqamini
    yubormaydi -- ular uchun birinchi reys ishlatiladi.
    """
    if logistics_id:
        found = next((trip for trip in batch.trips if trip.id == logistics_id), None)
        if not found:
            raise HTTPException(status_code=404, detail="Reys topilmadi.")
        return found
    return batch.logistics


def distribute_accepted_to_items(batch: DeliveryBatch) -> None:
    """Reyslarda qabul qilingan jami miqdorni partiya bandlariga taqsimlaydi.

    Yuklangan miqdor bilan bir xil qoida: bandlar mahsulot bo'yicha,
    reyslar mashina bo'yicha bo'linadi, shuning uchun taqsimot yuklangan
    ulush bo'yicha ketadi.
    """
    accepted_total = qty(sum((Decimal(trip.accepted_quantity or 0) for trip in batch.trips), Decimal("0")))
    loaded_total = qty(sum((Decimal(item.loaded_quantity or 0) for item in batch.items), Decimal("0")))
    if not batch.items:
        return
    remaining = accepted_total
    for index, item in enumerate(batch.items):
        if index == len(batch.items) - 1:
            item.accepted_quantity = qty(remaining)
        else:
            share = qty((accepted_total * Decimal(item.loaded_quantity or 0)) / loaded_total) if loaded_total else Decimal("0")
            item.accepted_quantity = share
            remaining = qty(remaining - share)
        item.difference_quantity = qty(Decimal(item.loaded_quantity or 0) - Decimal(item.accepted_quantity or 0))


def distribute_loaded_to_items(batch: DeliveryBatch) -> None:
    """Reyslarda yuklangan jami miqdorni partiya bandlariga taqsimlaydi.

    Bandlar mahsulot bo'yicha bo'linadi, reyslar esa mashina bo'yicha --
    ikkovi bir-biriga to'g'ridan-to'g'ri mos kelmaydi. Shuning uchun
    umumiy yuklangan miqdor reja ulushiga qarab bandlarga bo'linadi.
    """
    loaded_total = qty(sum((Decimal(trip.loaded_quantity or 0) for trip in batch.trips), Decimal("0")))
    planned_total = qty(sum((Decimal(item.planned_quantity or 0) for item in batch.items), Decimal("0")))
    if not batch.items:
        return
    if loaded_total <= 0:
        for item in batch.items:
            item.loaded_quantity = None
        return
    remaining = loaded_total
    for index, item in enumerate(batch.items):
        if index == len(batch.items) - 1:
            item.loaded_quantity = qty(remaining)
        else:
            share = qty((loaded_total * Decimal(item.planned_quantity or 0)) / planned_total) if planned_total else Decimal("0")
            item.loaded_quantity = share
            remaining = qty(remaining - share)


def sync_batch_status_from_logistics(batch: DeliveryBatch, logistics: Logistics | None = None) -> None:
    """Partiya holati barcha reyslardan chiqadi.

    Ilgari u bitta reysdan olinardi. Partiyada uch reys bo'lsa va
    birinchisi yetkazib bo'lgan bo'lsa, partiya «yetkazildi» deb turar,
    qolgan ikkitasi esa hali yo'lda bo'lardi.

    Qoida oddiy: partiya harakatni birinchi mashina yo'lga chiqishi bilan
    boshlaydi, lekin «yetkazildi» yoki «qabul qilindi» bo'lishi uchun
    hamma reys shu holatga yetishi kerak.
    """
    protected = {BatchStatus.cancelled, BatchStatus.issue, BatchStatus.completed}
    if batch.status in protected:
        return
    trips = [trip for trip in batch.trips if trip.status not in (LogisticsStatus.cancelled,)]
    if not trips:
        return
    ranks = [TRIP_RANK.get(trip.status, 0) for trip in trips]
    slowest, fastest = min(ranks), max(ranks)
    if slowest >= 7:
        batch.status = BatchStatus.accepted
    elif slowest >= 6:
        batch.status = BatchStatus.arrived
    elif fastest >= 4:
        batch.status = BatchStatus.in_transit
    elif fastest >= 3:
        batch.status = BatchStatus.loaded
    elif slowest >= 1:
        batch.status = BatchStatus.ready_for_loading


def logistics_defaults(db: Session, batch: DeliveryBatch) -> dict[str, Any]:
    return {
        "logistics_number": unique_logistics_number(db, batch),
        "delivery_batch_id": batch.id,
        "status": LogisticsStatus.not_assigned,
        "planned_pickup_date": batch.planned_loading_date,
        "planned_delivery_date": batch.planned_delivery_date,
        "loading_address": delivery_point_address(db, batch.loading_point_id),
        "delivery_address": delivery_point_address(db, batch.delivery_point_id),
        "cost_amount": Decimal("0"),
        "customer_price": Decimal("0"),
        "paid_by": PaidBy.company,
    }


def ensure_logistics(db: Session, batch: DeliveryBatch, payload: LogisticsCreate | None = None) -> Logistics:
    logistics = batch.logistics
    requested_status = payload.status if payload else None
    data = payload.model_dump(exclude_unset=True) if payload else {}
    validate_logistics_dates(data)
    guard_transport_model(batch, data.get("transport_id"))
    guard_transport_available(db, data.get("transport_id"))
    if logistics:
        if not logistics.logistics_number:
            logistics.logistics_number = unique_logistics_number(db, batch)
        update_model(logistics, data)
    else:
        defaults = logistics_defaults(db, batch)
        defaults.update({key: value for key, value in data.items() if value is not None})
        logistics = Logistics(**defaults)
        batch.logistics = logistics
        db.add(logistics)
    if logistics.planned_quantity is None:
        # Birinchi reysning miqdori ham qo'yilishi kerak, aks holda
        # kartochka «butun miqdor reysga biriktirilmagan» deb turadi va
        # «Reys qo'shish» takroriy reys ochib yuboradi. Sig'imdan katta
        # bo'lsa, u sig'im bilan cheklanadi -- qolganiga yangi reys.
        suggested = suggested_trip_quantity(db, batch)
        logistics.planned_quantity = suggested if suggested > 0 else None
    if not logistics.planned_pickup_date:
        logistics.planned_pickup_date = batch.planned_loading_date
    if not logistics.planned_delivery_date:
        logistics.planned_delivery_date = batch.planned_delivery_date
    if blank(logistics.loading_address):
        logistics.loading_address = delivery_point_address(db, batch.loading_point_id)
    if blank(logistics.delivery_address):
        logistics.delivery_address = delivery_point_address(db, batch.delivery_point_id)
    if logistics.cost_amount is None:
        logistics.cost_amount = Decimal("0")
    if logistics.customer_price is None:
        logistics.customer_price = Decimal("0")
    if logistics.paid_by is None:
        logistics.paid_by = PaidBy.company
    apply_transport_to_logistics(db, logistics)
    apply_delivery_point_address(db, batch, logistics)
    sync_actual_dates_from_timeline(logistics)
    sync_fuel_and_distance(logistics)
    open_siphoning_event(db, logistics)
    sync_logistics_status(logistics, batch, requested_status)
    sync_batch_status_from_logistics(batch, logistics)
    return logistics


def get_order_or_400(db: Session, order_id: int) -> Order:
    order = db.scalars(select(Order).where(Order.id == order_id).options(selectinload(Order.items))).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Buyurtma mavjud emas.")
    return order


def load_batch_detail(db: Session, batch_id: int) -> DeliveryBatch:
    batch = db.scalars(
        select(DeliveryBatch)
        .where(DeliveryBatch.id == batch_id)
        .options(
            selectinload(DeliveryBatch.client),
            selectinload(DeliveryBatch.contract),
            selectinload(DeliveryBatch.order).selectinload(Order.items),
            selectinload(DeliveryBatch.items),
            selectinload(DeliveryBatch.trips),
            selectinload(DeliveryBatch.documents),
            selectinload(DeliveryBatch.notes_history),
        )
    ).first()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partiya topilmadi.")
    return batch


def get_batch_or_404(db: Session, batch_id: int) -> DeliveryBatch:
    batch = db.get(DeliveryBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partiya topilmadi.")
    return batch


def get_child_or_404(db: Session, model: Any, parent_field: str, parent_id: int, item_id: int):
    item = db.get(model, item_id)
    if not item or getattr(item, parent_field) != parent_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mahsulot topilmadi.")
    return item


def calculate_batch_item(item: DeliveryBatchItem) -> None:
    if item.accepted_quantity is None:
        item.difference_quantity = None
        return
    item.difference_quantity = qty((item.loaded_quantity or Decimal("0")) - item.accepted_quantity)


def update_batch_status_from_items(batch: DeliveryBatch) -> None:
    for item in batch.items:
        calculate_batch_item(item)
    if batch.status == BatchStatus.quantity_difference:
        if batch.accepted_date or any(item.accepted_quantity is not None for item in batch.items):
            batch.status = BatchStatus.accepted
        elif batch.logistics and batch.logistics.actual_delivery_date:
            batch.status = BatchStatus.arrived
        elif batch.logistics and batch.logistics.actual_pickup_date:
            batch.status = BatchStatus.loaded
        else:
            batch.status = BatchStatus.planned


def planned_for_order_item(db: Session, order_item_id: int, exclude_batch_id: int | None = None) -> Decimal:
    stmt = select(func.coalesce(func.sum(DeliveryBatchItem.planned_quantity), 0)).join(DeliveryBatch).where(
        DeliveryBatchItem.order_item_id == order_item_id,
        DeliveryBatch.status != BatchStatus.cancelled,
    )
    if exclude_batch_id:
        stmt = stmt.where(DeliveryBatch.id != exclude_batch_id)
    return qty(db.scalar(stmt) or Decimal("0"))


def accepted_for_order_item(db: Session, order_item_id: int, exclude_batch_id: int | None = None) -> Decimal:
    stmt = select(func.coalesce(func.sum(DeliveryBatchItem.accepted_quantity), 0)).join(DeliveryBatch).where(
        DeliveryBatchItem.order_item_id == order_item_id,
        DeliveryBatch.status != BatchStatus.cancelled,
    )
    if exclude_batch_id:
        stmt = stmt.where(DeliveryBatch.id != exclude_batch_id)
    return qty(db.scalar(stmt) or Decimal("0"))


def balance_for_order_item(db: Session, order_item: OrderItem, exclude_batch_id: int | None = None) -> OrderItemBatchBalance:
    planned = planned_for_order_item(db, order_item.id, exclude_batch_id)
    accepted = accepted_for_order_item(db, order_item.id, exclude_batch_id)
    return OrderItemBatchBalance(
        order_item_id=order_item.id,
        product_name=order_item.product_name,
        unit=order_item.unit,
        order_quantity=qty(order_item.quantity),
        planned_quantity_total=planned,
        accepted_quantity_total=accepted,
        remaining_quantity_for_planning=qty(order_item.quantity - planned),
        remaining_quantity_for_completion=qty(order_item.quantity - accepted),
    )


def validate_items(db: Session, order: Order, items: list[DeliveryBatchItemCreate], exclude_batch_id: int | None = None) -> dict[int, OrderItem]:
    order_items = {item.id: item for item in order.items}
    requested: dict[int, Decimal] = {}
    for item in items:
        if item.order_item_id not in order_items:
            raise HTTPException(status_code=422, detail="Partiya mahsulotlari tanlangan buyurtma mahsulotlari orasidan tanlanishi kerak.")
        requested[item.order_item_id] = requested.get(item.order_item_id, Decimal("0")) + item.planned_quantity
    for order_item_id, planned in requested.items():
        balance = balance_for_order_item(db, order_items[order_item_id], exclude_batch_id)
        if planned > balance.remaining_quantity_for_planning:
            raise HTTPException(
                status_code=422,
                detail=f"Bu order bo'yicha qoldiq {balance.remaining_quantity_for_planning} {balance.unit}. Siz {planned} {balance.unit} kiritdingiz.",
            )
    return order_items


def build_batch_item(order_item: OrderItem, payload: DeliveryBatchItemCreate, batch_id: int | None = None) -> DeliveryBatchItem:
    item = DeliveryBatchItem(
        order_item_id=order_item.id,
        contract_item_id=order_item.contract_item_id,
        product_name=order_item.product_name,
        unit=order_item.unit,
        planned_quantity=payload.planned_quantity,
        loaded_quantity=payload.loaded_quantity,
        accepted_quantity=payload.accepted_quantity,
        comment=payload.comment,
    )
    if batch_id:
        item.delivery_batch_id = batch_id
    calculate_batch_item(item)
    return item


def batch_summary(batch: DeliveryBatch) -> DeliveryBatchSummary:
    total_planned = qty(sum((item.planned_quantity for item in batch.items), Decimal("0")))
    total_loaded = qty(sum((item.loaded_quantity or Decimal("0") for item in batch.items), Decimal("0")))
    has_accepted_input = any(item.accepted_quantity is not None for item in batch.items)
    total_accepted = qty(sum((item.accepted_quantity or Decimal("0") for item in batch.items), Decimal("0"))) if has_accepted_input else None
    total_diff = qty(sum((item.difference_quantity or Decimal("0") for item in batch.items), Decimal("0"))) if has_accepted_input else None
    return DeliveryBatchSummary(
        total_planned_quantity=total_planned,
        total_loaded_quantity=total_loaded,
        total_accepted_quantity=total_accepted,
        total_difference_quantity=total_diff,
        items_count=len(batch.items),
        has_quantity_difference=any(item.difference_quantity is not None and item.difference_quantity != 0 for item in batch.items),
        documents_count=len(batch.documents),
        logistics_status=batch.logistics.status if batch.logistics else None,
    )


def balances_for_batch(db: Session, batch: DeliveryBatch) -> list[OrderItemBatchBalance]:
    return [balance_for_order_item(db, item, batch.id) for item in batch.order.items]


def serialize_batch(batch: DeliveryBatch) -> DeliveryBatchListItem:
    summary = batch_summary(batch)
    return DeliveryBatchListItem(
        **DeliveryBatchDetail.model_validate(batch).model_dump(exclude={"items", "logistics", "documents", "notes_history", "summary", "order_item_balances"}),
        product=product_summary([item.product_name for item in batch.items]),
        total_planned_quantity=summary.total_planned_quantity,
        total_loaded_quantity=summary.total_loaded_quantity,
        total_accepted_quantity=summary.total_accepted_quantity,
        total_difference_quantity=summary.total_difference_quantity,
        logistics_status=summary.logistics_status,
        last_activity=None,
    )


@router.get("/order/{order_id}/balances", response_model=list[OrderItemBatchBalance])
def get_order_balances(order_id: int, db: Session = Depends(get_db)):
    order = get_order_or_400(db, order_id)
    return [balance_for_order_item(db, item) for item in order.items]


@router.get("", response_model=Page[DeliveryBatchListItem])
def list_batches(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    client_id: int | None = None,
    contract_id: int | None = None,
    order_id: int | None = None,
    overdue_only: bool = False,
    group: str | None = Query(default=None, pattern="^(moving|problem)$"),
):
    stmt = (
        select(DeliveryBatch)
        # Spell the ON clauses out: chained .join(Contract) after .join(Client)
        # walks Client.contracts instead of the batch's own contract, which both
        # multiplies rows and drops any batch whose client owns no contract.
        .join(Client, DeliveryBatch.client_id == Client.id)
        .join(Contract, DeliveryBatch.contract_id == Contract.id)
        .join(Order, DeliveryBatch.order_id == Order.id)
        .outerjoin(DeliveryBatchItem)
        .options(selectinload(DeliveryBatch.client), selectinload(DeliveryBatch.contract), selectinload(DeliveryBatch.order), selectinload(DeliveryBatch.items), selectinload(DeliveryBatch.trips), selectinload(DeliveryBatch.documents))
        .distinct()
    )
    filters = []
    if search:
        value = f"%{search}%"
        filters.append(or_(DeliveryBatch.batch_number.ilike(value), Order.order_number.ilike(value), Contract.contract_number.ilike(value), Client.name.ilike(value), Client.inn.ilike(value), DeliveryBatchItem.product_name.ilike(value), DeliveryBatch.supplier_name.ilike(value)))
    if status_filter:
        filters.append(DeliveryBatch.status == status_filter)
    if group:
        # Reuse the overview's own sets so a dashboard counter and the list it
        # links to can never disagree about what "on the move" means.
        statuses = delivery_stats.BATCH_ON_THE_MOVE if group == "moving" else delivery_stats.BATCH_PROBLEM
        filters.append(DeliveryBatch.status.in_(list(statuses)))
    if overdue_only:
        # Same rule the overview counts by: still open and past its promised date.
        filters.append(DeliveryBatch.status.notin_(list(delivery_stats.BATCH_CLOSED)))
        filters.append(DeliveryBatch.planned_delivery_date < date.today())
    if client_id:
        filters.append(DeliveryBatch.client_id == client_id)
    if contract_id:
        filters.append(DeliveryBatch.contract_id == contract_id)
    if order_id:
        filters.append(DeliveryBatch.order_id == order_id)
    if filters:
        stmt = stmt.where(*filters)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    batches = db.scalars(stmt.order_by(DeliveryBatch.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=[serialize_batch(batch) for batch in batches], total=total, page=page, page_size=page_size)


def ensure_order_has_source(db: Session, order, payload) -> None:
    """Refuse to ship goods nobody has recorded buying.

    The order flow has supplier_search -> supplier_selected ->
    supplier_confirmed, but batch creation never looked at any of it: six orders
    reached "partially delivered" across nineteen batches with supplier_status
    still "not_selected" and no offers on file. So the goods moved, and the
    system holds no record of where they came from or what they cost.

    Stock-sourced orders are exempt: there the supplier is on the stock lot, not
    on the order. A supplier named on the batch itself also satisfies this --
    that is a record, just entered later.

    Zaxira endi belgi emas, fakt: ajratma bor ekan, mol qayerdan kelgani
    ticketda yozilgan.
    """
    if db.scalar(select(func.count()).select_from(StockAllocation).where(StockAllocation.order_id == order.id)):
        return
    if payload.supplier_id or (payload.supplier_name or "").strip():
        return
    if order.supplier_id or (order.supplier_name or "").strip():
        return
    # Xabar ilgari «yoki partiyada uni ko'rsating» derdi, lekin partiya
    # oynasida ta'minotchi maydoni faqat o'qish uchun -- ya'ni maslahat
    # bajarib bo'lmaydigan edi. API darajasida partiyada ko'rsatish hamon
    # mumkin, foydalanuvchiga esa haqiqiy yo'l aytiladi.
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            "Bu buyurtmada ta'minotchi tanlanmagan. Buyurtma kartochkasida "
            "ta'minotchini tanlang."
        ),
    )


def category_of_order_item(order_item):
    """Buyurtma qatoridan mahsulot turkumigacha. Topilmasa None."""
    contract_item = getattr(order_item, "contract_item", None)
    product = getattr(contract_item, "product", None)
    return getattr(product, "category", None)


@router.post("", response_model=DeliveryBatchDetail, status_code=201, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_batch(payload: DeliveryBatchCreate, db: Session = Depends(get_db)):
    order = get_order_or_400(db, payload.order_id)
    ensure_order_has_source(db, order, payload)
    order_items = validate_items(db, order, payload.items)
    data = payload.model_dump(exclude={"items", "logistics", "documents", "initial_note"})
    data["client_id"] = order.client_id
    data["contract_id"] = order.contract_id
    # Model so'ralmaydi -- u buyurtmaning manbasidan kelib chiqadi va shu
    # yerda ko'chiriladi.
    data["fulfillment_type"] = order.fulfillment_type.value
    data["source_type"] = order.source_type.value
    # Yetkazish usuli ko'rsatilmagan bo'lsa, mahsulot turkumlaridan
    # chiqariladi -- operator uni partiya oynasida almashtira oladi.
    if not data.get("delivery_method"):
        data["delivery_method"] = default_method_for(
            # Mahsulot kartochkasi shartnoma qatorida turadi: buyurtma va
            # partiya qatorlarida faqat nomi saqlanadi. Zanjirning har bir
            # bo'g'ini bo'sh bo'lishi mumkin -- eski yozuvlarda mahsulot
            # kartochkasi biriktirilmagan.
            [category_of_order_item(order_items[item.order_item_id]) for item in payload.items]
        )
    # Yetkazish nuqtasi buyurtmadan meros bo'ladi.
    if not data.get("delivery_point_id"):
        data["delivery_point_id"] = order.delivery_point_id
    if not data.get("supplier_id"):
        data["supplier_id"] = order.supplier_id
    if not data.get("supplier_name"):
        data["supplier_name"] = order.supplier_name
    batch = DeliveryBatch(**data)
    db.add(batch)
    db.flush()
    for item_payload in payload.items:
        db.add(build_batch_item(order_items[item_payload.order_item_id], item_payload, batch.id))
    for document_payload in payload.documents:
        db.add(DeliveryBatchDocument(delivery_batch_id=batch.id, **document_payload.model_dump()))
    if payload.initial_note:
        db.add(DeliveryBatchNote(delivery_batch_id=batch.id, **payload.initial_note.model_dump()))
    db.flush()
    db.expire(batch, ["items"])
    db.refresh(batch)
    update_batch_status_from_items(batch)
    logistics = ensure_logistics(db, batch, payload.logistics)
    open_trips_to_cover(db, batch)
    link_stock_allocation_to_batch(db, batch)
    sync_order_status(order, db=db)
    db.commit()
    if logistics.vehicle_number:
        notify_driver_of_trip(db, logistics)
    return get_batch_detail(batch.id, db)


# Bitta partiyaga ochiladigan reyslarning cheki. 461 tonna 24 tonnalik
# sisternalarga 20 ta reysga bo'linadi -- bu haqiqat. Lekin miqdor
# xato kiritilgan bo'lsa (masalan nol ortiqcha), yuzlab bo'sh yozuv
# ochilib ketmasligi kerak.
MAX_AUTO_TRIPS = 50


def open_trips_to_cover(db: Session, batch: DeliveryBatch) -> int:
    """Partiya miqdorini qoplaguncha reys ochadi.

    Partiya yaratilganda bitta reys ochilardi, sehrgar esa «shuncha reys
    ochiladi» deb va'da qilardi. Natijada 461 tonnalik partiyada 24
    tonnalik bitta reys turar va qolgan 437 tonna uchun foydalanuvchi
    tugmani 19 marta bosishi kerak edi.

    Faqat o'zimiz tashiydigan partiyada ishlaydi: ta'minotchi
    yetkazadigan partiyada reys mashinamizga bog'lanmaydi.
    """
    if not is_company_managed(batch):
        return 0
    # Birinchi reys hali yozilmagan bo'lishi mumkin: raqam takrorlanmasligi
    # uchun avval yozib olamiz (`autoflush` o'chirilgan).
    db.flush()
    opened = 0
    while opened < MAX_AUTO_TRIPS:
        remaining = suggested_trip_quantity(db, batch)
        if remaining <= 0:
            break
        trip = Logistics(**{**logistics_defaults(db, batch), "planned_quantity": remaining})
        db.add(trip)
        db.flush()
        db.refresh(batch)
        apply_delivery_point_address(db, batch, trip)
        opened += 1
    return opened


MSG_TRIP_QUANTITY = "Reys miqdori 0 dan katta bo'lishi kerak."
MSG_TRIP_OVER = "Reyslar miqdori partiya miqdoridan oshib ketadi"
MSG_TRIP_STARTED = "Boshlangan reysni o'chirib bo'lmaydi"


def trips_planned_total(batch: DeliveryBatch) -> Decimal:
    return sum((Decimal(trip.planned_quantity or 0) for trip in batch.trips), Decimal("0"))


def remaining_for_trip(batch: DeliveryBatch) -> Decimal:
    """Partiyaning qaysi qismi hali reysga biriktirilmagan."""
    return qty(transport_choice.planned_quantity(batch) - trips_planned_total(batch))


def suggested_trip_quantity(db: Session, batch: DeliveryBatch) -> Decimal:
    """Yangi reysga taklif qilinadigan miqdor.

    Qolgan miqdor eng katta sisternadan oshsa, u bitta reysga sig'maydi
    -- shuning uchun taklif sig'im bilan cheklanadi va operator qolganiga
    yana reys ochadi.
    """
    remaining = remaining_for_trip(batch)
    largest = db.scalar(select(func.max(Transport.capacity_tons)))
    if largest and remaining > Decimal(largest):
        return qty(Decimal(largest))
    return remaining


@router.post("/{batch_id}/trips", response_model=LogisticsRead, status_code=201, dependencies=[Depends(require_edit("yetkazib_berish"))])
def add_batch_trip(batch_id: int, payload: LogisticsCreate | None = None, db: Session = Depends(get_db)):
    """Partiyaga yana bitta reys qo'shadi.

    100 tonna bitta sisternaga sig'maydi. Har bir reys -- mashinaning
    bitta yurishi: o'z miqdori, o'z probegi va o'z yoqilg'i hisobi bilan.
    """
    batch = load_batch_detail(db, batch_id)
    if not is_company_managed(batch):
        raise HTTPException(status_code=422, detail=MSG_DIRECT_NO_TRANSPORT)
    data = payload.model_dump(exclude_unset=True) if payload else {}
    guard_transport_model(batch, data.get("transport_id"))
    guard_transport_available(db, data.get("transport_id"))

    if data.get("planned_quantity") is not None and Decimal(str(data["planned_quantity"])) <= 0:
        raise HTTPException(status_code=422, detail=MSG_TRIP_QUANTITY)

    defaults = logistics_defaults(db, batch)
    defaults.update({key: value for key, value in data.items() if value is not None})
    if not defaults.get("planned_quantity"):
        # Qolgan miqdor -- eng ehtimolli javob, operator uni o'zgartira oladi.
        remaining = suggested_trip_quantity(db, batch)
        if remaining <= 0:
            # Miqdorsiz reys ochish -- bo'sh yozuv yaratish demak. Butun
            # miqdor allaqachon biriktirilgan bo'lsa, avval mavjud reys
            # miqdorini kamaytirish kerak.
            raise HTTPException(status_code=422, detail=MSG_TRIP_OVER)
        defaults["planned_quantity"] = remaining
    trip = Logistics(**defaults)
    db.add(trip)
    db.flush()
    db.refresh(batch)
    apply_delivery_point_address(db, batch, trip)
    db.commit()
    db.refresh(trip)
    return logistics_read(trip)


@router.get("/{batch_id}/transport-choices")
def batch_transport_choices(batch_id: int, db: Session = Depends(get_db)) -> dict:
    """Bu partiyaga qaysi mashinani berish mumkin -- sabablari bilan.

    Dispetcher oynasi shu javobdan quriladi: har bir mashinaning holati,
    yuklash nuqtasigacha masofasi, bakdagi yoqilg'i, band-emasligi va
    sig'imi bitta ro'yxatda turadi.
    """
    batch = load_batch_detail(db, batch_id)
    live = transports_live(db)
    return {
        "planned_quantity": transport_choice.planned_quantity(batch),
        "loading_point": batch.loading_point.name if batch.loading_point else None,
        "live_available": live.get("available", False),
        "live_reason": live.get("reason"),
        "items": transport_choice.build_candidates(db, batch, live),
    }


@router.get("/{batch_id}", response_model=DeliveryBatchDetail)
def get_batch_detail(batch_id: int, db: Session = Depends(get_db)):
    batch = load_batch_detail(db, batch_id)
    result = DeliveryBatchDetail.model_validate(batch)
    balance_map = {balance.order_item_id: balance for balance in balances_for_batch(db, batch)}
    prices = {item.id: item.order_item for item in batch.items}
    items = []
    for item in result.items:
        current = balance_map.get(item.order_item_id)
        if current:
            current = current.model_copy(update={"remaining_quantity_for_planning": qty(current.remaining_quantity_for_planning + item.planned_quantity)})
        order_item = prices.get(item.id)
        items.append(item.model_copy(update={
            "balance": current,
            "unit_price": order_item.unit_price if order_item else None,
            "vat_rate": order_item.vat_rate if order_item else None,
        }))
    return result.model_copy(update={
        "items": items,
        "summary": batch_summary(batch),
        "order_item_balances": balances_for_batch(db, batch),
        "difference": difference_read(batch),
        "transport_check": transport_check_read(batch),
    })


def difference_for(batch: DeliveryBatch) -> batch_difference.Difference:
    """Partiya bo'yicha kamomad: miqdori, puldagi qiymati va qabul qilingan qaror."""
    return batch_difference.build_difference(
        items=[
            {
                "loaded_quantity": item.loaded_quantity,
                "accepted_quantity": item.accepted_quantity,
                # Mijozga aynan buyurtma narxida faktura qo'yiladi.
                "unit_price": item.order_item.unit_price if item.order_item else 0,
                "vat_rate": item.order_item.vat_rate if item.order_item else 0,
            }
            for item in batch.items
        ],
        resolution=batch.difference_resolution,
    )


def transport_check_read(batch: DeliveryBatch) -> DeliveryBatchTransportCheck:
    """Partiya transporti shartnomadagi shartlarga mos keladimi."""
    terms = batch.contract.transport_terms if batch.contract else None
    logistics = batch.logistics
    check = batch_transport_check.check_transport(
        delivery_method=terms.delivery_method.value if terms else None,
        transport_payment_type=terms.transport_payment_type.value if terms else None,
        # Logistika modulida temir yo'l yo'q: biriktirilgan har qanday
        # transport avtotransport hisoblanadi.
        has_road_transport=bool(
            logistics and (logistics.vehicle_number or logistics.driver_name or logistics.carrier_name)
        ),
        customer_price=logistics.customer_price if logistics else 0,
    )
    # Tanlangan nuqta usulga mos keladimi -- «tuz partiyasi ABZ ga ketyapti»
    # degan holat aynan shu yerda ko'rinadi. Bloklamaydi: hujjat allaqachon
    # boshqacha rasmiylashtirilgan bo'lishi mumkin.
    warnings = list(check.warnings or [])
    point_problem = delivery_method_service.point_warning(batch.delivery_method, batch.delivery_point)
    if point_problem:
        warnings.append(point_problem)
    return DeliveryBatchTransportCheck(
        delivery_method=check.delivery_method,
        transport_payment_type=check.transport_payment_type,
        customer_price=money(check.customer_price),
        warnings=warnings,
    )


def difference_read(batch: DeliveryBatch) -> DeliveryBatchDifferenceRead:
    difference = difference_for(batch)
    return DeliveryBatchDifferenceRead(
        quantity=difference.quantity,
        amount=difference.amount,
        resolution=difference.resolution,
        resolution_label=batch_difference.RESOLUTION_LABELS.get(difference.resolution or ""),
        note=batch.difference_note,
        resolved_at=batch.difference_resolved_at,
        resolved_by=batch.difference_resolved_by,
        warnings=batch_difference.warnings_for(difference),
    )


@router.post("/{batch_id}/confirm-acceptance", response_model=DeliveryBatchDetail, dependencies=[Depends(require_edit("yetkazib_berish"))])
def confirm_batch_acceptance(
    batch_id: int,
    payload: DeliveryBatchAcceptanceConfirm,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Qabul qilingan miqdorlar va -- kamomad bo'lsa -- u bilan nima qilinishi.

    Ikkalasi bitta amalda: qabulni yozib, farqni ochiq qoldirib ketish aynan
    o'sha 2 tonna havoda qolib ketishiga olib kelgan.
    """
    batch = load_batch_detail(db, batch_id)
    if batch.status == BatchStatus.cancelled:
        raise HTTPException(status_code=422, detail="Bekor qilingan partiyada qabulni tasdiqlab bo'lmaydi.")
    # Reys bo'yicha qabul -- asosiy yo'l: har bir mashina alohida qabul
    # qilinadi. Partiya bandlaridagi miqdor shundan hisoblanadi.
    if payload.trips:
        trips = {trip.id: trip for trip in batch.trips}
        for row in payload.trips:
            trip = trips.get(row.logistics_id)
            if trip is None:
                raise HTTPException(status_code=404, detail="Reys topilmadi.")
            loaded = qty(trip.loaded_quantity or Decimal("0"))
            if loaded <= 0:
                raise HTTPException(status_code=422, detail=f"{trip.logistics_number or trip.id}: reys hali yuklanmagan.")
            if row.accepted_quantity > loaded:
                raise HTTPException(
                    status_code=422,
                    detail=f"{trip.logistics_number or trip.id}: qabul miqdori yuklangandan ko'p bo'lishi mumkin emas.",
                )
            trip.accepted_quantity = qty(row.accepted_quantity)
            trip.status = LogisticsStatus.accepted
            if row.comment is not None:
                trip.notes = row.comment
        distribute_accepted_to_items(batch)
        sync_batch_status_from_logistics(batch)

    items = {item.id: item for item in batch.items}
    for row in payload.items:
        item = items.get(row.id)
        if item is None:
            raise HTTPException(status_code=422, detail="Partiya qatori topilmadi.")
        if row.accepted_quantity < 0:
            raise HTTPException(status_code=422, detail="Qabul qilingan miqdor manfiy bo'lishi mumkin emas.")
        item.accepted_quantity = row.accepted_quantity
        item.difference_quantity = (item.loaded_quantity or Decimal("0")) - row.accepted_quantity
        if row.comment is not None:
            item.comment = row.comment

    difference = difference_for(batch)
    if difference.exists and difference.quantity > 0:
        if payload.difference_resolution not in batch_difference.RESOLUTIONS:
            raise HTTPException(
                status_code=422,
                detail=f"{batch_difference.MSG_RESOLUTION_REQUIRED}: {batch_difference.quantity_text(difference.quantity)}",
            )
        batch.difference_resolution = payload.difference_resolution
        batch.difference_note = payload.difference_note
        batch.difference_resolved_at = datetime.now()
        batch.difference_resolved_by = getattr(user, "username", None)
    else:
        # Farq yopilgan bo'lsa, eski qaror ham keraksiz.
        batch.difference_resolution = None
        batch.difference_note = None
        batch.difference_resolved_at = None
        batch.difference_resolved_by = None

    # Farq bo'lsa partiya «miqdor farqi» holatida turadi -- reyslar
    # holatidan qat'i nazar, chunki qaror qabul qilinmagan.
    if difference.exists:
        batch.status = BatchStatus.quantity_difference
    else:
        sync_batch_status_from_logistics(batch)
        if batch.status != BatchStatus.accepted:
            # Reyslarning hammasi qabul qilinmagan bo'lsa ham, bandlar
            # bo'yicha qabul kiritilgan -- eski yo'l shunday ishlagan.
            batch.status = BatchStatus.accepted
    sync_order_status(batch.order, db=db)
    db.commit()
    return get_batch_detail(batch.id, db)


@router.post("/{batch_id}/confirm-loading", response_model=DeliveryBatchDetail, dependencies=[Depends(require_edit("yetkazib_berish"))])
def confirm_batch_loading(batch_id: int, payload: DeliveryBatchLoadingConfirm, db: Session = Depends(get_db)):
    batch = load_batch_detail(db, batch_id)
    logistics = trip_of(batch, payload.logistics_id)
    if not logistics:
        raise HTTPException(status_code=422, detail="Yuklandi deb belgilash uchun avval transportni biriktiring.")
    # Transport talabi faqat o'zimiz tashiydigan partiyaga tegishli.
    # Ta'minotchi yetkazadigan partiyaga mashina biriktirilmaydi, ya'ni bu
    # tekshiruv uni hech qachon o'tkazmas edi -- yuklashni belgilashning
    # iloji bo'lmay qolardi.
    if is_company_managed(batch):
        allowed_statuses = {LogisticsStatus.carrier_assigned, LogisticsStatus.vehicle_assigned, LogisticsStatus.loading}
        if logistics.status not in allowed_statuses and batch.status != BatchStatus.ready_for_loading:
            raise HTTPException(status_code=422, detail="Yuklandi deb belgilash uchun avval transportni biriktiring.")
    if not batch.items:
        raise HTTPException(status_code=422, detail="Partiya mahsulotlari topilmadi.")
    planned_total = qty(sum((item.planned_quantity or Decimal("0") for item in batch.items), Decimal("0")))
    loaded_total = qty(payload.loaded_quantity)
    if loaded_total <= 0:
        raise HTTPException(status_code=422, detail="Yuklangan miqdor 0 dan katta bo'lishi kerak.")
    if planned_total <= 0:
        raise HTTPException(status_code=422, detail="Partiyada reja miqdor topilmadi.")
    # Solishtirish reysning o'z rejasi bilan: partiya bir nechta reysga
    # bo'lingan bo'lsa, butun partiya miqdori bilan solishtirish ma'nosiz.
    trip_planned = qty(logistics.planned_quantity or planned_total)
    if loaded_total > trip_planned and not payload.allow_over_planned:
        # Xabar qaysi rejaga solishtirilganini aytadi: partiya 66 tonna
        # bo'lib, reys 24 tonnaga rejalashtirilgan bo'lishi mumkin.
        raise HTTPException(
            status_code=409,
            detail=f"Yuklangan miqdor reys rejasidan oshgan ({trip_planned}). Davom etishni tasdiqlang.",
        )

    # Yuklangan miqdor reysning o'zida saqlanadi, partiya bandlari esa
    # barcha reyslarning yig'indisidan hisoblanadi -- aks holda ikkinchi
    # reysning yuklashi birinchisining raqamini bosib ketardi.
    logistics.loaded_quantity = loaded_total
    distribute_loaded_to_items(batch)
    for item in batch.items:
        item.accepted_quantity = None
        item.difference_quantity = None
        if payload.notes:
            item.comment = payload.notes

    apply_measurements(logistics, payload, (
        "odometer_start_km", "fuel_before_liters", "gross_weight_tons",
        "tare_weight_tons", "loading_temperature_c", "loading_seal", "departed_at",
    ))
    logistics.actual_pickup_date = payload.actual_loading_date
    logistics.status = LogisticsStatus.loaded
    if not batch.actual_loading_date:
        # Partiyaning yuklash sanasi -- birinchi mashina yo'lga chiqqan kun.
        batch.actual_loading_date = payload.actual_loading_date
    sync_batch_status_from_logistics(batch)
    mark_stock_picked_up_for_batch(db, batch)
    if payload.notes:
        logistics.notes = payload.notes
        batch.notes = payload.notes
        db.add(DeliveryBatchNote(delivery_batch_id=batch.id, note=payload.notes, created_by="system"))
    sync_order_status(batch.order, db=db)
    db.commit()
    return get_batch_detail(batch.id, db)


@router.post("/{batch_id}/confirm-delivery", response_model=DeliveryBatchDetail, dependencies=[Depends(require_edit("yetkazib_berish"))])
def confirm_batch_delivery(batch_id: int, payload: DeliveryBatchDeliveryConfirm, db: Session = Depends(get_db)):
    batch = load_batch_detail(db, batch_id)
    logistics = trip_of(batch, payload.logistics_id)
    if not logistics:
        raise HTTPException(status_code=422, detail="Yetkazildi deb belgilash uchun avval transportni biriktiring.")
    if batch.status in {BatchStatus.cancelled, BatchStatus.issue, BatchStatus.completed}:
        raise HTTPException(status_code=422, detail="Ushbu partiya holatida yetkazishni tasdiqlab bo'lmaydi.")
    # Mashina va haydovchi -- o'zimiz tashiydigan reysning shartlari.
    # Ta'minotchi yetkazadigan partiyada ular bo'lmaydi.
    if is_company_managed(batch) and not logistics.vehicle_number and not logistics.carrier_name and not logistics.driver_name:
        raise HTTPException(status_code=422, detail="Yetkazildi deb belgilash uchun avval transportni biriktiring.")
    actual_loading_date = logistics.actual_pickup_date or batch.actual_loading_date
    if not actual_loading_date:
        raise HTTPException(status_code=422, detail="Yetkazildi deb belgilash uchun avval yuklashni tasdiqlang.")
    if logistics.status not in {LogisticsStatus.loaded, LogisticsStatus.in_transit, LogisticsStatus.arrived, LogisticsStatus.unloading}:
        raise HTTPException(status_code=422, detail="Yetkazildi deb belgilash uchun partiya avval yuklangan yoki yo'lda bo'lishi kerak.")
    if payload.actual_delivery_date < actual_loading_date:
        raise HTTPException(status_code=422, detail="Haqiqiy yetkazish sanasi haqiqiy yuklash sanasidan oldin bo'lishi mumkin emas.")

    apply_measurements(logistics, payload, ("unloading_temperature_c", "unloading_seal", "arrived_at"))
    logistics.actual_delivery_date = payload.actual_delivery_date
    logistics.status = LogisticsStatus.delivered
    # Partiyaning yetkazish sanasi -- oxirgi mashina yetkazgan kun.
    if not batch.actual_delivery_date or payload.actual_delivery_date > batch.actual_delivery_date:
        batch.actual_delivery_date = payload.actual_delivery_date
    sync_batch_status_from_logistics(batch)
    mark_stock_delivered_for_batch(db, batch)
    for item in batch.items:
        item.accepted_quantity = None
        item.difference_quantity = None
    if payload.notes:
        logistics.notes = payload.notes
        batch.notes = payload.notes
        db.add(DeliveryBatchNote(delivery_batch_id=batch.id, note=payload.notes, created_by="system"))
    sync_order_status(batch.order, db=db)
    db.commit()
    return get_batch_detail(batch.id, db)


@router.post("/{batch_id}/complete", response_model=DeliveryBatchDetail, dependencies=[Depends(require_edit("yetkazib_berish"))])
def complete_batch(batch_id: int, payload: DeliveryBatchCompletionConfirm, db: Session = Depends(get_db)):
    batch = load_batch_detail(db, batch_id)
    logistics = batch.logistics
    if not any(item.accepted_quantity is not None for item in batch.items):
        raise HTTPException(status_code=422, detail="Partiyani yakunlash uchun avval qabul qilingan miqdorni kiriting.")
    if not logistics or logistics.status not in {LogisticsStatus.delivered, LogisticsStatus.accepted, LogisticsStatus.completed}:
        raise HTTPException(status_code=422, detail="Partiyani yakunlash uchun logistika jarayoni yakunlangan bo'lishi kerak.")
    required_documents = {BatchDocumentType.ttn, BatchDocumentType.acceptance_act}
    uploaded_documents = {document.document_type for document in batch.documents}
    if not required_documents.issubset(uploaded_documents) and not payload.allow_missing_documents:
        raise HTTPException(status_code=409, detail="Majburiy hujjatlar hali to'liq yuklanmagan.")
    for item in batch.items:
        calculate_batch_item(item)
    if any(item.difference_quantity is not None and item.difference_quantity != 0 for item in batch.items) and not payload.allow_quantity_difference:
        raise HTTPException(status_code=409, detail="Yuklangan va qabul qilingan miqdor farq qiladi.")
    # Bazaga qaytgach olinadigan raqamlar shu oynada kiritiladi, shuning uchun
    # tekshiruvdan oldin yoziladi -- aks holda hozirgina kiritilgani hisobga
    # olinmay, oyna bekorga ogohlantirardi.
    apply_measurements(logistics, payload, ("odometer_end_km", "fuel_after_liters", "fuel_added_liters", "returned_at"))
    sync_fuel_and_distance(logistics)
    # Reys yopilayotgan payt -- masofani monitoringdan olishning eng to'g'ri
    # vaqti: sanalar allaqachon ma'lum va marshrut hali so'ralmagan.
    # Muvaffaqiyatsizlik yakunlashni to'smaydi, sababi izohga yoziladi.
    distance_problem = apply_measured_distance(db, logistics)
    # Datchik ko'rsatkichi ham shu yerda olinadi: tekshiruvdan oldin, ya'ni
    # «bak qoldig'i mos emas» ogohlantirishi yakunlash paytida ko'rinadi,
    # keyin emas.
    sensor_problem = apply_sensor_fuel(db, logistics)
    trip = trip_check_for(logistics)
    # Partiyada bir nechta reys bo'lishi mumkin. Faqat birinchisini
    # tekshirish -- qolganlari yarim yo'lda turganda ham partiyani yopib
    # yuborish demak, ya'ni ularning odometri va bak qoldig'i abadiy
    # bo'sh qolardi.
    for other in batch.trips:
        if other.id == logistics.id:
            continue
        extra = trip_check_for(other)
        trip.blocking.extend(f"{other.logistics_number or other.id}: {message}" for message in extra.blocking)
        trip.soft.extend(f"{other.logistics_number or other.id}: {message}" for message in extra.soft)
    if trip.blocking:
        raise HTTPException(status_code=422, detail=trip.blocking[0])
    if trip.soft and not payload.allow_missing_trip_data:
        raise HTTPException(status_code=409, detail=f"{trip_completion_check.MSG_TRIP_DATA_MISSING}: {', '.join(trip.soft)}")

    batch.status = BatchStatus.completed
    if logistics.status in {LogisticsStatus.delivered, LogisticsStatus.accepted, LogisticsStatus.completed}:
        logistics.status = LogisticsStatus.completed
    note_parts = [f"Yakunlash sanasi: {payload.completed_date.isoformat()}"]
    if trip.soft:
        note_parts.append(f"{trip_completion_check.MSG_TRIP_DATA_SKIPPED}: {', '.join(trip.soft)}")
    if logistics.measured_distance_km is not None:
        note_parts.append(f"Monitoring bo'yicha probeg: {logistics.measured_distance_km} km")
    elif distance_problem:
        note_parts.append(f"Probegni monitoringdan olib bo'lmadi: {distance_problem}")
    if logistics.sensor_fuel_before_liters is not None or logistics.sensor_fuel_after_liters is not None:
        note_parts.append(
            f"Datchik bo'yicha bak: {fmt_liters(logistics.sensor_fuel_before_liters)}"
            f" -> {fmt_liters(logistics.sensor_fuel_after_liters)} litr"
        )
    elif sensor_problem:
        note_parts.append(f"Datchik ko'rsatkichini olib bo'lmadi: {sensor_problem}")
    if logistics.sensor_fuel_drop_liters:
        note_parts.append(f"Turgan joyda bak kamaygan: {logistics.sensor_fuel_drop_liters} litr")
    if payload.notes:
        note_parts.append(payload.notes)
        batch.notes = payload.notes
        logistics.notes = payload.notes
    db.add(DeliveryBatchNote(delivery_batch_id=batch.id, note="\n".join(note_parts), created_by="system"))
    sync_order_status(batch.order, db=db)
    db.commit()
    return get_batch_detail(batch.id, db)


@router.patch("/{batch_id}", response_model=DeliveryBatchDetail, dependencies=[Depends(require_edit("yetkazib_berish"))])
def update_batch(batch_id: int, payload: DeliveryBatchUpdate, db: Session = Depends(get_db)):
    batch = load_batch_detail(db, batch_id)
    old_vehicle_number = batch.logistics.vehicle_number if batch.logistics else None
    order = get_order_or_400(db, payload.order_id or batch.order_id)
    if payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=422, detail="Partiyada kamida bitta mahsulot bo'lishi kerak.")
        validate_items(db, order, payload.items, batch.id)
    data = payload.model_dump(exclude_unset=True, exclude={"items", "logistics"})
    if "order_id" in data:
        data["client_id"] = order.client_id
        data["contract_id"] = order.contract_id
        data["fulfillment_type"] = order.fulfillment_type.value
        data["source_type"] = order.source_type.value
        # Yetkazish nuqtasi buyurtmadan meros bo'ladi: u shartnomadan
        # buyurtmaga, buyurtmadan partiyaga tushadi va yo'lda yo'qolmaydi.
        if not data.get("delivery_point_id"):
            data["delivery_point_id"] = order.delivery_point_id
    update_model(batch, data)
    if payload.items is not None:
        order_items = {item.id: item for item in order.items}
        for existing_item in list(batch.items):
            db.delete(existing_item)
        db.flush()
        for item_payload in payload.items:
            db.add(build_batch_item(order_items[item_payload.order_item_id], item_payload, batch.id))
        db.flush()
        db.expire(batch, ["items"])
    update_batch_status_from_items(batch)
    logistics = ensure_logistics(db, batch, payload.logistics)
    sync_order_status(batch.order, db=db)
    db.commit()
    if logistics.vehicle_number and logistics.vehicle_number != old_vehicle_number:
        notify_driver_of_trip(db, logistics)
    return get_batch_detail(batch.id, db)


@router.delete("/{batch_id}", status_code=204, dependencies=[Depends(require_edit("yetkazib_berish"))])
def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, batch_id)
    if db.scalar(select(func.count()).where(CustomerInvoice.delivery_batch_id == batch_id)):
        raise HTTPException(
            status_code=422,
            detail="Mijoz hisob-fakturalari mavjud partiyani o'chirib bo'lmaydi. Avval ularni olib tashlang.",
        )
    order = batch.order
    db.query(StockAllocation).filter(StockAllocation.delivery_batch_id == batch_id).update(
        {StockAllocation.delivery_batch_id: None},
        synchronize_session=False,
    )
    db.delete(batch)
    db.flush()
    sync_order_status(order, db=db)
    db.commit()
    return Response(status_code=204)


@router.post("/{batch_id}/items", response_model=DeliveryBatchItemRead, status_code=201, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_batch_item(batch_id: int, payload: DeliveryBatchItemCreate, db: Session = Depends(get_db)):
    batch = load_batch_detail(db, batch_id)
    order_items = validate_items(db, batch.order, [payload], batch.id)
    item = build_batch_item(order_items[payload.order_item_id], payload, batch.id)
    db.add(item)
    db.flush()
    update_batch_status_from_items(batch)
    sync_order_status(batch.order, db=db)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{batch_id}/items/{item_id}", response_model=DeliveryBatchItemRead, dependencies=[Depends(require_edit("yetkazib_berish"))])
def update_batch_item(batch_id: int, item_id: int, payload: DeliveryBatchItemUpdate, db: Session = Depends(get_db)):
    batch = load_batch_detail(db, batch_id)
    item = get_child_or_404(db, DeliveryBatchItem, "delivery_batch_id", batch_id, item_id)
    merged = DeliveryBatchItemCreate(
        order_item_id=payload.order_item_id or item.order_item_id,
        planned_quantity=payload.planned_quantity or item.planned_quantity,
        loaded_quantity=item.loaded_quantity if payload.loaded_quantity is None else payload.loaded_quantity,
        accepted_quantity=item.accepted_quantity if payload.accepted_quantity is None else payload.accepted_quantity,
        comment=item.comment if payload.comment is None else payload.comment,
    )
    order_items = validate_items(db, batch.order, [merged], batch.id)
    order_item = order_items[merged.order_item_id]
    item.order_item_id = order_item.id
    item.contract_item_id = order_item.contract_item_id
    item.product_name = order_item.product_name
    item.unit = order_item.unit
    item.planned_quantity = merged.planned_quantity
    item.loaded_quantity = merged.loaded_quantity
    item.accepted_quantity = merged.accepted_quantity
    item.comment = merged.comment
    update_batch_status_from_items(batch)
    sync_order_status(batch.order, db=db)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{batch_id}/items/{item_id}", status_code=204, dependencies=[Depends(require_edit("yetkazib_berish"))])
def delete_batch_item(batch_id: int, item_id: int, db: Session = Depends(get_db)):
    batch = load_batch_detail(db, batch_id)
    if len(batch.items) <= 1:
        raise HTTPException(status_code=422, detail="Partiyada kamida bitta mahsulot bo'lishi kerak.")
    item = get_child_or_404(db, DeliveryBatchItem, "delivery_batch_id", batch_id, item_id)
    db.delete(item)
    db.flush()
    update_batch_status_from_items(batch)
    sync_order_status(batch.order, db=db)
    db.commit()
    return Response(status_code=204)


@router.post("/{batch_id}/documents", response_model=DeliveryBatchDocumentRead, status_code=201, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_batch_document(batch_id: int, payload: DeliveryBatchDocumentCreate, db: Session = Depends(get_db)):
    get_batch_or_404(db, batch_id)
    document = DeliveryBatchDocument(delivery_batch_id=batch_id, **payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.post("/{batch_id}/documents/upload", response_model=DeliveryBatchDocumentRead, status_code=201, dependencies=[Depends(require_edit("yetkazib_berish"))])
def upload_batch_document(
    batch_id: int,
    document_type: BatchDocumentType = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=422, detail="Fayl majburiy.")
    get_batch_or_404(db, batch_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name.replace(" ", "_")
    stored_name = f"{uuid4().hex}_{safe_name}"
    destination = UPLOAD_DIR / stored_name
    with destination.open("wb") as buffer:
        copyfileobj(file.file, buffer)
    document = DeliveryBatchDocument(
        delivery_batch_id=batch_id,
        document_type=document_type,
        title=title,
        file_url=f"/static/uploads/delivery-batches/{stored_name}",
        # Hujjatni kim yuklaganini brauzer emas, sessiya aytadi -- ilgari bu
        # formadagi matn qutisi edi va odatda bo'sh qolardi.
        uploaded_by=user.username,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.patch("/{batch_id}/documents/{document_id}", response_model=DeliveryBatchDocumentRead, dependencies=[Depends(require_edit("yetkazib_berish"))])
def update_batch_document(batch_id: int, document_id: int, payload: DeliveryBatchDocumentUpdate, db: Session = Depends(get_db)):
    document = get_child_or_404(db, DeliveryBatchDocument, "delivery_batch_id", batch_id, document_id)
    update_model(document, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(document)
    return document


@router.delete("/{batch_id}/documents/{document_id}", status_code=204, dependencies=[Depends(require_edit("yetkazib_berish"))])
def delete_batch_document(batch_id: int, document_id: int, db: Session = Depends(get_db)):
    document = get_child_or_404(db, DeliveryBatchDocument, "delivery_batch_id", batch_id, document_id)
    db.delete(document)
    db.commit()
    return Response(status_code=204)


@router.post("/{batch_id}/notes", response_model=DeliveryBatchNoteRead, status_code=201, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_batch_note(batch_id: int, payload: DeliveryBatchNoteCreate, db: Session = Depends(get_db)):
    get_batch_or_404(db, batch_id)
    note = DeliveryBatchNote(delivery_batch_id=batch_id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{batch_id}/notes/{note_id}", status_code=204, dependencies=[Depends(require_edit("yetkazib_berish"))])
def delete_batch_note(batch_id: int, note_id: int, db: Session = Depends(get_db)):
    note = get_child_or_404(db, DeliveryBatchNote, "delivery_batch_id", batch_id, note_id)
    db.delete(note)
    db.commit()
    return Response(status_code=204)


@logistics_router.get("", response_model=Page[LogisticsListItem])
def list_logistics(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    client_id: int | None = None,
    contract_id: int | None = None,
    order_id: int | None = None,
    overdue_only: bool = False,
    linked: str | None = Query(default=None, pattern="^(yes|no)$"),
    group: str | None = Query(default=None, pattern="^(moving|problem)$"),
):
    stmt = select(Logistics).join(DeliveryBatch).join(Order).join(Client).options(selectinload(Logistics.batch).selectinload(DeliveryBatch.client), selectinload(Logistics.batch).selectinload(DeliveryBatch.order), selectinload(Logistics.batch).selectinload(DeliveryBatch.items), selectinload(Logistics.transport)).distinct()
    # Mashina biriktirilmagan reys hech qaysi mashinaning xulosasiga
    # tushmaydi, shuning uchun ularni alohida ko'rish kerak bo'ladi.
    if linked == "no":
        stmt = stmt.where(Logistics.transport_id.is_(None))
    elif linked == "yes":
        stmt = stmt.where(Logistics.transport_id.isnot(None))
    if search:
        value = f"%{search}%"
        stmt = stmt.where(or_(Logistics.logistics_number.ilike(value), DeliveryBatch.batch_number.ilike(value), Logistics.carrier_name.ilike(value), Logistics.driver_name.ilike(value), Logistics.driver_phone.ilike(value), Logistics.vehicle_number.ilike(value), Client.name.ilike(value), Order.order_number.ilike(value)))
    if status_filter:
        stmt = stmt.where(Logistics.status == status_filter)
    if client_id:
        stmt = stmt.where(DeliveryBatch.client_id == client_id)
    if contract_id:
        stmt = stmt.where(DeliveryBatch.contract_id == contract_id)
    if order_id:
        stmt = stmt.where(DeliveryBatch.order_id == order_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Logistics.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    items = []
    for row in rows:
        base = logistics_read(row).model_dump()
        items.append(
            LogisticsListItem(
                **base,
                batch=row.batch,
                client=row.batch.client,
                order=row.batch.order,
                fulfillment_type=row.batch.fulfillment_type,
            )
        )
    return Page(items=items, total=total, page=page, page_size=page_size)


@logistics_router.get("/{logistics_id}", response_model=LogisticsDetail)
def get_logistics_detail(logistics_id: int, db: Session = Depends(get_db)):
    logistics = db.scalars(select(Logistics).where(Logistics.id == logistics_id).options(selectinload(Logistics.batch).selectinload(DeliveryBatch.client), selectinload(Logistics.batch).selectinload(DeliveryBatch.order), selectinload(Logistics.batch).selectinload(DeliveryBatch.items), selectinload(Logistics.transport), selectinload(Logistics.documents), selectinload(Logistics.notes_history))).first()
    if not logistics:
        raise HTTPException(status_code=404, detail="Logistika topilmadi.")
    base = logistics_read(logistics).model_dump()
    return LogisticsDetail(
        **base,
        batch=logistics.batch,
        client=logistics.batch.client,
        order=logistics.batch.order,
        documents=logistics.documents,
        notes_history=logistics.notes_history,
    )


@logistics_router.get("/{logistics_id}/live")
def logistics_live(logistics_id: int, db: Session = Depends(get_db)) -> dict:
    """Reysdagi mashina hozir qayerda.

    Javob har doim keladi -- monitoring o'chiq yoki mashina biriktirilmagan
    bo'lsa, sababi bilan. Reys kartochkasi tashqi tizim tufayli yiqilmasligi
    kerak.
    """
    logistics = db.get(Logistics, logistics_id)
    if not logistics:
        raise HTTPException(status_code=404, detail="Logistika topilmadi.")
    if not logistics.transport_id:
        return {"available": False, "reason": "Reysga parkdagi mashina biriktirilmagan", "vehicle": None}
    transport = db.get(Transport, logistics.transport_id)
    if not transport:
        return {"available": False, "reason": "Transport topilmadi", "vehicle": None}
    return transport_live_payload(transport)


def trip_window(logistics: Logistics) -> tuple[date, date] | None:
    """Reys qaysi kunlarni qamragan.

    Vaqt nuqtalari bo'lsa ular aniqroq; bo'lmasa haqiqiy yuklash va yetkazish
    sanalari olinadi. Ikkalasi ham bo'lmasa masofani so'rashning ma'nosi yo'q.
    """
    start = logistics.departed_at.date() if logistics.departed_at else logistics.actual_pickup_date
    end = logistics.returned_at.date() if logistics.returned_at else logistics.actual_delivery_date
    end = end or start
    start = start or end
    if not start or not end:
        return None
    return (start, end) if start <= end else (end, start)


def apply_measured_distance(db: Session, logistics: Logistics) -> str | None:
    """Reys masofasini monitoringdan oladi.

    Odometr SMNda deyarli hamma mashinada nol, marshrut masofasi esa aniq
    ishlaydi -- shuning uchun manba aynan u. Qo'lda kiritilgan masofa ustun
    turadi: o'lchov yordam, buyruq emas.
    """
    transport = db.get(Transport, logistics.transport_id) if logistics.transport_id else None
    if not transport or not transport.smn_object_id:
        return smn.MSG_NOT_LINKED
    window = trip_window(logistics)
    if not window:
        return "Reys sanalari kiritilmagan"
    result = smn.track(transport.smn_object_id, window[0], window[1])
    if not result.ok:
        return result.error
    # SMNning tayyor `distanceKm` raqami butun kunga tegishli. Mashina o'sha
    # kuni yana boshqa reys qilgan bo'lsa, u raqam bu reysniki emas --
    # shuning uchun jo'nash va qaytish vaqti ma'lum bo'lsa, nuqtalarni o'sha
    # oynaga qisqartirib o'lchaymiz.
    distance = track_distance.distance_for_window(
        result.data, logistics.departed_at, logistics.returned_at
    )
    if distance is None:
        return "Monitoringda bu kunlar uchun marshrut yo'q"
    logistics.measured_distance_km = Decimal(str(distance))
    # GPS masofasi ilgari qo'lda kiritilardi va odatda bo'sh qolardi -- shu
    # sababdan «odometr va GPS mos emas» tekshiruvi umuman ishlamasdi.
    # Monitoring o'lchagan probeg aynan shu raqam.
    if logistics.gps_distance_km is None:
        logistics.gps_distance_km = Decimal(str(distance))
    # Umumiy masofa odometrdan olinadi -- u haydovchi qayd etgan rasmiy
    # raqam. Monitoring uni tekshiradi, o'rniga yozilmaydi.
    if logistics.distance_km is None:
        logistics.distance_km = Decimal(str(distance))
    return None


def fmt_liters(value) -> str:
    return "?" if value is None else str(value)


def trip_moments(logistics: Logistics) -> tuple[datetime, datetime] | None:
    """Reysning aniq boshlanish va tugash payti.

    Vaqt nuqtalari bo'lmasa haqiqiy sanalarning boshi va oxiri olinadi:
    kunlik oyna aniq emas, lekin butunlay tekshirmaslikdan yaxshiroq.
    """
    start = logistics.departed_at
    end = logistics.returned_at
    if start is None and logistics.actual_pickup_date:
        start = datetime.combine(logistics.actual_pickup_date, time.min)
    if end is None and logistics.actual_delivery_date:
        end = datetime.combine(logistics.actual_delivery_date, time.max)
    if start is None or end is None or end < start:
        return None
    return start, end


def apply_sensor_fuel(db: Session, logistics: Logistics) -> str | None:
    """Reysning ikki uchidagi bak ko'rsatkichini monitoringdan oladi.

    Haydovchi aytgan raqam o'z o'rnida qoladi -- bu tekshiruv, almashtirish
    emas. Qo'shimcha ravishda reys ichida mashina turgan joyda bak keskin
    kamaygan bo'lsa, o'sha miqdor yig'ib beriladi: sliv aynan shunday
    ko'rinadi va uni haydovchining hisobotisiz ham ko'rish mumkin.
    """
    transport = db.get(Transport, logistics.transport_id) if logistics.transport_id else None
    if not transport or not transport.smn_object_id:
        return smn.MSG_NOT_LINKED
    window = trip_moments(logistics)
    if not window:
        return "Reys sanalari kiritilmagan"
    start, end = window
    logistics.sensor_fuel_before_liters = fuel_watch.fuel_at(db, transport.id, start)
    logistics.sensor_fuel_after_liters = fuel_watch.fuel_at(db, transport.id, end)
    drops = fuel_watch.detect_drops(fuel_watch.samples_between(db, transport.id, start, end))
    logistics.sensor_fuel_drop_liters = sum((d.liters for d in drops), Decimal("0")) if drops else None
    if logistics.sensor_fuel_before_liters is None and logistics.sensor_fuel_after_liters is None:
        # Namunalar reysdan keyin yig'ila boshlagan bo'lsa shunday bo'ladi.
        return "Bu reys uchun datchik namunalari yo'q"
    return None


@logistics_router.patch("/{logistics_id}", response_model=LogisticsRead, dependencies=[Depends(require_edit("yetkazib_berish"))])
def update_logistics(logistics_id: int, payload: LogisticsUpdate, db: Session = Depends(get_db)):
    logistics = db.scalars(select(Logistics).where(Logistics.id == logistics_id).options(selectinload(Logistics.batch).selectinload(DeliveryBatch.items), selectinload(Logistics.batch).selectinload(DeliveryBatch.order))).first()
    if not logistics:
        raise HTTPException(status_code=404, detail="Logistika topilmadi.")
    old_vehicle_number = logistics.vehicle_number
    data = payload.model_dump(exclude_unset=True)
    validate_logistics_dates(data)
    guard_transport_model(logistics.batch, data.get("transport_id"))
    guard_transport_available(db, data.get("transport_id"))
    requested_status = data.get("status")
    update_model(logistics, data)
    if requested_status == LogisticsStatus.completed:
        trip = trip_check_for(logistics)
        if trip.blocking:
            raise HTTPException(status_code=422, detail=trip.blocking[0])
    apply_transport_to_logistics(db, logistics, provided=set(data))
    sync_actual_dates_from_timeline(logistics)
    sync_fuel_and_distance(logistics)
    open_siphoning_event(db, logistics)
    sync_logistics_status(logistics, logistics.batch, requested_status)
    sync_batch_status_from_logistics(logistics.batch, logistics)
    sync_order_status(logistics.batch.order, db=db)
    db.commit()
    db.refresh(logistics)
    if logistics.vehicle_number and logistics.vehicle_number != old_vehicle_number:
        notify_driver_of_trip(db, logistics)
    return logistics_read(logistics)


@logistics_router.delete("/{logistics_id}", status_code=204, dependencies=[Depends(require_edit("yetkazib_berish"))])
def delete_trip(logistics_id: int, db: Session = Depends(get_db)):
    """Ortiqcha reysni o'chiradi.

    Boshlangan reysga tegilmaydi: uning odometri, bak qoldig'i va
    hujjatlari bor, ular partiya hisobining bir qismi. Partiyaning oxirgi
    reysi ham o'chirilmaydi -- reyssiz partiya yetkazib bo'lmaydigan
    yozuvga aylanadi.
    """
    logistics = db.get(Logistics, logistics_id)
    if not logistics:
        raise HTTPException(status_code=404, detail="Logistika topilmadi.")
    if logistics.status not in (LogisticsStatus.not_assigned, LogisticsStatus.carrier_assigned, LogisticsStatus.vehicle_assigned):
        raise HTTPException(status_code=422, detail=MSG_TRIP_STARTED)
    if logistics.actual_pickup_date or logistics.odometer_start_km is not None:
        raise HTTPException(status_code=422, detail=MSG_TRIP_STARTED)
    batch = logistics.batch
    if batch and len(batch.trips) <= 1:
        raise HTTPException(status_code=422, detail="Partiyaning yagona reysini o'chirib bo'lmaydi.")
    db.delete(logistics)
    db.commit()
    return None


@logistics_router.post("/{logistics_id}/documents", response_model=LogisticsDocumentRead, status_code=201, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_logistics_document(logistics_id: int, payload: LogisticsDocumentCreate, db: Session = Depends(get_db)):
    if not db.get(Logistics, logistics_id):
        raise HTTPException(status_code=404, detail="Logistika topilmadi.")
    document = LogisticsDocument(logistics_id=logistics_id, **payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@logistics_router.post("/{logistics_id}/notes", response_model=LogisticsNoteRead, status_code=201, dependencies=[Depends(require_edit("yetkazib_berish"))])
def create_logistics_note(logistics_id: int, payload: LogisticsNoteCreate, db: Session = Depends(get_db)):
    if not db.get(Logistics, logistics_id):
        raise HTTPException(status_code=404, detail="Logistika topilmadi.")
    note = LogisticsNote(logistics_id=logistics_id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
