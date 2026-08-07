import asyncio
import logging
import random
import string
import threading
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session
from telegram import ReplyKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from backend.app.core.config import TELEGRAM_BOT_TOKEN
from backend.app.core.paths import UPLOADS_DIR
from backend.app.db.session import SessionLocal
from backend.app.models.attendance import Employee
from backend.app.models.delivery import Logistics, LogisticsStatus
from backend.app.models.transport import Transport, TransportCheckIn, TransportCheckInKind
from backend.app.models.user import User
from backend.app.services import notifications

logger = logging.getLogger(__name__)

UPLOAD_DIR = UPLOADS_DIR / "transports"

TERMINAL_LOGISTICS_STATUSES = {LogisticsStatus.delivered, LogisticsStatus.completed, LogisticsStatus.cancelled, LogisticsStatus.issue}

ODOMETER_PHOTO, ODOMETER_VALUE, FUEL_PHOTO, FUEL_VALUE = range(4)

REPORT_BUTTON = "⛽ Hisobot yuborish"
STOP_BUTTON = "🛑 To'xtadim"
RESUME_BUTTON = "▶️ Davom etyapman"
TRIP_BUTTON = "ℹ️ Joriy safar"

REPLY_KEYBOARD = ReplyKeyboardMarkup(
    [[REPORT_BUTTON], [STOP_BUTTON, RESUME_BUTTON], [TRIP_BUTTON]],
    resize_keyboard=True,
)

_application: Application | None = None
_loop: asyncio.AbstractEventLoop | None = None
_thread: threading.Thread | None = None


# ---- shared DB helpers (each bot handler opens its own short-lived session) ----

def _get_employee_by_chat(db: Session, chat_id: str) -> Employee | None:
    return db.scalars(select(Employee).where(Employee.telegram_chat_id == chat_id)).first()


def _get_transport_for_employee(db: Session, employee: Employee) -> Transport | None:
    return db.scalars(select(Transport).where(Transport.driver_employee_id == employee.id)).first()


def _get_active_logistics_for_transport(db: Session, transport: Transport) -> Logistics | None:
    return db.scalars(
        select(Logistics)
        .where(Logistics.vehicle_number == transport.vehicle_number, Logistics.status.notin_(TERMINAL_LOGISTICS_STATUSES))
        .order_by(Logistics.created_at.desc())
    ).first()


def _dispatcher_user_ids(db: Session) -> list[int]:
    users = db.query(User).filter(User.is_active.is_(True)).all()
    return [u.id for u in users if u.is_admin or "yetkazib_berish" in (u.edit_modules or [])]


def _notify_dispatchers(db: Session, title: str, body: str, link_path: str) -> None:
    for user_id in _dispatcher_user_ids(db):
        notifications.notify(db, user_id=user_id, title=title, body=body, kind="transport", link_path=link_path)


def _parse_decimal(raw: str) -> Decimal | None:
    try:
        return Decimal(raw.strip().replace(",", "."))
    except (InvalidOperation, AttributeError):
        return None


def generate_pairing_code(db: Session, employee: Employee) -> tuple[str, datetime]:
    code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    expires_at = datetime.now() + timedelta(minutes=15)
    employee.telegram_pairing_code = code
    employee.telegram_pairing_code_expires_at = expires_at
    db.commit()
    return code, expires_at


# ---- bot handlers ----

