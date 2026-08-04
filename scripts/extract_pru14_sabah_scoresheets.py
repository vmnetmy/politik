#!/usr/bin/env python3
"""Publish Sabah Assembly-15 polling-stream results from the PRU-14 SPR archive."""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

try:
    from .extract_pru14_dun_scoresheets import apply_authoritative_results, build_selected_artifacts
    from .extract_scoresheets import ScoresheetExtractionError, serialise, write_or_check
except ImportError:
    from extract_pru14_dun_scoresheets import apply_authoritative_results, build_selected_artifacts  # type: ignore[no-redef]
    from extract_scoresheets import ScoresheetExtractionError, serialise, write_or_check  # type: ignore[no-redef]


EVENT_ID = "prn-sabah-2018"


def build_artifacts(source_root: Path, state_elections_path: Path):
    return build_selected_artifacts(
        source_root,
        state_elections_path,
        event_ids={EVENT_ID},
        publication_title="Liputan helaian mata SPR DUN Sabah Ke-15 (PRU-14)",
        source_root_label="sources/pru14/sabah-assembly-15-scoresheets",
        scope_note="All 60 Sabah Assembly-15 constituencies contested concurrently with PRU-14 using the pre-2019 constituency registry.",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract Sabah Assembly-15 SPR XLSX scoresheets from PRU-14.")
    parser.add_argument("--source-root", type=Path, default=Path("sources/pru14/sabah-assembly-15-scoresheets"))
    parser.add_argument("--state-elections", type=Path, default=Path("public/data/state-elections.json"))
    parser.add_argument("--output-directory", type=Path, default=Path("public/data/state-election-scoresheets/prn-15"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        manifest, index, results = build_artifacts(args.source_root, args.state_elections)
        state_elections = json.loads(args.state_elections.read_text(encoding="utf-8"))
        apply_authoritative_results(state_elections, results)
        outputs = [
            (args.source_root / "manifest.json", serialise(manifest)),
            (args.output_directory / "index.json", serialise(index)),
            (args.state_elections, serialise(state_elections, compact=True)),
        ]
        outputs.extend(
            (args.output_directory / result["stateId"] / f"{result['dunCode']}.json", serialise(result, compact=True))
            for result in results.values()
        )
        for path, content in outputs:
            write_or_check(path, content, args.check)
        if not args.check:
            expected = {f"{result['stateId']}/{result['dunCode']}.json" for result in results.values()}
            for stale in args.output_directory.glob("*/*.json"):
                if stale.relative_to(args.output_directory).as_posix() not in expected:
                    stale.unlink()
        action = "Validated" if args.check else "Wrote"
        print(
            f"{action} {len(results)} Sabah Assembly-15 scoresheets, "
            f"{index['metadata']['totalRows']} polling streams; "
            f"{index['metadata']['rejectedSourceCount']} sources rejected."
        )
        return 0
    except (OSError, KeyError, TypeError, zipfile.BadZipFile, json.JSONDecodeError, ScoresheetExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
