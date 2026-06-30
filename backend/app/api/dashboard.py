from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.client import Client
from backend.app.models.contract import Contract, ContractStatus
from backend.app.models.delivery import BatchStatus, DeliveryBatch, DeliveryBatchItem, Logistics
from backend.app.models.finance import CustomerInvoice, CustomerPayment, InvoiceStatus, InvoiceType, PaymentStatus
from backend.app.models.order import Order, OrderStatus
from backend.app.models.procurement import Procurement, Supplier
from backend.app.models.supplier_finance import (
    SupplierInvoice,
    SupplierInvoiceStatus,
    SupplierInvoiceType,
    SupplierPayment,
    SupplierPaymentStatus,
)


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
MONEY = Decimal("0.01")
PERCENT = Decimal("0.1")
REVENUE_TYPES = {InvoiceType.batch_payment, InvoiceType.transport, InvoiceType.adjustment}
SUPPLIER_COST_TYPES = {SupplierInvoiceType.product_purchase, SupplierInvoiceType.adjustment}


def money(value: Decimal | None) -> Decimal:
    return Decimal(value or 0).quantize(MONEY, rounding=ROUND_HALF_UP)


def percent(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(value).quantize(PERCENT, rounding=ROUND_HALF_UP)


def margin(gross_profit: Decimal, revenue: Decimal) -> Decimal | None:
    if not revenue:
        return None
    return percent(gross_profit / revenue * Decimal("100"))


def in_range(value: date | None, date_from: date | None, date_to: date | None) -> bool:
    if not value:
        return True
    if date_from and value < date_from:
        return False
    if date_to and value > date_to:
        return False
    return True


def enum_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def payment_state(total: Decimal, paid: Decimal) -> str:
    if total <= 0:
        return "none"
    if paid <= 0:
        return "unpaid"
    if paid < total:
        return "partial"
    return "paid"


def page(items: list[dict[str, Any]], total: int, page_no: int, page_size: int) -> dict[str, Any]:
    return {"items": items, "total": total, "page": page_no, "page_size": page_size}


def load_context(db: Session) -> dict[str, Any]:
    return {
        "clients": db.scalars(select(Client).options(selectinload(Client.contracts), selectinload(Client.orders))).all(),
        "contracts": db.scalars(select(Contract).options(selectinload(Contract.client), selectinload(Contract.orders))).all(),
        "orders": db.scalars(select(Order).options(selectinload(Order.client), selectinload(Order.contract), selectinload(Order.delivery_batches), selectinload(Order.procurement))).all(),
        "batches": db.scalars(select(DeliveryBatch).options(selectinload(DeliveryBatch.client), selectinload(DeliveryBatch.order), selectinload(DeliveryBatch.items), selectinload(DeliveryBatch.logistics))).all(),
        "logistics": db.scalars(select(Logistics).options(selectinload(Logistics.batch))).all(),
        "customer_invoices": db.scalars(select(CustomerInvoice).options(selectinload(CustomerInvoice.client), selectinload(CustomerInvoice.contract), selectinload(CustomerInvoice.order), selectinload(CustomerInvoice.delivery_batch), selectinload(CustomerInvoice.allocations))).all(),
        "customer_payments": db.scalars(select(CustomerPayment).options(selectinload(CustomerPayment.client))).all(),
        "procurements": db.scalars(select(Procurement).options(selectinload(Procurement.order))).all(),
        "supplier_invoices": db.scalars(select(SupplierInvoice).options(selectinload(SupplierInvoice.supplier), selectinload(SupplierInvoice.procurement), selectinload(SupplierInvoice.delivery_batch), selectinload(SupplierInvoice.allocations))).all(),
        "supplier_payments": db.scalars(select(SupplierPayment).options(selectinload(SupplierPayment.supplier))).all(),
    }


def filter_orders(ctx: dict[str, Any], client_id: int | None, contract_id: int | None, order_id: int | None, source_type: str | None, fulfillment_type: str | None, status_filter: str | None, date_from: date | None, date_to: date | None) -> list[Order]:
    rows = []
    for order in ctx["orders"]:
        if client_id and order.client_id != client_id:
            continue
        if contract_id and order.contract_id != contract_id:
            continue
        if order_id and order.id != order_id:
            continue
        if source_type and enum_value(order.source_type) != source_type:
            continue
        if fulfillment_type and enum_value(order.fulfillment_type) != fulfillment_type:
            continue
        if status_filter and enum_value(order.status) != status_filter:
            continue
        if not in_range(order.order_date, date_from, date_to):
            continue
        rows.append(order)
    return rows


def invoice_paid(invoice: CustomerInvoice | SupplierInvoice) -> Decimal:
    return money(sum((allocation.allocated_amount for allocation in invoice.allocations), Decimal("0")))


def customer_totals(invoices: list[CustomerInvoice]) -> dict[str, Decimal]:
    included = [i for i in invoices if i.status != InvoiceStatus.cancelled and i.invoice_type in REVENUE_TYPES]
    advance = [i for i in invoices if i.status != InvoiceStatus.cancelled and i.invoice_type == InvoiceType.advance]
    total = money(sum((i.total_amount for i in included), Decimal("0")))
    paid = money(sum((invoice_paid(i) for i in included), Decimal("0")))
    advance_total = money(sum((i.total_amount for i in advance), Decimal("0")))
    advance_paid = money(sum((invoice_paid(i) for i in advance), Decimal("0")))
    return {
        "revenue_subtotal": money(sum((i.subtotal_amount for i in included), Decimal("0"))),
        "revenue_total_with_vat": total,
        "customer_paid": paid,
        "customer_remaining": money(total - paid),
        "customer_advance_invoiced": advance_total,
        "customer_advance_paid": advance_paid,
        "customer_advance_remaining": money(advance_total - advance_paid),
    }


def supplier_totals(invoices: list[SupplierInvoice]) -> dict[str, Decimal]:
    included = [i for i in invoices if i.status != SupplierInvoiceStatus.cancelled and i.invoice_type in SUPPLIER_COST_TYPES]
    advance = [i for i in invoices if i.status != SupplierInvoiceStatus.cancelled and i.invoice_type == SupplierInvoiceType.advance]
    total = money(sum((i.total_amount for i in included), Decimal("0")))
    paid = money(sum((invoice_paid(i) for i in included), Decimal("0")))
    advance_total = money(sum((i.total_amount for i in advance), Decimal("0")))
    advance_paid = money(sum((invoice_paid(i) for i in advance), Decimal("0")))
    return {
        "supplier_purchase_cost_subtotal": money(sum((i.subtotal_amount for i in included), Decimal("0"))),
        "supplier_purchase_cost_total_with_vat": total,
        "supplier_paid": paid,
        "supplier_remaining": money(total - paid),
        "supplier_advance_invoiced": advance_total,
        "supplier_advance_paid": advance_paid,
        "supplier_advance_remaining": money(advance_total - advance_paid),
    }


def logistics_cost(logistics_rows: list[Logistics], supplier_transport_invoices: list[SupplierInvoice]) -> Decimal:
    linked_logistics_ids = {invoice.logistics_id for invoice in supplier_transport_invoices if invoice.logistics_id}
    invoice_cost = money(
        sum(
            (invoice.subtotal_amount for invoice in supplier_transport_invoices if invoice.status != SupplierInvoiceStatus.cancelled),
            Decimal("0"),
        )
    )
    fallback_cost = money(
        sum(
            (row.cost_amount or Decimal("0") for row in logistics_rows if row.id not in linked_logistics_ids),
            Decimal("0"),
        )
    )
    return money(invoice_cost + fallback_cost)


def order_profit_row(order: Order, ctx: dict[str, Any]) -> dict[str, Any]:
    procurements = [p for p in ctx["procurements"] if p.order_id == order.id]
    procurement_ids = {p.id for p in procurements}
    batch_ids = {b.id for b in ctx["batches"] if b.order_id == order.id}
    customer = customer_totals([i for i in ctx["customer_invoices"] if i.order_id == order.id])
    supplier_invoices = [i for i in ctx["supplier_invoices"] if i.procurement_id in procurement_ids]
    supplier = supplier_totals(supplier_invoices)
    transport_invoices = [
        i
        for i in ctx["supplier_invoices"]
        if i.status != SupplierInvoiceStatus.cancelled
        and i.invoice_type == SupplierInvoiceType.transport
        and (i.procurement_id in procurement_ids or i.delivery_batch_id in batch_ids)
    ]
    logistics_rows = [l for l in ctx["logistics"] if l.batch and l.batch.order_id == order.id]
    log_cost = logistics_cost(logistics_rows, transport_invoices)
    gross = money(customer["revenue_subtotal"] - supplier["supplier_purchase_cost_subtotal"] - log_cost)
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "client_id": order.client_id,
        "client_name": order.client.name if order.client else None,
        "contract_id": order.contract_id,
        "contract_number": order.contract.contract_number if order.contract else None,
        "source_type": enum_value(order.source_type),
        "fulfillment_type": enum_value(order.fulfillment_type),
        **customer,
        **supplier,
        "logistics_cost": log_cost,
        "markup_amount": money(order.markup_amount),
        "gross_profit": gross,
        "profit_margin": margin(gross, customer["revenue_subtotal"]),
        "payment_status": payment_state(customer["revenue_total_with_vat"], customer["customer_paid"]),
        "supplier_payment_status": payment_state(supplier["supplier_purchase_cost_total_with_vat"], supplier["supplier_paid"]),
        "order_status": enum_value(order.status),
    }


