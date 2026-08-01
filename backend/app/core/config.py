import os

from backend.app.core.paths import PROJECT_ROOT


def _load_dotenv() -> None:
    """Load KEY=VALUE pairs from a .env file at the project root, if present.

    Kept dependency-free (no python-dotenv) since this is the only place that
    needs it. Existing environment variables always win over the file.
    """
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bitum.db")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174",
    ).split(",")
    if origin.strip()
]

# Hikvision access-control terminals (real turnstile attendance source).
# Set these in a project-root .env file (gitignored) — never hardcode them.
# HIKVISION_HOSTS accepts a comma-separated list (multiple doors/readers on
# the same site, e.g. "192.168.100.214,192.168.100.215"); HIKVISION_HOST is
# kept as a single-value fallback for backward compatibility.
_hikvision_hosts_raw = os.getenv("HIKVISION_HOSTS", "") or os.getenv("HIKVISION_HOST", "")
HIKVISION_HOSTS = [host.strip() for host in _hikvision_hosts_raw.split(",") if host.strip()]
HIKVISION_HOST = HIKVISION_HOSTS[0] if HIKVISION_HOSTS else ""
HIKVISION_USERNAME = os.getenv("HIKVISION_USERNAME", "")
HIKVISION_PASSWORD = os.getenv("HIKVISION_PASSWORD", "")

# Signs the login session cookie. Set SESSION_SECRET_KEY in .env for real
# deployments — this fallback is stable across dev restarts but is not secret.
SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "uzyolbutlash-dev-session-secret-change-me")
