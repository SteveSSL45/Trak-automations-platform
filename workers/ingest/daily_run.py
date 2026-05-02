"""Daily orchestrator: ingest → dossier → notify.

Runs every weekday at 6 AM via launchd (see scripts/install_launchd.sh).
Manual: python -m ingest.daily_run [--client <id>] [--date YYYY-MM-DD].

Discovers clients by scanning app_data_dir/clients/<id>/credentials_*.json.
For each client with creds, runs GSC + GA4 ingest, then builds the dossier.
At the end fires a single macOS notification banner via osascript.

When the swarm goes live, add a swarm_orchestrator step between dossier
and notification (search for "SWARM_HOOK" below).
"""
from __future__ import annotations

import argparse
import datetime as dt
import logging
import shlex
import subprocess
import sys
import time
from pathlib import Path

from ._common import CLIENTS_DIR, credentials_path
from . import dossier_builder, ga4, gsc

LOG_DIR = Path.home() / "Library" / "Logs" / "trak-automations"
LOG_FILE = LOG_DIR / "daily.log"

# Per-client property metadata. Phase 3 v1.5 will move this to
# clients/<id>/client_config.json — for Phase 7 thin slice we hardcode.
CLIENT_PROPERTIES: dict[str, dict[str, str]] = {
    "trak-automations": {
        "gsc_site": "sc-domain:trakautomations.com",
        "ga4_property_id": "535548482",
    },
    # Add more as clients onboard:
    # "lawn-care-co":     {"gsc_site": "...", "ga4_property_id": "..."},
    # "home-improvement-co": {"gsc_site": "...", "ga4_property_id": "..."},
}


def _setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("daily_run")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.FileHandler(LOG_FILE)
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        )
        logger.addHandler(handler)
        # Also log to stdout when run interactively
        stream = logging.StreamHandler(sys.stdout)
        stream.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(stream)
    return logger


def discover_clients() -> list[str]:
    if not CLIENTS_DIR.exists():
        return []
    return sorted(
        d.name
        for d in CLIENTS_DIR.iterdir()
        if d.is_dir() and (d / "credentials_gsc.json").exists()
    )


def notify(title: str, body: str) -> None:
    """Show a native macOS notification banner. Best-effort — fail silently."""
    safe_title = title.replace('"', "'")
    safe_body = body.replace('"', "'")
    script = f'display notification "{safe_body}" with title "{safe_title}"'
    try:
        subprocess.run(["osascript", "-e", script], check=False, timeout=5)
    except Exception:
        pass


def run_for_client(client_id: str, target_day: dt.date, logger: logging.Logger) -> bool:
    """Run the full pipeline for one client. Returns True on success."""
    props = CLIENT_PROPERTIES.get(client_id)
    if not props:
        logger.warning(
            f"  {client_id}: no entry in CLIENT_PROPERTIES — skipping. "
            f"Add gsc_site + ga4_property_id to daily_run.py."
        )
        return False

    success = True

    # GSC
    gsc_creds = credentials_path(client_id, "gsc")
    if gsc_creds.exists():
        try:
            sys.argv = [
                "ingest.gsc",
                client_id,
                "--site",
                props["gsc_site"],
                "--date",
                target_day.isoformat(),
            ]
            gsc.main()
            logger.info(f"  {client_id} · GSC ingest OK")
        except Exception as e:
            logger.error(f"  {client_id} · GSC ingest FAILED: {e}")
            success = False
    else:
        logger.info(f"  {client_id} · GSC creds missing — skip")

    # GA4
    ga4_creds = credentials_path(client_id, "ga4")
    if ga4_creds.exists():
        try:
            sys.argv = [
                "ingest.ga4",
                client_id,
                "--property-id",
                props["ga4_property_id"],
                "--date",
                target_day.isoformat(),
            ]
            ga4.main()
            logger.info(f"  {client_id} · GA4 ingest OK")
        except Exception as e:
            logger.error(f"  {client_id} · GA4 ingest FAILED: {e}")
            success = False
    else:
        logger.info(f"  {client_id} · GA4 creds missing — skip")

    # Dossier
    try:
        sys.argv = ["ingest.dossier_builder", client_id, "--date", target_day.isoformat()]
        dossier_builder.main()
        logger.info(f"  {client_id} · dossier OK")
    except Exception as e:
        logger.error(f"  {client_id} · dossier FAILED: {e}")
        success = False

    # SWARM_HOOK: when LoRA adapters are trained, add the swarm_orchestrator
    # call here. Until then it's intentionally a stub.

    return success


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument(
        "--client",
        help="Run for one client only. Default: all clients with creds.",
    )
    ap.add_argument(
        "--date",
        help="ISO date (defaults to yesterday)",
    )
    ap.add_argument(
        "--no-notify",
        action="store_true",
        help="Skip the macOS notification (useful for manual runs)",
    )
    args = ap.parse_args()

    logger = _setup_logging()
    started = time.time()

    target_day = (
        dt.date.fromisoformat(args.date) if args.date else dt.date.today() - dt.timedelta(days=1)
    )

    clients = [args.client] if args.client else discover_clients()
    if not clients:
        logger.warning("No clients with credentials found — nothing to do.")
        return 0

    logger.info(f"=== daily_run · date={target_day} · clients={clients}")

    succeeded: list[str] = []
    failed: list[str] = []
    for cid in clients:
        try:
            ok = run_for_client(cid, target_day, logger)
            (succeeded if ok else failed).append(cid)
        except Exception as e:
            logger.error(f"  {cid} · UNCAUGHT: {e}")
            failed.append(cid)

    elapsed = time.time() - started
    summary = (
        f"daily_run done in {elapsed:.1f}s · {len(succeeded)} ok"
        + (f", {len(failed)} failed" if failed else "")
    )
    logger.info(f"=== {summary}")

    if not args.no_notify:
        if failed:
            notify(
                "Trak Automations · daily run partial",
                f"{len(succeeded)} ok, {len(failed)} failed. Check logs.",
            )
        else:
            notify(
                "Trak Automations · today's plans ready",
                f"{len(succeeded)} client(s) processed. Open dashboard to review.",
            )

    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
