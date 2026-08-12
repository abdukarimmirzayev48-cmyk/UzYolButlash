from __future__ import annotations

from datetime import datetime
from typing import Any, Iterator

import requests
from requests.auth import HTTPDigestAuth

from backend.app.core.config import HIKVISION_HOSTS, HIKVISION_PASSWORD, HIKVISION_USERNAME

PAGE_SIZE = 30
MAX_PAGES = 500
REQUEST_TIMEOUT = 10


class HikvisionError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(HIKVISION_HOSTS and HIKVISION_USERNAME and HIKVISION_PASSWORD)


def configured_hosts() -> list[str]:
    """All Hikvision device hosts configured via HIKVISION_HOSTS/.env."""
    return list(HIKVISION_HOSTS)


class HikvisionClient:
    def __init__(self, host: str | None = None, username: str | None = None, password: str | None = None, timeout: int = REQUEST_TIMEOUT):
        self.host = host or (HIKVISION_HOSTS[0] if HIKVISION_HOSTS else "")
        self.username = username or HIKVISION_USERNAME
        self.password = password or HIKVISION_PASSWORD
        self.timeout = timeout
        if not (self.host and self.username and self.password):
            raise HikvisionError("Hikvision qurilmasi sozlanmagan (.env faylida HIKVISION_* o'zgaruvchilarini kiriting).")
        self.session = requests.Session()
        self.session.auth = HTTPDigestAuth(self.username, self.password)

    def _post(self, path: str, payload: dict) -> dict:
        url = f"http://{self.host}{path}"
        try:
            response = self.session.post(url, json=payload, timeout=self.timeout)
        except requests.RequestException as exc:
            raise HikvisionError(f"Qurilmaga ulanib bo'lmadi ({self.host}): {exc}") from exc
        if response.status_code != 200:
            raise HikvisionError(f"Qurilma xatosi (HTTP {response.status_code}): {response.text[:300]}")
        try:
            return response.json()
        except ValueError as exc:
            raise HikvisionError("Qurilma javobini o'qib bo'lmadi (JSON emas).") from exc

    def ping(self) -> dict:
        """Lightweight connectivity check — fetch a single user record."""
        data = self._post(
            "/ISAPI/AccessControl/UserInfo/Search?format=json",
            {"UserInfoSearchCond": {"searchID": "ping", "searchResultPosition": 0, "maxResults": 1}},
        )
        section = data.get("UserInfoSearch", {})
        return {"totalUsers": section.get("totalMatches", 0)}

    def list_users(self) -> Iterator[dict[str, Any]]:
        position = 0
        for _ in range(MAX_PAGES):
            data = self._post(
                "/ISAPI/AccessControl/UserInfo/Search?format=json",
                {"UserInfoSearchCond": {"searchID": "1", "searchResultPosition": position, "maxResults": PAGE_SIZE}},
            )
            section = data.get("UserInfoSearch", {})
            users = section.get("UserInfo", [])
            for user in users:
                yield user
            if section.get("responseStatusStrg") != "MORE" or not users:
                return
            position += len(users)
        raise HikvisionError("Foydalanuvchilar ro'yxati juda katta, sinxronlash to'xtatildi.")

    def search_events(self, start_time: str, end_time: str) -> Iterator[dict[str, Any]]:
        """Yield raw access-control events with an identified employee.

        Real device output confirmed: only genuine person-recognition events
        (face/fingerprint/card match) carry `employeeNoString`; door-sensor
        noise events (door open/close detection) don't. Filtering on that
        field's presence is more robust than hardcoding a specific `minor`
        event code, which varies by verification method and firmware.
        """
        position = 0
        for _ in range(MAX_PAGES):
            data = self._post(
                "/ISAPI/AccessControl/AcsEvent?format=json",
                {
                    "AcsEventCond": {
                        "searchID": "1",
                        "searchResultPosition": position,
                        "maxResults": PAGE_SIZE,
                        "major": 0,
                        "minor": 0,
                        "startTime": start_time,
                        "endTime": end_time,
                    }
                },
            )
            section = data.get("AcsEvent", {})
            events = section.get("InfoList", [])
            for event in events:
                if event.get("employeeNoString") and event.get("time"):
                    yield event
            if section.get("responseStatusStrg") != "MORE" or not events:
                return
            position += len(events)
        raise HikvisionError("Hodisalar ro'yxati juda katta, sinxronlash to'xtatildi. Sanalar oralig'ini qisqartiring.")


def parse_device_time(value: str) -> datetime:
    """Parse the device's ISO8601 timestamp (with UTC offset) as a naive local datetime."""
    return datetime.fromisoformat(value).replace(tzinfo=None)
