"""Generate frontend/src/config/cyrillic.js — the Latin→Cyrillic UI dictionary.

Latin is the source of truth everywhere in this project. This script scrapes
every user-facing string out of the frontend (and the Uzbek messages the
backend sends to toasts), transliterates them, and writes a flat lookup the
browser applies at render time.

Re-run it whenever UI text is added:

    .venv/bin/python scripts/generate_cyrillic_dict.py

Being regenerable is the whole point: the old hand-written English→Latin
dictionary rotted (302 of its 502 entries are dead). Corrections belong in
OVERRIDES in scripts/uz_translit.py so they survive regeneration.
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from uz_translit import _PAIRS, PROTECTED, WORD_FIXES, translate  # noqa: E402

_PAIRS_FOR_JS = [[a, b] for a, b in _PAIRS]

# Mirrors uz_translit.transliterate() so interpolated backend messages (which no
# dictionary can match) can still be translated in the browser. Emitted here so
# the letter table can never drift from the Python one.
JS_TRANSLITERATOR = """
const uzCyrillicPairs = __PAIRS__;
const uzCyrillicProtected = __PROTECTED__;
// Oddiy o'girish xato qiladigan alohida so'zlar. Python tomonidagi
// scripts/uz_translit.py WORD_FIXES bilan bir xil bo'lishi shart.
const uzCyrillicWordFixes = __WORD_FIXES__;
const _uzWordFixRe = new RegExp(Object.keys(uzCyrillicWordFixes).join("|"), "g");

const _uzKeepRe = new RegExp(
  [
    "[\\\\w.+-]+@[\\\\w-]+\\\\.[\\\\w.]+",
    "https?://\\\\S+",
    "\\\\{\\\\w+\\\\}",
    "\\\\b\\\\w+(?:_\\\\w+)+\\\\b",
    "\\\\b\\\\w+\\\\.(?:env|md|py|js|json|csv|pdf)\\\\b",
    "\\\\b\\\\d[\\\\w.,/:-]*",
    "\\\\b(?:" + uzCyrillicProtected.map((p) => p.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")).join("|") + ")\\\\b",
  ].join("|"),
  "g"
);