def get_order_rows(ctx: dict[str, Any], **filters: Any) -> list[dict[str, Any]]:
    return [order_profit_row(order, ctx) for order in filter_orders(ctx, **filters)]


def sum_fields(rows: list[dict[str, Any]], fields: list[str]) -> dict[str, Decimal]:
    return {field: money(sum((row.get(field) or Decimal("0") for row in rows), Decimal("0"))) for field in fields}


def customer_payment_dict(payment: CustomerPayment) -> dict[str, Any]:
    return {
        "id": payment.id,
        "payment_number": payment.payment_number,
        "payment_date": payment.payment_date,
        "client_name": payment.client.name if payment.client else None,
        "amount": payment.amount,
        "status": enum_value(payment.status),
    }


def supplier_payment_dict(payment: SupplierPayment) -> dict[str, Any]:
    return {
        "id": payment.id,
        "payment_number": payment.payment_number,
        "payment_date": payment.payment_date,
        "supplier_name": payment.supplier.name if payment.supplier else None,
        "amount": payment.amount,
        "status": enum_value(payment.status),
    }


@router.get("/profit/orders")
def profit_orders(
    db: Session = Depends(get_db),
    page_no: int = Query(1, alias="page", ge=1),
    page_size: int = Query(20, ge=1, le=100),
    date_from: date | None = None,
    date_to: date | None = None,
    client_id: int | None = None,
    contract_id: int | None = None,
    order_id: int | None = None,
    source_type: str | None = None,
    fulfillment_type: str | None = None,
    status: str | None = None,
):
    ctx = load_context(db)
    rows = get_order_rows(ctx, client_id=client_id, contract_id=contract_id, order_id=order_id, source_type=source_type, fulfillment_type=fulfillment_type, status_filter=status, date_from=date_from, date_to=date_to)
    rows.sort(key=lambda row: row["gross_profit"], reverse=True)
    total = len(rows)
    return page(rows[(page_no - 1) * page_size : page_no * page_size], total, page_no, page_size)


