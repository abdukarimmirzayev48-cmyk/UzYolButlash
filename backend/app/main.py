from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from apscheduler.schedulers.background import BackgroundScheduler

from backend.app.api.attendance import attendance_router, departments_router, employees_router as attendance_employees_router
from backend.app.api.audit import router as audit_router
from backend.app.api.auth import auth_router, users_router
from backend.app.api.clients import router as clients_router
from backend.app.api.contracts import router as contracts_router
from backend.app.api.geo import router as geo_router
from backend.app.api.customer_requests import public_router as customer_requests_public_router
from backend.app.api.customer_requests import router as customer_requests_router
from backend.app.api.dashboard import router as dashboard_router
from backend.app.api.delivery import logistics_router, overview_router as delivery_overview_router, router as delivery_router
from backend.app.api.finance import finance_router, invoice_router, payment_router
from backend.app.api.hikvision_agent import router as hikvision_agent_router
from backend.app.api.inventory import router as inventory_router
from backend.app.api.notifications import router as notifications_router
from backend.app.api.orders import router as orders_router
from backend.app.api.procurement import procurement_router, supplier_router
from backend.app.api.supplier_finance import finance_router as supplier_finance_router
from backend.app.api.supplier_finance import invoice_router as supplier_invoice_router
from backend.app.api.supplier_finance import payment_router as supplier_payment_router
from backend.app.api.task import router as tasks_router
from backend.app.api.transports import router as transports_router
from backend.app.api.products import categories_router as product_categories_router
from backend.app.api.products import products_router
from backend.app.core.config import CORS_ORIGINS, SESSION_SECRET_KEY
from backend.app.core.paths import FRONTEND_DIR, UPLOADS_DIR
from backend.app.db.session import SessionLocal
from backend.app.services.audit import AuditMiddleware
from backend.app.services.auth import get_current_user
from backend.app.services.notifications import (
    run_reminder_sweep,
    sweep_expired_contracts,
    sweep_overdue_contract_payments,
)
from backend.app.services.telegram_bot import start_bot, stop_bot


app = FastAPI(title="UzYolButlash ERP", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
# Added before SessionMiddleware on purpose: Starlette runs the last-added
# middleware outermost, so this one sits inside the session wrapper and can
# read request.session to learn who is acting.
app.add_middleware(AuditMiddleware)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET_KEY, same_site="lax")

# Public — no login required (customer-facing request form, the login endpoint
# itself, and the LAN sync agent, which authenticates with its own shared
# token via require_sync_agent_token instead of a browser session).
app.include_router(customer_requests_public_router)
app.include_router(auth_router)
app.include_router(hikvision_agent_router)

# Everything else requires a logged-in session. Individual write endpoints
# (e.g. Ijro, Davomat) additionally require edit permission for that module
# via their own route-level `require_edit(...)` dependency.
authenticated = [Depends(get_current_user)]
app.include_router(audit_router, dependencies=authenticated)
app.include_router(geo_router, dependencies=authenticated)
app.include_router(clients_router, dependencies=authenticated)
app.include_router(contracts_router, dependencies=authenticated)
app.include_router(customer_requests_router, dependencies=authenticated)
app.include_router(dashboard_router, dependencies=authenticated)
app.include_router(orders_router, dependencies=authenticated)
app.include_router(delivery_router, dependencies=authenticated)
app.include_router(delivery_overview_router, dependencies=authenticated)
app.include_router(logistics_router, dependencies=authenticated)
app.include_router(transports_router, dependencies=authenticated)
app.include_router(invoice_router, dependencies=authenticated)
app.include_router(payment_router, dependencies=authenticated)
app.include_router(finance_router, dependencies=authenticated)
app.include_router(supplier_router, dependencies=authenticated)
app.include_router(procurement_router, dependencies=authenticated)
app.include_router(supplier_invoice_router, dependencies=authenticated)
app.include_router(supplier_payment_router, dependencies=authenticated)
app.include_router(supplier_finance_router, dependencies=authenticated)
app.include_router(inventory_router, dependencies=authenticated)
app.include_router(product_categories_router, dependencies=authenticated)
app.include_router(products_router, dependencies=authenticated)
app.include_router(attendance_employees_router, dependencies=authenticated)
app.include_router(departments_router, dependencies=authenticated)
app.include_router(attendance_router, dependencies=authenticated)
app.include_router(tasks_router, dependencies=authenticated)
app.include_router(notifications_router, dependencies=authenticated)
app.include_router(users_router, dependencies=authenticated)  # also self-gates to admin-only

class VersionedStaticFiles(StaticFiles):
    """Cache assets forever when the URL carries a ?v=... stamp.

    Every script and stylesheet in index.html is requested with a version stamp
    that is bumped whenever the file changes, so a given URL can never return
    different bytes -- which is exactly the condition "immutable" describes.
    Without this header the browser only got a weak ETag, so all 32 script files
    were re-fetched on every single page load; the front end is deliberately
    unbundled, which makes that per-file cost worth removing.

    Requests without a stamp (uploaded documents, anything hand-typed) fall
    through to revalidation, since those really can change under the same URL.
    """

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            stamped = b"v=" in scope.get("query_string", b"")
            response.headers["Cache-Control"] = (
                "public, max-age=31536000, immutable" if stamped else "public, max-age=0, must-revalidate"
            )
        return response


app.mount("/static/uploads", VersionedStaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/static", VersionedStaticFiles(directory=FRONTEND_DIR), name="static")


def _run_reminder_sweep_job() -> None:
    db = SessionLocal()
    try:
        run_reminder_sweep(db)
        sweep_overdue_contract_payments(db)
        sweep_expired_contracts(db)
    finally:
        db.close()


@app.on_event("startup")
def start_scheduler() -> None:
    scheduler = BackgroundScheduler()
    scheduler.add_job(_run_reminder_sweep_job, "interval", minutes=15, id="task_reminder_sweep")
    scheduler.start()


@app.on_event("startup")
def start_telegram_bot() -> None:
    start_bot()


@app.on_event("shutdown")
def stop_telegram_bot() -> None:
    stop_bot()


@app.get("/")
def root():
    return RedirectResponse("/clients")


@app.get("/{full_path:path}", include_in_schema=False)
def frontend(full_path: str):
    # Anything under /api/ that got this far is a route that does not exist.
    # Falling through to the SPA answered it with 200 and an HTML page, so a
    # mistyped path looked like a success until the caller tried to parse the
    # page as JSON and got a confusing syntax error instead of a 404.
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bunday API manzili yo'q.")
    # Qolgan hamma narsa SPA ga beriladi va router noma'lum manzil uchun
    # «Sahifa topilmadi» ni chizadi. Ilgari bu yerda ro'yxatdagi prefikslardan
    # boshqasi /clients ga yo'naltirilardi, shuning uchun /finance/customer-
    # invoices deb yozgan odam hech qanday xatosiz «Mijozlar» sahifasida paydo
    # bo'lardi. Prefikslar ro'yxatining o'zi ham xato manbai edi: yangi sahifa
    # qo'shilganda uni bu yerga qo'shish esdan chiqsa, sahifa yangilanganda
    # yo'qolib qolardi.
    #
    # index.html ?v= belgilarini olib yuradi, shuning uchun u har doim yangi
    # olinishi kerak -- keshlansa, brauzer eski fayllarga bog'lanib qoladi.
    return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})
