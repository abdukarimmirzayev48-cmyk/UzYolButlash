"""Does the chosen supplier match the source the order says the goods come from?

An order whose source was "Rossiyadan to'g'ridan-to'g'ri" was saved with
Jarqo'rg'on Bitum Trade MCHJ as its supplier -- a company registered in
Surxondaryo. Nothing objected, and the delivery batch then took its loading
address from that supplier, so the paperwork said the goods were being loaded
in Surxondaryo for a consignment that was supposed to be crossing the Russian
border. The source type drives customs handling, lead time and price, so a
contradiction between the two is worth saying out loud.

The check is deliberately weak in one direction. A supplier with no address on
file tells us nothing, so it produces no warning: silence about an unknown is
better than accusing someone on missing data. Only a recorded address that
actually contradicts the source is reported.

Nothing here blocks a save. Sourcing arrangements are commercial decisions --
buying Russian bitumen through an Uzbek intermediary is an ordinary thing to do
-- so the answer is a note on the card, not a refusal.
"""

# The fourteen administrative regions, written the way the address fields hold
# them. Matching is on a normalised prefix, so "Surxondaryo viloyati" and
# "Toshkent shahri" both land on the right entry.
UZBEK_REGIONS = (
    "andijon",
    "buxoro",
    "farg'ona",
    "fargona",
    "jizzax",
    "namangan",
    "navoiy",
    "qashqadaryo",
    "qoraqalpog'iston",
    "qoraqalpogiston",
    "samarqand",
    "sirdaryo",
    "surxondaryo",
    "toshkent",
    "xorazm",
    # Manzillar amalda kirillcha ham kiritiladi -- OILTECH SERVICE MCHJ QK
    # ning yuridik manzili «Тошкент» deb yozilgan. Lug'at orqali o'tkazish
    # mumkin emas: bu mijoz ma'lumoti, tarjima qilinmaydi.
    "андижон",
    "бухоро",
    "фарғона",
    "фаргона",
    "жиззах",
    "наманган",
    "навоий",
    "қашқадарё",
    "кашкадарё",
    "қорақалпоғистон",
    "коракалпогистон",
    "самарқанд",
    "самарканд",
    "сирдарё",
    "сурхондарё",
    "тошкент",
    "хоразм",
)

# Where the Jarqo'rg'on source actually is.
JARKURGAN_REGIONS = ("surxondaryo", "сурхондарё")
JARKURGAN_DISTRICTS = ("jarqo'rg'on", "жарқўрғон", "жаркурган")

MSG_RUSSIA_LOCAL_SUPPLIER = "Manba «Rossiyadan to'g'ridan-to'g'ri», ta'minotchi esa O'zbekistonda ro'yxatdan o'tgan"
MSG_LOCAL_FOREIGN_SUPPLIER = "Manba «O'zbekistondan», ta'minotchining O'zbekistonda manzili yo'q"
MSG_JARKURGAN_ELSEWHERE = "Manba «Jarqo'rg'on», ta'minotchi esa boshqa hududda"


def normalise(value: str | None) -> str:
    return (value or "").strip().lower().replace("‘", "'").replace("’", "'")


def region_key(value: str | None) -> str | None:
    """Which of the fourteen regions an address line names, if any."""
    text = normalise(value)
    if not text:
        return None
    for region in UZBEK_REGIONS:
        if text.startswith(region):
            return region
    return None


def check_source(*, source_type: str, addresses: list[dict]) -> list[str]:
    """`addresses` carries one dict per supplier address: {region, district}.

    An empty list means the supplier has no address on file -- see the module
    docstring for why that is not a finding.
    """
    if not addresses:
        return []

    regions = {region_key(address.get("region")) for address in addresses}
    regions.discard(None)
    # Shown back the way it was typed, not as the normalised key -- the value
    # half of a warning is rendered untranslated and lowercasing someone's
    # address looks like a bug of its own.
    written = sorted({(address.get("region") or "").strip() for address in addresses if region_key(address.get("region"))})
    districts = {normalise(address.get("district")) for address in addresses}
    warnings: list[str] = []

    if source_type == "russia_direct" and regions:
        warnings.append(f"{MSG_RUSSIA_LOCAL_SUPPLIER}: {', '.join(written)}")
    elif source_type == "uzbekistan_local" and not regions:
        warnings.append(MSG_LOCAL_FOREIGN_SUPPLIER)
    elif source_type == "jarkurgan":
        # The region alone is enough: a Surxondaryo supplier is at least in the
        # right place, and the district is often left blank.
        if not regions.intersection(JARKURGAN_REGIONS) and not any(
            district.startswith(prefix) for district in districts for prefix in JARKURGAN_DISTRICTS
        ):
            warnings.append(MSG_JARKURGAN_ELSEWHERE)
    return warnings
