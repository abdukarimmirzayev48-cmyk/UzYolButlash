# Hikvision sync agent — setup (LAN-side, unattended)

Why this exists: the turnstiles live at private IPs (`192.168.100.x`) on the
office network. The main server (VPS) can't reach them directly. This
script runs on a machine that's physically on that same office network,
talks to the turnstiles, and pushes the results up to the server — on a
schedule, with no one needing to remember to run anything by hand.

## One-time setup

1. **Get a copy of this repository onto a machine on the office LAN** (the
   same network as the turnstiles — anything that can reach
   `192.168.100.214/215/216` today). Any way of getting it there works: git
   clone, or just copying the whole project folder.

2. **Install Python 3** if it's not already there (python.org), then open a
   terminal/command prompt in the project folder and run:
   ```
   pip install requests
   ```
   (Only `requests` is needed for this script — not the full app's
   dependencies.)

3. **Create a `.env` file** at the project root (same folder as this
   `scripts/` directory) with:
   ```
   HIKVISION_HOSTS=192.168.100.214,192.168.100.215,192.168.100.216
   HIKVISION_USERNAME=admin
   HIKVISION_PASSWORD=<the real device password>
   SYNC_TARGET_URL=https://uzyolbutlash.uz
   HIKVISION_SYNC_AGENT_TOKEN=<ask the admin for this — it must match the
     HIKVISION_SYNC_AGENT_TOKEN already set in the server's own .env>
   ```

4. **Test it once by hand** before scheduling anything:
   ```
   python scripts\hikvision_sync_agent.py
   ```
   You should see one line per device ("Qurilma ...: OK.") followed by a
   "Muvaffaqiyatli yuborildi: ..." summary line. If something's wrong, the
   error message explains what (unreachable device, bad token, unreachable
   server, etc.) and nothing gets marked as sent — the next run retries the
   same window automatically, so it's safe to just fix the problem and
   re-run.

## Scheduling it (Windows Task Scheduler)

1. Open **Task Scheduler** → **Create Task…** (not "Create Basic Task" —
   the basic wizard doesn't support the "repeat every N minutes" trigger
   this needs).
2. **General** tab: name it e.g. "Hikvision Sync Agent". Check "Run whether
   user is logged on or not" if you want it to keep running even when
   nobody's logged into that PC.
3. **Triggers** tab → New… → Begin the task: *On a schedule* → Daily →
   pick a start time → check **"Repeat task every"** and set it to
   **15 or 30 minutes**, for a duration of **1 day** (so it keeps repeating
   all day, every day).
4. **Actions** tab → New… → Action: *Start a program* → Program/script:
   browse to `scripts\run_hikvision_sync_agent.bat` in this project folder.
5. Save. You can right-click the task → **Run** to trigger it immediately
   and confirm it works before waiting for the schedule.

## Checking it's actually working

- **`agent_run.log`** in the project root accumulates one line per run —
  check it any time to see the history of runs and any errors.
- **In the app itself**: Davomat page → "Turniketdan sinxronlash" button →
  the modal shows "Oxirgi avtomatik sinxronlash (LAN agenti): ..." with the
  timestamp and counts from the most recent agent run. If that timestamp
  isn't advancing, the scheduled task isn't running (check Task Scheduler's
  history for that task) or is failing (check `agent_run.log`).

## Notes

- Safe to run as often as you like — re-submitting overlapping data just
  updates the same records again, nothing gets duplicated.
- If a device is temporarily unreachable, the agent still sends whatever
  the *other* devices returned; only a device that fails gets skipped for
  that run.
- The manual "Turniketdan sinxronlash" button in the web UI still exists
  and still works as a fallback for anyone running the server itself on
  the office LAN (e.g. local testing) — this agent doesn't replace it, it
  just covers the production case where the server can't reach the
  turnstiles directly.
