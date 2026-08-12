# Hikvision sync agent — Windows setup guide

**Why this exists.** The turnstiles sit at private addresses on the office
network (`192.168.100.214/215/216`). The server (uzyolbutlash.uz) is on the
internet and physically cannot reach those addresses — that is why the
"Turniketdan sinxronlash" button on the Davomat page can never work from the
server. This little program runs on an office computer that *is* on the same
network, reads the turnstiles, and sends the attendance up to the site. Once
set up it runs by itself every 30 minutes; nobody has to remember anything.

**Which computer?** Any Windows PC in the office that:
- is on the same network as the turnstiles, and
- stays switched on during the working day.

A desktop that's always on is ideal. It does **not** need to be a server.

---

## Step 1 — Install Python

1. Go to <https://www.python.org/downloads/> and click the big yellow
   **Download Python** button.
2. Run the installer.
3. **IMPORTANT:** on the first screen, tick the box at the bottom that says
   **"Add python.exe to PATH"** before clicking Install. If you miss this,
   nothing else in this guide will work.
4. Click **Install Now** and wait for it to finish.

**Check it worked:** press `Win + R`, type `cmd`, press Enter, then type:

```
python --version
```

You should see something like `Python 3.13.1`. If instead you get
*"'python' is not recognized"*, Python was installed without the PATH option —
re-run the installer, choose **Modify**, and tick "Add python.exe to PATH".

## Step 2 — Unpack the program

1. Copy `hikvision-sync-agent.zip` onto the office computer.
2. Right-click it → **Extract All…**
3. Extract it somewhere permanent and easy to type, for example:
   `C:\hikvision-sync-agent`

   Do **not** leave it in Downloads or on the Desktop — the scheduled task
   will point at this folder forever, so it must not move.

After extracting you should have `C:\hikvision-sync-agent\` containing a
`scripts` folder, a `backend` folder, `README.md` and `.env.example`.

## Step 3 — Install the one library it needs

Open Command Prompt (`Win + R` → `cmd` → Enter) and run:

```
pip install requests
```

That's the only dependency — this program does not need the rest of the ERP.

## Step 4 — Create the settings file

1. In `C:\hikvision-sync-agent`, find the file **`.env.example`**.
2. Copy it and rename the copy to exactly **`.env`** (no `.txt`, no
   `.example` — just `.env`).

   *If Windows hides file extensions:* in Explorer, View → tick
   **File name extensions**, so you can be sure the name is right.
3. Open `.env` with Notepad and fill in the two blank values:

```
HIKVISION_HOSTS=192.168.100.214,192.168.100.215,192.168.100.216
HIKVISION_USERNAME=admin
HIKVISION_PASSWORD=<the turnstile password>
SYNC_TARGET_URL=https://uzyolbutlash.uz
HIKVISION_SYNC_AGENT_TOKEN=<ask the administrator>
```

The token must be exactly the same value that is set on the server. Ask
whoever administers the server if you don't have it.

## Step 5 — Test it once by hand

In Command Prompt:

```
cd C:\hikvision-sync-agent
python scripts\hikvision_sync_agent.py
```

**A successful run looks like this** — one line per turnstile, then a summary:

```
[2026-08-12T14:20:03] Qurilma 192.168.100.214: OK.
[2026-08-12T14:20:03] Qurilma 192.168.100.215: OK.
[2026-08-12T14:20:04] Qurilma 192.168.100.216: OK.
[2026-08-12T14:20:04] Muvaffaqiyatli yuborildi: 0 ta yangi xodim, 135 ta hodisa, 22 ta kun yangilandi.
```

Open the Davomat page on uzyolbutlash.uz — today's arrival times should now
be there. **Do not continue to Step 6 until this works.**

If something is wrong, the message tells you what — see Troubleshooting below.

## Step 6 — Make it run automatically

1. Press `Win`, type **Task Scheduler**, open it.
2. In the right-hand panel click **Create Task…**
   (*not* "Create Basic Task" — the basic wizard can't repeat every 30 minutes).

**General tab**
- Name: `Hikvision Sync Agent`
- Select **Run whether user is logged on or not** — so it keeps working when
  nobody is signed in.
- Tick **Run with highest privileges**.

**Triggers tab** → **New…**
- Begin the task: **On a schedule**
- Select **Daily**, start time `07:00:00`
- Tick **Repeat task every:** and type `30 minutes`
  (type it in — the dropdown may only offer 1 hour)
- for a duration of: **1 day**
- Make sure **Enabled** is ticked → **OK**

**Actions tab** → **New…**
- Action: **Start a program**
- Program/script: click **Browse…** and select
  `C:\hikvision-sync-agent\scripts\run_hikvision_sync_agent.bat`
- → **OK**

**Settings tab**
- Tick **Run task as soon as possible after a scheduled start is missed**
  (so it catches up if the PC was off).
- At the bottom, *If the task is already running*: leave as
  **Do not start a new instance**.
- → **OK**

Windows will ask for the computer's password — this is required for
"run whether user is logged on or not".

**Test the schedule:** find the task in the list, right-click → **Run**.
Then open `C:\hikvision-sync-agent\agent_run.log` — a new block of lines
should have appeared at the bottom.

---

## How to check it's working later

**In the app:** Davomat page → **Turniketdan sinxronlash** button. The window
shows *"Oxirgi avtomatik sinxronlash (LAN agenti): …"* with the time of the
last successful run. If that time is within the last hour, everything is fine.

**On the computer:** open `C:\hikvision-sync-agent\agent_run.log`. It keeps a
line for every run, so you can see the history and any errors.

*(The red "cannot connect to device" messages in that window are normal and
expected — that's the server itself trying to reach the turnstiles, which it
never can. Only the "Oxirgi avtomatik sinxronlash" line matters.)*

---

## Troubleshooting

**`'python' is not recognized`**
Python isn't on PATH. Re-run the Python installer → Modify → tick
"Add python.exe to PATH".

**`ModuleNotFoundError: No module named 'requests'`**
Step 3 was skipped. Run `pip install requests`.

**`Xatolik: ... .env faylida ... kiritilmagan`**
The `.env` file is missing, misnamed (e.g. `.env.txt`), or a value is blank.
Check Step 4.

**`Qurilmaga ulanib bo'lmadi (192.168.100.x)`**
This computer can't reach that turnstile. Check it's on the office network
(not guest Wi-Fi), and that the device is powered on. If only one of the three
fails, the others still sync — the failing one is skipped for that run.

**`Server xatosi (HTTP 403)`**
The `HIKVISION_SYNC_AGENT_TOKEN` doesn't match the server's. Get the correct
value from the administrator.

**`Serverga ulanib bo'lmadi`**
No internet, or `SYNC_TARGET_URL` is wrong. It should be exactly
`https://uzyolbutlash.uz`.

**Nothing is broken but data isn't updating**
Open Task Scheduler, find the task, and look at **Last Run Result** and the
**History** tab. `0x0` means success.

---

## Good to know

- **Safe to run as often as you like.** Re-sending the same days just updates
  the same records — nothing is ever duplicated.
- **It catches up by itself.** If the PC is off or the internet drops, the run
  fails harmlessly and the *next* successful run collects everything that was
  missed. No data is lost.
- **Manually-marked days are protected.** If someone is marked in the app as
  on leave, sick, or on a business trip, the sync will not overwrite that,
  even if the person badges through a turnstile that day.
- **Only reads.** The agent never changes anything on the turnstiles; it only
  reads events and the employee list.
