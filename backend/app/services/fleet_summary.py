"""Park bo'yicha davr xulosasi: kim qancha yurdi, qancha yedi, qancha turdi.

Bitumovozlarni nazorat qiladigan jadvalning bosh varag'i shu edi: davrni
tanlaysiz va o'sha davrda har bir mashina bo'yicha reyslar, tonna,
kilometr, yoqilg'i, normadan chetlanish, slivga shubha, buzilishlar,
ta'mir tufayli turib qolish va TO gacha qolgan masofa bitta jadvalda
chiqadi.

Bu yerda hech narsa yangidan hisoblanmaydi: reys hisobi logistics_fuel.py
da, ta'mir hisobi transport_repairs.py da, hujjat holati
transport_readiness.py da. Bu modul ularni davr bo'yicha yig'adi, xolos --
shunda bir sahifadagi raqam boshqa sahifadagidan farq qilib qolmaydi.

Davr chegarasi reysning haqiqiy yuklash sanasi bo'yicha olinadi: reys
qachon boshlangan bo'lsa, o'sha oyning hisobiga kiradi.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class VehicleRow:
    transport_id: int
    vehicle_number: str
    driver_name: str | None = None
    status: str = ""
    trip_count: int = 0
    delivered_tons: Decimal = Decimal("0")
    distance_km: Decimal = Decimal("0")
    fuel_liters: Decimal = Decimal("0")
    norm_liters: Decimal = Decimal("0")
    difference_liters: Decimal = Decimal("0")
    difference_percent: Decimal | None = None
    suspected_liters: Decimal = Decimal("0")
    event_count: int = 0
    unchecked_event_count: int = 0
    damage_amount: Decimal = Decimal("0")
    repair_downtime_hours: Decimal = Decimal("0")
    repair_amount: Decimal = Decimal("0")
    open_repair_count: int = 0
    remaining_to_service_km: Decimal | None = None
    document_level: str = "unknown"
    warnings: list[str] = field(default_factory=list)


@dataclass
class FleetTotals:
    vehicle_count: int = 0
    trip_count: int = 0
    delivered_tons: Decimal = Decimal("0")
    distance_km: Decimal = Decimal("0")
    fuel_liters: Decimal = Decimal("0")
    norm_liters: Decimal = Decimal("0")
    difference_liters: Decimal = Decimal("0")
    suspected_liters: Decimal = Decimal("0")
    event_count: int = 0
    unchecked_event_count: int = 0
    damage_amount: Decimal = Decimal("0")
    repair_downtime_hours: Decimal = Decimal("0")
    repair_amount: Decimal = Decimal("0")
    unavailable_count: int = 0
    document_risk_count: int = 0


@dataclass
class FleetSummary:
    date_from: date | None = None
    date_to: date | None = None
    totals: FleetTotals = field(default_factory=FleetTotals)
    rows: list[VehicleRow] = field(default_factory=list)


def percent_of(part: Decimal, whole: Decimal) -> Decimal | None:
    if not whole:
        return None
    return (part / whole * Decimal("100")).quantize(Decimal("0.01"))


def build_summary(*, vehicles: list[dict], date_from: date | None, date_to: date | None) -> FleetSummary:
    """`vehicles` -- har bir mashina uchun tayyorlangan lug'at.

    Yig'ish shu yerda bo'lgani uchun API qatlami faqat ma'lumot yig'adi,
    qoida esa bitta joyda qoladi.
    """
    summary = FleetSummary(date_from=date_from, date_to=date_to)
    for vehicle in vehicles:
        row = VehicleRow(
            transport_id=vehicle["transport_id"],
            vehicle_number=vehicle["vehicle_number"],
            driver_name=vehicle.get("driver_name"),
            status=vehicle.get("status", ""),
            remaining_to_service_km=vehicle.get("remaining_to_service_km"),
            document_level=vehicle.get("document_level", "unknown"),
            warnings=list(vehicle.get("warnings") or []),
        )
        for trip in vehicle.get("trips", []):
            row.trip_count += 1
            row.delivered_tons += Decimal(trip.get("tons") or 0)
            row.distance_km += Decimal(trip.get("distance_km") or 0)
            row.fuel_liters += Decimal(trip.get("fuel_liters") or 0)
            row.norm_liters += Decimal(trip.get("norm_liters") or 0)
            row.suspected_liters += Decimal(trip.get("suspected_liters") or 0)
        row.difference_liters = (row.fuel_liters - row.norm_liters).quantize(Decimal("0.01"))
        row.difference_percent = percent_of(row.difference_liters, row.norm_liters)
        row.event_count = vehicle.get("event_count", 0)
        row.unchecked_event_count = vehicle.get("unchecked_event_count", 0)
        row.damage_amount = Decimal(vehicle.get("damage_amount") or 0)
        row.repair_downtime_hours = Decimal(vehicle.get("repair_downtime_hours") or 0)
        row.repair_amount = Decimal(vehicle.get("repair_amount") or 0)
        row.open_repair_count = vehicle.get("open_repair_count", 0)
        summary.rows.append(row)

    totals = summary.totals
    totals.vehicle_count = len(summary.rows)
    for row in summary.rows:
        totals.trip_count += row.trip_count
        totals.delivered_tons += row.delivered_tons
        totals.distance_km += row.distance_km
        totals.fuel_liters += row.fuel_liters
        totals.norm_liters += row.norm_liters
        totals.suspected_liters += row.suspected_liters
        totals.event_count += row.event_count
        totals.unchecked_event_count += row.unchecked_event_count
        totals.damage_amount += row.damage_amount
        totals.repair_downtime_hours += row.repair_downtime_hours
        totals.repair_amount += row.repair_amount
        if row.open_repair_count:
            totals.unavailable_count += 1
        if row.document_level in {"expired", "soon"}:
            totals.document_risk_count += 1
    totals.difference_liters = (totals.fuel_liters - totals.norm_liters).quantize(Decimal("0.01"))

    # Eng ko'p chetlangani yuqorida: xulosa qaraladigan tartib shu.
    summary.rows.sort(key=lambda item: (item.suspected_liters, item.difference_liters), reverse=True)
    return summary
