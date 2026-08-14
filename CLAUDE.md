# UzYolButlash ERP — project handbook

Read this first in a new session. It describes where everything lives, the
conventions that are load-bearing, and the mistakes that are easy to repeat.

---

## 1. What this is

An internal ERP for **UzYolButlash**, an Uzbek road-construction and bitumen
company. Real staff use it daily in **Uzbek Cyrillic**. It covers:

| Area | Uzbek name | What it does |
|---|---|---|
| Sales | Sotuv / Сотув | clients, talabnoma (requests), contracts, orders, products |
| Delivery | Yetkazib berish | delivery batches, logistics, own truck fleet |
| Supply | Ta'minot | suppliers, procurements, supplier offers, stock |
| Finance | Moliya | customer + supplier invoices and payments, receivables/payables |
| Reports | Hisobotlar | dashboard, profit, cashflow |
| Staff | Xodimlar | employees, departments, users/logins |
| Attendance | Davomat | turnstile-based timesheet (Hikvision) |
| **Tasks** | **Ijro / Ижро** | task workflow — the most actively developed module |

Live at **https://uzyolbutlash.uz**. Repo: `abdukarimmirzayev48-cmyk/UzYolButlash`, branch `main`.

---

## 2. Stack and the one hard constraint

- **Backend**: FastAPI + SQLAlchemy 2.0 (typed `Mapped[...]` style) + Alembic, **SQLite** (`bitum.db` at repo root)
- **Frontend**: **plain browser JavaScript, no build step, no framework, no npm**
- **Auth**: signed session cookie (`SessionMiddleware`), server-rendered nothing — the frontend is a static SPA shell
- **Scheduler**: APScheduler `BackgroundScheduler` started in `@app.on_event("startup")`
- **Excel**: `openpyxl` · **PDF**: `pypdf` · **Telegram**: `python-telegram-bot` 21.x

> ### ⚠️ The frontend has no build step
> Every JS file is a `<script defer>` tag in `frontend/index.html` and everything
> shares one global scope. There is **no bundler, no import/export, no
> transpiler**. Functions are plain globals; a file can call a function defined
> in another file because they all land on `window`.
>
> Consequences you must respect:
> - Never add `import`/`export` to `frontend/src/**`.
> - A new file must be registered as a `<script>` tag in `index.html`.
> - `index.html` cache-busts with `?v=<date>-<slug>` query strings. **Bump them
>   whenever you change a JS/CSS file**, or browsers serve stale code.

---

## 3. Repository layout

```text
UzYolButlash/
├── backend/app/
│   ├── main.py               app assembly: routers, middleware, SPA fallback, scheduler, telegram bot
│   ├── api/          (17)    one router per module — the HTTP layer
│   ├── models/       (14)    SQLAlchemy ORM models
│   ├── schemas/      (14)    Pydantic request/response models
│   ├── services/     (14)    business logic — workflow rules, integrations, reports
│   ├── core/                 config.py (env + .env loader), paths.py
│   └── db/session.py         engine, SessionLocal, Base, get_db
├── frontend/
│   ├── index.html            THE shell: sidebar, top bar, and all ~31 <script> tags
│   ├── app.js                bootstrap
│   ├── styles.css            ~4400 lines, the whole design system
│   └── src/
│       ├── core/runtime.js   (~950 lines) the shared toolbox — read this first
│       ├── pages/    (14)    one file per module, render* functions
│       ├── components/       small HTML-string builders
│       ├── config/           constants.js, cyrillic.js (GENERATED — see §6)
│       ├── api/              per-module fetch helpers
│       └── utils/formatters.js
├── alembic/versions/  (31)   migrations, named YYYYMMDD_NNNN_slug.py
├── scripts/                  maintenance tools (see §11)
├── storage/uploads/          user files, served at /static/uploads
├── uz-yol-butlash-request-portal/   SEPARATE public request portal (TypeScript + npm)
├── bitum.db                  the database (gitignored)
└── .env                      secrets (gitignored — never commit, never print)
```

**Gotchas in the tree:**
- `frontend/.git/` is a stray nested git directory. It is *not* a submodule; the
  frontend files are tracked by the main repo. Ignore it.
