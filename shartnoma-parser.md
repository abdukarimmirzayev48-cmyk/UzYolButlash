You are a senior full-stack engineer. Continue the existing UzYolButlash ERP project.

The project already has:

* FastAPI backend
* SQLite database
* React + TypeScript frontend
* ERP admin panel
* Customers module
* Products module
* Customer Requests / Talabnomalar module
* Orders / Purchases / Shipments modules
* Uzbek ERP-style formal UI

Now implement a new module:

SHARTNOMALAR / CONTRACTS MODULE

Main goal:
Allow an internal ERP user to upload a contract PDF, parse the contract data automatically using deterministic/rule-based parsing, review the extracted data, then create an ERP contract record.

Important:

* Do NOT use AI.
* Do NOT use chatbot logic.
* Do NOT send PDF data to any external service.
* Do NOT rely on online APIs.
* Use local PDF text extraction and regex/rule-based parsing.
* Do not auto-create final contracts without user confirmation.
* Workflow must be:
  PDF upload → parse → review/edit → confirm → create contract.

Do not rewrite the whole project.
Do not break existing modules.
Do not change existing order/purchase/shipment logic.
Add the contracts module cleanly.

==================================================
BUSINESS WORKFLOW
=================

The correct workflow:

1. Internal user opens “Shartnomalar” module.
2. User clicks “PDF orqali yaratish”.
3. User uploads contract PDF.
4. Backend extracts text from PDF.
5. Backend parses important fields.
6. Frontend shows extracted data in a review form.
7. User checks and edits extracted fields if needed.
8. User clicks “Shartnomani yaratish”.
9. ERP creates contract record.
10. Contract can later be linked to customer request or sales order.

Important:

* PDF parsing creates a draft/parsed result only.
* Final contract is created only after user confirmation.
* Parser must return warnings for missing or uncertain fields.

==================================================
REFERENCE CONTRACT FORMAT
=========================

The current contract PDF format contains information such as:

* Contract title: “Шартнома / Договор”
* Contract number, for example: “Договор №110/Б”
* Place: “Тошкент ш”
* Contract date, for example: “10.06.2026”
* Valid until date, for example: “31.12.2026”
* Executor: "O`ZYO`LBUTLASH RESPUBLIKA TA`MINOT BOSHQARMASI" DM
* Customer: "BUXORO YO‘LLARDAN MUNTAZAM FOYDALANISH KORXONASI" DAVLAT MUASSASASI
* Product: Йўлбоп битум маҳсулоти БНД 60/90
* Unit: tonna / тонна
* Quantity: 150
* Unit price: 5 303 600
* Total without VAT: 795 540 000
* VAT rate: 12%
* VAT amount: 95 464 800
* Total with VAT: 891 004 800
* Prepayment percent: 30%
* Prepayment amount: 267 301 440
* Transport costs are separate from contract total
* Didox document ID
* Rouming document ID
* Executor legal requisites
* Customer legal requisites
* Specification table

Parser must be designed for this type of contract template.

==================================================
BACKEND REQUIREMENTS
====================

Add backend support for:

1. PDF file upload
2. PDF text extraction
3. Rule-based contract parsing
4. Parsed data review response
5. Final contract creation
6. Contract list/detail/edit
7. Contract items
8. Contract file storage
9. Contract linking to customer and customer request if possible

Recommended Python libraries:

* pypdf or PyMuPDF for text extraction
* regex / re for parsing
* pathlib for local file storage

If the project already uses another PDF library, use the existing style.

Do not use OCR in this stage.
If PDF text extraction returns empty text, return clear error:
“PDF matnini o‘qib bo‘lmadi. Fayl skaner qilingan bo‘lishi mumkin.”

==================================================
DATABASE TABLES
===============

Create these tables.

---

1. contracts

---

Fields:

* id
* contract_number unique nullable
* contract_date nullable
* valid_until nullable
* place nullable

Customer relation:

* customer_id nullable
* customer_request_id nullable

Customer snapshot fields:

* customer_name nullable
* customer_director_full_name nullable
* customer_inn nullable
* customer_oked nullable
* customer_legal_address nullable
* customer_bank_account nullable
* customer_bank_name nullable
* customer_mfo nullable
* customer_phone nullable

Executor snapshot fields:

* executor_name nullable
* executor_director_full_name nullable
* executor_inn nullable
* executor_oked nullable
* executor_legal_address nullable
* executor_bank_account nullable
* executor_bank_name nullable
* executor_mfo nullable
* executor_phone nullable

Financial fields:

* total_without_vat numeric nullable
* vat_rate numeric nullable
* vat_amount numeric nullable
* total_with_vat numeric nullable

