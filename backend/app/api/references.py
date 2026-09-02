"""Ma'lumotnomalar bo'limi.

Ma'lumotnoma -- tanlanadigan, kam o'zgaradigan va o'z hayot sikli yo'q
ma'lumot: mahsulot kartochkasi, mijoz, tuman, stansiya. Buyurtma yoki
partiya esa operatsion -- ularning sanasi, summasi va holat oqimi bor.

Ilgari ular operatsion sahifalar orasiga sochilib ketgan edi, uchtasining
esa sahifasi umuman yo'q edi: viloyat/tuman, korxonalar reyestri va ombor
joylari faqat boshqa formaning ichidan ko'rinardi yoki umuman ko'rinmasdi.

Bu yerda ikki narsa bor: bosh sahifadagi kartochkalar uchun sanoq, va
o'z sahifasi yo'q ikkita ma'lumotnoma uchun ro'yxat.

Yorliq va manzil ataylab bu yerda emas: ular ekranga tegishli va
frontendda turadi. Server faqat sanoqni beradi.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.attendance import Department, Employee
from backend.app.models.client import Client
from backend.app.models.customer_request import CompanyRegistry
from backend.app.models.delivery_point import DeliveryPoint, DeliveryPointType
from backend.app.models.geo import District, Region
from backend.app.models.inventory import StockLocation, StockLocationType
from backend.app.models.procurement import Supplier
from backend.app.models.product import Product, ProductCategory
from backend.app.models.transport import Transport
from backend.app.schemas.client import Page
from backend.app.services.auth import require_edit

router = APIRouter(prefix="/api/references", tags=["references"])


class ReferenceCount(BaseModel):
    count: int = 0
    updated_at: datetime | None = None


def counted(db: Session, model, *conditions) -> ReferenceCount:
    """Yozuvlar soni va oxirgi o'zgarish sanasi.

    `updated_at` ustuni yo'q jadval ham bor (tuman, bo'lim) -- unda sana
    bo'sh qoladi va kartochkada ko'rsatilmaydi.
    """
    stmt = select(func.count()).select_from(model)
    if conditions:
        stmt = stmt.where(*conditions)
    count = db.scalar(stmt) or 0
    updated = None
    column = getattr(model, "updated_at", None) or getattr(model, "created_at", None)
    if column is not None:
        stmt = select(func.max(column))
        if conditions:
            stmt = stmt.where(*conditions)
        updated = db.scalar(stmt)
    return ReferenceCount(count=count, updated_at=updated)


@router.get("/summary", response_model=dict[str, ReferenceCount])
def references_summary(db: Session = Depends(get_db)):
    return {
        "clients": counted(db, Client),
        "suppliers": counted(db, Supplier),
        "company_registry": counted(db, CompanyRegistry),
        "products": counted(db, Product),
        "product_categories": counted(db, ProductCategory),
        "delivery_points": counted(db, DeliveryPoint, DeliveryPoint.point_type != DeliveryPointType.railway_station),
        "railway_stations": counted(db, DeliveryPoint, DeliveryPoint.point_type == DeliveryPointType.railway_station),
        "stock_locations": counted(db, StockLocation),
        "regions": counted(db, Region),
        "districts": counted(db, District),
        "employees": counted(db, Employee),
        "departments": counted(db, Department),
        "transports": counted(db, Transport),
    }


# ---- Korxonalar reyestri --------------------------------------------------
#
# Faqat o'qish uchun: reyestr tashqaridan import qilinadi va talabnoma
# to'ldirishda ishlatiladi. Uni qo'lda tahrirlash import bilan ziddiyatga
# olib kelardi -- keyingi import o'zgarishni bekor qilib yuboradi.


class CompanyRegistryRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    inn: str
    company_name: str
    region: str | None = None
    oked: str | None = None
    director_full_name: str | None = None
    legal_address: str | None = None
    bank_name: str | None = None
    mfo: str | None = None
    bank_account: str | None = None
    phone: str | None = None


@router.get("/company-registry", response_model=Page[CompanyRegistryRow])
def list_company_registry(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    region: str | None = None,
):
    conditions = []
    if region:
        conditions.append(CompanyRegistry.region == region)
    if search:
        value = f"%{search}%"
        conditions.append(
            or_(
                CompanyRegistry.company_name.ilike(value),
                CompanyRegistry.inn.ilike(value),
                CompanyRegistry.director_full_name.ilike(value),
                CompanyRegistry.oked.ilike(value),
            )
        )
    stmt = select(CompanyRegistry)
    if conditions:
        stmt = stmt.where(*conditions)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(CompanyRegistry.company_name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return Page(items=[CompanyRegistryRow.model_validate(row) for row in rows], total=total, page=page, page_size=page_size)


# ---- Ombor joylari --------------------------------------------------------


class StockLocationRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    location_type: StockLocationType
    name: str
    supplier_id: int | None = None
    supplier_name: str | None = None
    region: str | None = None
    district: str | None = None
    address: str | None = None
    lot_count: int = 0


class StockLocationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    location_type: StockLocationType = StockLocationType.company_warehouse
    supplier_id: int | None = None
    region: str | None = None
    district: str | None = None
    address: str | None = None


class StockLocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    location_type: StockLocationType | None = None
    supplier_id: int | None = None
    region: str | None = None
    district: str | None = None
    address: str | None = None


def location_row(location: StockLocation) -> StockLocationRow:
    return StockLocationRow(
        id=location.id,
        location_type=location.location_type,
        name=location.name,
        supplier_id=location.supplier_id,
        supplier_name=location.supplier.name if location.supplier else None,
        region=location.region,
        district=location.district,
        address=location.address,
        lot_count=len(location.stock_lots),
    )


def get_location_or_404(db: Session, location_id: int) -> StockLocation:
    location = db.get(StockLocation, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ombor joyi topilmadi.")
    return location


@router.get("/stock-locations", response_model=list[StockLocationRow])
def list_stock_locations(db: Session = Depends(get_db), search: str | None = None):
    stmt = select(StockLocation).options(
        selectinload(StockLocation.supplier), selectinload(StockLocation.stock_lots)
    )
    if search:
        value = f"%{search}%"
        stmt = stmt.where(or_(StockLocation.name.ilike(value), StockLocation.address.ilike(value)))
    return [location_row(row) for row in db.scalars(stmt.order_by(StockLocation.name)).unique()]


@router.post(
    "/stock-locations",
    response_model=StockLocationRow,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_edit("taminot"))],
)
def create_stock_location(payload: StockLocationCreate, db: Session = Depends(get_db)):
    location = StockLocation(**payload.model_dump())
    db.add(location)
    db.commit()
    db.refresh(location)
    return location_row(location)


@router.patch(
    "/stock-locations/{location_id}",
    response_model=StockLocationRow,
    dependencies=[Depends(require_edit("taminot"))],
)
def update_stock_location(location_id: int, payload: StockLocationUpdate, db: Session = Depends(get_db)):
    location = get_location_or_404(db, location_id)
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(location, name, value)
    db.commit()
    db.refresh(location)
    return location_row(location)


@router.delete(
    "/stock-locations/{location_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_edit("taminot"))],
)
def delete_stock_location(location_id: int, db: Session = Depends(get_db)):
    location = get_location_or_404(db, location_id)
    # Partiya turgan omborni o'chirish o'sha partiyani qayerdaligi noma'lum
    # qilib qo'yardi. Bo'shatilgandan keyin o'chiriladi.
    if location.stock_lots:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu omborda zaxira partiyasi bor. Avval uni boshqa joyga o'tkazing.",
        )
    db.delete(location)
    db.commit()