- `uz-yol-butlash-request-portal/` is a *different* app (public talabnoma form,
  TypeScript, has its own `package.json` and build). The no-build-step rule does
  **not** apply there. The ERP's own `/talabnoma` route in `publicTalabnoma.js`
  is a separate, simpler implementation.
- `app.db`, `hikvison.py`, `scan_hikvision.py`, `users.json` are legacy/scratch.

---

## 4. Backend conventions

**Layering:** `api/` parses and authorises → `services/` decides → `models/` persists.
Anything a second caller might need (rules, aggregation, export) belongs in `services/`.

**Route registration** (`main.py`): three tiers.
1. Public — `customer_requests_public_router`, `auth_router`, `hikvision_agent_router`
   (the agent authenticates with its own shared-token header, not a cookie).
2. `dependencies=authenticated` — every other router; requires a logged-in session.
3. Per-route `Depends(require_edit("<module>"))` for writes.

**Module keys** used by `require_edit` — these exact strings, nothing else:
`xodimlar`, `davomat`, `ijro`, `sotuv`, `yetkazib_berish`, `taminot`, `moliya`.

**SPA fallback:** `main.py` has an explicit allowlist of first path segments that
return `index.html`. **Add your new page's path prefix there** or a page refresh
404s / redirects to `/clients`.

**Route ordering:** literal paths must be declared *before* `/{id}` paths, or
FastAPI tries to parse the literal as an int. `/api/tasks/dashboard` and
`/api/tasks/export.xlsx` sit above `/api/tasks/{task_id}` for this reason.

**Errors:** `HTTPException(detail=...)` messages are written in **Latin Uzbek**
and translated in the browser (see §6). Do not write Cyrillic in Python.

---

## 5. Frontend conventions

`frontend/src/core/runtime.js` is the shared toolbox. Before writing UI, grep it —
the helper you want probably exists:

| Helper | Purpose |
|---|---|
| `api(path, opts)` / `apiForm(path, formData)` | fetch wrappers; translate error details, handle 401 |
| `section(title, body)`, `detailList`, `tableOrEmpty`, `opsTableOrEmpty` | layout blocks |
| `summaryCards`, `opsPageShell`, `opsFooter` | page furniture |
| `workflowHeader`, `workflowTabs`, `workflowWarningsPanel` | detail-page furniture |
| `bindOpsSearch(formId, basePath, keys)`, `bindOpsPagination` | filter form ↔ URL |
| `statusBadge`, `statusLabel`, `fmt`, `esc`, `fmtDate`, `fmtDayOnly`, `fmtMoney` | rendering |
| `showToast(msg, isError)` | notifications |
| `localizeText`, `localizeMessage`, `localizeDom`, `currentLang`, `setLang` | language (§6) |
| `navigate(path)` | pushState routing |

`canEdit(moduleKey)` lives in `pages/auth.js` and reads the logged-in user.

**Routing** is a plain if/else chain in `frontend/src/router.js`.

**Filters live in the URL.** Read `location.search`, write it with `navigate()`.
This is what makes a link reproduce a colleague's exact view, and what lets the
list, the dashboard and the export agree.

---

## 6. The language system — read before touching any UI string

The UI ships in **Uzbek Cyrillic by default**, with a Latin switch. The mechanism
is unusual and easy to break.

**Latin is the single source of truth.** Every string in `.js`, `.html` and every
Python `detail=` message is written in **Latin Uzbek**. Cyrillic is produced at
render time.

**`frontend/src/config/cyrillic.js` is generated — never hand-edit it.**

```bash
python3 scripts/generate_cyrillic_dict.py    # ~1900 strings + ~72 patterns
```

`scripts/uz_translit.py` holds the transliterator plus `OVERRIDES` (hand
corrections) and `PROTECTED` (brands/acronyms left alone). Fix bad output there,
then regenerate — corrections survive.

**Run the generator after any user-facing string change**, or your new text stays
Latin for real users.

### The rules that keep customer data safe