Payment terms:

* prepayment_percent numeric nullable
* prepayment_amount numeric nullable
* remaining_payment_percent numeric nullable
* payment_terms_text nullable
* transport_cost_separate boolean default false

Document IDs:

* didox_id nullable
* rouming_id nullable

Other:

* status required
* source_file_path nullable
* original_filename nullable
* parsed_text_path nullable
* parser_version nullable
* parse_confidence numeric nullable
* parse_warnings JSON/text nullable
* created_at
* updated_at

Status values:

* draft
* active
* completed
* cancelled

Uzbek labels:

* draft → Qoralama
* active → Amalda
* completed → Yakunlangan
* cancelled → Bekor qilingan

---

2. contract_items

---

Fields:

* id
* contract_id
* product_id nullable
* product_name nullable
* product_brand nullable
* catalog_code nullable
* barcode nullable
* unit nullable
* quantity numeric nullable
* unit_price numeric nullable
* amount_without_vat numeric nullable
* vat_rate numeric nullable
* vat_amount numeric nullable
* amount_with_vat numeric nullable
* created_at
* updated_at

Notes:

* product_id is nullable because parsed product name may not exactly match product catalog.
* After parsing, allow user to map parsed item to an existing product.

---

3. contract_files

---

Fields:

* id
* contract_id nullable
* parse_session_id nullable
* original_filename
* file_path
* file_type
* file_size
* uploaded_by nullable
* created_at

---

4. contract_parse_sessions

---

Fields:

* id
* original_filename
* file_path
* parsed_text_path nullable
* parsed_data_json JSON/text
* warnings_json JSON/text
* confidence numeric nullable
* status
* created_by nullable
* created_contract_id nullable
* created_at
* updated_at

Status values:

* parsed
* confirmed
* failed

Purpose:

* Store parsed result before final contract creation.
* Allow user to review parsed data before saving as contract.

==================================================
PDF FILE STORAGE
================

Store uploaded PDFs locally in:

backend/storage/contracts/originals/

Store extracted text optionally in:

backend/storage/contracts/parsed_text/

Rules:

* Generate safe filenames.
* Keep original filename in database.
* Do not overwrite existing files.
* Validate file extension: only .pdf
* Validate file size. Default max: 20 MB.
* Return formal Uzbek validation errors.

==================================================
PDF PARSING REQUIREMENTS
========================

Create parser module:

backend/app/services/contract_pdf_parser.py

Main function:
parse_contract_pdf(file_path: str) -> ParsedContractResult

Create structured result:

{
"contract_number": "110/Б",
"contract_date": "2026-06-10",
"valid_until": "2026-12-31",
"place": "Тошкент ш",
"executor": {...},
"customer": {...},
"items": [...],
"totals": {...},
"payment_terms": {...},
"document_ids": {...},
"transport_cost_separate": true,
"warnings": [...],
"confidence": 0.85,
"raw_text": "..."
}

---

## Fields to parse

A) Contract main information:

* contract_number
* contract_date
* valid_until
* place

Patterns:

* “Договор №...”
* “№...-сонли шартномага”
* date format: dd.mm.yyyy
* valid until often appears after contract date in dd.mm.yyyy format

B) Executor:

* executor_name
* executor_director_full_name
* executor_inn
* executor_oked
* executor_legal_address
* executor_bank_account
* executor_bank_name
* executor_mfo

C) Customer:

* customer_name
* customer_director_full_name
* customer_inn
* customer_oked
* customer_legal_address
* customer_bank_account
* customer_bank_name
* customer_mfo

D) Product item:

* product_name
* product_brand
* catalog_code
* unit
* quantity
* unit_price
* amount_without_vat
* vat_rate
* vat_amount
* amount_with_vat

E) Totals:

* total_without_vat
* vat_rate
* vat_amount
* total_with_vat

F) Payment terms:

* prepayment_percent
* prepayment_amount
* remaining_payment_percent
* payment_terms_text

G) Transport:

* transport_cost_separate
  Detect true when text contains meaning similar to:
  “transport xarajatlari shartnoma bahosi tarkibiga kiritilmagan”
  or
  “транспортные расходы ... не включены ... отдельно”

H) Document IDs:

* didox_id
* rouming_id

Patterns:

* “ID документа (Didox.uz): ...”
* “ID документа (Rouming.uz): ...”

---

## Parsing rules

1. Normalize whitespace.
2. Convert non-breaking spaces.
3. Preserve Uzbek apostrophes.
4. Support both Cyrillic and Latin text.
5. Parse numbers with spaces:
   “5 303 600.00” → 5303600
