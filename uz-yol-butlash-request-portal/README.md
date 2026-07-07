# UzYolButlash Request Portal

Separate public frontend for submitting bitumen requirement requests to the UzYolButlash ERP backend.

This project is not the internal ERP admin panel. It has no login, no sidebar, and only calls public backend endpoints.

## Install

```bash
npm install
```

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Local development:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_ERP_LOGIN_URL=http://127.0.0.1:8000/dashboard
```

Production example:

```env
VITE_API_BASE_URL=https://api.uzyolbutlash.uz
VITE_ERP_LOGIN_URL=https://erp.uzyolbutlash.uz/login
```

## Run Locally

Start the ERP backend first, then run:

```bash
npm run dev
```

The dev command builds the portal and serves `dist/` locally with history fallback for `/talabnoma`.

Open:

```text
http://127.0.0.1:5173/talabnoma
```

## Public Routes

- `/` redirects to `/talabnoma`
- `/talabnoma` opens the request form
- Success is shown inside the request form after submission

## Backend API

The portal uses only public ERP endpoints:

- `GET /api/public/company-by-inn?inn=...`
- `GET /api/public/products`
- `POST /api/public/customer-requests`

The base URL is configured through `VITE_API_BASE_URL`.

For `Tizim tashkiloti` STIR lookup, import the real organization registry in the backend first:

```bash
cd /path/to/UzYolButlash
python -m backend.app.import_company_registry
```

## Build

```bash
npm run build
```

Output is generated in `dist/`.

The production build type-checks TypeScript and emits browser modules into `dist/`. Runtime React dependencies are loaded through the import map in `dist/index.html`.

## Deployment Notes

This frontend can be hosted on a separate domain, for example:

```text
https://talabnoma.uzyolbutlash.uz
```

Configure `VITE_API_BASE_URL` to the ERP backend public API domain before building. The backend must allow CORS from the public portal domain.