`localizeText()` is **dictionary-only, no transliteration fallback**. It runs over
the whole DOM, so an unknown string (a client name, an address, a plate number)
passes through untouched. `localizeMessage()` *does* fall back to live
transliteration, and is used only for toasts and API errors — never for table data.

### Practical rules when writing UI text

1. **One text node per translatable string.** `<strong>Joriy holat: ${value}</strong>`
   produces the text node `"Joriy holat: Bajarilmoqda"` — not a dictionary key, so
   it stays Latin. Wrap each part: `<strong><span>Joriy holat</span>: <span>${value}</span></strong>`.
2. **No double quotes inside a translatable literal** — the extractor rejects
   them. Use Uzbek guillemets: `«Boshlash»`, not `\"Boshlash\"`.
3. **Interpolated values break lookups.** Numbers are handled (`"5 ta tanlandi"`
   matches a `{n}` pattern), arbitrary text is not. Keep the sentence static and
   put the variable in its own element.
4. **`data-noloc`** on an element opts its whole subtree out — use it for live
   data shown inside a dialog, and for the language switcher itself.
5. **Modals appended to `document.body` are not auto-translated.** The
   MutationObserver only watches `#app`. Call `localizeDom(myBackdrop)` by hand.
   (`taskDialog` in `pages/tasks.js` is the worked example.)

---

## 7. Permissions

Two layers:

**Module edit rights** — `User.is_admin` or `"<module>" in user.edit_modules`.
Backend: `require_edit("ijro")`. Frontend: `canEdit("ijro")`.

**Row visibility (Ijro)** — `services/task_query.visibility_clause()`:
managers (admin or `ijro` right) see every task; everyone else sees only tasks
assigned to them or created by them. It is applied inside `filter_clauses()`
*before* every other filter, so the list, the dashboard and the Excel export are
all covered by construction. `/api/tasks/dashboard` and `/api/tasks/export.xlsx`
additionally require a manager.

> **The link that makes it work:** an employee only sees "their" tasks if their
> **staff card is linked to a login** (`Employee.user_id`). Unlinked staff see an
> empty list and get no Ijro notifications. On production this is currently
> **2 of 41 active employees** — the single biggest reason Ijro looks broken to a
> normal user. Link them in Xodimlar → user modal → "Bog'langan xodim".

---

## 8. Database and migrations

- Default `DATABASE_URL=sqlite:///./bitum.db`.
- Migration files: `alembic/versions/YYYYMMDD_NNNN_slug.py` — continue the
  numbering (`20260814_0031` was the last as of writing).
- **SQLite cannot ALTER columns.** Use `op.batch_alter_table(...)` for any change
  to an existing column.
- **Back up before migrating production**: `cp bitum.db bitum.db.pre-<change>.bak`.
  Several such `.bak` files exist locally and on the VPS; that is the convention.
- Verify a migration both ways before shipping:
  ```bash
  .venv/bin/alembic upgrade head && .venv/bin/alembic downgrade -1 && .venv/bin/alembic upgrade head
  ```

---

## 9. Running and verifying locally

```bash
cd /Users/macbookair/Desktop/bitum-github/UzYolButlash
source .venv/bin/activate           # or call .venv/bin/python directly
alembic upgrade head
TELEGRAM_BOT_TOKEN="" uvicorn backend.app.main:app --port 8000 --reload
```

> ### ⚠️ Always start the local server with `TELEGRAM_BOT_TOKEN=""`
> Telegram allows **one long-polling client per bot token**. A local server with
> the real token fights the VPS and both get `409 Conflict` — you silently break
> the drivers' bot in production. Blanking the variable simply skips the bot.

**Static checks (cheap, run always):**
```bash
.venv/bin/python -c "from backend.app.main import app"   # backend imports
node --check frontend/src/pages/<file>.js                 # JS syntax
```

**Playwright** is available but only through an npx cache. ESM `import` needs the
script to *live inside that directory* (`NODE_PATH` does not work for ESM):

```bash
cp check.mjs /Users/macbookair/.npm/_npx/e41f203b7505f1fb/check.mjs
node /Users/macbookair/.npm/_npx/e41f203b7505f1fb/check.mjs
```

