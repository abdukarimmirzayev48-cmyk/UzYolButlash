"""One line naming what is in a multi-line record.

Every list -- the contract's orders, the order's batches, the client's
contracts -- printed `items[0].product_name` in its "Mahsulot" column. Records
routinely carry two or three different grades, so a row holding BND 60/90,
BND 50/70 and BND 40/60 read simply "BND 60/90". Two rows with completely
different contents looked identical, and the only way to find out what was
actually in one was to open it.

Two names fit a table column; beyond that a count says there is more without
pushing the column wide.
"""

LIMIT = 2


def product_summary(names: list[str | None], limit: int = LIMIT) -> str | None:
    """Distinct names in the order they appear, trimmed to `limit` plus a count."""
    seen: list[str] = []
    for name in names:
        text = (name or "").strip()
        if text and text not in seen:
            seen.append(text)
    if not seen:
        return None
    if len(seen) <= limit:
        return ", ".join(seen)
    return f"{', '.join(seen[:limit])} +{len(seen) - limit}"