async def _download_photo(update: Update, context: ContextTypes.DEFAULT_TYPE, prefix: str) -> str:
    photo = update.message.photo[-1]
    file = await context.bot.get_file(photo.file_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{prefix}_{uuid4().hex}.jpg"
    destination = UPLOAD_DIR / stored_name
    await file.download_to_drive(custom_path=str(destination))
    return f"/static/uploads/transports/{stored_name}"


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        existing = _get_employee_by_chat(db, chat_id)
        if existing:
            await update.message.reply_text(f"Siz allaqachon ulangansiz: {existing.full_name}.", reply_markup=REPLY_KEYBOARD)
            return
        if not context.args:
            await update.message.reply_text("Ulanish uchun administratordan havola so'rang.")
            return
        code = context.args[0].strip()
        employee = db.scalars(select(Employee).where(Employee.telegram_pairing_code == code)).first()
        if not employee or not employee.telegram_pairing_code_expires_at or employee.telegram_pairing_code_expires_at < datetime.now():
            await update.message.reply_text("Kod noto'g'ri yoki muddati o'tgan. Administratordan yangi havola so'rang.")
            return
        employee.telegram_chat_id = chat_id
        employee.telegram_pairing_code = None
        employee.telegram_pairing_code_expires_at = None
        db.commit()
        await update.message.reply_text(f"Muvaffaqiyatli ulandingiz, {employee.full_name}! Endi quyidagi tugmalardan foydalanishingiz mumkin.", reply_markup=REPLY_KEYBOARD)
    finally:
        db.close()


async def report_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    db = SessionLocal()
    try:
        employee = _get_employee_by_chat(db, str(update.effective_chat.id))
        if not employee:
            await update.message.reply_text("Siz hali botga ulanmagansiz. Administratordan ulanish havolasini so'rang.")
            return ConversationHandler.END
        transport = _get_transport_for_employee(db, employee)
        if not transport:
            await update.message.reply_text("Sizga biriktirilgan transport topilmadi.")
            return ConversationHandler.END
        context.user_data["transport_id"] = transport.id
        context.user_data["employee_id"] = employee.id
    finally:
        db.close()
    await update.message.reply_text("Spidometr rasmini yuboring. Bekor qilish uchun /cancel yozing.")
    return ODOMETER_PHOTO


async def report_odometer_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.message.photo:
        await update.message.reply_text("Iltimos, rasm yuboring.")
        return ODOMETER_PHOTO
    context.user_data["odometer_photo_url"] = await _download_photo(update, context, "odometer")
    await update.message.reply_text("Spidometr ko'rsatkichini kiriting (km):")
    return ODOMETER_VALUE


async def report_odometer_value(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    value = _parse_decimal(update.message.text or "")
    if value is None:
        await update.message.reply_text("Iltimos, faqat raqam kiriting (masalan: 123456).")
        return ODOMETER_VALUE
    context.user_data["odometer_km"] = value
    await update.message.reply_text("Endi yoqilg'i ko'rsatkichi rasmini yuboring.")
    return FUEL_PHOTO


async def report_fuel_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.message.photo:
        await update.message.reply_text("Iltimos, rasm yuboring.")
        return FUEL_PHOTO
    context.user_data["fuel_photo_url"] = await _download_photo(update, context, "fuel")
    await update.message.reply_text("Necha litr yoqilg'i bor?")
    return FUEL_VALUE


async def report_fuel_value(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    value = _parse_decimal(update.message.text or "")
    if value is None:
        await update.message.reply_text("Iltimos, faqat raqam kiriting (masalan: 85.5).")
        return FUEL_VALUE

    db = SessionLocal()
    try:
        transport = db.get(Transport, context.user_data["transport_id"])
        employee = db.get(Employee, context.user_data["employee_id"])
        active_logistics = _get_active_logistics_for_transport(db, transport)
        checkin = TransportCheckIn(
            transport_id=transport.id,
            employee_id=employee.id,
            logistics_id=active_logistics.id if active_logistics else None,
            kind=TransportCheckInKind.report,
            odometer_km=context.user_data["odometer_km"],
            odometer_photo_url=context.user_data["odometer_photo_url"],
            fuel_liters=value,
            fuel_photo_url=context.user_data["fuel_photo_url"],
        )
        db.add(checkin)
        db.commit()
        _notify_dispatchers(
            db,
            f"Yoqilg'i/spidometr hisoboti: {transport.vehicle_number}",
            f"{employee.full_name}: {context.user_data['odometer_km']} km, {value} L",
            f"/transports/{transport.id}/fuel",
        )
    finally:
        db.close()

    context.user_data.clear()
    await update.message.reply_text("Rahmat! Hisobot qabul qilindi.", reply_markup=REPLY_KEYBOARD)
    return ConversationHandler.END


async def report_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text("Bekor qilindi.", reply_markup=REPLY_KEYBOARD)
    return ConversationHandler.END


async def _record_status_event(update: Update, kind: TransportCheckInKind, confirm_text: str) -> None:
    db = SessionLocal()
    try:
        employee = _get_employee_by_chat(db, str(update.effective_chat.id))
        if not employee:
            await update.message.reply_text("Siz hali botga ulanmagansiz.")
            return
        transport = _get_transport_for_employee(db, employee)
        if not transport:
            await update.message.reply_text("Sizga biriktirilgan transport topilmadi.")
            return
        active_logistics = _get_active_logistics_for_transport(db, transport)
        db.add(TransportCheckIn(
            transport_id=transport.id,
            employee_id=employee.id,
            logistics_id=active_logistics.id if active_logistics else None,
            kind=kind,
        ))
        db.commit()
        label = "to'xtadi" if kind == TransportCheckInKind.stopped else "davom etmoqda"
        _notify_dispatchers(db, f"Transport {label}: {transport.vehicle_number}", f"Haydovchi: {employee.full_name}", f"/transports/{transport.id}/fuel")
    finally:
        db.close()
    await update.message.reply_text(confirm_text, reply_markup=REPLY_KEYBOARD)


async def handle_stopped(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _record_status_event(update, TransportCheckInKind.stopped, "🛑 To'xtash qayd etildi. Bosh ofisga xabar berildi.")


async def handle_resumed(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _record_status_event(update, TransportCheckInKind.resumed, "▶️ Davom etish qayd etildi.")


async def handle_current_trip(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db = SessionLocal()
    try:
        employee = _get_employee_by_chat(db, str(update.effective_chat.id))
        if not employee:
            await update.message.reply_text("Siz hali botga ulanmagansiz.")
            return
        transport = _get_transport_for_employee(db, employee)
        if not transport:
            await update.message.reply_text("Sizga biriktirilgan transport topilmadi.")
            return
        active = _get_active_logistics_for_transport(db, transport)
        if not active:
            await update.message.reply_text("Hozircha faol safar yo'q.")
            return
        text = (
            f"🚚 {transport.vehicle_number}\n"
            f"Qayerdan: {active.loading_address or '—'}\n"
            f"Qayerga: {active.delivery_address or '—'}\n"
            f"Reja yuklash: {active.planned_pickup_date or '—'}\n"
            f"Reja yetkazish: {active.planned_delivery_date or '—'}"
        )
        await update.message.reply_text(text)
    finally:
        db.close()


def _build_application() -> Application:
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", handle_start))
    application.add_handler(ConversationHandler(
        entry_points=[MessageHandler(filters.Regex(f"^{REPORT_BUTTON}$"), report_start)],
        states={
            ODOMETER_PHOTO: [MessageHandler(filters.PHOTO, report_odometer_photo)],
            ODOMETER_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, report_odometer_value)],
            FUEL_PHOTO: [MessageHandler(filters.PHOTO, report_fuel_photo)],
            FUEL_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, report_fuel_value)],
        },
        fallbacks=[CommandHandler("cancel", report_cancel)],
    ))
    application.add_handler(MessageHandler(filters.Regex(f"^{STOP_BUTTON}$"), handle_stopped))
    application.add_handler(MessageHandler(filters.Regex(f"^{RESUME_BUTTON}$"), handle_resumed))
    application.add_handler(MessageHandler(filters.Regex(f"^{TRIP_BUTTON}$"), handle_current_trip))
    return application


# ---- lifecycle (runs in a dedicated background thread, mirroring the existing BackgroundScheduler pattern) ----

def start_bot() -> None:
    global _application, _loop, _thread
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN is not set -- Telegram driver bot will not start.")
        return

    def _run() -> None:
        global _application, _loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        _loop = loop
        application = _build_application()
        _application = application
        loop.run_until_complete(application.initialize())
        loop.run_until_complete(application.start())
        loop.run_until_complete(application.updater.start_polling(drop_pending_updates=True))
        loop.run_forever()

    _thread = threading.Thread(target=_run, daemon=True, name="telegram-bot")
    _thread.start()


def stop_bot() -> None:
    if not _application or not _loop:
        return

    async def _shutdown() -> None:
        await _application.updater.stop()
        await _application.stop()
        await _application.shutdown()

    future = asyncio.run_coroutine_threadsafe(_shutdown(), _loop)
    try:
        future.result(timeout=10)
    except Exception:
        logger.exception("Error stopping Telegram bot")
    _loop.call_soon_threadsafe(_loop.stop)


def send_message(chat_id: str, text: str) -> None:
    if not _application or not _loop:
        return
    future = asyncio.run_coroutine_threadsafe(_application.bot.send_message(chat_id=chat_id, text=text), _loop)
    future.add_done_callback(lambda f: f.exception() and logger.warning("Failed to send Telegram message: %s", f.exception()))


# ---- outbound triggers, called from FastAPI request handlers ----

def notify_driver_of_trip(db: Session, logistics: Logistics) -> None:
    if not TELEGRAM_BOT_TOKEN or not logistics.vehicle_number:
        return
    transport = db.scalars(select(Transport).where(Transport.vehicle_number == logistics.vehicle_number)).first()
    if not transport or not transport.driver_employee_id:
        return
    employee = db.get(Employee, transport.driver_employee_id)
    if not employee or not employee.telegram_chat_id:
        return
    text = (
        f"🚚 Sizga yangi safar biriktirildi: {transport.vehicle_number}\n"
        f"Qayerdan: {logistics.loading_address or '—'}\n"
        f"Qayerga: {logistics.delivery_address or '—'}\n"
        f"Reja yuklash: {logistics.planned_pickup_date or '—'}\n"
        f"Reja yetkazish: {logistics.planned_delivery_date or '—'}"
    )
    send_message(employee.telegram_chat_id, text)


def request_checkin(db: Session, transport: Transport) -> bool:
    if not transport.driver_employee_id:
        return False
    employee = db.get(Employee, transport.driver_employee_id)
    if not employee or not employee.telegram_chat_id:
        return False
    send_message(
        employee.telegram_chat_id,
        f"📋 Bosh ofis sizdan hisobot so'ramoqda: iltimos spidometr va yoqilg'i ko'rsatkichlarini \"{REPORT_BUTTON}\" tugmasi orqali yuboring.",
    )
    return True