6. Parse percentages:
   “12 %” → 12
7. Parse dates:
   dd.mm.yyyy → yyyy-mm-dd
8. If a field is missing, set it to null and add warning.
9. Do not guess uncertain values silently.
10. Add confidence score based on number of required fields found.

---

## Required field confidence

High confidence fields:

* contract_number
* contract_date
* customer_name
* customer_inn
* product_name
* quantity
* unit_price
* total_with_vat

If any high confidence field is missing, add warning.

Example warnings:

* “Shartnoma raqami aniqlanmadi.”
* “Buyurtmachi STIR aniqlanmadi.”
* “Mahsulot miqdori aniqlanmadi.”
* “Umumiy summa aniqlanmadi.”
* “PDF matni to‘liq o‘qilmagan bo‘lishi mumkin.”

==================================================
BACKEND API ENDPOINTS
=====================

Add authenticated internal ERP endpoints.

---

1. Parse PDF

---

POST /api/contracts/parse-pdf

Auth required.

Request:
multipart/form-data

* file: PDF file

Behavior:

* validate PDF
* store uploaded file
* extract text
* parse text
* create contract_parse_sessions row
* return parsed data

Response:
{
"success": true,
"data": {
"parse_session_id": 1,
"confidence": 0.86,
"warnings": [],
"parsed": {
"contract_number": "110/Б",
"contract_date": "2026-06-10",
"valid_until": "2026-12-31",
"place": "Тошкент ш",
"customer_name": "...",
"customer_inn": "206840820",
"items": [...]
}
}
}

---

2. Create contract from parsed data

---

POST /api/contracts/from-parsed

Auth required.

Request:
{
"parse_session_id": 1,
"customer_id": 5,
"customer_request_id": 2,
"contract_number": "110/Б",
"contract_date": "2026-06-10",
"valid_until": "2026-12-31",
"place": "Тошкент ш",
"customer_name": "...",
"customer_director_full_name": "...",
"customer_inn": "...",
"customer_oked": "...",
"customer_legal_address": "...",
"customer_bank_account": "...",
"customer_bank_name": "...",
"customer_mfo": "...",
"executor_name": "...",
"executor_inn": "...",
"executor_oked": "...",
"executor_legal_address": "...",
"executor_bank_account": "...",
"executor_bank_name": "...",
"executor_mfo": "...",
"total_without_vat": 795540000,
"vat_rate": 12,
"vat_amount": 95464800,
"total_with_vat": 891004800,
"prepayment_percent": 30,
"prepayment_amount": 267301440,
"remaining_payment_percent": 70,
"transport_cost_separate": true,
"didox_id": "...",
"rouming_id": "...",
"status": "active",
"items": [
{
"product_id": 1,
"product_name": "Yo‘lbop bitum mahsuloti",
"product_brand": "BND 60/90",
"unit": "tonna",
"quantity": 150,
"unit_price": 5303600,
"amount_without_vat": 795540000,
"vat_rate": 12,
"vat_amount": 95464800,
"amount_with_vat": 891004800
}
]
}

Behavior:

* validate data
* create contract
* create contract items
* link uploaded file to contract
* mark parse session as confirmed
* return created contract

---

3. Contract list

---

GET /api/contracts

Auth required.

Filters:

* search
* status
* customer_id
* customer_request_id
* date_from
* date_to
* page
* limit

Search by:

* contract_number
* customer_name
* customer_inn
* didox_id
* rouming_id

Return:

* id
* contract_number
* contract_date
* valid_until
* customer_name
* customer_inn
* total_with_vat
* status
* created_at

---

4. Contract detail

---

GET /api/contracts/{id}

Return:

* contract main data
* customer snapshot
* executor snapshot
* financial data
* payment terms
* document IDs
* items
* files
* linked customer request if exists

---

5. Update contract

---

PATCH /api/contracts/{id}

Allow editing contract fields and items.
Do not edit source file.
Do not delete parse session.

---

6. Delete/cancel contract

---

POST /api/contracts/{id}/cancel

Do not hard delete.
Set status = cancelled.

---

7. Download/view contract file

---

GET /api/contracts/{id}/file

Return original PDF file if available.

==================================================
FRONTEND REQUIREMENTS
=====================

Add ERP sidebar item:

* Shartnomalar

Routes:

* /contracts
* /contracts/upload
* /contracts/:id
* /contracts/:id/edit

==================================================

1. CONTRACT LIST PAGE
   ==================================================

Route:

* /contracts

Title:

* Shartnomalar

Top actions:

* PDF orqali yaratish
* Yangi shartnoma

Table columns:

