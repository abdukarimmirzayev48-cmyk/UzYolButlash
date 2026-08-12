@echo off
REM Launcher for Windows Task Scheduler. Forces UTF-8 so Uzbek/Cyrillic text
REM in device error messages can't crash the script on a cp866/cp1251 console.
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0\.."
python scripts\hikvision_sync_agent.py >> agent_run.log 2>&1
