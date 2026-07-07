# Bitum ERP

Stage 1 implements the Clients module.
Stage 2 implements the Contracts module connected to clients.
Stage 3 implements the Orders module connected to clients, contracts, and contract specification items.
Stage 4 implements Delivery Batches and Logistics connected to orders.
Stage 5 implements Customer Invoices and Customer Payments.
Stage 6 adds public talabnoma intake and the contract PDF parser workflow.

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

## Company Registry Import

Put the Excel file here:

```text
backend/data/road_organizations.xlsx
```

Import real road organizations into `company_registry` for public STIR lookup:

```bash
python -m backend.app.import_company_registry
```

If you run commands from the `backend/` directory, use:

```bash
python -m app.import_company_registry
uvicorn app.main:app --reload
```

Open:

- `http://127.0.0.1:8000/clients`
- `http://127.0.0.1:8000/contracts`
- `http://127.0.0.1:8000/orders`
- `http://127.0.0.1:8000/delivery-batches`
- `http://127.0.0.1:8000/logistics`
- `http://127.0.0.1:8000/customer-invoices`
- `http://127.0.0.1:8000/customer-payments`

## Shartnomalar PDF Parser

The contracts module supports a local, rule-based PDF workflow:

```text
PDF yuklash -> matnni ajratish -> regex/rule-based tahlil -> ko'rib chiqish/tahrirlash -> shartnoma yaratish
```

No AI, chatbot logic, online API, or external PDF service is used. PDF text is extracted locally with `pypdf`, then parsed with deterministic Python rules in:

```text
backend/app/services/contract_pdf_parser.py
```

Supported format is the current text-based UzYolButlash contract template containing contract number/date, executor and customer requisites, product specification, QQS totals, payment terms, and Didox/Rouming IDs. Scanned/image-only PDFs are not supported in this stage. If text extraction fails, the API returns:

```text
PDF matnini o‘qib bo‘lmadi. Fayl skaner qilingan bo‘lishi mumkin.
```

Uploaded files are stored locally:

```text
backend/storage/contracts/originals/
backend/storage/contracts/parsed_text/
```

Main endpoints:

```text
POST /api/contracts/parse-pdf
POST /api/contracts/from-parsed
GET  /api/contracts
GET  /api/contracts/{id}
PATCH /api/contracts/{id}
POST /api/contracts/{id}/cancel
GET  /api/contracts/{id}/file
```

How to test:

1. Run `alembic upgrade head`.
2. Open `http://127.0.0.1:8000/contracts`.
3. Click `PDF orqali yaratish`.
4. Upload a text-based contract PDF.
5. Review parser confidence and warnings.
6. Edit parsed fields if needed.
7. Link an ERP client/product if suggested.
8. Click `Shartnomani yaratish`.
9. Open the created contract detail and verify the original PDF opens from `PDF faylni ko'rish`.

## Migrations

The default database URL is `sqlite:///./bitum.db`. Override it with:

```bash
export DATABASE_URL="sqlite:///./bitum.db"
alembic upgrade head
```
