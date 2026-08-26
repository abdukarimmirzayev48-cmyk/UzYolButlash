"""To'lov raqamini serverda berish.

Raqam brauzerda yasalardi va u mijoz tanlanishidan oldin -- ya'ni mijoz
identifikatori hali yo'q paytda -- hisoblanardi. Maydon esa faqat o'qish
uchun, shuning uchun keyin mijoz tanlansa ham raqam bo'sh qolar, saqlashda
`payment_number: matn bo'lishi kerak` degan xato chiqardi va to'lovni umuman
kiritib bo'lmasdi.

Buning ustiga brauzer bazani ko'rmaydi. Uchta sahifa uchta xil formatda raqam
yasardi -- `CPAY-20260825-90`, `CPAY-20260821-102041-3`, `CPAY-20260727-265` --
va bir xil raqam ikki marta chiqib qolishidan hech narsa saqlamasdi: raqamga
mijoz identifikatori qo'shilgani sababli, bitta mijozdan bir kunda ikkita
to'lov kelsa ikkalasi ham bir xil raqam olardi.

Shuning uchun raqam bu yerda, bazadagi mavjudlariga qarab beriladi. Format
`<PREFIX>-YYYYMMDD-NN`: sana odam o'qiy oladigan ko'rinishda, oxiridagi tartib
raqami esa o'sha kundagi bo'sh o'rinni topguncha oshiriladi.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

# Bir kunda shuncha to'lovdan keyin raqam berish to'xtaydi. Bu chegara emas,
# cheksiz aylanishdan himoya: real kunlik hajm bir necha o'nlab.
MAX_DAILY_SEQUENCE = 999


def next_payment_number(db: Session, column, prefix: str, on_date: date) -> str:
    """`column` -- raqam saqlanadigan ustun, masalan `CustomerPayment.payment_number`."""
    day = f"{prefix}-{on_date.strftime('%Y%m%d')}"
    taken = set(db.scalars(select(column).where(column.like(f"{day}%"))).all())
    for sequence in range(1, MAX_DAILY_SEQUENCE + 1):
        candidate = f"{day}-{sequence:02d}"
        if candidate not in taken:
            return candidate
    # Bu yerga yetib kelish amalda mumkin emas, lekin jim qolgandan ko'ra
    # aytgan yaxshi: raqamsiz to'lov saqlansa, uni keyin topib bo'lmaydi.
    raise ValueError(f"{day} kuni uchun bo'sh to'lov raqami qolmadi.")