function _uzTranslitWord(word) {
  // Word-initial "e" is "э"; done before the digraph pass so the e inside
  // ye/yo is never caught (in "Yetkazib" the boundary sits before the Y).
  let out = word.replace(/\\be/g, "\\u0001").replace(/\\bE/g, "\\u0002");
  for (const [latin, cyr] of uzCyrillicPairs) out = out.split(latin).join(cyr);
  return out.replace(/\\u0001/g, "э").replace(/\\u0002/g, "Э").replace(/['’]/g, "ъ");
}

function transliterateToCyrillic(text) {
  if (!text) return text;
  let out = "";
  let cursor = 0;
  _uzKeepRe.lastIndex = 0;
  let m;
  while ((m = _uzKeepRe.exec(text)) !== null) {
    out += _uzTranslitWord(text.slice(cursor, m.index)) + m[0];
    cursor = m.index + m[0].length;
  }
  out += _uzTranslitWord(text.slice(cursor));
  return out.replace(_uzWordFixRe, (found) => uzCyrillicWordFixes[found]);
}
"""

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "src" / "config" / "cyrillic.js"

# Quoted literals, plus text sitting between tags inside template literals.
_STR_RE = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`", re.S)
_TAG_TEXT_RE = re.compile(r">([^<>{}$]+)<")
_PY_DETAIL_RE = re.compile(r'detail\s*=\s*(?:f?)"((?:[^"\\]|\\.)*)"')
_PY_STR_RE = re.compile(r'(?:f?)"((?:[^"\\\n]|\\.)*)"')

# Things that are code, not prose.
_REJECT = re.compile(
    r"^\s*$"
    r"|^[\d\s.,:%+-]*$"                      # numbers / punctuation only
    r"|^[a-z0-9_]+$"                          # identifier / enum key
    r"|^[a-z-]+(?:\s+[a-z-]+)*$"              # css class lists (all lowercase)
    r"|^[./#?]"                               # paths, selectors
    r"|^https?:|^data:|^mailto:"
    r"|^[A-Za-z-]+/[A-Za-z-]+$"               # mime types
    r"|^#[0-9a-fA-F]{3,8}$"                   # hex colour
    r"|^\W+$"
    r"|[A-Za-z_]\w*\("                        # any call: numberValue(, Number(row.month)
    r"|^(?:GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)$"  # HTTP verbs from api() calls
    r"|&&|\|\||=>"                            # expression fragments: a && b.c
    r"|^[a-z][a-z0-9_]*_\{n\}$"                 # generated field name: quantity_{n}
    r"|^\w+(?:\.\w+){2,}$"                     # dotted path (F.I.Sh. survives: trailing dot)
    r"|^[a-z]+[A-Z]\w*$"                       # camelCase identifier
    r"|^[A-Z][a-z]+(?:[A-Z][a-z]*)+$"          # PascalCase: TaskComment (2-letter codes like NB survive)
    r"|^[A-Z][A-Z0-9]*_[A-Z0-9_]*$"            # CONST_NAME (needs an underscore, so NB survives)
    r"|^[A-Za-z]+-[A-Z]"                       # header-ish: Content-Type
    r'|"'                                      # embedded double quote -> code fragment
)                                              # NB: single quotes are Uzbek (o', ta'til), never rejected
_CODEY = set("[]{}=;`")  # "|" allowed: appears in real UI text
# Must contain a letter, and must look like a word rather than a token soup.
_HAS_LETTER = re.compile(r"[A-Za-z]")
_UZ_HINT = re.compile(r"[A-Z]|\s|'")

# Keys of the legacy English->Latin dictionary. English is translated to Latin
# Uzbek *before* the Cyrillic lookup runs, so an English key must never get a
# Cyrillic entry -- transliterating English produces gibberish ("Photo" ->
# "Пҳото"). Keys that map to themselves are the exception: those ARE the Latin
# text that ends up on screen (e.g. "Transport", "Status"), so they must stay.
_ENGLISH_KEYS: set[str] = set()
_ENGLISH_VALUES: set[str] = set()


def load_english_keys() -> None:
    text = (ROOT / "frontend" / "src" / "config" / "constants.js").read_text(encoding="utf-8")
    for m in re.finditer(r'^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)"', text, re.M):
        key, value = m.group(1), m.group(2)
        if key != value:
            _ENGLISH_KEYS.add(key)
        _ENGLISH_VALUES.add(value)


def is_ui_text(s: str) -> bool:
    s = s.strip()
    # Single characters are never safe to translate: the A-E grade badges, unit
    # letters and initials would all get rewritten. (Cost: the collapsed
    # sidebar's one-letter shortcuts stay Latin.)
    if len(s) < 2 or len(s) > 300:
        return False
    if "\n" in s or "\\n" in s or "${" in s or "<" in s:
        return False
    if _CODEY & set(s):
        return False
    # A parenthesised whole string is a CSS media query or a selector fragment,
    # never a sentence -- "(max-width: 980px)" was being transliterated.
    if s.startswith("(") and s.endswith(")"):
        return False
    # A quote-comma-quote sequence means the extractor cut across a literal
    # boundary in an array, so what it captured is two half-strings glued
    # together ("', 'Birlik narxi") rather than anything shown on screen.
    if "', '" in s or '", "' in s:
        return False
    if _REJECT.search(s):
        return False
    if not _HAS_LETTER.search(s) or not _UZ_HINT.search(s):
        return False
    if s in _ENGLISH_KEYS:
        return False
    return True


def collect_js(path: Path) -> set[str]:
    """Scan the file directly rather than trying to parse string literals.

    This codebase nests template literals several levels deep (a `...` inside a
    ${...} inside another `...`), which no simple regex can partition correctly
    -- an earlier attempt swallowed whole regions and silently dropped ~40% of
    the UI text. Matching >text< and quoted runs independently is robust to any
    nesting depth.
    """
    text = path.read_text(encoding="utf-8")
    found: set[str] = set()
    for m in _TAG_TEXT_RE.finditer(text):
        if is_ui_text(m.group(1)):
            found.add(m.group(1).strip())
    # Double-quoted only: Uzbek apostrophes (ta'minotchi, Mas'ul) otherwise
    # look like single-quoted string delimiters and swallow whole regions,
    # hiding every real string in between.
    for m in re.finditer(r'"((?:[^"\\\n]|\\.)*)"', text):
        raw = m.group(1)
        if is_ui_text(raw):
            found.add(raw.strip())
    return found


def pattern_is_code(raw: str, stripped: str) -> bool:
    """Reject the fragments that reach a pattern collector but are not UI text.

    Two kinds slipped through: generated field names (`quantity_${index}` ->
    "quantity_{n}") and pieces of expressions that happen to sit between tags
    (`0 && invoice.due_date`). Both were transliterated into nonsense.
    """
    # A generated field name has no space and often an underscore
    # ("quantity_{n}", "toast{n}"); real UI text has a space around the
    # placeholder ("{n} kun", "{n} partiya").
    if "_" in stripped or not re.search(r"\s", raw):
        return True
    if re.search(r"&&|\|\||=>|[A-Za-z_]\w*\.[A-Za-z_]", raw):
        return True
    return False


def collect_js_patterns(path: Path) -> set[str]:
    """Tag text containing ${...} interpolation, normalised to a {n} pattern.

    Covers the counters and pagination lines ("267 ta mijoz",
    "Ko'rsatilmoqda: 1-20 / 267") that carry live numbers and so can never be
    matched by an exact-string lookup.
    """
    text = path.read_text(encoding="utf-8")
    found: set[str] = set()
    for m in re.finditer(r">([^<>]*\$\{[^<>]*)<", text):
        raw = re.sub(r"\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", "{n}", m.group(1)).strip()
        if "${" in raw or "{n}" not in raw:
            continue
        stripped = raw.replace("{n}", "").strip()
        # Needs real words around the placeholders, and nothing code-like.
        # Must contain a real lowercase word. Without this, identifier
        # templates like `BAT-${a}-${b}` / `CINV-${a}-${b}` become patterns and
        # would transliterate live document numbers — data, not UI.
        if len(stripped) < 3 or not re.search(r"[a-z]{3,}", stripped):
            continue
        # Check for code characters on the text with the {n} placeholders
        # removed, so their own braces don't disqualify every pattern.
        if _CODEY & set(raw.replace("{n}", "")) or '"' in raw:
            continue
        if pattern_is_code(raw, stripped):
            continue
        found.add(raw)
    return found


_TPL_PATTERN_RE = re.compile(r"`([^`\n]*\$\{[^`\n]*)`")


def collect_tpl_patterns(path: Path) -> set[str]:
    """Single-line template literals with interpolation — the list counters
    ("267 ta mijoz", "5 ta transport · 5 ta faol") live here rather than in
    tag text, since they're passed as plain strings to opsListPage()."""
    text = path.read_text(encoding="utf-8")
    found: set[str] = set()
    for m in _TPL_PATTERN_RE.finditer(text):
        raw = re.sub(r"\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", "{n}", m.group(1)).strip()
        if "${" in raw or "{n}" not in raw or "<" in raw:
            continue
        stripped = raw.replace("{n}", "").strip()
        if len(stripped) < 3 or not re.search(r"[a-z]{3,}", stripped):
            continue
        if _CODEY & set(raw.replace("{n}", "")) or '"' in raw or "/" in stripped:
            continue
        if pattern_is_code(raw, stripped):
            continue
        found.add(raw)
    return found


def collect_html(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    found = {t.group(1).strip() for t in _TAG_TEXT_RE.finditer(text) if is_ui_text(t.group(1))}
    for attr in ("title", "aria-label", "data-short", "placeholder"):
        for m in re.finditer(rf'{attr}="([^"]+)"', text):
            if is_ui_text(m.group(1)):
                found.add(m.group(1).strip())
    return found


_PY_MESSAGE_CONST_RE = re.compile(r'^MSG_[A-Z0-9_]+\s*=\s*"([^"\n]+)"', re.MULTILINE)


def collect_py(path: Path) -> set[str]:
    """Only `detail=` messages: those are what reach the user as toasts.

    Deliberately not every Python string -- docstrings, log lines and internal
    constants are not UI text and would otherwise be transliterated into
    nonsense. Interpolated (f-string) details are skipped here and handled at
    runtime by the transliterator fallback in localizeMessage().
    """
    text = path.read_text(encoding="utf-8")
    found: set[str] = set()
    for m in _PY_DETAIL_RE.finditer(text):
        raw = m.group(1)
        if "{" in raw:
            continue
        if is_ui_text(raw):
            found.add(raw.strip())
    # A module constant named MSG_* is a deliberate marker for "this sentence
    # is shown to the user". It exists so a message that has a value appended
    # to it at runtime can still be translated: the sentence is a fixed
    # literal, the value is not part of it.
    for m in _PY_MESSAGE_CONST_RE.finditer(text):
        raw = m.group(1)
        if "{" not in raw and is_ui_text(raw):
            found.add(raw.strip())
    return found


UNIT_WORDS = [
    "tonna", "kilogramm", "litr", "dona", "quti", "metr", "kilometr",
    "soat", "kun", "oy", "yil", "foiz",
]


def main() -> None:
    load_english_keys()
    strings: set[str] = set()
    patterns: set[str] = set()
    for p in sorted((ROOT / "frontend" / "src").rglob("*.js")):
        if p.name == "cyrillic.js":
            continue
        strings |= collect_js(p)
        patterns |= collect_js_patterns(p)
        patterns |= collect_tpl_patterns(p)
    strings |= collect_html(ROOT / "frontend" / "index.html")
    # Units of measure come from the database, so nothing in the source
    # extracts them -- but they are a small closed vocabulary that belongs in
    # the reader's alphabet, not a company name to leave alone.
    strings |= set(UNIT_WORDS)
    strings |= _ENGLISH_VALUES
    for p in sorted((ROOT / "backend" / "app").rglob("*.py")):
        # PDF-parser patterns and the registry importer are data-matching, not UI.
        if p.name in {"contract_pdf_parser.py", "import_company_registry.py"}:
            continue
        strings |= collect_py(p)

    mapping: dict[str, str] = {}
    for s in sorted(strings):
        cyr = translate(s)
        if cyr != s:  # nothing to say if transliteration is a no-op
            mapping[s] = cyr

    pattern_map: dict[str, str] = {}
    for s in sorted(patterns):
        cyr = translate(s)
        if cyr != s:
            pattern_map[s] = cyr

    body = json.dumps(mapping, ensure_ascii=False, indent=2, sort_keys=True)
    pat_body = json.dumps(pattern_map, ensure_ascii=False, indent=2, sort_keys=True)
    pairs = json.dumps(_PAIRS_FOR_JS, ensure_ascii=False)
    protected = json.dumps(PROTECTED, ensure_ascii=False)
    OUT.write_text(
        "// GENERATED by scripts/generate_cyrillic_dict.py — do not edit by hand.\n"
        "// Latin is the source of truth; re-run the generator after adding UI text.\n"
        "// Corrections go in OVERRIDES in scripts/uz_translit.py, then regenerate.\n"
        f"const uzCyrillic = {body};\n\n"
        f"// Templates carrying live values; {{n}} stands in for each interpolation.\n"
        f"const uzCyrillicPatterns = {pat_body};\n\n"
        + JS_TRANSLITERATOR
        .replace("__PAIRS__", pairs)
        .replace("__PROTECTED__", protected)
        .replace("__WORD_FIXES__", json.dumps(WORD_FIXES, ensure_ascii=False)),
        encoding="utf-8",
    )
    # A protected brand only keeps its Latin form on a word boundary, so an
    # Uzbek suffix glued to it ("Excelga") slips past and gets transliterated
    # into nonsense. Widening the boundary is not safe -- short entries like
    # "ID" would then swallow the start of ordinary words -- so instead say so
    # loudly and let the caller reword the string.
    # A string that is actually English gets transliterated as though it were
    # Uzbek and lands on screen as nonsense -- "First contact" was rendering as
    # "Фирст контакт" because it was not a key in the legacy English dictionary
    # and so nothing stopped it. These words do not occur in Uzbek UI text, so
    # seeing one means the source string should be rewritten in Uzbek.
    english_only = {
        "first", "basic", "information", "full", "name", "address", "account",
        "number", "select", "supplier", "invoice", "payment", "item", "items",
        "unit", "price", "quantity", "remove", "cancel", "save", "back", "add",
        "open", "leave", "manual", "allocation", "allocate", "documents",
        "method", "reference", "region", "district", "position", "comment",
        "notes", "type", "date", "due", "procurement", "edit", "new", "total",
        "description", "product", "search", "filter", "with", "the", "and",
        "contact", "amount", "code", "value", "list", "row",
        # "bank" and "status" are spelled the same in Uzbek, so they are not
        # evidence of anything.
    }
    def english_words(text: str) -> set[str]:
        return {word.strip(".,:;!?()").lower() for word in text.split()} & english_only

    # Two English words together is unambiguous. A single one counts too:
    # strings that are keys of the legacy English dictionary never reach
    # `mapping`, so anything here is text nothing else protects.
    latin_english = sorted(
        text
        for text in mapping
        if not re.search(r"[Ѐ-ӿ]", text)
        and (len(english_words(text)) >= 2 or (len(text.split()) == 1 and english_words(text)))
    )
    for text in latin_english:
        print(f"  OGOHLANTIRISH: '{text}' -> '{mapping[text]}' (inglizcha matn o'zbekchadek o'girildi)")

    suffixed = sorted(
        {
            text
            for text in mapping
            for brand in PROTECTED
            if re.search(rf"{re.escape(brand)}[a-z]", text) and brand not in mapping[text]
        }
    )
    for text in suffixed:
        print(f"  OGOHLANTIRISH: '{text}' -> '{mapping[text]}' (brend qo'shimcha bilan buzildi)")

    print(f"{len(mapping)} strings + {len(pattern_map)} patterns -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
