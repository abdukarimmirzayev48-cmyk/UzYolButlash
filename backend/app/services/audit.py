"""Recording of write actions, and the naming used to present them."""

import re
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from backend.app.db.session import SessionLocal
from backend.app.models.audit import AuditLog
from backend.app.models.user import User

# Reads are not recorded. The dashboards poll constantly, so logging them would
# bury the handful of entries that actually matter under thousands of GETs.
TRACKED_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

# Nothing about these is worth keeping and one of them carries a password.
SKIP_PATHS = ("/api/auth/login", "/api/notifications")

# First path segment after /api/ -> the module a person would name.
MODULE_BY_PREFIX = {
    "clients": "Mijozlar",
    "customer-requests": "Talabnomalar",
    "contracts": "Shartnomalar",
    "orders": "Buyurtmalar",
    "delivery-batches": "Partiyalar",
    "delivery": "Yetkazib berish",
    "logistics": "Logistika",
    "transports": "Transportlar",
    "suppliers": "Ta'minotchilar",
    "procurements": "Xaridlar",
    "supplier-invoices": "Ta'minotchi hisoblari",
    "supplier-payments": "Ta'minotchi to'lovlari",
    "supplier-finance": "Ta'minotchi moliyasi",
    "customer-invoices": "Mijoz hisoblari",
    "customer-payments": "Mijoz to'lovlari",
    "finance": "Moliya",
    "stock-lots": "Zaxira",
    "stock": "Zaxira",
    "exchange-tickets": "Birja ticketlari",
    "inventory": "Zaxira",
    "products": "Mahsulotlar",
    "product-categories": "Mahsulot turkumlari",
    "tasks": "Ijro",
    "attendance": "Davomat",
    "employees": "Xodimlar",
    "departments": "Bo'limlar",
    "users": "Foydalanuvchilar",
    "auth": "Kirish",
}

ACTION_BY_METHOD = {
    "POST": "created",
    "PATCH": "updated",
    "PUT": "updated",
    "DELETE": "deleted",
}

# Verbs that read better than a bare "created" when the URL says what happened.
ACTION_BY_SUFFIX = {
    "status": "status_changed",
    "cancel": "cancelled",
    "complete": "completed",
    "confirm-loading": "loading_confirmed",
    "confirm-delivery": "delivery_confirmed",
    "convert-to-order": "converted",
    "documents": "document_added",
    "upload": "document_added",
    "notes": "note_added",
    "comments": "comment_added",
    "attachments": "file_added",
    "logout": "logged_out",
}

_ID_IN_PATH = re.compile(r"/(\d+)(?:/|$)")


def describe(path: str, method: str) -> tuple[str | None, str, str | None]:
    """Module, action and record id, worked out from the URL alone."""
    trimmed = path.split("?")[0].rstrip("/")
    parts = [part for part in trimmed.split("/") if part]
    module = None
    if len(parts) >= 2 and parts[0] == "api":
        module = MODULE_BY_PREFIX.get(parts[1], parts[1])
    action = ACTION_BY_METHOD.get(method, method.lower())
    if parts:
        suffix = parts[-1]
        if suffix in ACTION_BY_SUFFIX and method != "DELETE":
            action = ACTION_BY_SUFFIX[suffix]
    ids = _ID_IN_PATH.findall(trimmed)
    return module, action, (ids[0] if ids else None)


class AuditMiddleware(BaseHTTPMiddleware):
    """Writes one row per write request, after the response is known.

    Failures here are swallowed on purpose: an audit trail must never be the
    reason a user's save fails.
    """

    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        try:
            self.record(request, response.status_code, int((time.perf_counter() - started) * 1000))
        except Exception:  # noqa: BLE001 - logging must not break the request
            pass
        return response

    def record(self, request: Request, status_code: int, duration_ms: int) -> None:
        method = request.method.upper()
        path = request.url.path
        if method not in TRACKED_METHODS or path.startswith(SKIP_PATHS):
            return

        user_id = None
        try:
            user_id = request.session.get("user_id")
        except (AssertionError, AttributeError):
            # No session middleware in front of us (e.g. the LAN sync agent).
            user_id = None

        module, action, record_id = describe(path, method)
        db = SessionLocal()
        try:
            user = db.get(User, user_id) if user_id else None
            db.add(
                AuditLog(
                    user_id=user.id if user else None,
                    username=user.username if user else None,
                    full_name=user.full_name if user else None,
                    method=method,
                    path=path[:500],
                    module=module,
                    action=action,
                    record_id=record_id,
                    status_code=status_code,
                    duration_ms=duration_ms,
                    ip_address=(request.client.host if request.client else None),
                )
            )
            db.commit()
        finally:
            db.close()