@router.get("/profit/contracts")
def profit_contracts(db: Session = Depends(get_db), page_no: int = Query(1, alias="page", ge=1), page_size: int = Query(20, ge=1, le=100), client_id: int | None = None):
    ctx = load_context(db)
    order_rows = get_order_rows(ctx, client_id=client_id, contract_id=None, order_id=None, source_type=None, fulfillment_type=None, status_filter=None, date_from=None, date_to=None)
    by_contract: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in order_rows:
        by_contract[row["contract_id"]].append(row)
    contracts = {c.id: c for c in ctx["contracts"]}
    rows = []
    for contract_id, grouped in by_contract.items():
        contract = contracts.get(contract_id)
        sums = sum_fields(grouped, ["revenue_subtotal", "revenue_total_with_vat", "customer_paid", "customer_remaining", "supplier_purchase_cost_subtotal", "supplier_purchase_cost_total_with_vat", "supplier_paid", "supplier_remaining", "logistics_cost", "gross_profit"])
        rows.append({
            "contract_id": contract_id,
            "contract_number": contract.contract_number if contract else None,
            "client_id": contract.client_id if contract else None,
            "client_name": contract.client.name if contract and contract.client else None,
            "contract_total_amount": money(contract.total_amount if contract else 0),
            **sums,
            "profit_margin": margin(sums["gross_profit"], sums["revenue_subtotal"]),
            "active_orders_count": sum(1 for row in grouped if row["order_status"] not in {"cancelled", "closed"}),
            "completed_orders_count": sum(1 for row in grouped if row["order_status"] in {"delivered", "closed"}),
        })
    rows.sort(key=lambda row: row["gross_profit"], reverse=True)
    return page(rows[(page_no - 1) * page_size : page_no * page_size], len(rows), page_no, page_size)


