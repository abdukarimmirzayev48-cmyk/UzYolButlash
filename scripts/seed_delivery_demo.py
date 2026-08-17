"""Seed a believable slice of business: contract -> order -> batches -> delivery.

Everything goes through the real HTTP API rather than straight into the tables,
so every record passes the same validation and status rules a dispatcher's
clicks would. That is the point: the result is not just rows that look right,
it is a state the application can actually reach.

Every record it writes carries created_by = DEMO_TAG, which is also how
--purge finds them again. Nothing else is touched.

    python3 scripts/seed_delivery_demo.py --url http://127.0.0.1:8000 --user admin --password ...
    python3 scripts/seed_delivery_demo.py --url ... --user ... --password ... --purge
"""

import argparse
import json
import random
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from http.cookiejar import CookieJar

DEMO_TAG = "namuna-demo"

PRODUCTS = [
    ("BND 60/90", "t", 4_150_000),
    ("BND 70/100", "t", 4_050_000),
    ("BND 50/70", "t", 4_250_000),
    ("MGO 130/200", "t", 3_900_000),
]
SUPPLIERS = [
    "Jarqo'rg'on Bitum Trade MCHJ",
    "Farg'ona Refinery Supply MCHJ",
    "Buxoro Petroleum Base MCHJ",
    "Import Bitumen Service MCHJ",
]
CARRIERS = ["Samarqand Logistic Carrier MCHJ", "UzTransLogistics MCHJ", "Yo'lchi Servis MCHJ"]
DRIVERS = [
    ("Karimov Aziz Baxtiyorovich", "+998 90 123 45 67"),
    ("Rahimov Shuhrat Anvarovich", "+998 91 234 56 78"),
    ("To'xtayev Bekzod Ilhomovich", "+998 93 345 67 89"),
    ("Ergashev Sardor Nodirovich", "+998 94 456 78 90"),
]
PLATES = ["01 A 247 BA", "10 B 884 CA", "30 D 512 FA", "40 H 901 HA", "80 K 118 KA", "01 C 733 MA"]
ROUTES = [
    ("Jarqo'rg'on — Toshkent", 640),
    ("Farg'ona — Namangan", 95),
    ("Buxoro — Navoiy", 105),
    ("Toshkent — Samarqand", 310),
    ("Qarshi — Termiz", 380),
    ("Toshkent — Andijon", 340),
]
LOADING_ADDRESSES = [
    "Surxondaryo vil., Jarqo'rg'on tumani, bitum bazasi",
    "Farg'ona sh., NPZ hududi, 4-darvoza",
    "Buxoro vil., Kogon tumani, neft bazasi",
]


class Api:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def call(self, method: str, path: str, payload=None):
        body = None if payload is None else json.dumps(payload, default=str).encode()
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        request = urllib.request.Request(self.base + path, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=60) as response:
                raw = response.read()
                return json.loads(raw.decode()) if raw else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:300]
            raise SystemExit(f"{method} {path} -> {error.code}\n{detail}") from None

    def login(self, username: str, password: str):
        self.call("POST", "/api/auth/login", {"username": username, "password": password})


def money(value) -> str:
    return f"{int(value):,}".replace(",", " ")


def build_contract(api: Api, client: dict, index: int, today: date) -> dict:
    signed = today - timedelta(days=random.randint(150, 330))
    items = []
    for name, unit, price in random.sample(PRODUCTS, random.randint(1, 2)):
        items.append({
            "product_name": name,
            "unit": unit,
            "quantity": random.choice([300, 500, 750, 1000]),
            "unit_price": price,
            "vat_rate": 12,
        })
    payload = {
        "client_id": client["id"],
        "contract_number": f"SH-{signed:%Y}/{100 + index}",
        "contract_date": signed,
        "valid_until": date(signed.year + 1, 12, 31),
        "title": "Neft bitumi yetkazib berish shartnomasi",
        "status": "active",
        "currency": "UZS",
        "created_by": DEMO_TAG,
        "customer_name": client["name"],
        "place": "Toshkent sh.",
        "items": items,
        "initial_note": {"note": "Shartnoma imzolandi, spetsifikatsiya kelishildi.", "created_by": DEMO_TAG},
    }
    return api.call("POST", "/api/contracts", payload)


