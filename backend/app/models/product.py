from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import TimestampMixin
from backend.app.models.contract import DeliveryMethod


class ProductCategory(Base, TimestampMixin):
    __tablename__ = "product_categories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    # Bu turkumdagi mahsulot odatda qanday yetkaziladi. Faqat SUKUT qiymat:
    # partiya yaratilganda oldindan tanlab qo'yiladi, lekin operator uni
    # almashtira oladi. Qattiq bog'lansa, birinchi istisnoda -- masalan katta
    # bitum partiyasi temiryo'l sisternasida ketganda -- tizimni aylanib
    # o'tishga to'g'ri kelardi.
    default_delivery_method: Mapped[DeliveryMethod | None] = mapped_column(SAEnum(DeliveryMethod, length=16))

    products: Mapped[list["Product"]] = relationship(back_populates="category", cascade="all, delete-orphan")


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("product_categories.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    category: Mapped["ProductCategory"] = relationship(back_populates="products")
