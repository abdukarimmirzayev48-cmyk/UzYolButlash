from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, text

from backend.app.db.session import SessionLocal
from backend.app.models.client import AddressType, Client, ClientAddress, ClientBankAccount, ClientContact
from backend.app.models.contract import (
    Contract,
    ContractItem,
    ContractPaymentTerms,
    ContractStatus,
    ContractTransportTerms,
    DeliveryMethod,
    TransportPaymentType,
)
from backend.app.models.delivery import (
    AutoDeliveryMethod,
    BatchStatus,
    DeliveryBatch,
    DeliveryBatchItem,
    Logistics,
    LogisticsStatus,
    PaidBy,
)
from backend.app.models.finance import (
    CustomerInvoice,
    CustomerInvoiceItem,
    CustomerPayment,
    InvoiceStatus,
    InvoiceType,
    PaymentAllocation,
    PaymentMethod,
    PaymentStatus,
)
from backend.app.models.inventory import (
    ExchangeTicket,
    ExchangeTicketStatus,
    OwnershipStatus,
    StockAllocation,
    StockAllocationStatus,
    StockLocation,
    StockLocationType,
    StockLot,
    StockMovement,
    StockMovementType,
    StockStatus,
)
from backend.app.models.order import (
    FulfillmentType,
    Order,
    OrderItem,
    OrderStatus,
    OrderSupplierOption,
    SourceType,
    SupplierStatus,
)
from backend.app.models.transport import Transport, TransportStatus
from backend.app.models.procurement import (
    Procurement,
    ProcurementItem,
    ProcurementStatus,
    Supplier,
    SupplierAddress,
    SupplierAddressType,
    SupplierBankAccount,
    SupplierContact,
    SupplierOffer,
    SupplierOfferItem,
    SupplierOfferStatus,
)
from backend.app.models.supplier_finance import (
    SupplierInvoice,
    SupplierInvoiceItem,
    SupplierInvoiceStatus,
    SupplierInvoiceType,
    SupplierPayment,
    SupplierPaymentAllocation,
    SupplierPaymentMethod,
    SupplierPaymentStatus,
)


MARKER_INN = "309874561"
TODAY = date(2026, 6, 25)
VAT = Decimal("12")


def clear_database(db) -> None:
    db.execute(text("PRAGMA foreign_keys=OFF"))
    tables = db.execute(
        text(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT IN ('alembic_version', 'sqlite_sequence')"
        )
    ).scalars().all()
    for table in tables:
        db.execute(text(f'DELETE FROM "{table}"'))
    if db.execute(text("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")).scalar():
        db.execute(text("DELETE FROM sqlite_sequence"))
    db.execute(text("PRAGMA foreign_keys=ON"))


