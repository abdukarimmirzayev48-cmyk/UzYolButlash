"""SMN monitoring proxysi bilan ishlash.

SMN'ning o'zi bilan bevosita gaplashmaymiz: login, sessiya va uning ichki
endpointlari `smn-api` proxysida yopilgan. ERP faqat toza JSON oladi va
parolni bilmaydi.

Har bir chaqiruv «javob yoki sabab» qaytaradi, hech qachon istisno otmaydi:
monitoring tashqi tizim va u o'chib turgani uchun buyurtma kartochkasi
yiqilmasligi kerak.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

import requests

from backend.app.core.config import SMN_API_KEY, SMN_API_URL

REQUEST_TIMEOUT = 12
# Marshrut so'rovi og'ir: bitta mashinaning bir kuni 4-5 ming nuqta.
TRACK_TIMEOUT = 60

# Hisobotni SMN har safar qaytadan quradi -- bir haftalik kesim ham
# o'nlab soniya olishi mumkin, park bo'yicha esa undan ko'p.
REPORT_TIMEOUT = 240

# Saytdagi shartnoma raqami. Bu hisobot formasidagi yashirin maydon:
# usiz SMN hisobot o'rniga hisobot turlari ro'yxatini qaytaradi va
# xato ham bermaydi -- javob 200 bo'ladi.
REPORT_CONTRACT_ID = 23

MSG_NOT_CONFIGURED = "SMN monitoringi ulanmagan"
MSG_UNREACHABLE = "SMN monitoringiga ulanib bo'lmadi"
MSG_NOT_LINKED = "Bu mashina SMN monitoringiga biriktirilmagan"


@dataclass
class SmnResult:
    """Javob yoki sabab -- ikkalasi bir vaqtda hech qachon bo'lmaydi."""

    data: Any = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


def is_configured() -> bool:
    return bool(SMN_API_URL)


def _report_moment(value: date, end_of_day: bool) -> str:
    """SMN hisobot formasi kutadigan sana: `dd.MM.yyyy HH:mm`.

    Maydonda `maxlength=16` turadi, ya'ni soniya joylashmaydi -- uzunroq
    qiymat jimgina kesiladi.
    """
    return f"{value.strftime('%d.%m.%Y')} {'23:59' if end_of_day else '00:00'}"


def reports(include_all: bool = False) -> SmnResult:
    """Hisobotlar katalogi. Sukut bo'yicha faqat bizga mos turlar."""
    return _get("/api/reports", {"all": "true"} if include_all else None)


def report(report_id: int, start: date, end: date, object_id: int | None = None) -> SmnResult:
    """Bitta hisobotni ishga tushiradi va o'qilgan jadvalni qaytaradi.

    Parametrlar to'plami saytning o'z formasidan olingan. `reportId` va
    `id` ikkalasi ham yuboriladi -- sayt shunday qiladi.
    """
    params: dict[str, Any] = {
        "reportId": report_id,
        "value-contract-id": REPORT_CONTRACT_ID,
        "contracts-ids": "",
        "reportSelect2": 1,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "datestart": _report_moment(start, False),
        "dateend": _report_moment(end, True),
    }
    if object_id:
        params["param-objectid"] = object_id
    return _get(f"/api/reports/{report_id}", params, timeout=REPORT_TIMEOUT)


def _get(path: str, params: dict | None = None, timeout: int = REQUEST_TIMEOUT) -> SmnResult:
    if not is_configured():
        return SmnResult(error=MSG_NOT_CONFIGURED)
    headers = {"x-api-key": SMN_API_KEY} if SMN_API_KEY else {}
    try:
        response = requests.get(
            f"{SMN_API_URL}{path}", params=params or {}, headers=headers, timeout=timeout
        )
    except requests.RequestException:
        return SmnResult(error=MSG_UNREACHABLE)
    if response.status_code == 404:
        return SmnResult(error="SMN'da bunday mashina topilmadi")
    if response.status_code >= 400:
        # Proxy sababni o'zi yozadi (captcha, login, sessiya) -- shuni ko'rsatamiz.
        detail = ""
        try:
            detail = str(response.json().get("error") or "")
        except ValueError:
            detail = ""
        return SmnResult(error=detail or f"{MSG_UNREACHABLE} ({response.status_code})")
    try:
        return SmnResult(data=response.json())
    except ValueError:
        return SmnResult(error=MSG_UNREACHABLE)


def vehicles() -> SmnResult:
    """Barcha mashinalar -- biriktirish ro'yxati uchun."""
    result = _get("/api/vehicles")
    if not result.ok:
        return result
    return SmnResult(data=result.data.get("vehicles", []))


def vehicle(object_id: int | str) -> SmnResult:
    """Bitta mashinaning jonli holati."""
    if not object_id:
        return SmnResult(error=MSG_NOT_LINKED)
    return _get(f"/api/vehicles/{object_id}")


def track(object_id: int | str, start: date | str, end: date | str) -> SmnResult:
    """Marshrut: masofa va nuqtalar.

    Nuqtalar massivi katta bo'lgani uchun chaqiruvchi odatda faqat
    `distanceKm` ni oladi.
    """
    if not object_id:
        return SmnResult(error=MSG_NOT_LINKED)
    return _get(
        f"/api/vehicles/{object_id}/track",
        {"from": str(start), "to": str(end)},
        timeout=TRACK_TIMEOUT,
    )
