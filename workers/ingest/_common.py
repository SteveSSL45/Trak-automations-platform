"""Shared helpers for the daily ingest scripts.

Single source of truth for:
- Where credentials live (Tauri's app data dir on macOS).
- Where SQLite snapshots get written (same place — keeps everything per-client
  in one tree, simplifies backup + Phase 7 launchd cron).
- Loading google-auth Credentials from the Tauri-written JSON.
- Opening per-client SQLite databases in WAL mode.
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# macOS app data dir for Tauri identifier com.trakautomations.dashboard.
# Override via TRAK_DATA_DIR env var if testing or running from a different
# host (CI, container, etc.).
DEFAULT_DATA_DIR = Path.home() / "Library" / "Application Support" / "com.trakautomations.dashboard"
DATA_DIR = Path(os.environ.get("TRAK_DATA_DIR", DEFAULT_DATA_DIR))
CLIENTS_DIR = DATA_DIR / "clients"
CLIENTS_CONFIG = DATA_DIR / "clients.json"


def read_clients_config() -> list[dict]:
    """Read the dashboard-managed list of clients (added via the Tauri UI).

    Returns empty list if the file doesn't exist (operator hasn't launched
    the dashboard yet — Tauri seeds the file on first read).
    """
    import json

    if not CLIENTS_CONFIG.exists():
        return []
    return json.loads(CLIENTS_CONFIG.read_text())


def find_client(client_id: str) -> dict | None:
    for c in read_clients_config():
        if c.get("id") == client_id:
            return c
    return None


def credentials_path(client_id: str, provider: str) -> Path:
    return CLIENTS_DIR / client_id / f"credentials_{provider}.json"


def db_path(client_id: str, source: str) -> Path:
    return CLIENTS_DIR / client_id / f"{source}_snapshots.db"


def load_credentials(client_id: str, provider: str) -> Credentials:
    """Load OAuth credentials written by the dashboard's token-bridge step.
    google-auth's Credentials class handles access-token refresh transparently
    on first request — we eagerly call refresh() here so a 401 surfaces early
    rather than mid-API-call.
    """
    path = credentials_path(client_id, provider)
    if not path.exists():
        raise FileNotFoundError(
            f"missing {path}\n"
            f"complete the OAuth grant for {client_id} × {provider} in the dashboard first"
        )
    raw = json.loads(path.read_text())
    creds = Credentials(
        token=None,  # access_token unset; refresh fetches one
        refresh_token=raw["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=raw["client_id"],
        client_secret=raw["client_secret"],
        scopes=raw.get("scopes", []),
    )
    creds.refresh(Request())
    return creds


def open_db(client_id: str, source: str) -> sqlite3.Connection:
    """Open (creating if needed) the per-client SQLite DB for a given source."""
    path = db_path(client_id, source)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode = WAL")
    return conn
