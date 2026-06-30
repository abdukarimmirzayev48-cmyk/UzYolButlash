from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models.contract import Contract, ContractItem, ContractStatus
from backend.app.models.delivery import BatchStatus, DeliveryBatch, DeliveryBatchItem
from backend.app.models.finance import CustomerInvoice, InvoiceStatus
from backend.app.models.order import Order, OrderStatus


PROTECTED_CONTRACT_STATUSES = {ContractStatus.cancelled}


def _decimal(value: Decimal | None) -> Decimal:
    return Decimal(value or 0)


def sync_contract_status(db: Session, contract_id: int | None) -> None:
    if not contract_id:
        return
    contract = db.get(Contract, contract_id)
    if not contract or contract.status in PROTECTED_CONTRACT_STATUSES:
        return

    total_quantity = _decimal(
        db.scalar(
            select(func.coalesce(func.sum(ContractItem.quantity), 0)).where(ContractItem.contract_id == contract_id)
        )
    )
    delivered_quantity = _decimal(
        db.scalar(
            select(func.coalesce(func.sum(DeliveryBatchItem.accepted_quantity), 0))
            .join(DeliveryBatch)
            .where(DeliveryBatch.contract_id == contract_id, DeliveryBatch.status != BatchStatus.cancelled)
        )
    )
    active_orders = db.scalar(
        select(func.count()).where(Order.contract_id == contract_id, Order.status != OrderStatus.cancelled)
    ) or 0
    active_batches = db.scalar(
        select(func.count()).where(DeliveryBatch.contract_id == contract_id, DeliveryBatch.status != BatchStatus.cancelled)
    ) or 0
    invoice_activity = db.scalar(
        select(func.count()).where(
            CustomerInvoice.contract_id == contract_id,
            CustomerInvoice.status.notin_([InvoiceStatus.cancelled, InvoiceStatus.draft]),
        )
    ) or 0
    paid_amount = _decimal(
        db.scalar(
            select(func.coalesce(func.sum(CustomerInvoice.paid_amount), 0)).where(
                CustomerInvoice.contract_id == contract_id,
                CustomerInvoice.status != InvoiceStatus.cancelled,
            )
        )
    )
    unpaid_amount = _decimal(
        db.scalar(
            select(func.coalesce(func.sum(CustomerInvoice.remaining_amount), 0)).where(
                CustomerInvoice.contract_id == contract_id,
                CustomerInvoice.status != InvoiceStatus.cancelled,
            )
        )
    )

    if total_quantity > 0 and active_batches > 0 and delivered_quantity >= total_quantity and unpaid_amount <= 0:
        contract.status = ContractStatus.completed
    elif active_orders > 0 or active_batches > 0 or paid_amount > 0:
        contract.status = ContractStatus.active
    elif invoice_activity > 0 or contract.status == ContractStatus.signed:
        contract.status = ContractStatus.signed
    else:
        contract.status = ContractStatus.draft


def sync_contracts_for_invoices(db: Session, invoices: list[CustomerInvoice]) -> None:
    contract_ids = {invoice.contract_id for invoice in invoices if invoice and invoice.contract_id}
    for contract_id in contract_ids:
        sync_contract_status(db, contract_id)
