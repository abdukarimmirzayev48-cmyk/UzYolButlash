"""Region and district reference data.

Read by every form that asks for an address. Regions are fixed; districts grow
as they are entered, which is why there is a create endpoint but no update --
renaming a district would silently change the address of every record already
pointing at it, and that is a decision for a data cleanup, not a form.

Ro'yxat SOATO tasniflagichidan to'ldirilgan va ekrandan boshqarilmaydi:
o'chirish yoki qayta nomlash uchun endpoint yo'q. Tuman qo'shish esa
qoladi -- manzil formasi ro'yxatda yo'q tumanni yozib qo'ya olishi kerak.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.geo import District, Region
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
