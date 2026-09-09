"""Bu partiyaga qaysi mashinani berish mumkin.

Transport biriktirish oynasi oddiy ro'yxat edi: davlat raqami, haydovchi
va ikkita belgi. Dispetcher esa boshqa savollarga javob izlaydi -- qaysi
mashina bo'sh, qaysi biri yuklash nuqtasiga yaqin, bakida yoqilg'i
yetadimi, sig'imi yukni ko'taradimi. Ularning hech biri ekranda yo'q edi,
natijada ikkita mashina bir vaqtda ikkitadan reysga biriktirilib qolgan.

Shu yerda har bir mashina uchun uchta narsa hisoblanadi:

* **to'siqlar** -- ta'mirda, TO da yoki faol emas. Bunday mashinaga reys
  berilmaydi, chunki u yo'lga chiqa olmaydi.
* **ogohlantirishlar** -- hujjat muddati, TO muddati, boshqa reysda
  ekani, sig'im yetmasligi. Bular ishni to'xtatmaydi: dispetcher
  sababini bilib turib qaror qiladi.
* **holat** -- monitoringdagi joylashuv, yuklash nuqtasigacha masofa va
  bakdagi yoqilg'i.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.delivery import DeliveryBatch, Logistics, LogisticsStatus
from backend.app.models.delivery_point import DeliveryPoint
from backend.app.models.transport import Transport, TransportStatus, UNAVAILABLE_STATUSES
from backend.app.services import transport_readiness
from backend.app.services.point_distance import road_km, straight_line_km

# Mashina shu holatlardagi reysda bo'lsa, u ayni paytda ish bilan band.
BUSY_STATUSES = (
    LogisticsStatus.carrier_assigned,
    LogisticsStatus.vehicle_assigned,
    LogisticsStatus.loading,
    LogisticsStatus.loaded,
    LogisticsStatus.in_transit,
    LogisticsStatus.arrived,
    LogisticsStatus.unloading,
)

MSG_UNAVAILABLE = {
    TransportStatus.repair: "Ta'mirda",
    TransportStatus.service: "Texnik xizmatda",
    TransportStatus.inactive: "Faol emas",
}
MSG_BUSY = "Hozir boshqa reysda"
# Sana bo'yicha bandlik: reys hali boshlanmagan bo'lsa ham, rejasi shu
# partiya bilan ustma-ust tushsa, mashina ikki joyga yozib qo'yilgan
# bo'ladi. Ilgari faqat «hozir yo'ldami» tekshirilardi, ya'ni ertangi
# kunga bitta mashinani ikki partiyaga bemalol biriktirsa bo'lardi.
MSG_BOOKED = "Shu kunlarga band"
MSG_CAPACITY = "Sig'imi yetmaydi"
MSG_CAPACITY_UNKNOWN = "Sisterna sig'imi kiritilmagan"
MSG_DOCUMENTS = "Hujjat yoki TO muddati o'tgan"


def _dec(value) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def planned_quantity(batch: DeliveryBatch | None) -> Decimal:
    if not batch:
        return Decimal("0")
    return sum((_dec(item.planned_quantity) or Decimal("0") for item in batch.items), Decimal("0"))


def distance_to_point(vehicle: dict | None, point: DeliveryPoint | None) -> Decimal | None:
    """Mashinadan yuklash nuqtasigacha taxminiy yo'l masofasi.

    To'g'ri chiziq yo'l koeffitsienti bilan -- xuddi reja masofasi kabi.
    Aniq marshrut emas, lekin «qaysi mashina yaqinroq» degan savolga
    javob berish uchun yetadi.
    """
    if not vehicle or not point:
        return None
    straight = straight_line_km(vehicle.get("lat"), vehicle.get("lng"), point.latitude, point.longitude)
    return road_km(straight)


def planned_window(batch: DeliveryBatch) -> tuple[date | None, date | None]:
    """Partiya qaysi kunlarni egallaydi."""
    logistics = batch.logistics
    start = (logistics.planned_pickup_date if logistics else None) or batch.planned_loading_date
    end = (logistics.planned_delivery_date if logistics else None) or batch.planned_delivery_date
    return start or end, end or start


def windows_overlap(a_start, a_end, b_start, b_end) -> bool:
    """Ikki reja oynasi kesishadimi. Sanasi noma'lum bo'lsa -- kesishmaydi
    deb hisoblanadi: taxmin qilib ogohlantirish chiqarish shovqin bo'lardi."""
    if not a_start or not a_end or not b_start or not b_end:
        return False
    return a_start <= b_end and b_start <= a_end