@router.get("/profit/clients")
def profit_clients(db: Session = Depends(get_db), page_no: int = Query(1, alias="page", ge=1), page_size: int = Query(20, ge=1, le=100)):
    ctx = load_context(db)
    order_rows = get_order_rows(ctx, client_id=None, contract_id=None, order_id=None, source_type=None, fulfillment_type=None, status_filter=None, date_from=None, date_to=None)
    by_client: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in order_rows:
        by_client[row["client_id"]].append(row)
    clients = {c.id: c for c in ctx["clients"]}
    rows = []
    for client_id, grouped in by_client.items():
        client = clients.get(client_id)
        sums = sum_fields(grouped, ["revenue_subtotal", "revenue_total_with_vat", "customer_paid", "customer_remaining", "supplier_purchase_cost_subtotal", "logistics_cost", "gross_profit"])
        overdue = money(sum((i.remaining_amount for i in ctx["customer_invoices"] if i.client_id == client_id and i.status != InvoiceStatus.cancelled and i.remaining_amount > 0 and i.due_date < date.today()), Decimal("0")))
        payments = [p.payment_date for p in ctx["customer_payments"] if p.client_id == client_id and p.status != PaymentStatus.cancelled]
        rows.append({
            "client_id": client_id,
            "client_name": client.name if client else None,
            "inn": client.inn if client else None,
            **sums,
            "profit_margin": margin(sums["gross_profit"], sums["revenue_subtotal"]),
            "active_contracts_count": sum(1 for c in ctx["contracts"] if c.client_id == client_id and c.status == ContractStatus.active),
            "active_orders_count": sum(1 for o in ctx["orders"] if o.client_id == client_id and o.status not in {OrderStatus.cancelled, OrderStatus.closed}),
            "overdue_amount": overdue,
            "last_payment_date": max(payments).isoformat() if payments else None,
        })
    rows.sort(key=lambda row: row["gross_profit"], reverse=True)
    return page(rows[(page_no - 1) * page_size : page_no * page_size], len(rows), page_no, page_size)