* Shartnoma raqami
* Sana
* Amal qilish muddati
* Buyurtmachi
* STIR
* Umumiy summa
* Status
* Amallar

Actions:

* Ko‘rish
* Tahrirlash
* Faylni ko‘rish

Filters:

* Qidiruv
* Status
* Sana oralig‘i

==================================================
2. PDF UPLOAD / PARSE PAGE
==========================

Route:

* /contracts/upload

Title:

* PDF orqali shartnoma yaratish

Step 1:

* Upload PDF

UI text:

* Shartnoma PDF faylini yuklang
* Faqat PDF fayl qabul qilinadi.
* Fayl yuklash
* Tahlil qilish

After upload and parse:
Show parsed result review page.

==================================================
3. PARSED RESULT REVIEW UI
==========================

After successful parse, show editable review form.

Page title:

* Shartnoma ma’lumotlarini tekshirish

Show confidence and warnings:

* Aniqlik darajasi
* Ogohlantirishlar

If warnings exist, show them clearly.

Review sections:

1. Asosiy ma’lumotlar
   Fields:

* Shartnoma raqami
* Shartnoma sanasi
* Amal qilish muddati
* Tuzilgan joy

2. Bajaruvchi
   Fields:

* Bajaruvchi nomi
* Direktor F.I.Sh.
* STIR
* OKED
* Yuridik manzil
* Hisob raqami
* Bank nomi
* MFO

3. Buyurtmachi
   Fields:

* Buyurtmachi nomi
* Direktor F.I.Sh.
* STIR
* OKED
* Yuridik manzil
* Hisob raqami
* Bank nomi
* MFO

4. Mahsulotlar
   Editable table:

* Mahsulot
* Marka
* Katalog kodi
* O‘lchov birligi
* Miqdor
* Birlik narxi
* QQSsiz summa
* QQS stavkasi
* QQS summasi
* QQS bilan summa
* ERP mahsuloti bilan bog‘lash

5. Hisob-kitob
   Fields:

* QQSsiz umumiy summa
* QQS stavkasi
* QQS summasi
* QQS bilan umumiy summa

6. To‘lov shartlari
   Fields:

* Oldindan to‘lov foizi
* Oldindan to‘lov summasi
* Qolgan to‘lov foizi
* Transport xarajati alohida hisoblanadi

7. Elektron hujjat identifikatorlari
   Fields:

* Didox ID
* Rouming ID

8. Bog‘lash
   Fields:

* Mijoz bilan bog‘lash
* Talabnoma bilan bog‘lash

Buttons:

* Shartnomani yaratish
* Bekor qilish
* PDF faylni ko‘rish

Important:

* User must be able to edit parsed fields before creating contract.
* User must be able to map parsed customer to existing customer.
* User must be able to map parsed product to existing product.
* If parsed customer INN matches existing customer INN, suggest that customer automatically.
* If parsed product brand matches existing product brand, suggest product automatically.

==================================================
4. CONTRACT DETAIL PAGE
=======================

Route:

* /contracts/:id

Title:

* Shartnoma kartasi

Header:

* Shartnoma raqami
* Status badge
* Buyurtmachi
* Shartnoma sanasi
* Amal qilish muddati

Actions:

* Tahrirlash
* PDF faylni ko‘rish
* Bekor qilish
* Orqaga

Sections:

1. Asosiy ma’lumotlar
2. Bajaruvchi
3. Buyurtmachi
4. Mahsulotlar
5. Hisob-kitob
6. To‘lov shartlari
7. Elektron hujjat identifikatorlari
8. Bog‘langan obyektlar

==================================================
5. CONTRACT EDIT PAGE
=====================

Route:

* /contracts/:id/edit

Allow editing:

* contract main fields
* customer snapshot
* executor snapshot
* financial data
* payment terms
* items
* links to customer/customer request

Do not edit original file.

==================================================
UI TEXT QUALITY
===============

Use formal Uzbek text.

Use:

* Shartnomalar
* PDF orqali yaratish
* PDF orqali shartnoma yaratish
* Shartnoma PDF faylini yuklang
* Tahlil qilish
* Shartnoma ma’lumotlarini tekshirish
* Aniqlik darajasi
* Ogohlantirishlar
* Asosiy ma’lumotlar
* Bajaruvchi
* Buyurtmachi
* Mahsulotlar
* Hisob-kitob
* To‘lov shartlari
* Elektron hujjat identifikatorlari
* Bog‘lash
* Shartnoma raqami
* Shartnoma sanasi
* Amal qilish muddati
* Tuzilgan joy
* STIR
* OKED
* Yuridik manzil
* Hisob raqami
* Bank nomi
* MFO
* Mahsulot
* Marka
* O‘lchov birligi
* Miqdor
* Birlik narxi
* QQSsiz summa
* QQS stavkasi
* QQS summasi
* QQS bilan summa
* QQS bilan umumiy summa
* Oldindan to‘lov foizi
* Oldindan to‘lov summasi
* Transport xarajati alohida hisoblanadi
* Didox ID
* Rouming ID
* Mijoz bilan bog‘lash
* Talabnoma bilan bog‘lash
* Shartnomani yaratish
* Tahrirlash
* Bekor qilish
* Orqaga
* PDF faylni ko‘rish

