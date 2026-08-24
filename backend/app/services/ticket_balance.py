"""Ticket bo'yicha qancha mol olingan va qancha qolgan.

Ticket -- kvota. Undagi miqdor bir yo'la emas, bo'lib-bo'lib olinadi, olingani
esa zaxiradan mijozlarga yana bo'lib-bo'lib ketadi. Ya'ni bitta ticketda ikkita
har xil «qoldiq» bor va ularni chalkashtirish oson:

* **kvotada qolgan** -- ta'minotchidan yana olish mumkin bo'lgan miqdor;
* **zaxirada erkin** -- allaqachon olib kelingan, lekin hali birorta
  buyurtmaga biriktirilmagan miqdor.

Ilgari ticket ochilishi bilan butun miqdor zaxiraga tushardi, shuning uchun
birinchi raqam umuman mavjud emas edi: hali bazadan chiqmagan mol ham bizniki
bo'lib hisoblanardi.

Zaxira tomonidagi arifmetika `StockLot` dagi hisoblardan kelib chiqadi:
biriktirishda `available` kamayadi va `reserved` oshadi, yuklashda esa
`reserved` kamayadi. Demak mijozga ketgan miqdor -- dastlabkidan erkin va band
qolganini ayirgan qismi.
"""

from dataclasses import dataclass
from decimal import Decimal

MSG_OVER_INTAKE = "Ticket kvotasidan ortiq mol olib bo'lmaydi"
MSG_QUOTA_UNUSED = "Ticket kvotasidan olinmagan miqdor bor"
MSG_NOTHING_TAKEN = "Ticket bo'yicha hali mol olinmagan"


@dataclass
class TicketBalance:
    quota: Decimal = Decimal("0")
    taken: Decimal = Decimal("0")
    available: Decimal = Decimal("0")
    reserved: Decimal = Decimal("0")

    @property
    def remaining_on_ticket(self) -> Decimal:
        """Ta'minotchidan yana olish mumkin bo'lgan miqdor."""
        return max(Decimal("0"), self.quota - self.taken)

    @property
    def shipped(self) -> Decimal:
        """Olinganidan mijozga ketgan qismi."""
        return max(Decimal("0"), self.taken - self.available - self.reserved)


def quantity_text(value: Decimal) -> str:
    text = f"{value:,.3f}".rstrip("0").rstrip(".")
    return text.replace(",", " ")


def build_balance(*, quota: Decimal, intakes: list[Decimal], available: Decimal, reserved: Decimal) -> TicketBalance:
    return TicketBalance(
        quota=Decimal(quota or 0),
        taken=sum((Decimal(value or 0) for value in intakes), Decimal("0")),
        available=Decimal(available or 0),
        reserved=Decimal(reserved or 0),
    )


def warnings_for(balance: TicketBalance) -> list[str]:
    if balance.taken <= 0:
        return [MSG_NOTHING_TAKEN]
    if balance.remaining_on_ticket > 0:
        return [f"{MSG_QUOTA_UNUSED}: {quantity_text(balance.remaining_on_ticket)}"]
    return []