A verification script should: log in, drive the real UI, assert on rendered
**Cyrillic** text, capture `pageerror`/`console.error`, and screenshot. A useful
trick: register `page.on('dialog', ...)` as a *failure* to prove no native
`prompt`/`confirm` remains.

**Test data:** seed with a recognisable prefix (`[DEMO]`, `[PERM]`) and delete it
by that prefix afterwards. Delete temporary test users too. Never seed production.

---

## 10. Deployment

```text
VPS 185.217.131.71  (credentials are the user's; they live in .env / the user's notes)
/opt/uzyolbutlash           git checkout, its own .venv and .env
uvicorn on 127.0.0.1:8001   systemd unit: uzyolbutlash.service
nginx site: uzyolbutlash.uz -> proxy to 8001
```

**Deploy = push, then run the VPS script.** `deploy.sh` exists only on the server
(`/opt/uzyolbutlash/deploy.sh`), not in the repo. It does: `git pull` →
`pip install -r requirements.txt` → `alembic upgrade head` →
`systemctl restart uzyolbutlash.service` → waits for `/login` to answer 200.

```bash
git push origin main
ssh root@185.217.131.71 'bash /opt/uzyolbutlash/deploy.sh'
```

**Never just `git pull` on the server** — the running uvicorn keeps the old code
in memory and you get phantom 405s on new routes. Always restart via the script.

**After deploying, verify:**
```bash
curl -s https://uzyolbutlash.uz/login | grep -o "tasks.js?v=[a-z0-9-]*"   # new asset version live
curl -s -o /dev/null -w "%{http_code}\n" https://uzyolbutlash.uz/api/tasks/dashboard  # 401 = route exists
```

**Before every commit:** confirm `.env`, `bitum.db` and `*.bak` are not staged.
They are gitignored, but check anyway — the repo holds real credentials in `.env`.

---

## 11. Integrations

### Hikvision turnstiles (Davomat)

Attendance comes from real access-control terminals over ISAPI (HTTP +
`HTTPDigestAuth`). Config: `HIKVISION_HOSTS` (comma-separated), `HIKVISION_USERNAME`,
`HIKVISION_PASSWORD`.

- **The VPS cannot reach the office LAN.** The in-app "sync now" button can never
  work in production. The real path is `scripts/hikvision_sync_agent.py` +
  `run_hikvision_sync_agent.bat`, run on an office Windows PC on the same LAN; it
  pushes to `POST /api/attendance/hikvision/agent/sync`, authenticated by
  `HIKVISION_SYNC_AGENT_TOKEN`. Setup guide: `scripts/HIKVISION_AGENT_SETUP.md`.
- **Manual edits are protected.** `services/hikvision_sync.py` skips any record
  whose status is in `MANUAL_STATUSES` — a sync must never overwrite a manually
  entered leave/absence. Keep that guard.
- **Device `.216` reports `+08:00` (China) offsets but its wall clock is correct.**
  This was verified by cross-device comparison. The existing timezone-stripping is
  right; "fixing" the offset would shift real records by 3 hours.

### Telegram bot (drivers)

`services/telegram_bot.py`, long-polling in a dedicated thread, started from
`main.py` startup; cross-thread sends use `asyncio.run_coroutine_threadsafe`.
Drivers pair via a one-time code from the employee page, then report fuel level,
odometer + photos, and stop alerts. See the one-poller warning in §9.

### Scheduler

`run_reminder_sweep` every 15 minutes: deadline reminders (1 day / 1 hour out) and
an overdue sweep. It is **idempotent** — it dedups against existing `Notification`
rows, so repeated runs never duplicate. Preserve that property.

### Scripts

| Script | Purpose |
|---|---|
| `generate_cyrillic_dict.py` | regenerate the Cyrillic dictionary (§6) |
| `uz_translit.py` | the transliterator + OVERRIDES/PROTECTED |
| `hikvision_sync_agent.py` + `.bat` | office-LAN attendance agent |
| `seed_more_demo_data.py` | demo data |
| `import_registry_as_clients.py`, `merge_company_registry_into_clients.py` | company registry import |

---

## 12. Ijro (tasks) — the actively developed module