Do not use:

* AI
* Chatbot
* informal Uzbek
* mixed random Russian labels
* emojis

Legal abbreviations like STIR, OKED, MFO, QQS are allowed.

==================================================
VALIDATION REQUIREMENTS
=======================

Backend and frontend validations:

* PDF fayl majburiy.
* Faqat PDF fayl qabul qilinadi.
* Fayl hajmi 20 MB dan oshmasligi kerak.
* PDF matnini o‘qib bo‘lmadi. Fayl skaner qilingan bo‘lishi mumkin.
* Shartnoma raqami majburiy.
* Shartnoma sanasi majburiy.
* Buyurtmachi nomi majburiy.
* Buyurtmachi STIR majburiy.
* Kamida bitta mahsulot bo‘lishi kerak.
* Miqdor 0 dan katta bo‘lishi kerak.
* Birlik narxi 0 dan katta bo‘lishi kerak.
* QQS stavkasi noto‘g‘ri.
* QQS bilan umumiy summa noto‘g‘ri hisoblangan bo‘lishi mumkin.

==================================================
CALCULATION CHECKS
==================

After parsing and before saving, backend should validate:

1. item.quantity * item.unit_price approximately equals amount_without_vat
2. amount_without_vat * vat_rate / 100 approximately equals vat_amount
3. amount_without_vat + vat_amount approximately equals amount_with_vat
4. Sum of item amount_with_vat approximately equals contract total_with_vat

If mismatch, do not necessarily block save, but add warning:
“Hisob-kitob qiymatlarida farq aniqlandi. Ma’lumotlarni tekshiring.”

Allow small rounding difference.

==================================================
CUSTOMER / PRODUCT MATCHING
===========================

After parsing:

* If customer_inn matches existing customer.inn, suggest that customer.
* If no customer found, allow creating contract using snapshot only.
* If product_brand or product_name matches existing products, suggest product mapping.
* If no product found, allow saving item with product_id null.

Do not auto-create customer unless user confirms in future stage.
For now, contract can store customer snapshot even if customer_id is null.

==================================================
LINK TO CUSTOMER REQUEST
========================

Allow optional linking to existing customer request.

Search/select customer request by:

* request_number
* company_name
* inn

If linked:

* contract.customer_request_id is set.
* Customer request detail should show linked contract if possible.
* Contract detail should show linked customer request.

Do not automatically convert request to order in this stage.

==================================================
README / DOCUMENTATION
======================

Update README with:

1. New contracts module explanation
2. How PDF parsing works
3. Supported PDF format
4. File upload storage path
5. Important limitation:

   * Parser works with text-based PDFs.
   * Scanned PDFs are not supported in this stage.
6. How to test:

   * Upload a contract PDF
   * Review parsed data
   * Create contract
   * Open contract detail

==================================================
ACCEPTANCE CRITERIA
===================

After implementation:

1. Backend starts without errors.
2. New contract tables are created.
3. ERP sidebar has “Shartnomalar”.
4. User can open /contracts.
5. User can upload PDF at /contracts/upload.
6. Backend extracts text from text-based PDF.
7. Parser extracts contract number, date, valid until, customer data, executor data, item data, totals, payment terms, Didox/Rouming IDs where possible.
8. Parser returns warnings for missing fields.
9. Frontend shows parsed data in editable review form.
10. User can edit parsed data.
11. User can map customer and product if matches exist.
12. User can create final contract from parsed data.
13. Contract list shows created contract.
14. Contract detail shows all saved sections.
15. Original PDF file is stored and can be opened/downloaded.
16. Existing modules still work.
17. Frontend build passes.
18. UI text is formal Uzbek.
19. No AI/chatbot wording appears anywhere.

==================================================
FINAL DELIVERABLE
=================

After implementation, provide:

1. Summary of backend changes
2. Summary of frontend changes
3. New database tables
4. New API endpoints
5. PDF parser implementation summary
6. File storage path
7. How to test with a contract PDF
8. Parser limitations
9. Any assumptions made

Do not stop at planning. Implement the contracts module fully.
