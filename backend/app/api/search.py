"""Butun tizim bo'ylab tez qidiruv.

Operator ko'pincha aniq bir hujjatni izlaydi: shartnoma raqamini, mijoz nomini
yoki buyurtma raqamini biladi va o'sha kartochkani ochmoqchi. Buning uchun
avval kerakli bo'limni topib, keyin o'sha bo'limning filtridan foydalanish
kerak edi -- ya'ni qaysi bo'limda ekanini oldindan bilish shart edi.

Bu yerda hammasi bitta so'rovda qidiriladi va natija turi bo'yicha guruhlanadi.
Har bir turdan sanoqli qator olinadi: bu tezkor qidiruv, to'liq ro'yxat emas --
ko'proq kerak bo'lsa, o'sha bo'limning o'z filtri bor.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.client import Client
from backend.app.models.contract import Contract
from backend.app.models.delivery import DeliveryBatch
from backend.app.models.order import Order

router = APIRouter(prefix="/api/search", tags=["search"])

# Har bir turdan nechta qator qaytariladi.
PER_TYPE = 5


def like(value: str) -> str:
    return f"%{value.strip()}%"


@router.get("")
def global_search(q: str = Query(default="", min_length=0, max_length=120), db: Session = Depends(get_db)):
    text = (q or "").strip()
    if len(text) < 2:
        return {"query": text, "groups": []}
    pattern = like(text)
    groups = []

    clients = db.scalars(
        select(Client)
        .where(or_(Client.name.ilike(pattern), Client.inn.ilike(pattern), Client.phone.ilike(pattern)))
        .order_by(Client.name)
        .limit(PER_TYPE)
    ).all()
    if clients:
        groups.append({
            "key": "clients",
            "label": "Mijozlar",
            "items": [
                {"title": row.name, "subtitle": row.inn or "", "path": f"/clients/{row.id}"}
                for row in clients
            ],
        })

    contracts = db.scalars(
        select(Contract)
        .options(selectinload(Contract.client))
        .where(or_(Contract.contract_number.ilike(pattern), Contract.customer_name.ilike(pattern)))
        .order_by(Contract.contract_date.desc())
        .limit(PER_TYPE)
    ).all()
    if contracts:
        groups.append({
            "key": "contracts",
            "label": "Shartnomalar",
            "items": [
                {
                    "title": row.contract_number,
                    "subtitle": row.customer_name or (row.client.name if row.client else ""),
                    "path": f"/contracts/{row.id}",
                }
                for row in contracts
            ],
        })

    orders = db.scalars(
        select(Order)
        .options(selectinload(Order.client))
        .where(or_(Order.order_number.ilike(pattern), Order.supplier_name.ilike(pattern)))
        .order_by(Order.order_date.desc())
        .limit(PER_TYPE)
    ).all()
    if orders:
        groups.append({
            "key": "orders",
            "label": "Buyurtmalar",
            "items": [
                {
                    "title": row.order_number,
                    "subtitle": row.client.name if row.client else "",
                    "path": f"/orders/{row.id}",
                }
                for row in orders
            ],
        })

    batches = db.scalars(
        select(DeliveryBatch)
        .options(selectinload(DeliveryBatch.client))
        .where(DeliveryBatch.batch_number.ilike(pattern))
        .order_by(DeliveryBatch.batch_date.desc())
        .limit(PER_TYPE)
    ).all()
    if batches:
        groups.append({
            "key": "batches",
            "label": "Partiyalar",
            "items": [
                {
                    "title": row.batch_number,
                    "subtitle": row.client.name if row.client else "",
                    "path": f"/delivery-batches/{row.id}",
                }
                for row in batches
            ],
        })

    return {"query": text, "groups": groups}
