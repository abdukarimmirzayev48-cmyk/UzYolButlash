"""Reysni bir bosqich orqaga qaytarish.

Bosqichlar faqat oldinga yurardi. Xato kiritilgan sana yoki miqdorni
tuzatishning yagona yo'li -- «to'liq tahrirlash» formasida statusni
qo'lda almashtirish edi. U esa faqat yorliqni o'zgartiradi: yuklash
sanasi, odometr, bak qoldig'i va tarozi o'z joyida qolaverardi, ya'ni
yozuv «yuklanmagan» deb turar, ostida esa yuklash raqamlari bo'lardi.

Shu yerda har bir bosqich uchun qaysi maydonlar o'sha bosqichda
to'ldirilgani yozilgan. Orqaga qaytishda aynan o'shalar tozalanadi --
sababi bilan birga tarixga yoziladi, chunki tuzatish ham hujjat.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.app.models.delivery import LogisticsStatus


@dataclass(frozen=True)
class Stage:
    """Bitta bosqich: qaysi holatdan qaysi holatga qaytadi va nima tozalanadi."""

    status: LogisticsStatus
    previous: LogisticsStatus
    label: str
    clears: tuple[str, ...] = field(default_factory=tuple)


# Qaytarish zanjiri. Tartib muhim: ro'yxatdagi birinchi mos keladigan
# yozuv ishlatiladi.
STAGES = (
    Stage(
        status=LogisticsStatus.accepted,
        previous=LogisticsStatus.delivered,
        label="Qabul",
        clears=("accepted_quantity",),
    ),
    Stage(
        status=LogisticsStatus.delivered,
        previous=LogisticsStatus.loaded,
        label="Yetkazildi",
        clears=("actual_delivery_date", "unloading_temperature_c", "unloading_seal",
                "arrived_at", "unloading_started_at", "unloading_finished_at"),
    ),
    Stage(
        status=LogisticsStatus.unloading,
        previous=LogisticsStatus.in_transit,
        label="Tushirilmoqda",
        clears=("unloading_started_at",),
    ),
    Stage(
        status=LogisticsStatus.arrived,
        previous=LogisticsStatus.in_transit,
        label="Yetib bordi",
        clears=("arrived_at",),
    ),
    Stage(
        status=LogisticsStatus.in_transit,
        previous=LogisticsStatus.loaded,
        label="Yo'lda",
        clears=(),
    ),
    Stage(
        status=LogisticsStatus.loaded,
        previous=LogisticsStatus.vehicle_assigned,
        label="Yuklandi",
        clears=("actual_pickup_date", "loaded_quantity", "odometer_start_km",
                "fuel_before_liters", "gross_weight_tons", "tare_weight_tons",
                "loading_temperature_c", "loading_seal", "departed_at",
                "loading_started_at", "loading_finished_at"),
    ),
    Stage(
        status=LogisticsStatus.vehicle_assigned,
        previous=LogisticsStatus.not_assigned,
        label="Transport biriktirildi",
        clears=("transport_id", "vehicle_number", "trailer_number", "driver_name", "driver_phone"),
    ),
    Stage(
        status=LogisticsStatus.carrier_assigned,
        previous=LogisticsStatus.not_assigned,
        label="Tashuvchi biriktirildi",
        clears=("carrier_id", "carrier_name", "driver_name", "driver_phone"),
    ),
)

STAGE_BY_STATUS = {stage.status: stage for stage in STAGES}

MSG_NOTHING_TO_REVERT = "Bu reys boshlang'ich bosqichda -- orqaga qaytariladigan narsa yo'q"
MSG_COMPLETED = "Yakunlangan reysni orqaga qaytarib bo'lmaydi"
MSG_REASON_REQUIRED = "Orqaga qaytarish sababini yozing"


def stage_for(status: LogisticsStatus) -> Stage | None:
    return STAGE_BY_STATUS.get(status)


def revert(logistics, stage: Stage) -> None:
    """Bosqichda to'ldirilgan maydonlarni tozalaydi va holatni qaytaradi."""
    for name in stage.clears:
        setattr(logistics, name, None)
    logistics.status = stage.previous
