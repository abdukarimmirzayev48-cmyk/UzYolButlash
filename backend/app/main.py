from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from apscheduler.schedulers.background import BackgroundScheduler

from backend.app.api.attendance import attendance_router, departments_router, employees_router as attendance_employees_router
from backend.app.api.auth import auth_router, users_router
from backend.app.api.clients import router as clients_router
from backend.app.api.contracts import router as contracts_router
from backend.app.api.customer_requests import public_router as customer_requests_public_router
from backend.app.api.customer_requests import router as customer_requests_router
from backend.app.api.dashboard import router as dashboard_router
from backend.app.api.delivery import logistics_router, router as delivery_router
from backend.app.api.finance import finance_router, invoice_router, payment_router
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
from backend.app.services.auth import get_current_user
from backend.app.services.notifications import run_reminder_sweep
from backend.app.services.telegram_bot import start_bot, stop_bot


app = FastAPI(title="Bitum ERP", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET_KEY, same_site="lax")

# Public — no login required (customer-facing request form, and the login endpoint itself).
app.include_router(customer_requests_public_router)
app.include_router(auth_router)

# Everything else requires a logged-in session. Individual write endpoints
# (e.g. Ijro, Davomat) additionally require edit permission for that module
# via their own route-level `require_edit(...)` dependency.
authenticated = [Depends(get_current_user)]
app.include_router(clients_router, dependencies=authenticated)
app.include_router(contracts_router, dependencies=authenticated)
app.include_router(customer_requests_router, dependencies=authenticated)
app.include_router(dashboard_router, dependencies=authenticated)
app.include_router(orders_router, dependencies=authenticated)
app.include_router(delivery_router, dependencies=authenticated)
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

app.mount("/static/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


def _run_reminder_sweep_job() -> None:
    db = SessionLocal()
    try:
        run_reminder_sweep(db)
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
    if (
        full_path.startswith("clients")
        or full_path.startswith("customer-requests")
        or full_path.startswith("talabnoma")
        or full_path.startswith("request")
        or full_path.startswith("contracts")
        or full_path.startswith("orders")
        or full_path.startswith("delivery-batches")
        or full_path.startswith("logistics")
        or full_path.startswith("transports")
        or full_path.startswith("customer-invoices")
        or full_path.startswith("customer-payments")
        or full_path.startswith("suppliers")
        or full_path.startswith("procurements")
        or full_path.startswith("supplier-invoices")
        or full_path.startswith("supplier-payments")
        or full_path.startswith("exchange-tickets")
        or full_path.startswith("stock")
        or full_path.startswith("inventory")
        or full_path.startswith("dashboard")
        or full_path.startswith("profit")
        or full_path.startswith("cashflow")
        or full_path.startswith("receivables")
        or full_path.startswith("payables")
        or full_path.startswith("products")
        or full_path.startswith("attendance")
        or full_path.startswith("tasks")
        or full_path.startswith("employees")
        or full_path.startswith("departments")
        or full_path.startswith("login")
        or full_path.startswith("users")
    ):
        return FileResponse(FRONTEND_DIR / "index.html")
    return RedirectResponse("/clients")
