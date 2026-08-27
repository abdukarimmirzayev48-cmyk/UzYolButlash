"""Yoqilg'i va yo'l hodisalari jurnali

Revision ID: 20260828_0046
Revises: 20260828_0045
Create Date: 2026-08-28

Yoqilg'i daftari «qancha quyildi» degan savolga javob berardi, nazorat
uchun kerak bo'lgan «bu yerda nima bo'ldi va tekshiruv nima bilan
tugadi» degan savolga esa yo'q. Ikkita jadval bir voqeani ikki xil
aytmasligi uchun daftar alohida qoldirilmadi: yozuvlari hodisalar
jurnaliga ko'chirildi.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260828_0046"
down_revision = "20260828_0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transport_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_number", sa.String(64), nullable=False),
        sa.Column("transport_id", sa.Integer(), sa.ForeignKey("transports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("logistics_id", sa.Integer(), sa.ForeignKey("logistics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("source", sa.String(255)),
        sa.Column("location", sa.String(255)),
        sa.Column("gps_coordinates", sa.String(128)),
        sa.Column("odometer_km", sa.Numeric(10, 1)),
        sa.Column("speed_kmh", sa.Numeric(6, 1)),
        sa.Column("engine_running", sa.Boolean()),
        sa.Column("fuel_before_liters", sa.Numeric(10, 2)),
        sa.Column("fuel_after_liters", sa.Numeric(10, 2)),
        sa.Column("amount_liters", sa.Numeric(10, 2)),
        sa.Column("possible_loss_liters", sa.Numeric(10, 2)),
        sa.Column("confirmed_consumption_liters", sa.Numeric(10, 2)),
        sa.Column("cost_amount", sa.Numeric(18, 2)),
        sa.Column("document_reference", sa.String(255)),
        sa.Column("evidence_url", sa.String(500)),
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("approved_by", sa.String(255)),
        sa.Column("driver_explanation", sa.Text()),
        sa.Column("check_result", sa.String(32), nullable=False, server_default="not_checked"),
        sa.Column("checked_by", sa.String(255)),
        sa.Column("decision", sa.Text()),
        sa.Column("damage_amount", sa.Numeric(18, 2)),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("note", sa.Text()),
        sa.Column("created_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    for column in ("event_number", "transport_id", "logistics_id", "occurred_at", "event_type", "check_result", "status"):
        op.create_index(f"ix_transport_events_{column}", "transport_events", [column])

    # Eski daftardagi yozuvlar. Sana bor, vaqt yo'q -- kun boshi qo'yiladi
    # va bu ko'rinib turadi: yozuv qachon kiritilganini kim kiritganidan
    # bilib bo'lmaydi, uni to'qib qo'yish esa yolg'on bo'lardi.
    bind = op.get_bind()
    rows = list(bind.execute(sa.text(
        "SELECT id, transport_id, entry_date, entry_type, amount_liters, cost_amount, note, created_by, created_at"
        " FROM transport_fuel_logs ORDER BY entry_date, id"
    )))
    counters: dict[str, int] = {}
    for row in rows:
        data = dict(row._mapping)
        day = str(data["entry_date"])[:10].replace("-", "")
        counters[day] = counters.get(day, 0) + 1
        bind.execute(
            sa.text(
                "INSERT INTO transport_events (event_number, transport_id, occurred_at, event_type,"
                " amount_liters, cost_amount, note, created_by, is_approved, check_result, status, created_at, updated_at)"
                " VALUES (:number, :transport_id, :occurred_at, :event_type, :amount, :cost, :note, :created_by,"
                " 0, 'not_checked', 'closed', :created_at, :created_at)"
            ).bindparams(
                number=f"EV-{day}-{counters[day]:02d}",
                transport_id=data["transport_id"],
                occurred_at=f"{str(data['entry_date'])[:10]} 00:00:00",
                event_type="refuel" if data["entry_type"] == "added" else "consumption",
                amount=data["amount_liters"],
                cost=data["cost_amount"],
                note=data["note"],
                created_by=data["created_by"],
                created_at=data["created_at"],
            )
        )
    print(f"  yoqilg'i daftaridan ko'chirildi: {len(rows)} ta yozuv")
    op.drop_table("transport_fuel_logs")


def downgrade() -> None:
    op.create_table(
        "transport_fuel_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transport_id", sa.Integer(), sa.ForeignKey("transports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("entry_type", sa.String(16), nullable=False),
        sa.Column("amount_liters", sa.Numeric(10, 2), nullable=False),
        sa.Column("cost_amount", sa.Numeric(18, 2)),
        sa.Column("note", sa.Text()),
        sa.Column("created_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    bind = op.get_bind()
    bind.execute(sa.text(
        "INSERT INTO transport_fuel_logs (transport_id, entry_date, entry_type, amount_liters, cost_amount, note, created_by, created_at, updated_at)"
        " SELECT transport_id, date(occurred_at), CASE WHEN event_type = 'refuel' THEN 'added' ELSE 'consumed' END,"
        " COALESCE(amount_liters, 0), cost_amount, note, created_by, created_at, updated_at"
        " FROM transport_events WHERE event_type IN ('refuel', 'consumption')"
    ))
    op.drop_table("transport_events")