@router.get("/profit/batches")
def profit_batches(db: Session = Depends(get_db), page_no: int = Query(1, alias="page", ge=1), page_size: int = Query(20, ge=1, le=100)):
    ctx = load_context(db)
    rows = []
    for batch in ctx["batches"]:
        customer = customer_totals([i for i in ctx["customer_invoices"] if i.delivery_batch_id == batch.id])
        supplier_invoices = [i for i in ctx["supplier_invoices"] if i.delivery_batch_id == batch.id]
        supplier = supplier_totals(supplier_invoices)
        transport_invoices = [i for i in supplier_invoices if i.invoice_type == SupplierInvoiceType.transport and i.status != SupplierInvoiceStatus.cancelled]
        log_cost = logistics_cost([batch.logistics] if batch.logistics else [], transport_invoices)
        gross = money(customer["revenue_subtotal"] - supplier["supplier_purchase_cost_subtotal"] - log_cost)
        rows.append({
            "delivery_batch_id": batch.id,
            "batch_number": batch.batch_number,
            "order_id": batch.order_id,
            "order_number": batch.order.order_number if batch.order else None,
            "client_id": batch.client_id,
            "client_name": batch.client.name if batch.client else None,
            "supplier_id": batch.supplier_id,
            "supplier_name": batch.supplier_name,
            "planned_quantity": sum((item.planned_quantity for item in batch.items), Decimal("0")),
            "loaded_quantity": sum((item.loaded_quantity or Decimal("0") for item in batch.items), Decimal("0")),
            "accepted_quantity": sum((item.accepted_quantity or Decimal("0") for item in batch.items), Decimal("0")),
            **customer,
            **supplier,
            "logistics_cost": log_cost,
            "gross_profit": gross,
            "profit_margin": margin(gross, customer["revenue_subtotal"]),
            "batch_status": enum_value(batch.status),
        })
    rows.sort(key=lambda row: row["gross_profit"], reverse=True)
    return page(rows[(page_no - 1) * page_size : page_no * page_size], len(rows), page_no, page_size)


def cashflow_rows(customer_payments: list[CustomerPayment], supplier_payments: list[SupplierPayment], monthly: bool = False) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Decimal]] = defaultdict(lambda: {"cash_in": Decimal("0"), "cash_out": Decimal("0")})
    for payment in customer_payments:
        if payment.status == PaymentStatus.cancelled:
            continue
        key = payment.payment_date.strftime("%Y-%m") if monthly else payment.payment_date.isoformat()
        grouped[key]["cash_in"] += payment.amount
    for payment in supplier_payments:
        if payment.status == SupplierPaymentStatus.cancelled:
            continue
        key = payment.payment_date.strftime("%Y-%m") if monthly else payment.payment_date.isoformat()
        grouped[key]["cash_out"] += payment.amount
    rows = []
    for key in sorted(grouped):
        cash_in = money(grouped[key]["cash_in"])
        cash_out = money(grouped[key]["cash_out"])
        rows.append({"month" if monthly else "date": key, "cash_in": cash_in, "cash_out": cash_out, "net_cashflow": money(cash_in - cash_out)})
    return rows


@router.get("/cashflow/daily")
def cashflow_daily(db: Session = Depends(get_db), date_from: date | None = None, date_to: date | None = None):
    ctx = load_context(db)
    return cashflow_rows([p for p in ctx["customer_payments"] if in_range(p.payment_date, date_from, date_to)], [p for p in ctx["supplier_payments"] if in_range(p.payment_date, date_from, date_to)])


@router.get("/cashflow/monthly")
def cashflow_monthly(db: Session = Depends(get_db), date_from: date | None = None, date_to: date | None = None):
    ctx = load_context(db)
    return cashflow_rows([p for p in ctx["customer_payments"] if in_range(p.payment_date, date_from, date_to)], [p for p in ctx["supplier_payments"] if in_range(p.payment_date, date_from, date_to)], monthly=True)