def build_order(api: Api, contract: dict, index: int, today: date) -> dict:
    ordered = today - timedelta(days=random.randint(120, 200))
    items = [
        {"contract_item_id": item["id"], "quantity": min(float(item["quantity"]), random.choice([120, 180, 240]))}
        for item in contract["items"]
    ]
    payload = {
        "contract_id": contract["id"],
        "order_number": f"BY-{ordered:%Y%m}-{200 + index}",
        "order_date": ordered,
        "required_date": ordered + timedelta(days=45),
        "status": "supplier_confirmed",
        "fulfillment_type": random.choice(["direct_supplier_to_customer", "company_managed_delivery"]),
        "source_type": random.choice(["jarkurgan", "uzbekistan_local", "russia_direct"]),
        "supplier_name": random.choice(SUPPLIERS),
        "supplier_status": "confirmed",
        "currency": "UZS",
        "logistics_price": random.choice([6_000_000, 8_000_000, 11_000_000]),
        "created_by": DEMO_TAG,
        "items": items,
        "initial_note": {"note": "Ta'minotchi tasdiqladi, partiyalarga bo'linadi.", "created_by": DEMO_TAG},
    }
    return api.call("POST", "/api/orders", payload)


def build_batch(api: Api, order: dict, number: int, batch_date: date, assign_transport: bool) -> dict:
    route, distance = random.choice(ROUTES)
    driver, phone = random.choice(DRIVERS)
    planned_delivery = batch_date + timedelta(days=random.randint(4, 12))
    cost = random.choice([5_500_000, 7_200_000, 9_400_000, 11_800_000])
    items = [
        {"order_item_id": item["id"], "planned_quantity": random.choice([22, 24, 26, 28])}
        for item in order["items"]
    ]
    logistics = {
        "status": "vehicle_assigned" if assign_transport else "not_assigned",
        "carrier_name": random.choice(CARRIERS) if assign_transport else None,
        "driver_name": driver if assign_transport else None,
        "driver_phone": phone if assign_transport else None,
        "vehicle_number": random.choice(PLATES) if assign_transport else None,
        "loading_address": random.choice(LOADING_ADDRESSES),
        "delivery_address": "Buyurtmachi ob'ekti, qabul qilish punkti",
        "planned_pickup_date": batch_date + timedelta(days=1),
        "planned_delivery_date": planned_delivery,
        "cost_amount": cost,
        "customer_price": cost + random.choice([1_500_000, 2_400_000, 3_100_000]),
        "paid_by": "customer",
        "route_name": route,
        "distance_km": distance,
        "created_by": DEMO_TAG,
    }
    payload = {
        "order_id": order["id"],
        "batch_number": f"PB-{batch_date:%Y%m}-{number:03d}",
        "batch_date": batch_date,
        "planned_loading_date": batch_date + timedelta(days=1),
        "planned_delivery_date": planned_delivery,
        "supplier_name": order.get("supplier_name"),
        "created_by": DEMO_TAG,
        "items": items,
        "logistics": logistics,
        "initial_note": {"note": "Partiya rejalashtirildi.", "created_by": DEMO_TAG},
    }
    return api.call("POST", "/api/delivery-batches", payload)


def add_documents(api: Api, batch_id: int, kinds: list[str]) -> None:
    titles = {
        "ttn": "TTN yuk xati",
        "acceptance_act": "Qabul dalolatnomasi",
        "quality_certificate": "Sifat sertifikati",
    }
    for kind in kinds:
        api.call("POST", f"/api/delivery-batches/{batch_id}/documents", {
            "document_type": kind,
            "title": titles.get(kind, kind),
            "uploaded_by": DEMO_TAG,
        })


def advance(api: Api, batch: dict, stage: str, today: date) -> str:
    """Walk one batch as far along the real workflow as its target stage."""
    batch_id = batch["id"]
    loading_date = date.fromisoformat(str(batch["planned_loading_date"]))
    planned_delivery = date.fromisoformat(str(batch["planned_delivery_date"]))
    loaded_total = sum(float(item["planned_quantity"]) for item in batch["items"])

    if stage == "planned":
        return "planned"

    if stage == "ready":
        api.call("PATCH", f"/api/delivery-batches/{batch_id}", {"status": "ready_for_loading"})
        return "ready_for_loading"

    api.call("POST", f"/api/delivery-batches/{batch_id}/confirm-loading", {
        "actual_loading_date": loading_date,
        "loaded_quantity": loaded_total,
        "notes": "Yuklash yakunlandi, yo'lga chiqdi.",
    })
    if stage == "loaded":
        return "loaded"

    if stage == "in_transit":
        api.call("PATCH", f"/api/logistics/{batch['logistics']['id']}", {"status": "in_transit"})
        api.call("PATCH", f"/api/delivery-batches/{batch_id}", {"status": "in_transit"})
        return "in_transit"

    delivery_date = min(planned_delivery + timedelta(days=random.randint(-1, 2)), today)
    if delivery_date < loading_date:
        delivery_date = loading_date + timedelta(days=1)
    api.call("POST", f"/api/delivery-batches/{batch_id}/confirm-delivery", {
        "actual_delivery_date": delivery_date,
        "notes": "Yuk manzilga yetkazildi.",
    })
    if stage == "arrived":
        return "arrived"

    # Acceptance: the customer signs for what actually arrived.
    shortfall = 0.5 if stage == "difference" else 0
    detail = api.call("GET", f"/api/delivery-batches/{batch_id}")
    for index, item in enumerate(detail["items"]):
        accepted = float(item["loaded_quantity"] or 0) - (shortfall if index == 0 else 0)
        api.call("PATCH", f"/api/delivery-batches/{batch_id}/items/{item['id']}", {
            "accepted_quantity": max(accepted, 0),
        })

    if stage == "issue":
        api.call("PATCH", f"/api/delivery-batches/{batch_id}", {
            "status": "issue",
            "notes": "Qabul qilishda nomuvofiqlik aniqlandi, tekshirilmoqda.",
        })
        return "issue"

    add_documents(api, batch_id, ["ttn", "acceptance_act", "quality_certificate"])
    api.call("POST", f"/api/delivery-batches/{batch_id}/complete", {
        "completed_date": delivery_date,
        "notes": "Hujjatlar to'liq, partiya yopildi.",
        "allow_quantity_difference": stage == "difference",
    })
    return "completed"


