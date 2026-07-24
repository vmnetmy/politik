#!/usr/bin/env python3
"""Build a deterministic integrity manifest for every published data artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


CORE_DATA_FILES = {
    "election.json": "seats",
    "changes.json": "changes",
    "affiliations.json": "affiliations",
    "candidate-changes.json": "candidateChanges",
}

CAPABILITY_DATA_FILES = {
    "seating": {"seating.json": "positions"},
    "voterAge": {"constituencies.json": "duns", "voter-age.json": "dunRecords"},
    "voterEthnicity": {"constituencies.json": "duns", "voter-age.json": "dunRecords", "voter-ethnicity.json": "records"},
    "geography": {"constituencies.json": "duns", "polling-places.json": "pollingDistricts", "geography.json": "pdms"},
    "scoresheets": {"polling-places.json": "pollingDistricts", "scoresheets/index.json": "seats"},
}

ALL_DATA_FILES = {
    "election.json": "seats",
    "seating.json": "positions",
    "changes.json": "changes",
    "affiliations.json": "affiliations",
    "candidate-changes.json": "candidateChanges",
    "constituencies.json": "duns",
    "voter-age.json": "dunRecords",
    "voter-ethnicity.json": "records",
    "polling-places.json": "pollingDistricts",
    "geography.json": "pdms",
    "scoresheets/index.json": "seats",
}

REFERENCE_FILES = {
    "alliances.json": "alliances",
    "parties.json": "parties",
    "persons.json": "persons",
    "person-matches.json": "matches",
}

BOUNDARY_FILES = {
    "semenanjung-2018/negeri-sembilan-dun.json": "features",
    "registry.json": "registryEntries",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/index.json": "atlasIndexFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/perlis.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/kedah.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/kelantan.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/terengganu.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/pulau-pinang.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/perak.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/pahang.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/selangor.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/wp-kuala-lumpur.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/wp-putrajaya.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/negeri-sembilan.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/melaka.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/johor.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/wp-labuan.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/sabah.json": "atlasFeatures",
    "my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/sarawak.json": "atlasFeatures",
}


def build_collection_manifest(directory: Path, data_files: dict[str, str]) -> dict[str, Any]:
    files: dict[str, Any] = {}
    for filename, collection_key in data_files.items():
        path = directory / filename
        raw = path.read_bytes()
        value = json.loads(raw)
        if collection_key == "atlasFeatures":
            collection = (
                value.get("layers", {}).get("parliament", {}).get("features", [])
                + value.get("layers", {}).get("dun", {}).get("features", [])
            )
        elif collection_key == "atlasIndexFeatures":
            collection = value.get("layers", {}).get("parliament", {}).get("features", [])
        elif collection_key == "registryEntries":
            collection = [
                *value.get("federal", {}).values(),
                *value.get("stateAssemblies", {}).values(),
            ]
        else:
            collection = value.get(collection_key, [])
        if not isinstance(collection, list):
            raise ValueError(f"{filename} must contain a {collection_key} array.")
        files[filename] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "records": len(collection),
        }
    return {"version": 1, "algorithm": "sha256", "files": files}


def build(data_directory: Path, capabilities: dict[str, bool] | None = None) -> dict[str, Any]:
    expected = set(CORE_DATA_FILES)
    if capabilities is None:
        expected.update(filename for filename in ALL_DATA_FILES if (data_directory / filename).exists())
    else:
        for capability, enabled in capabilities.items():
            if enabled:
                expected.update(CAPABILITY_DATA_FILES.get(capability, {}))
    data_files = {filename: collection for filename, collection in ALL_DATA_FILES.items() if filename in expected}
    files: dict[str, Any] = {}
    for filename, collection_key in data_files.items():
        path = data_directory / filename
        raw = path.read_bytes()
        value = json.loads(raw)
        collection = value.get(collection_key, [])
        if not isinstance(collection, list):
            raise ValueError(f"{filename} must contain a {collection_key} array.")
        files[filename] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "records": len(collection),
        }
    scoresheet_directory = data_directory / "scoresheets"
    scoresheets_enabled = capabilities is None and scoresheet_directory.exists() or bool(capabilities and capabilities.get("scoresheets"))
    for path in sorted(scoresheet_directory.glob("P.*.json")) if scoresheets_enabled else []:
        relative = path.relative_to(data_directory).as_posix()
        raw = path.read_bytes()
        value = json.loads(raw)
        collection = value.get("rows", [])
        if not isinstance(collection, list):
            raise ValueError(f"{relative} must contain a rows array.")
        files[relative] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "records": len(collection),
        }
    return {"version": 1, "algorithm": "sha256", "files": files}


def render(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the published data integrity manifest.")
    parser.add_argument("--data-directory", type=Path, default=Path("public/data/elections/pru-15"))
    parser.add_argument("--output", type=Path, default=Path("public/data/elections/pru-15/manifest.json"))
    parser.add_argument("--registry", type=Path, default=Path("public/data/elections/index.json"))
    parser.add_argument("--all", action="store_true", help="Generate or check every edition listed in the registry.")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--stdout", action="store_true")
    args = parser.parse_args()
    try:
        if args.all:
            if args.stdout:
                raise ValueError("--stdout cannot be combined with --all.")
            registry = json.loads(args.registry.read_text(encoding="utf-8"))
            for edition in registry.get("elections", []):
                data_directory = args.registry.parent.parent / edition["path"]
                output = data_directory / "manifest.json"
                rendered = render(build(data_directory, edition.get("capabilities", {})))
                if args.check:
                    if output.read_text(encoding="utf-8") != rendered:
                        raise ValueError(f"{output} is stale. Run npm run data:manifest.")
                else:
                    output.write_text(rendered, encoding="utf-8")
                    print(f"Wrote integrity manifest to {output}.")
            reference_directory = args.registry.parent.parent / "reference"
            reference_output = reference_directory / "manifest.json"
            reference_rendered = render(build_collection_manifest(reference_directory, REFERENCE_FILES))
            if args.check:
                if reference_output.read_text(encoding="utf-8") != reference_rendered:
                    raise ValueError(f"{reference_output} is stale. Run npm run data:manifest.")
            else:
                reference_output.write_text(reference_rendered, encoding="utf-8")
                print(f"Wrote integrity manifest to {reference_output}.")
            boundary_directory = args.registry.parent.parent / "boundaries"
            boundary_output = boundary_directory / "manifest.json"
            boundary_rendered = render(build_collection_manifest(boundary_directory, BOUNDARY_FILES))
            if args.check:
                if boundary_output.read_text(encoding="utf-8") != boundary_rendered:
                    raise ValueError(f"{boundary_output} is stale. Run npm run data:manifest.")
            else:
                boundary_output.write_text(boundary_rendered, encoding="utf-8")
                print(f"Wrote integrity manifest to {boundary_output}.")
            if args.check:
                print("All election, reference and boundary data integrity manifests are current.")
            return 0
        rendered = render(build(args.data_directory))
        if args.stdout:
            print(rendered, end="")
            return 0
        if args.check:
            if args.output.read_text(encoding="utf-8") != rendered:
                raise ValueError(f"{args.output} is stale. Run npm run data:manifest.")
            print("Published data integrity manifest is current.")
            return 0
        args.output.write_text(rendered, encoding="utf-8")
        print(f"Wrote integrity manifest to {args.output}.")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
