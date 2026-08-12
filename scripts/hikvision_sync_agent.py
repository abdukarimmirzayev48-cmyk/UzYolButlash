"""Unattended Hikvision attendance sync agent.

Runs on a machine physically on the same LAN as the turnstiles (the backend
server usually can't reach HIKVISION_HOSTS directly -- see the comment above
HIKVISION_SYNC_AGENT_TOKEN in backend/app/core/config.py). Meant to be run on
a schedule (Windows Task Scheduler, every 15-30 min) via
run_hikvision_sync_agent.bat -- see HIKVISION_AGENT_SETUP.md in this folder
for setup instructions.

Only dependency beyond the standard library: `pip install requests`. Unlike
the other scripts in this folder, it does NOT need the rest of
requirements.txt (no FastAPI/SQLAlchemy/etc. on this machine).

Config comes from a .env file at the project root (same loader as the main
app, backend/app/core/config.py) -- fill in on THIS machine:
  HIKVISION_HOSTS=192.168.100.214,192.168.100.215,192.168.100.216
  HIKVISION_USERNAME=...
  HIKVISION_PASSWORD=...
  SYNC_TARGET_URL=https://uzyolbutlash.uz
  HIKVISION_SYNC_AGENT_TOKEN=...   (same value as the server's .env)
"""

from datetime import datetime, timedelta
from pathlib import Path
import json
import sys

import requests

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.app.core.config import HIKVISION_SYNC_AGENT_TOKEN, SYNC_TARGET_URL
from backend.app.services.hikvision_client import HikvisionClient, HikvisionError, configured_hosts, is_configured

STATE_FILE = Path(__file__).resolve().parent / "hikvision_sync_state.json"
TIMEOUT = 30


def log(message: str) -> None:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {message}")


def load_last_sync() -> datetime:
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text())
            return datetime.fromisoformat(data["last_sync_at"])
        except (ValueError, KeyError, json.JSONDecodeError):
            log(f"Ogohlantirish: {STATE_FILE.name} o'qilmadi, bugungi kun boshidan boshlanadi.")
    return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)


def save_last_sync(moment: datetime) -> None:
    STATE_FILE.write_text(json.dumps({"last_sync_at": moment.isoformat()}))


def iso_with_offset(moment: datetime) -> str:
    # Matches the +05:00 (Tashkent) convention already used by the browser-triggered
    # sync endpoint in backend/app/api/attendance.py -- the device expects this offset.
    return moment.strftime("%Y-%m-%dT%H:%M:%S+05:00")


def main() -> int:
    if not is_configured():
        log("Xatolik: HIKVISION_HOSTS/USERNAME/PASSWORD .env faylida to'liq kiritilmagan.")
        return 1
    if not SYNC_TARGET_URL:
        log("Xatolik: SYNC_TARGET_URL .env faylida kiritilmagan (masalan: https://uzyolbutlash.uz).")
        return 1
    if not HIKVISION_SYNC_AGENT_TOKEN:
        log("Xatolik: HIKVISION_SYNC_AGENT_TOKEN .env faylida kiritilmagan.")
        return 1

    start = load_last_sync()
    end = datetime.now()
    if end <= start:
        log("O'tkazib yuborildi: oxirgi sinxronlashdan beri vaqt o'tmagan.")
        return 0

    device_users: list[dict] = []
    events: list[dict] = []
    device_errors: list[str] = []
    for host in configured_hosts():
        try:
            client = HikvisionClient(host=host)
            device_users.extend(client.list_users())
            events.extend(client.search_events(iso_with_offset(start), iso_with_offset(end)))
            log(f"Qurilma {host}: OK.")
        except HikvisionError as exc:
            device_errors.append(f"{host}: {exc}")
            log(f"Qurilma {host}ga ulanib bo'lmadi: {exc}")

    if not device_users and not events:
        log("Hech qanday qurilmadan ma'lumot olinmadi, bu safar hech narsa yuborilmadi.")
        return 1 if device_errors else 0

    try:
        response = requests.post(
            f"{SYNC_TARGET_URL.rstrip('/')}/api/attendance/hikvision/agent/sync",
            json={"device_users": device_users, "events": events},
            headers={"X-Sync-Token": HIKVISION_SYNC_AGENT_TOKEN},
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        log(f"Serverga ulanib bo'lmadi ({SYNC_TARGET_URL}): {exc}. Keyingi urinishda shu davr qayta yuboriladi.")
        return 1

    if response.status_code != 200:
        log(f"Server xatosi (HTTP {response.status_code}): {response.text[:300]}. Keyingi urinishda shu davr qayta yuboriladi.")
        return 1

    result = response.json()
    save_last_sync(end)
    log(
        "Muvaffaqiyatli yuborildi: "
        f"{result['employees']['created']} ta yangi xodim, "
        f"{result['events']['events_fetched']} ta hodisa, "
        f"{result['events']['days_updated']} ta kun yangilandi."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
