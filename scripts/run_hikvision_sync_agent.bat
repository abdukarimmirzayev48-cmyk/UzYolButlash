@echo off
cd /d "%~dp0\.."
python scripts\hikvision_sync_agent.py >> agent_run.log 2>&1
