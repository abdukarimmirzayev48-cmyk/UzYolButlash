# Bitum ERP

Stage 1 implements the Clients module.
Stage 2 implements the Contracts module connected to clients.
Stage 3 implements the Orders module connected to clients, contracts, and contract specification items.
Stage 4 implements Delivery Batches and Logistics connected to orders.
Stage 5 implements Customer Invoices and Customer Payments.

## Structure

```text
backend/app/       FastAPI app, API routers, models, schemas, services
frontend/          Browser app shell, styles, and modular JavaScript
storage/uploads/   User-uploaded files served at /static/uploads
alembic/           Database migrations
scripts/           Maintenance and seed scripts
```

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn backend.app.main:app --reload
```

Open:

- `http://127.0.0.1:8000/clients`
- `http://127.0.0.1:8000/contracts`
- `http://127.0.0.1:8000/orders`
- `http://127.0.0.1:8000/delivery-batches`
- `http://127.0.0.1:8000/logistics`
- `http://127.0.0.1:8000/customer-invoices`
- `http://127.0.0.1:8000/customer-payments`

## Migrations

The default database URL is `sqlite:///./bitum.db`. Override it with:

```bash
export DATABASE_URL="sqlite:///./bitum.db"
alembic upgrade head
```