# How many batches land in each stage. Weighted so the board looks like a real
# month: most work finished, a few moving, a couple needing attention.
STAGE_PLAN = [
    ("completed", 9),
    ("difference", 1),
    ("arrived", 2),
    ("in_transit", 3),
    ("loaded", 2),
    ("ready", 2),
    ("planned", 3),
    ("issue", 1),
]


def seed(api: Api, today: date) -> None:
    clients = api.call("GET", "/api/clients?page_size=60")["items"]
    clients = [c for c in clients if c.get("name")]
    if len(clients) < 6:
        raise SystemExit("Kamida 6 ta mijoz kerak.")
    chosen = random.sample(clients, 6)

    stages = [stage for stage, count in STAGE_PLAN for _ in range(count)]
    random.shuffle(stages)

    contracts = []
    for index, client in enumerate(chosen, start=1):
        contract = build_contract(api, client, index, today)
        order = build_order(api, contract, index, today)
        contracts.append((contract, order))
        print(f"  shartnoma {contract['contract_number']:16s} -> buyurtma {order['order_number']}  ({client['name'][:34]})")

    print()
    counts: dict[str, int] = {}
    for number, stage in enumerate(stages, start=1):
        contract, order = contracts[(number - 1) % len(contracts)]
        # Spread batches back over six months so the trend chart has a shape.
        batch_date = today - timedelta(days=random.randint(5, 170))
        needs_transport = stage != "planned"
        batch = build_batch(api, order, number, batch_date, needs_transport)
        final = advance(api, batch, stage, today)
        counts[final] = counts.get(final, 0) + 1
        print(f"  {batch['batch_number']:18s} {final}")

    print("\nHolatlar bo'yicha:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))


def purge(api: Api) -> None:
    """Delete only what this script created, newest layer first.

    The list endpoints don't return created_by, so each candidate is opened
    before it is deleted -- matching on the number prefix could catch a real
    record that happens to look similar, and that is not a risk worth taking.
    """
    removed = {"batches": 0, "orders": 0, "contracts": 0}
    for kind, path, key in [
        ("batches", "/api/delivery-batches", "delivery-batches"),
        ("orders", "/api/orders", "orders"),
        ("contracts", "/api/contracts", "contracts"),
    ]:
        page = 1
        ids = []
        while True:
            data = api.call("GET", f"{path}?page={page}&page_size=100")
            for row in data["items"]:
                detail = api.call("GET", f"{path}/{row['id']}")
                if detail.get("created_by") == DEMO_TAG:
                    ids.append(row["id"])
            if page * 100 >= data["total"]:
                break
            page += 1
        for record_id in ids:
            api.call("DELETE", f"{path}/{record_id}")
            removed[kind] += 1
    print("O'chirildi:", removed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--purge", action="store_true", help="faqat namuna yozuvlarini o'chiradi")
    parser.add_argument("--seed", type=int, default=42, help="takrorlanadigan natija uchun")
    args = parser.parse_args()

    random.seed(args.seed)
    api = Api(args.url)
    api.login(args.user, args.password)

    if args.purge:
        purge(api)
        return

    print(f"Namuna ma'lumotlari yaratilmoqda: {args.url}\n")
    seed(api, date.today())
    print("\nTayyor. Hammasini o'chirish uchun: --purge")


if __name__ == "__main__":
    sys.exit(main())
