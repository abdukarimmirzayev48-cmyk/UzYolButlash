from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models.delivery import BatchStatus
from backend.app.models.finance import CustomerInvoice, InvoiceStatus
from backend.app.models.order import Order, OrderStatus, SupplierStatus
from backend.app.models.procurement import ProcurementStatus
from backend.app.models.supplier_finance import SupplierInvoice, SupplierInvoiceStatus
from backend.app.services.contract_status import sync_contract_status


MANUAL_ORDER_STATUSES = {OrderStatus.on_hold, OrderStatus.cancelled}


def _qty(value: Decimal | None) -> Decimal:
    return Decimal(value or 0)


def _finance_ready_to_close(db: Session | None, order: Order) -> bool:
    if db is None or not order.documents:
        return False

    customer_count = db.scalar(
        select(func.count()).where(
            CustomerInvoice.order_id == order.id,
            CustomerInvoice.status != InvoiceStatus.cancelled,
        )
    ) or 0
    if customer_count <= 0:
        return False
    customer_remaining = db.scalar(
        select(func.coalesce(func.sum(CustomerInvoice.remaining_amount), 0)).where(
            CustomerInvoice.order_id == order.id,
            CustomerInvoice.status != InvoiceStatus.cancelled,
        )
    ) or Decimal("0")
    if _qty(customer_remaining) > 0:
        return False

    procurement_id = order.procurement.id if order.procurement else None
    if not procurement_id:
        return False
    supplier_count = db.scalar(
        select(func.count()).where(
            SupplierInvoice.procurement_id == procurement_id,
            SupplierInvoice.status != SupplierInvoiceStatus.cancelled,
        )
    ) or 0
    if supplier_count <= 0:
        return False
    supplier_remaining = db.scalar(
        select(func.coalesce(func.sum(SupplierInvoice.remaining_amount), 0)).where(
            SupplierInvoice.procurement_id == procurement_id,
            SupplierInvoice.status != SupplierInvoiceStatus.cancelled,
        )
    ) or Decimal("0")
    return _qty(supplier_remaining) <= 0


def sync_order_status(order: Order, db: Session | None = None, force: bool = False) -> None:
    if not force and order.status in MANUAL_ORDER_STATUSES:
        if db is not None:
            sync_contract_status(db, order.contract_id)
        return

    def finish(status: OrderStatus) -> None:
        order.status = status
        if db is not None:
            sync_contract_status(db, order.contract_id)

    active_batches = [batch for batch in order.delivery_batches if batch.status != BatchStatus.cancelled]
    total_quantity = sum((_qty(item.quantity) for item in order.items), Decimal("0"))
    loaded_quantity = sum(
        (_qty(item.loaded_quantity) for batch in active_batches for item in batch.items),
        Decimal("0"),
    )
    accepted_quantity = sum(
        (_qty(item.accepted_quantity) for batch in active_batches for item in batch.items),
        Decimal("0"),
    )

    if total_quantity > 0 and accepted_quantity >= total_quantity:
        finish(OrderStatus.closed if _finance_ready_to_close(db, order) else OrderStatus.delivered)
        return
    if accepted_quantity > 0:
        finish(OrderStatus.partially_delivered)
        return
    if loaded_quantity > 0 or any(
        batch.status
        in {
            BatchStatus.loaded,
            BatchStatus.in_transit,
            BatchStatus.arrived,
            BatchStatus.unloading,
            BatchStatus.accepted,
            BatchStatus.quantity_difference,
            BatchStatus.completed,
        }
        for batch in active_batches
    ):
        finish(OrderStatus.in_delivery)
        return
    if active_batches:
        finish(OrderStatus.ready_for_delivery)
        return

    if order.supplier_status == SupplierStatus.confirmed:
        finish(OrderStatus.supplier_confirmed)
        return
    if order.supplier_status == SupplierStatus.selected:
        finish(OrderStatus.supplier_selected)
        return
    if order.supplier_status == SupplierStatus.searching:
        finish(OrderStatus.supplier_search)
        return
    if order.supplier_options:
        if order.supplier_status not in {SupplierStatus.selected, SupplierStatus.confirmed}:
            order.supplier_status = SupplierStatus.searching
        finish(OrderStatus.supplier_search)
        return

    procurement = order.procurement
    if procurement:
        if procurement.status in {
            ProcurementStatus.supplier_confirmed,
            ProcurementStatus.purchase_approved,
            ProcurementStatus.waiting_supplier_ready,
            ProcurementStatus.ready_for_pickup,
            ProcurementStatus.ready_for_delivery,
            ProcurementStatus.completed,
        }:
            finish(OrderStatus.supplier_confirmed)
            return
        if procurement.status == ProcurementStatus.supplier_selected:
            finish(OrderStatus.supplier_selected)
            return
        if procurement.offers:
            finish(OrderStatus.supplier_search)
            return

    finish(OrderStatus.created if order.items else OrderStatus.draft)