def d(value: str | int | float | Decimal) -> Decimal:
    return Decimal(str(value))


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def calc_line(quantity: Decimal, unit_price: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    subtotal = money(quantity * unit_price)
    vat = money(subtotal * VAT / Decimal("100"))
    return subtotal, vat, money(subtotal + vat)


def add_client(db, idx: int, name: str, region: str) -> Client:
    client = Client(
        name=name,
        inn=str(309874560 + idx),
        oked="42110",
        phone=f"+99890{idx:03d}2600",
        email=f"info{idx}@bitumroad.uz",
        notes="Operatsion mijoz ma'lumotlari.",
    )
    client.contacts.append(
        ClientContact(
            full_name=f"{name.split()[0]} mas'uli",
            position="Xarid bo'yicha mas'ul",
            phone=f"+99891{idx:03d}2600",
            email=f"contact{idx}@bitumroad.uz",
            is_primary=True,
        )
    )
    client.addresses.append(
        ClientAddress(
            address_type=AddressType.legal,
            region=region,
            district=f"{region} tumani",
            address=f"{region}, Mustaqillik ko'chasi {idx * 7}",
        )
    )
    client.addresses.append(
        ClientAddress(
            address_type=AddressType.delivery,
            region=region,
            district=f"{region} tumani",
            address=f"{region}, yo'l qurilish obyekti {idx}",
        )
    )
    client.bank_accounts.append(
        ClientBankAccount(
            bank_name="Ipoteka Bank",
            mfo=f"01{idx:03d}",
            account_number=f"20208000900{idx:05d}",
            is_primary=True,
        )
    )
    db.add(client)
    return client


def add_supplier(db, idx: int, name: str, region: str) -> Supplier:
    supplier = Supplier(
        name=name,
        inn=str(308665430 + idx),
        oked="19201",
        phone=f"+99893{idx:03d}7700",
        email=f"sales{idx}@bitumsupply.uz",
        notes="Bitum va transport xizmatlari ta'minotchisi.",
    )
    supplier.contacts.append(
        SupplierContact(
            full_name=f"{name.split()[0]} vakili",
            position="Savdo menejeri",
            phone=f"+99894{idx:03d}7700",
            email=f"manager{idx}@bitumsupply.uz",
            is_primary=True,
        )
    )
    supplier.addresses.append(
        SupplierAddress(
            address_type=SupplierAddressType.loading,
            region=region,
            district=f"{region} sanoat zonasi",
            address=f"{region}, sanoat zonasi, yuklash terminali {idx}",
        )
    )
    supplier.addresses.append(
        SupplierAddress(
            address_type=SupplierAddressType.legal,
            region=region,
            district=f"{region} markazi",
            address=f"{region}, markaziy ofis {idx}",
        )
    )
    supplier.bank_accounts.append(
        SupplierBankAccount(
            bank_name="Asaka Bank",
            mfo=f"02{idx:03d}",
            account_number=f"20208000111{idx:05d}",
            is_primary=True,
        )
    )
    db.add(supplier)
    return supplier


def add_transport(
    db,
    idx: int,
    carrier_name: str,
    driver_name: str,
    vehicle_number: str,
    status: TransportStatus = TransportStatus.active,
    is_own: bool = False,
) -> Transport:
    transport = Transport(
        carrier_name=carrier_name,
        driver_name=driver_name,
        driver_phone=f"+99895{idx:03d}4455",
        vehicle_number=vehicle_number,
        trailer_number=f"TR-{200 + idx}",
        vehicle_type="Bitum tashuvchi sisterna",
        capacity=f"{25 + idx * 2} tonna",
        status=status,
        is_own=is_own,
        notes="Demo transport kartochkasi.",
    )
    db.add(transport)
    return transport


def add_contract(db, idx: int, client: Client, status: ContractStatus, quantity: Decimal, unit_price: Decimal) -> Contract:
    subtotal, vat, total = calc_line(quantity, unit_price)
    contract = Contract(
        client=client,
        contract_number=f"BIT-2026-{100 + idx}",
        contract_date=TODAY - timedelta(days=35 - idx),
        valid_until=TODAY + timedelta(days=120 + idx),
        title=f"{client.name} uchun bitum yetkazib berish shartnomasi",
        status=status,
        subtotal_amount=subtotal,
        vat_amount=vat,
        total_amount=total,
        notes="Bitum yetkazib berish bo'yicha shartnoma.",
        created_by="system",
    )
    contract.items.append(
        ContractItem(
            product_name="SG 70",
            product_code="SG70",
            unit="tonna",
            quantity=quantity,
            unit_price=unit_price,
            subtotal=subtotal,
            vat_rate=VAT,
            vat_amount=vat,
            total_with_vat=total,
        )
    )
    contract.payment_terms = ContractPaymentTerms(
        advance_percent=d("30"),
        advance_amount=money(total * d("0.30")),
        remaining_percent=d("70"),
        advance_due_days=7,
        batch_payment_due_days=3,
        remaining_payment_rule="Qolgan summa qabul qilingan partiya bo'yicha hisob asosida to'lanadi.",
    )
    contract.transport_terms = ContractTransportTerms(
        transport_payment_type=TransportPaymentType.separate_invoice,
        delivery_method=DeliveryMethod.auto,
        notes="Avtotransport orqali yetkazish.",
    )
    db.add(contract)
    return contract


def add_order(db, idx: int, contract: Contract, supplier: Supplier | None, status: OrderStatus, supplier_status: SupplierStatus, fulfillment: FulfillmentType, source: SourceType, quantity: Decimal, unit_price: Decimal, logistics_price: Decimal = Decimal("0")) -> Order:
    subtotal, vat, line_total = calc_line(quantity, unit_price)
    markup_percent = d("5")
    markup = money(subtotal * markup_percent / d("100"))
    total = money(line_total + markup + logistics_price)
    item = contract.items[0]
    order = Order(
        client=contract.client,
        contract=contract,
        order_number=f"ORD-2026-{100 + idx}",
        order_date=TODAY - timedelta(days=20 - idx),
        required_date=TODAY + timedelta(days=idx + 3),
        status=status,
        fulfillment_type=fulfillment,
        source_type=source,
        supplier_id=supplier.id if supplier else None,
        supplier_name=supplier.name if supplier else None,
        supplier_status=supplier_status,
        currency="UZS",
        product_subtotal=subtotal,
        vat_amount=vat,
        markup_percent=markup_percent,
        markup_amount=markup,
        logistics_price=logistics_price,
        total_amount=total,
        notes="Bitum yetkazib berish buyurtmasi.",
        created_by="system",
    )
    order.items.append(
        OrderItem(
            contract_item=item,
            product_name=item.product_name,
            unit=item.unit,
            quantity=quantity,
            unit_price=unit_price,
            subtotal=subtotal,
            vat_rate=VAT,
            vat_amount=vat,
            total_with_vat=line_total,
        )
    )
    if supplier:
        order.supplier_options.append(
            OrderSupplierOption(
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                offered_price=money(unit_price * d("0.86")),
                available_quantity=quantity,
                ready_date=TODAY + timedelta(days=idx),
                delivery_terms="Avto yuklash, 2-3 kun.",
                comment="Tanlangan ta'minotchi taklifi.",
                is_selected=supplier_status in {SupplierStatus.selected, SupplierStatus.confirmed},
            )
        )
    db.add(order)
    return order


def add_procurement(db, idx: int, order: Order, supplier: Supplier | None, status: ProcurementStatus) -> Procurement:
    order_item = order.items[0]
    purchase_price = money(order_item.unit_price * d("0.82"))
    subtotal, vat, total = calc_line(order_item.quantity, purchase_price)
    procurement = Procurement(
        order=order,
        contract=order.contract,
        client=order.client,
        procurement_number=f"PRC-2026-{100 + idx}",
        procurement_date=order.order_date,
        required_date=order.required_date,
        status=status,
        source_type=order.source_type.value,
        fulfillment_type=order.fulfillment_type.value,
        estimated_purchase_amount=total,
        final_purchase_amount=total if supplier else Decimal("0"),
        notes="Buyurtma bo'yicha xarid jarayoni.",
        created_by="system",
    )
    procurement_item = ProcurementItem(
        order_item=order_item,
        contract_item_id=order_item.contract_item_id,
        product_name=order_item.product_name,
        unit=order_item.unit,
        required_quantity=order_item.quantity,
        purchased_quantity=order_item.quantity if status in {ProcurementStatus.supplier_selected, ProcurementStatus.supplier_confirmed, ProcurementStatus.purchase_approved, ProcurementStatus.ready_for_delivery, ProcurementStatus.completed} else Decimal("0"),
    )
    procurement.items.append(procurement_item)
    if supplier:
        offer = SupplierOffer(
            supplier=supplier,
            supplier_name=supplier.name,
            offer_number=f"OFR-2026-{100 + idx}",
            offer_date=order.order_date + timedelta(days=1),
            valid_until=TODAY + timedelta(days=25),
            status=SupplierOfferStatus.selected if status != ProcurementStatus.completed else SupplierOfferStatus.received,
            total_product_amount=subtotal,
            total_vat_amount=vat,
            transport_included=False,
            delivery_terms="Avto transport uchun alohida hisob.",
            estimated_delivery_cost=d("1800000") + d(idx * 250000),
            total_amount=total,
            ready_date=TODAY + timedelta(days=idx),
            payment_terms="50% oldindan, qolgan qismi yuklashda.",
            notes="Ta'minotchi narx va muddat taklifi.",
            is_selected=status in {ProcurementStatus.supplier_selected, ProcurementStatus.supplier_confirmed, ProcurementStatus.purchase_approved, ProcurementStatus.ready_for_delivery, ProcurementStatus.completed},
            created_by="system",
        )
        offer.items.append(
            SupplierOfferItem(
                procurement_item=procurement_item,
                order_item=order_item,
                contract_item_id=order_item.contract_item_id,
                product_name=order_item.product_name,
                unit=order_item.unit,
                offered_quantity=order_item.quantity,
                selected_quantity=order_item.quantity if offer.is_selected else Decimal("0"),
                unit_price=purchase_price,
                subtotal=subtotal,
                vat_rate=VAT,
                vat_amount=vat,
                total_with_vat=total,
                transport_included=False,
                delivery_terms="Yuklash terminalidan olib ketish.",
                ready_date=offer.ready_date,
                is_selected=offer.is_selected,
            )
        )
        procurement.offers.append(offer)
    db.add(procurement)
    return procurement


def add_batch(db, idx: int, order: Order, supplier: Supplier | None, transport: Transport | None, status: BatchStatus, planned: Decimal, loaded: Decimal | None, accepted: Decimal | None, logistics_status: LogisticsStatus) -> DeliveryBatch:
    order_item = order.items[0]
    batch = DeliveryBatch(
        order=order,
        contract=order.contract,
        client=order.client,
        batch_number=f"BAT-2026-{100 + idx}",
        batch_date=TODAY - timedelta(days=9 - idx),
        planned_loading_date=TODAY - timedelta(days=4 - idx),
        planned_delivery_date=TODAY - timedelta(days=2 - idx),
        actual_loading_date=TODAY - timedelta(days=3 - idx) if loaded else None,
        actual_delivery_date=TODAY - timedelta(days=1 - idx) if accepted else None,
        accepted_date=TODAY - timedelta(days=idx % 3) if accepted else None,
        status=status,
        fulfillment_type=order.fulfillment_type.value,
        source_type=order.source_type.value,
        delivery_method=AutoDeliveryMethod.auto,
        supplier_id=supplier.id if supplier else order.supplier_id,
        supplier_name=supplier.name if supplier else order.supplier_name,
        notes="Buyurtma bo'yicha yetkazib berish partiyasi.",
        created_by="system",
    )
    batch.items.append(
        DeliveryBatchItem(
            order_item=order_item,
            contract_item_id=order_item.contract_item_id,
            product_name=order_item.product_name,
            unit=order_item.unit,
            planned_quantity=planned,
            loaded_quantity=loaded,
            accepted_quantity=accepted,
            difference_quantity=(loaded or Decimal("0")) - (accepted or Decimal("0")),
            comment="Partiya mahsulot miqdori.",
        )
    )
    batch.logistics = Logistics(
        logistics_number=f"LOG-2026-{100 + idx}",
        delivery_method=AutoDeliveryMethod.auto,
        status=logistics_status,
        carrier_id=transport.id if transport and logistics_status != LogisticsStatus.not_assigned else None,
        carrier_name=None if logistics_status == LogisticsStatus.not_assigned else (transport.carrier_name if transport else f"Asia Trans Logistics {idx}"),
        driver_name=None if logistics_status == LogisticsStatus.not_assigned else (transport.driver_name if transport else f"Haydovchi {idx}"),
        driver_phone=None if logistics_status == LogisticsStatus.not_assigned else (transport.driver_phone if transport else f"+99897{idx:03d}8800"),
        vehicle_number=None if logistics_status in {LogisticsStatus.not_assigned, LogisticsStatus.carrier_assigned} else (transport.vehicle_number if transport else f"01D{idx:03d}DA"),
        trailer_number=None if logistics_status in {LogisticsStatus.not_assigned, LogisticsStatus.carrier_assigned} else (transport.trailer_number if transport else f"TR{idx:03d}"),
        loading_address=f"{supplier.addresses[0].region}, yuklash terminali" if supplier else "Yuklash manzili",
        delivery_address=order.client.addresses[1].address if len(order.client.addresses) > 1 else "Yetkazish manzili",
        planned_pickup_date=batch.planned_loading_date,
        planned_delivery_date=batch.planned_delivery_date,
        actual_pickup_date=batch.actual_loading_date,
        actual_delivery_date=batch.actual_delivery_date,
        cost_amount=d("1500000") + d(idx * 300000),
        customer_price=d("2200000") + d(idx * 350000),
        paid_by=PaidBy.company,
        notes="Transport biriktirish va yetkazish ma'lumotlari.",
        created_by="system",
    )
    db.add(batch)
    return batch


def add_exchange_ticket(
    db,
    idx: int,
    supplier: Supplier,
    location: StockLocation,
    status: ExchangeTicketStatus,
    stock_status: StockStatus,
    quantity: Decimal,
    available: Decimal,
    reserved: Decimal = Decimal("0"),
) -> StockLot:
    unit_price = d("4380000") + d(idx * 120000)
    subtotal, vat, total = calc_line(quantity, unit_price)
    ticket = ExchangeTicket(
        ticket_number=f"ET-2026-{100 + idx}",
        ticket_date=TODAY - timedelta(days=18 - idx),
        supplier=supplier,
        supplier_name=supplier.name,
        product_name="SG 70",
        unit="tonna",
        quantity=quantity,
        unit_price=unit_price,
        subtotal_amount=subtotal,
        vat_rate=VAT,
        vat_amount=vat,
        total_amount=total,
        payment_term_days=30 + idx * 5,
        due_date=TODAY + timedelta(days=10 + idx),
        status=status,
        notes="Birja/xarid chiptasi bo'yicha zaxira.",
        created_by="system",
    )
    lot = StockLot(
        ticket=ticket,
        supplier=supplier,
        stock_location=location,
        product_name="SG 70",
        unit="tonna",
        quantity_initial=quantity,
        quantity_available=available,
        quantity_reserved=reserved,
        unit_cost=unit_price,
        currency="UZS",
        ownership_status=OwnershipStatus.owned_by_company,
        stock_status=stock_status,
    )
    lot.movements.append(
        StockMovement(
            movement_type=StockMovementType.purchase_in,
            quantity=quantity,
            to_location=location,
            notes="Demo zaxira kirimi.",
            created_by="system",
        )
    )
    db.add(ticket)
    db.add(lot)
    return lot


def add_customer_invoice(db, idx: int, order: Order, batch: DeliveryBatch | None, invoice_type: InvoiceType, status: InvoiceStatus, amount: Decimal, paid: Decimal, due_offset: int) -> CustomerInvoice:
    subtotal = money(amount / d("1.12"))
    vat = money(amount - subtotal)
    invoice = CustomerInvoice(
        client=order.client,
        contract=order.contract,
        order=order,
        delivery_batch=batch,
        logistics=batch.logistics if batch else None,
        invoice_number=f"CINV-2026-{100 + idx}",
        invoice_date=TODAY - timedelta(days=14 - idx),
        due_date=TODAY + timedelta(days=due_offset),
        invoice_type=invoice_type,
        status=status,
        subtotal_amount=subtotal,
        vat_amount=vat,
        total_amount=amount,
        paid_amount=paid,
        remaining_amount=money(amount - paid),
        notes="Mijozga chiqarilgan hisob.",
        created_by="system",
    )
    invoice.items.append(
        CustomerInvoiceItem(
            description=f"{invoice.invoice_number} bo'yicha mahsulot/xizmat",
            product_name=batch.items[0].product_name if batch else order.items[0].product_name,
            unit="tonna",
            quantity=batch.items[0].accepted_quantity if batch and batch.items[0].accepted_quantity else order.items[0].quantity,
            unit_price=money(subtotal / (batch.items[0].accepted_quantity if batch and batch.items[0].accepted_quantity else order.items[0].quantity)),
            subtotal=subtotal,
            vat_rate=VAT,
            vat_amount=vat,
            total_with_vat=amount,
        )
    )
    db.add(invoice)
    return invoice


def add_customer_payment(db, idx: int, invoice: CustomerInvoice, amount: Decimal, status: PaymentStatus) -> CustomerPayment:
    payment = CustomerPayment(
        client=invoice.client,
        payment_number=f"CPAY-2026-{100 + idx}",
        payment_date=TODAY - timedelta(days=8 - idx),
        amount=amount,
        payment_method=PaymentMethod.bank_transfer,
        bank_account="Ipoteka Bank 20208000900123456",
        reference_number=f"REF-C-{100 + idx}",
        status=status,
        notes="Mijozdan kelib tushgan to'lov.",
        created_by="system",
    )
    if amount > 0 and status in {PaymentStatus.allocated, PaymentStatus.partially_allocated}:
        payment.allocations.append(PaymentAllocation(invoice=invoice, allocated_amount=amount, created_by="system"))
    db.add(payment)
    return payment


def add_supplier_invoice(db, idx: int, supplier: Supplier, procurement: Procurement, batch: DeliveryBatch | None, status: SupplierInvoiceStatus, amount: Decimal, paid: Decimal, invoice_type: SupplierInvoiceType = SupplierInvoiceType.product_purchase) -> SupplierInvoice:
    subtotal = money(amount / d("1.12"))
    vat = money(amount - subtotal)
    offer = procurement.offers[0] if procurement.offers else None
    invoice = SupplierInvoice(
        supplier=supplier,
        procurement=procurement,
        supplier_offer=offer,
        delivery_batch=batch,
        logistics=batch.logistics if batch else None,
        invoice_number=f"SINV-2026-{100 + idx}",
        invoice_date=TODAY - timedelta(days=12 - idx),
        due_date=TODAY + timedelta(days=idx - 4),
        invoice_type=invoice_type,
        status=status,
        subtotal_amount=subtotal,
        vat_amount=vat,
        total_amount=amount,
        paid_amount=paid,
        remaining_amount=money(amount - paid),
        notes="Ta'minotchidan kelgan hisob.",
        created_by="system",
    )
    procurement_item = procurement.items[0]
    offer_item = offer.items[0] if offer and offer.items else None
    invoice.items.append(
        SupplierInvoiceItem(
            procurement_item=procurement_item,
            supplier_offer_item=offer_item,
            description=f"{invoice.invoice_number} bo'yicha xarid",
            product_name=procurement_item.product_name,
            unit=procurement_item.unit,
            quantity=procurement_item.required_quantity,
            unit_price=money(subtotal / procurement_item.required_quantity),
            subtotal=subtotal,
            vat_rate=VAT,
            vat_amount=vat,
            total_with_vat=amount,
        )
    )
    db.add(invoice)
    return invoice


def add_supplier_payment(db, idx: int, invoice: SupplierInvoice, amount: Decimal, status: SupplierPaymentStatus) -> SupplierPayment:
    payment = SupplierPayment(
        supplier=invoice.supplier,
        payment_number=f"SPAY-2026-{100 + idx}",
        payment_date=TODAY - timedelta(days=7 - idx),
        amount=amount,
        payment_method=SupplierPaymentMethod.bank_transfer,
        bank_account="Asaka Bank 20208000111234567",
        reference_number=f"REF-S-{100 + idx}",
        status=status,
        notes="Ta'minotchiga o'tkazilgan to'lov.",
        created_by="system",
    )
    if amount > 0 and status in {SupplierPaymentStatus.allocated, SupplierPaymentStatus.partially_allocated}:
        payment.allocations.append(SupplierPaymentAllocation(invoice=invoice, allocated_amount=amount, created_by="system"))
    db.add(payment)
    return payment


def main() -> None:
    db = SessionLocal()
    try:
        reset = "--reset" in sys.argv
        if reset:
            clear_database(db)
            db.commit()

        if db.scalar(select(Client.id).where(Client.inn == MARKER_INN)):
            print("Seed data already exists. Skipping.")
            return

        clients = [
            add_client(db, 1, "Toshkent Qurilish Ta'mir MCHJ", "Toshkent"),
            add_client(db, 2, "Andijon Yo'l Servis MCHJ", "Andijon"),
            add_client(db, 3, "Buxoro Asfalt Invest MCHJ", "Buxoro"),
            add_client(db, 4, "Namangan Beton Servis MCHJ", "Namangan"),
            add_client(db, 5, "Qarshi Magistral Yo'l MCHJ", "Qashqadaryo"),
            add_client(db, 6, "Nukus Road Invest MCHJ", "Qoraqalpog'iston"),
            add_client(db, 7, "Jizzax Transport Qurilish MCHJ", "Jizzax"),
            add_client(db, 8, "Urganch Kommunal Yo'l MCHJ", "Xorazm"),
        ]
        suppliers = [
            add_supplier(db, 1, "Jarqo'rg'on Bitum Trade MCHJ", "Surxondaryo"),
            add_supplier(db, 2, "Farg'ona Refinery Supply MCHJ", "Farg'ona"),
            add_supplier(db, 3, "Toshkent Oil Terminal MCHJ", "Toshkent"),
            add_supplier(db, 4, "Buxoro Petroleum Base MCHJ", "Buxoro"),
            add_supplier(db, 5, "Samarqand Logistic Carrier MCHJ", "Samarqand"),
            add_supplier(db, 6, "Import Bitumen Service MCHJ", "Toshkent"),
        ]
        db.flush()
        transports = [
            add_transport(db, 1, "UzTrans Bitum Logistic MCHJ", "Akmal Karimov", "01 A 247 BA", TransportStatus.active, True),
            add_transport(db, 2, "Asia Road Carrier MCHJ", "Jasur Toirov", "10 B 884 CA", TransportStatus.active),
            add_transport(db, 3, "Samarqand Sisterna Servis MCHJ", "Dilshod Ergashev", "30 D 512 FA", TransportStatus.active),
            add_transport(db, 4, "Farg'ona Yuk Avto MCHJ", "Sherzod Nabiyev", "40 H 901 HA", TransportStatus.maintenance),
            add_transport(db, 5, "Buxoro Trans Oil MCHJ", "Bobur Rahimov", "80 K 118 KA", TransportStatus.inactive),
        ]
        db.flush()
        stock_locations = [
            StockLocation(location_type=StockLocationType.supplier_storage, supplier=suppliers[0], name="Jarqo'rg'on terminali", region="Surxondaryo", district="Jarqo'rg'on", address="Jarqo'rg'on neft bazasi, 2-rezervuar"),
            StockLocation(location_type=StockLocationType.company_warehouse, name="Toshkent markaziy ombor", region="Toshkent", district="Bektemir", address="Bektemir sanoat zonasi, 14-ombor"),
            StockLocation(location_type=StockLocationType.in_transit, name="Yo'ldagi zaxira", region="Samarqand", district="Bulung'ur", address="M-39 yo'nalishi"),
            StockLocation(location_type=StockLocationType.customer_site, name="Mijoz obyektidagi qoldiq", region="Buxoro", district="Kogon", address="Kogon yo'l qurilish obyekt"),
        ]
        db.add_all(stock_locations)
        db.flush()

        scenarios = [
            (ContractStatus.active, OrderStatus.created, SupplierStatus.not_selected, ProcurementStatus.supplier_search, None, FulfillmentType.company_managed_delivery, SourceType.jarkurgan, d("40"), d("5200000"), None),
            (ContractStatus.active, OrderStatus.supplier_search, SupplierStatus.searching, ProcurementStatus.offers_received, suppliers[0], FulfillmentType.company_managed_delivery, SourceType.uzbekistan_local, d("55"), d("5350000"), None),
            (ContractStatus.active, OrderStatus.supplier_selected, SupplierStatus.selected, ProcurementStatus.supplier_selected, suppliers[1], FulfillmentType.direct_supplier_to_customer, SourceType.jarkurgan, d("30"), d("5450000"), None),
            (ContractStatus.signed, OrderStatus.waiting_payment, SupplierStatus.confirmed, ProcurementStatus.supplier_confirmed, suppliers[2], FulfillmentType.company_managed_delivery, SourceType.russia_direct, d("70"), d("5550000"), None),
            (ContractStatus.active, OrderStatus.in_delivery, SupplierStatus.confirmed, ProcurementStatus.ready_for_delivery, suppliers[0], FulfillmentType.company_managed_delivery, SourceType.uzbekistan_local, d("65"), d("5300000"), (BatchStatus.in_transit, LogisticsStatus.in_transit, d("25"), d("25"), None)),
            (ContractStatus.active, OrderStatus.partially_delivered, SupplierStatus.confirmed, ProcurementStatus.completed, suppliers[3], FulfillmentType.company_managed_delivery, SourceType.other, d("90"), d("5250000"), (BatchStatus.accepted, LogisticsStatus.accepted, d("45"), d("45"), d("42"))),
            (ContractStatus.completed, OrderStatus.delivered, SupplierStatus.confirmed, ProcurementStatus.completed, suppliers[4], FulfillmentType.direct_supplier_to_customer, SourceType.jarkurgan, d("50"), d("5400000"), (BatchStatus.completed, LogisticsStatus.completed, d("50"), d("50"), d("50"))),
            (ContractStatus.cancelled, OrderStatus.cancelled, SupplierStatus.changed, ProcurementStatus.cancelled, suppliers[5], FulfillmentType.company_managed_delivery, SourceType.russia_direct, d("35"), d("5600000"), None),
        ]

        contracts: list[Contract] = []
        orders: list[Order] = []
        procurements: list[Procurement] = []
        batches: list[DeliveryBatch | None] = []

        for idx, (contract_status, order_status, supplier_status, procurement_status, supplier, fulfillment, source, quantity, unit_price, batch_spec) in enumerate(scenarios, start=1):
            contract = add_contract(db, idx, clients[idx - 1], contract_status, quantity, unit_price)
            contracts.append(contract)
            db.flush()
            order = add_order(db, idx, contract, supplier, order_status, supplier_status, fulfillment, source, quantity, unit_price, d("2500000") if fulfillment == FulfillmentType.company_managed_delivery else Decimal("0"))
            orders.append(order)
            db.flush()
            procurement = add_procurement(db, idx, order, supplier, procurement_status)
            procurements.append(procurement)
            db.flush()
            batch = None
            if batch_spec:
                batch_status, logistics_status, planned, loaded, accepted = batch_spec
                transport = transports[(idx - 1) % len(transports)]
                batch = add_batch(db, idx, order, supplier, transport, batch_status, planned, loaded, accepted, logistics_status)
                db.flush()
            batches.append(batch)

        stock_lots = [
            add_exchange_ticket(db, 1, suppliers[0], stock_locations[0], ExchangeTicketStatus.opened, StockStatus.available, d("120"), d("120")),
            add_exchange_ticket(db, 2, suppliers[1], stock_locations[1], ExchangeTicketStatus.paid, StockStatus.reserved, d("85"), d("55"), d("30")),
            add_exchange_ticket(db, 3, suppliers[2], stock_locations[2], ExchangeTicketStatus.partially_paid, StockStatus.partially_used, d("70"), d("22"), d("18")),
            add_exchange_ticket(db, 4, suppliers[3], stock_locations[3], ExchangeTicketStatus.closed, StockStatus.used, d("45"), d("0")),
            add_exchange_ticket(db, 5, suppliers[4], stock_locations[1], ExchangeTicketStatus.overdue, StockStatus.blocked, d("30"), d("30")),
            add_exchange_ticket(db, 6, suppliers[5], stock_locations[0], ExchangeTicketStatus.cancelled, StockStatus.cancelled, d("25"), d("0")),
        ]
        db.flush()
        if batches[4]:
            stock_lots[1].allocations.append(
                StockAllocation(
                    order=orders[4],
                    order_item=orders[4].items[0],
                    delivery_batch=batches[4],
                    allocated_quantity=d("30"),
                    status=StockAllocationStatus.reserved,
                )
            )
            stock_lots[1].movements.append(
                StockMovement(
                    movement_type=StockMovementType.reserve,
                    quantity=d("30"),
                    from_location=stock_locations[1],
                    order_id=orders[4].id,
                    delivery_batch_id=batches[4].id,
                    notes="Buyurtma uchun zaxiralandi.",
                    created_by="system",
                )
            )
        if batches[5]:
            stock_lots[2].allocations.append(
                StockAllocation(
                    order=orders[5],
                    order_item=orders[5].items[0],
                    delivery_batch=batches[5],
                    allocated_quantity=d("18"),
                    status=StockAllocationStatus.delivered,
                )
            )
            stock_lots[2].movements.append(
                StockMovement(
                    movement_type=StockMovementType.delivered,
                    quantity=d("30"),
                    from_location=stock_locations[2],
                    to_location=stock_locations[3],
                    order_id=orders[5].id,
                    delivery_batch_id=batches[5].id,
                    notes="Mijoz obyektiga yetkazildi.",
                    created_by="system",
                )
            )

        invoices = [
            add_customer_invoice(db, 1, orders[3], None, InvoiceType.advance, InvoiceStatus.overdue, d("90000000"), d("0"), -5),
            add_customer_invoice(db, 2, orders[4], batches[4], InvoiceType.batch_payment, InvoiceStatus.issued, d("152000000"), d("0"), 4),
            add_customer_invoice(db, 3, orders[5], batches[5], InvoiceType.batch_payment, InvoiceStatus.partially_paid, d("210000000"), d("85000000"), -2),
            add_customer_invoice(db, 4, orders[6], batches[6], InvoiceType.batch_payment, InvoiceStatus.paid, d("302400000"), d("302400000"), 5),
            add_customer_invoice(db, 5, orders[6], batches[6], InvoiceType.transport, InvoiceStatus.paid, d("6500000"), d("6500000"), 5),
            add_customer_invoice(db, 6, orders[7], None, InvoiceType.other, InvoiceStatus.cancelled, d("25000000"), d("0"), 10),
        ]
        db.flush()
        add_customer_payment(db, 1, invoices[2], d("85000000"), PaymentStatus.partially_allocated)
        add_customer_payment(db, 2, invoices[3], d("302400000"), PaymentStatus.allocated)
        add_customer_payment(db, 3, invoices[4], d("6500000"), PaymentStatus.allocated)
        add_customer_payment(db, 4, invoices[1], d("30000000"), PaymentStatus.unallocated)
        add_customer_payment(db, 5, invoices[5], d("1000000"), PaymentStatus.cancelled)

        supplier_invoices = [
            add_supplier_invoice(db, 1, suppliers[2], procurements[3], None, SupplierInvoiceStatus.overdue, d("220000000"), d("0")),
            add_supplier_invoice(db, 2, suppliers[0], procurements[4], batches[4], SupplierInvoiceStatus.received, d("118000000"), d("0")),
            add_supplier_invoice(db, 3, suppliers[3], procurements[5], batches[5], SupplierInvoiceStatus.partially_paid, d("196000000"), d("70000000")),
            add_supplier_invoice(db, 4, suppliers[4], procurements[6], batches[6], SupplierInvoiceStatus.paid, d("240000000"), d("240000000")),
            add_supplier_invoice(db, 5, suppliers[4], procurements[6], batches[6], SupplierInvoiceStatus.paid, d("4800000"), d("4800000"), SupplierInvoiceType.transport),
            add_supplier_invoice(db, 6, suppliers[5], procurements[7], None, SupplierInvoiceStatus.cancelled, d("110000000"), d("0")),
        ]
        db.flush()
        add_supplier_payment(db, 1, supplier_invoices[2], d("70000000"), SupplierPaymentStatus.partially_allocated)
        add_supplier_payment(db, 2, supplier_invoices[3], d("240000000"), SupplierPaymentStatus.allocated)
        add_supplier_payment(db, 3, supplier_invoices[4], d("4800000"), SupplierPaymentStatus.allocated)
        add_supplier_payment(db, 4, supplier_invoices[1], d("45000000"), SupplierPaymentStatus.unallocated)
        add_supplier_payment(db, 5, supplier_invoices[5], d("1000000"), SupplierPaymentStatus.cancelled)

        db.commit()
        print("Added seed data:")
        print(f"  clients: {len(clients)}")
        print(f"  suppliers: {len(suppliers)}")
        print(f"  contracts: {len(contracts)}")
        print(f"  orders: {len(orders)}")
        print(f"  procurements: {len(procurements)}")
        print(f"  batches/logistics: {sum(1 for item in batches if item)}")
        print(f"  transports: {len(transports)}")
        print(f"  stock tickets/lots: {len(stock_lots)}")
        print(f"  customer invoices/payments: {len(invoices)}/5")
        print(f"  supplier invoices/payments: {len(supplier_invoices)}/5")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
