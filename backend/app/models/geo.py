"""Reference tables for regions and districts.

Addresses used to store the region as free text on both the client form and the
supplier form, while the list page built its filter dropdown from whatever had
been typed. One inconsistent entry ("Toshkent sh." next to "Toshkent shahri")
therefore created a second region and split the filter in two: half the clients
under each spelling, with nothing on screen suggesting anything was wrong. The
data happens to be clean today, which is luck rather than a guarantee.

Regions are a closed list -- Uzbekistan has fourteen and they change roughly
never, so they are seeded and picked from a dropdown.

Districts are deliberately *not* seeded. Nothing in this database holds an
authoritative district list: the column was empty everywhere, and the names
that can be scraped out of the free-text legal addresses carry the province
prefix on some rows, two spellings of the same district on others, and at least
one typo. Seeding from that would bake the very inconsistency this table exists
to remove. So the table starts empty and fills as districts are entered, each
one attached to its region -- after the first entry everyone else picks it from
the list instead of retyping it.
"""

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin


class Region(Base, TimestampMixin):
    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Stored exactly as it already appears in client_addresses, so switching the
    # form to a dropdown does not orphan a single existing record.
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    districts: Mapped[list["District"]] = relationship(
        back_populates="region", cascade="all, delete-orphan", order_by="District.name"
    )


class District(Base, TimestampMixin):
    __tablename__ = "districts"
    __table_args__ = (UniqueConstraint("region_id", "name", name="uq_district_region_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    region: Mapped[Region] = relationship(back_populates="districts")
