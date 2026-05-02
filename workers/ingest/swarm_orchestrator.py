"""Run the 8-stage swarm chain against a per-client dossier.

Phase 5 thin slice: stub mode only. Operator's LoRA adapters aren't trained
yet, so this script:

  1. Loads the dossier JSON for a given client+date
  2. Walks the 8 prompts/<stage>/system.md files in order
  3. Validates each stage's prompt file exists and has the right header
  4. Prints what *would* be sent to Ollama (--dry-run, the only mode for now)

When the adapters are ready, drop the --dry-run flag and the orchestrator
will call Ollama for real. Refactor needed: ~30 lines around the
`run_stage()` function below — replace the dry-run print with an HTTP
call to http://localhost:11434/api/chat.

Run:
  python -m ingest.swarm_orchestrator <client-id> [--date YYYY-MM-DD] [--dry-run]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any

from ._common import CLIENTS_DIR

REPO_ROOT = Path(__file__).resolve().parents[2]
PROMPTS_DIR = REPO_ROOT / "prompts"

STAGES = [
    ("01_keyword_serp_analyst", ("gsc_daily", "gsc_weekly")),
    ("02_technical_seo_auditor", ("crawl", "pagespeed")),
    ("03_content_strategist", ("gsc_weekly", "ga4_daily")),
    ("04_onpage_optimizer", ("crawl", "gsc_daily")),
    ("05_link_strategist", ("ahrefs", "competitors")),
    ("06_competitor_analyst", ("competitors", "gsc_weekly")),
    ("07_strategy_synthesizer", "__upstream__"),  # gets stages 1-6 outputs
    ("08_executor", "__upstream__"),               # gets stages 1-7 outputs
]


def load_dossier(client_id: str, target_day: dt.date) -> dict[str, Any]:
    path = CLIENTS_DIR / client_id / "dossiers" / f"{target_day.isoformat()}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"missing {path}\n"
            f"build the dossier first: "
            f"python -m ingest.dossier_builder {client_id} --date {target_day.isoformat()}"
        )
    return json.loads(path.read_text())


def load_system_prompt(stage_dir: str) -> str:
    path = PROMPTS_DIR / stage_dir / "system.md"
    if not path.exists():
        raise FileNotFoundError(f"missing prompt: {path}")
    text = path.read_text()
    # Validate the file looks like a stage prompt (has the `# Stage NN:` header)
    if not text.lstrip().startswith("# Stage"):
        raise ValueError(
            f"{path} does not start with '# Stage' header — looks malformed"
        )
    return text


def slice_dossier(dossier: dict[str, Any], inputs: tuple[str, ...] | str) -> dict[str, Any]:
    """Return only the dossier fields a given stage needs."""
    if inputs == "__upstream__":
        return {}  # synthesizer/executor get upstream stage outputs, not raw dossier
    return {k: dossier.get(k) for k in inputs}


def run_stage(
    stage_dir: str,
    inputs: tuple[str, ...] | str,
    dossier: dict[str, Any],
    upstream: dict[str, Any],
    dry_run: bool,
) -> dict[str, Any]:
    system_prompt = load_system_prompt(stage_dir)
    if inputs == "__upstream__":
        user_input: dict[str, Any] = {"dossier_meta": _dossier_meta(dossier), "upstream": upstream}
    else:
        user_input = slice_dossier(dossier, inputs)

    if dry_run:
        return _dry_run_print(stage_dir, system_prompt, user_input)

    raise NotImplementedError(
        f"{stage_dir}: real Ollama call not implemented yet — "
        f"adapters not trained. Use --dry-run."
    )


def _dossier_meta(d: dict[str, Any]) -> dict[str, Any]:
    return {k: d.get(k) for k in ("schema_version", "client_id", "date", "data_freshness")}


def _dry_run_print(stage_dir: str, system_prompt: str, user_input: dict[str, Any]) -> dict[str, Any]:
    header = system_prompt.splitlines()[0].lstrip("# ").strip()
    print(f"\n── {stage_dir} ── {header}")
    print(f"   system prompt: prompts/{stage_dir}/system.md ({len(system_prompt)} chars)")
    keys = sorted(user_input.keys())
    print(f"   user input keys: {keys}")
    for k in keys:
        v = user_input[k]
        if v is None:
            print(f"     {k}: (no data)")
        elif isinstance(v, dict):
            inner_keys = sorted(v.keys())
            print(f"     {k}: dict with keys {inner_keys}")
        elif isinstance(v, list):
            print(f"     {k}: list with {len(v)} items")
        else:
            print(f"     {k}: {type(v).__name__}")
    return {"stage": stage_dir, "stub_only": True}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("client_id")
    ap.add_argument("--date", help="ISO date (defaults to yesterday)")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print intended calls without invoking Ollama. Required until LoRAs are trained.",
    )
    args = ap.parse_args()

    target_day = (
        dt.date.fromisoformat(args.date) if args.date else dt.date.today() - dt.timedelta(days=1)
    )

    dossier = load_dossier(args.client_id, target_day)
    print(
        f"Swarm orchestrator · client={args.client_id} · date={target_day} "
        f"· schema={dossier.get('schema_version')} · dry_run={args.dry_run}"
    )

    if not args.dry_run:
        print(
            "ERROR: real swarm execution not implemented yet — LoRA adapters "
            "not trained. Re-run with --dry-run.",
            file=sys.stderr,
        )
        return 2

    upstream: dict[str, Any] = {}
    for stage_dir, inputs in STAGES:
        upstream[stage_dir] = run_stage(stage_dir, inputs, dossier, upstream, args.dry_run)

    print(f"\n✓ All {len(STAGES)} stages walked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