def build_candidates(db: Session, batch: DeliveryBatch, live: dict | None = None) -> list[dict]:
    """Parkdagi har bir mashina uchun qaror qilishga kerak bo'lgan hamma narsa."""
    transports = list(db.scalars(select(Transport).order_by(Transport.vehicle_number)))
    needed = planned_quantity(batch)
    loading_point = db.get(DeliveryPoint, batch.loading_point_id) if batch.loading_point_id else None
    vehicles = (live or {}).get("vehicles") or {}

    window_start, window_end = planned_window(batch)
    busy_map: dict[int, list[Logistics]] = {}
    booked_map: dict[int, list[Logistics]] = {}
    for row in db.scalars(
        select(Logistics).where(
            Logistics.transport_id.isnot(None),
            Logistics.status.notin_((
                LogisticsStatus.completed,
                LogisticsStatus.cancelled,
                LogisticsStatus.delivered,
                LogisticsStatus.accepted,
            )),
        )
    ):
        if batch.logistics and row.id == batch.logistics.id:
            continue
        if row.status in BUSY_STATUSES:
            busy_map.setdefault(row.transport_id, []).append(row)
        if windows_overlap(window_start, window_end, row.planned_pickup_date, row.planned_delivery_date):
            booked_map.setdefault(row.transport_id, []).append(row)

    today = date.today()
    result = []
    for transport in transports:
        blockers: list[str] = []
        warnings: list[str] = []

        if transport.status in UNAVAILABLE_STATUSES:
            blockers.append(MSG_UNAVAILABLE.get(transport.status, "Yo'lga chiqa olmaydi"))

        busy = busy_map.get(transport.id) or []
        if busy:
            warnings.append(MSG_BUSY)
        # Ikkala ogohlantirish mustaqil: mashina hozir yo'lda bo'lishi va
        # ayni shu kunlarga band bo'lishi -- bu ikki xil ma'lumot, va
        # dispetcherga ikkalasi ham kerak. Sanalarni izohda ko'rsatamiz,
        # shunda qaysi reys band qilgani izlab yurilmaydi.
        booked = booked_map.get(transport.id) or []
        if booked:
            warnings.append(MSG_BOOKED)

        readiness = transport_readiness.build_readiness(transport, today=today)
        if readiness.level == transport_readiness.LEVEL_EXPIRED:
            warnings.append(MSG_DOCUMENTS)

        capacity = _dec(transport.capacity_tons)
        if capacity is None:
            warnings.append(MSG_CAPACITY_UNKNOWN)
        elif needed > capacity:
            warnings.append(MSG_CAPACITY)

        vehicle = vehicles.get(str(transport.id))
        result.append({
            "id": transport.id,
            "vehicle_number": transport.vehicle_number,
            "trailer_number": transport.trailer_number,
            "driver_name": transport.driver_name,
            "driver_phone": transport.driver_phone,
            "status": transport.status.value,
            "capacity_tons": transport.capacity_tons,
            "readiness_level": readiness.level,
            "busy_trips": [
                {"id": row.id, "number": row.logistics_number, "status": row.status.value}
                for row in busy
            ],
            "booked_trips": [
                {
                    "id": row.id,
                    "number": row.logistics_number,
                    "from": row.planned_pickup_date,
                    "to": row.planned_delivery_date,
                }
                for row in booked
            ],
            "live": vehicle,
            "distance_km": distance_to_point(vehicle, loading_point),
            "blockers": blockers,
            "warnings": warnings,
        })

    # Tartib: bera oladiganlari tepada, ular ichida yuklash nuqtasiga
    # yaqini birinchi. Masofasi noma'lumi oxirida -- taxmin qilib
    # tepaga chiqarish noto'g'ri bo'lardi.
    def sort_key(row):
        return (
            bool(row["blockers"]),
            bool(row["warnings"]),
            row["distance_km"] is None,
            row["distance_km"] or Decimal("0"),
            row["vehicle_number"] or "",
        )

    result.sort(key=sort_key)
    return result