**Backend:** `api/task.py`, `models/task.py`, `schemas/task.py`, and four services:
`task_workflow.py` (rules), `task_query.py` (filters + visibility),
`task_stats.py` (dashboard aggregates), `task_export.py` (XLSX).
**Frontend:** `pages/tasks.js` (~1200 lines).

**Model:** `Task`, `TaskAssignee` (multi-assignee), `TaskComment`, `TaskAttachment`
(one table for both task-level and comment files — `comment_id IS NULL` means
task-level), `TaskHistory`, `Notification`.

**Workflow** (`task_workflow.ALLOWED_TRANSITIONS`):

```text
new → accepted → in_progress → done → verified
                                   └→ rejected
```

- `COMMENT_REQUIRED_TRANSITIONS`: `in_progress→done`, `done→rejected`
- `MANAGER_ONLY_TRANSITIONS`: `done→verified`, `done→rejected` (creator or `ijro` right)
- Any assignee can advance a shared task; it does **not** require all of them.
- `available_actions` is computed per user and returned on every task read — the
  UI renders buttons straight from it, so permission logic lives in one place.

**Views** (`/tasks?view=…`): `panel` (dashboard, managers only, default for them),
`board` (kanban, drag-and-drop), `table` (sortable, paginated).

**Deadlines are date-only.** The picker sends `YYYY-MM-DD`; `endOfDay()` stores
`T23:59:59` so a task due today is not overdue from midnight.

**Dialogs:** Ijro uses `taskDialog()` / `taskConfirm()` in `pages/tasks.js`, never
the browser's `prompt`/`confirm`. Each dialog states what will happen before it
happens. `TASK_STATUS_HELP` and `TASK_ACTION_HELP` hold the plain-language
explanations shown in the status panel and dialogs — keep them in sync when you
add a transition.

**Uploads:** max 10 MB per file, counted while streaming to disk (a lying
`Content-Length` can't slip a big file through). Deleting an attachment, comment
or task also removes the files from disk, guarded to stay inside the uploads dir.

**Export:** `/api/tasks/export.xlsx` — a "Topshiriqlar" sheet (18 columns, frozen
header, autofilter, overdue rows tinted) and a "Xulosa" summary sheet. Labels are
written server-side in `task_export.LABELS` for both alphabets, since a binary
file can't be transliterated in the browser; the caller passes `lang` and a
human-readable `filter_note` that is stamped into the file.

---

## 13. House style

- **Comments explain *why*, not *what*.** Match the density of the surrounding
  file. A comment earns its place by recording a decision or a trap.
- Uzbek Latin for all user-facing strings and commit messages; English for code
  identifiers and internal comments.
- Commit messages: a short Uzbek subject, then a body explaining the reasoning.
  End with the `Co-Authored-By:` trailer.
- Prefer extending `runtime.js` helpers over inventing a parallel pattern.
- When you touch a page, bump its `?v=` in `index.html`.

## 14. Definition of done

1. `.venv/bin/python -c "from backend.app.main import app"` passes
2. `node --check` on every edited JS file
3. Migration verified up → down → up (if any)
4. Cyrillic dictionary regenerated, new strings confirmed present
5. Playwright run against a local server: real flow, no console errors, Cyrillic asserted
6. Test/demo data removed
7. `.env` / `bitum.db` not staged; commit; push
8. `bash /opt/uzyolbutlash/deploy.sh` on the VPS; verify asset version + a route

---

## 15. Open items

- **Link the remaining ~39 employees to logins** — without it Ijro is invisible to
  them and notifications go nowhere (§7).
- Only 2 users hold the `ijro` right on production (`admin`, `sattarovamanzura`).
- Staff-document discrepancies never resolved: spelling differences between the
  official staff list and turnstile records (8 names), 3 drivers missing from the
  list (header says 10, lists 7), possibly 3 missing under "Хизмат кўрсатиш", and
  no full name for "Худойкулов У".
- A Mac launchd job (`uz.uzyolbutlash.hikvision-sync`) still syncs attendance from
  this laptop; retire it once the office Windows agent is running.
- Decide whether a shared task should require *all* assignees to accept, rather
  than any one of them.