@router.get("/receivables")
def receivables(db: Session = Depends(get_db), overdue_only: bool = False, client_id: int | None = None, status: str | None = None):
    ctx = load_context(db)
    today = date.today()
    invoices = [i for i in ctx["customer_invoices"] if i.status != InvoiceStatus.cancelled and i.remaining_amount > 0]
    if overdue_only:
        invoices = [i for i in invoices if i.due_date < today]
    if client_id:
        invoices = [i for i in invoices if i.client_id == client_id]
    if status:
        invoices = [i for i in invoices if enum_value(i.status) == status]
    rows = []
    for invoice in invoices:
        overdue_days = max((today - invoice.due_date).days, 0) if invoice.remaining_amount > 0 else 0
        rows.append({
            "customer_invoice_id": invoice.id,
            "customer_name": invoice.client.name if invoice.client else None,
            "invoice_number": invoice.invoice_number,
            "invoice_type": enum_value(invoice.invoice_type),
            "invoice_date": invoice.invoice_date,
            "due_date": invoice.due_date,
            "total_amount": invoice.total_amount,
            "paid_amount": invoice.paid_amount,
            "remaining_amount": invoice.remaining_amount,
            "overdue_days": overdue_days,
            "status": enum_value(invoice.status),
            "contract_id": invoice.contract_id,
            "contract_number": invoice.contract.contract_number if invoice.contract else None,
            "order_id": invoice.order_id,
            "order_number": invoice.order.order_number if invoice.order else None,
            "delivery_batch_id": invoice.delivery_batch_id,
            "batch_number": invoice.delivery_batch.batch_number if invoice.delivery_batch else None,
        })
    total_receivables = money(sum((i.remaining_amount for i in invoices), Decimal("0")))
    overdue_receivables = money(sum((i.remaining_amount for i in invoices if i.due_date < today), Decimal("0")))
    by_client: dict[str, Decimal] = defaultdict(Decimal)
    for invoice in invoices:
        by_client[invoice.client.name if invoice.client else "Unknown"] += invoice.remaining_amount
    first_day = today.replace(day=1)
    paid_this_month = money(sum((p.amount for p in ctx["customer_payments"] if p.status != PaymentStatus.cancelled and p.payment_date >= first_day), Decimal("0")))
    return {
        "summary": {
            "total_receivables": total_receivables,
            "overdue_receivables": overdue_receivables,
            "current_receivables": money(total_receivables - overdue_receivables),
            "paid_this_month": paid_this_month,
            "top_debtors": [{"name": name, "amount": money(amount)} for name, amount in sorted(by_client.items(), key=lambda item: item[1], reverse=True)[:5]],
        },
        "items": rows,
    }


