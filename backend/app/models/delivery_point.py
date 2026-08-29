"""ABZ nuqtalari -- bitum yetkaziladigan joylar.

Yetkazish manzili shu paytgacha erkin matn edi va u har bosqichda qaytadan
yozilardi: mijoz kartochkasida bir xil, talabnomada boshqacha, partiyada
uchinchi xil. Haydovchiga esa aynan qayerga borishini aytish kerak, va bu
manzil yil davomida o'zgarmaydi -- ABZ o'z joyida turadi.

Shuning uchun nuqta alohida ma'lumotnoma bo'ldi: viloyat, tuman, to'liq
manzil, mas'ul shaxs va uning telefoni, GPS koordinatasi. Talabnoma,
shartnoma, buyurtma va partiya endi shu nuqtaga ishora qiladi -- manzil
ularning har birida qayta yozilmaydi.

Koordinata matn sifatida saqlanadi, xuddi mijoz manzillaridagi kabi:
haydovchi uni telefoniga ko'chirib qo'yadi va uning aniqligi bizning
hisob-kitobimizga kirmaydi.
"""

from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, Enum as SAEnum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.client import Client, TimestampMixin


class DeliveryPointStatus(str, Enum):
    """Nuqtaning ish holati.

    Ilgari bu `is_active` -- ha yoki yo'q edi. Amalda oraliq holatlar bor:
    ABZ ishlayapti, lekin e'tibor talab qiladi (masalan hujjati yoki
    mas'uli yo'q), yoki hali ochilmagan va rejada turibdi. Ikkalasini ham
    «faol emas» deb belgilash ularni ro'yxatdan yashirib yuboradi.
    """

    active = "active"
    attention = "attention"
    inactive = "inactive"
    planned = "planned"


# Yangi yetkazishga tanlash mumkin bo'lgan holatlar. Rejadagi nuqta hali
# ochilmagan, faol emasi esa yopilgan -- ikkalasiga ham yuk yuborilmaydi.
SELECTABLE_STATUSES = (DeliveryPointStatus.active, DeliveryPointStatus.attention)


class DeliveryPointType(str, Enum):
    abz = "abz"
    warehouse = "warehouse"
    object_site = "object_site"
    other = "other"


class DeliveryPoint(Base, TimestampMixin):
    __tablename__ = "delivery_points"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code: Mapped[str | None] = mapped_column(String(64), index=True)
    point_type: Mapped[DeliveryPointType] = mapped_column(
        SAEnum(DeliveryPointType), default=DeliveryPointType.abz, nullable=False, index=True
    )
    # Nuqta odatda mijozniki, lekin o'z bazamiz ham nuqta bo'lishi mumkin --
    # shuning uchun bog'lanish majburiy emas.
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)

    region: Mapped[str | None] = mapped_column(String(255), index=True)
    district: Mapped[str | None] = mapped_column(String(255), index=True)
    address: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[str | None] = mapped_column(String(64))
    longitude: Mapped[str | None] = mapped_column(String(64))

    responsible_name: Mapped[str | None] = mapped_column(String(255))
    responsible_position: Mapped[str | None] = mapped_column(String(255))
    responsible_phone: Mapped[str | None] = mapped_column(String(64), index=True)
    responsible_email: Mapped[str | None] = mapped_column(String(255))

    working_hours: Mapped[str | None] = mapped_column(String(255))
    # Kunlik quvvat -- bir kunda qancha bitum qabul qila oladi. Sisterna
    # hajmi bilan aralashtirmaslik kerak: u bir marta qancha sig'ishini
    # aytadi, bu esa kuniga qancha o'tishini.
    daily_capacity_tons: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    # Sisternani qabul qila oladigan hajm -- reja tuzishda kerak bo'ladi.
    tank_capacity_tons: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[DeliveryPointStatus] = mapped_column(
        SAEnum(DeliveryPointStatus), default=DeliveryPointStatus.active, nullable=False, index=True
    )

    client: Mapped[Client | None] = relationship()

    # Hisoblanadigan maydonlar modelda turadi, API qatlamida emas: nuqta
    # to'rtta boshqa bo'limda ko'rsatiladi va har birida alohida yig'ilsa,
    # birida tuman qo'shiladi, boshqasida qo'shilmaydi -- bir xil nuqta ikki
    # xil ko'rinadi. Pydantic ularni `from_attributes` orqali o'zi oladi.
    @property
    def full_address(self) -> str | None:
        parts = [self.region, self.district, self.address]
        return ", ".join(part.strip() for part in parts if part and part.strip()) or None

    @property
    def is_active(self) -> bool:
        """Eski nom: interfeys va API filtrlarida hali ishlatiladi."""
        return self.status in SELECTABLE_STATUSES

    @property
    def map_url(self) -> str | None:
        """Ichki xarita yo'q, shuning uchun havola tashqi xizmatga boradi:
        haydovchi uni telefonida ochadi."""
        if not self.latitude or not self.longitude:
            return None
        return f"https://maps.google.com/?q={self.latitude},{self.longitude}"
