"""Region and district reference data.

Read by every form that asks for an address. Regions are fixed; districts grow
as they are entered, which is why there is a create endpoint but no update --
renaming a district would silently change the address of every record already
pointing at it, and that is a decision for a data cleanup, not a form.

O'chirish bor, lekin faqat hech qayerda ishlatilmagan tuman uchun. Manzil
matn bo'lib saqlanadi, ya'ni tashqi kalit bog'lanishi yo'q: shuning uchun
foydalanish nomi bo'yicha tekshiriladi. Ishlatilayotgani o'chirilsa, o'sha
yozuvlarning tumani ro'yxatda yo'q nomga aylanib qolardi.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.client import ClientAddress
from backend.app.models.delivery_point import DeliveryPoint
from backend.app.models.geo import District, Region
from backend.app.models.inventory import StockLocation
from backend.app.models.procurement import SupplierAddress
from backend.app.services.auth import require_edit

router = APIRouter(prefix="/api/geo", tags=["geo"])


class DistrictRead(BaseModel):
    id: int
    name: str


class RegionRead(BaseModel):
    id: int
    name: str
    districts: list[DistrictRead]


class DistrictCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


@router.get("/regions", response_model=list[RegionRead])
def list_regions(db: Session = Depends(get_db)):
    regions = db.scalars(
        select(Region).options(selectinload(Region.districts)).order_by(Region.sort_order, Region.name)
    ).all()
    return [
        RegionRead(
            id=region.id,
            name=region.name,
            districts=[DistrictRead(id=d.id, name=d.name) for d in region.districts],
        )
        for region in regions
    ]


@router.post(
    "/regions/{region_id}/districts",
    response_model=DistrictRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_edit("sotuv"))],
)
def create_district(region_id: int, payload: DistrictCreate, db: Session = Depends(get_db)):
    region = db.get(Region, region_id)
    if region is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hudud topilmadi.")
    name = payload.name.strip()
    # Case-insensitive, so "Shahrixon" cannot join "shahrixon" in the list --
    # two spellings of one district is exactly what this table prevents.
    existing = next((d for d in region.districts if d.name.casefold() == name.casefold()), None)
    if existing is not None:
        return DistrictRead(id=existing.id, name=existing.name)
    district = District(region_id=region.id, name=name)
    db.add(district)
    db.commit()
    db.refresh(district)
    return DistrictRead(id=district.id, name=district.name)


# Tuman qayerda ishlatilishi mumkin. Bog'lanish tashqi kalit emas, matn --
# shuning uchun har bir jadval nomi bo'yicha tekshiriladi.
DISTRICT_USED_IN = (
    (DeliveryPoint, DeliveryPoint.region, DeliveryPoint.district),
    (ClientAddress, ClientAddress.region, ClientAddress.district),
    (SupplierAddress, SupplierAddress.region, SupplierAddress.district),
    (StockLocation, StockLocation.region, StockLocation.district),
)


def district_usage(db: Session, region_name: str, district_name: str) -> int:
    total = 0
    for model, region_column, district_column in DISTRICT_USED_IN:
        total += db.scalar(
            select(func.count()).select_from(model).where(
                region_column == region_name, district_column == district_name
            )
        ) or 0
    return total


@router.delete(
    "/regions/{region_id}/districts/{district_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_edit("sotuv"))],
)
def delete_district(region_id: int, district_id: int, db: Session = Depends(get_db)):
    district = db.get(District, district_id)
    if district is None or district.region_id != region_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tuman topilmadi.")
    used = district_usage(db, district.region.name, district.name)
    if used:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu tuman manzillarda ishlatilmoqda, shuning uchun o'chirilmaydi.",
        )
    db.delete(district)
    db.commit()