@router.get("/payables")
def payables(db: Session = Depends(get_db), overdue_only: bool = False, supplier_id: int | None = None, status: str | None = None):
    ctx = load_context(db)
    today = date.today()
    invoices = [i for i in ctx["supplier_invoices"] if i.status != SupplierInvoiceStatus.cancelled and i.remaining_amount > 0]
    if overdue_only:
        invoices = [i for i in invoices if i.due_date < today]
    if supplier_id:
        invoices = [i for i in invoices if i.supplier_id == supplier_id]
    if status:
        invoices = [i for i in invoices if enum_value(i.status) == status]
    rows = []
    for invoice in invoices:
        overdue_days = max((today - invoice.due_date).days, 0) if invoice.remaining_amount > 0 else 0
        rows.append({
            "supplier_invoice_id": invoice.id,
            "supplier_name": invoice.supplier.name if invoice.supplier else None,
            "invoice_number": invoice.invoice_number,
            "invoice_type": enum_value(invoice.invoice_type),
            "invoice_date": invoice.invoice_date,
            "due_date": invoice.due_date,
            "total_amount": invoice.total_amount,
            "paid_amount": invoice.paid_amount,
            "remaining_amount": invoice.remaining_amount,
            "overdue_days": overdue_days,
            "status": enum_value(invoice.status),
            "procurement_id": invoice.procurement_id,
            "procurement_number": invoice.procurement.procurement_number if invoice.procurement else None,
            "delivery_batch_id": invoice.delivery_batch_id,
            "batch_number": invoice.delivery_batch.batch_number if invoice.delivery_batch else None,
        })
    total_payables = money(sum((i.remaining_amount for i in invoices), Decimal("0")))
    overdue_payables = money(sum((i.remaining_amount for i in invoices if i.due_date < today), Decimal("0")))
    by_supplier: dict[str, Decimal] = defaultdict(Decimal)
    for invoice in invoices:
        by_supplier[invoice.supplier.name if invoice.supplier else "Unknown"] += invoice.remaining_amount
    first_day = today.replace(day=1)
    paid_this_month = money(sum((p.amount for p in ctx["supplier_payments"] if p.status != SupplierPaymentStatus.cancelled and p.payment_date >= first_day), Decimal("0")))
    return {
        "summary": {
            "total_payables": total_payables,
            "overdue_payables": overdue_payables,
            "current_payables": money(total_payables - overdue_payables),
            "paid_this_month": paid_this_month,
            "top_suppliers_by_payable": [{"name": name, "amount": money(amount)} for name, amount in sorted(by_supplier.items(), key=lambda item: item[1], reverse=True)[:5]],
        },
        "items": rows,
    }


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    ctx = load_context(db)
    order_rows = get_order_rows(ctx, client_id=None, contract_id=None, order_id=None, source_type=None, fulfillment_type=None, status_filter=None, date_from=None, date_to=None)
    sums = sum_fields(order_rows, ["revenue_subtotal", "revenue_total_with_vat", "customer_paid", "customer_remaining", "supplier_purchase_cost_subtotal", "supplier_purchase_cost_total_with_vat", "supplier_paid", "supplier_remaining", "logistics_cost", "gross_profit"])
    cash_in = money(sum((p.amount for p in ctx["customer_payments"] if p.status != PaymentStatus.cancelled), Decimal("0")))
    cash_out = money(sum((p.amount for p in ctx["supplier_payments"] if p.status != SupplierPaymentStatus.cancelled), Decimal("0")))
    receivable_data = receivables(db)
    payable_data = payables(db)
    negative = [row for row in order_rows if row["gross_profit"] < 0]
    top = sorted(order_rows, key=lambda row: row["gross_profit"], reverse=True)[:5]
    return {
        "summary": {
            "revenue_subtotal": sums["revenue_subtotal"],
            "revenue_total_with_vat": sums["revenue_total_with_vat"],
            "customer_payments_received": cash_in,
            "supplier_purchase_cost_subtotal": sums["supplier_purchase_cost_subtotal"],
            "supplier_purchase_cost_total_with_vat": sums["supplier_purchase_cost_total_with_vat"],
            "supplier_payments_made": cash_out,
            "logistics_cost": sums["logistics_cost"],
            "gross_profit": sums["gross_profit"],
            "profit_margin": margin(sums["gross_profit"], sums["revenue_subtotal"]),
            "net_cashflow": money(cash_in - cash_out),
            "customer_receivables": receivable_data["summary"]["total_receivables"],
            "supplier_payables": payable_data["summary"]["total_payables"],
            "overdue_customer_invoices_count": len([row for row in receivable_data["items"] if row["overdue_days"] > 0]),
            "overdue_customer_invoices_amount": receivable_data["summary"]["overdue_receivables"],
            "overdue_supplier_invoices_count": len([row for row in payable_data["items"] if row["overdue_days"] > 0]),
            "overdue_supplier_invoices_amount": payable_data["summary"]["overdue_payables"],
            "active_contracts_count": len([c for c in ctx["contracts"] if c.status == ContractStatus.active]),
            "active_orders_count": len([o for o in ctx["orders"] if o.status not in {OrderStatus.cancelled, OrderStatus.closed}]),
            "open_delivery_batches_count": len([b for b in ctx["batches"] if b.status not in {BatchStatus.cancelled, BatchStatus.completed}]),
            "negative_profit_orders_count": len(negative),
            "orders_waiting_customer_payment_count": len([row for row in order_rows if row["customer_remaining"] > 0]),
            "supplier_invoices_overdue_count": len([row for row in payable_data["items"] if row["overdue_days"] > 0]),
        },
        "recent_customer_payments": [customer_payment_dict(row) for row in sorted(ctx["customer_payments"], key=lambda p: p.payment_date, reverse=True)[:5]],
        "recent_supplier_payments": [supplier_payment_dict(row) for row in sorted(ctx["supplier_payments"], key=lambda p: p.payment_date, reverse=True)[:5]],
        "top_profitable_orders": top,
        "negative_profit_orders": sorted(negative, key=lambda row: row["gross_profit"])[:5],
        "overdue_customer_invoices": [row for row in receivable_data["items"] if row["overdue_days"] > 0][:5],
        "overdue_supplier_invoices": [row for row in payable_data["items"] if row["overdue_days"] > 0][:5],
    }
