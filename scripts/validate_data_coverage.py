#!/usr/bin/env python3
"""Validate coverage metadata, geography hierarchy and immutable boundary snapshots."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
GEOGRAPHY_PATH = ROOT / "public/data/elections/pru-15/geography.json"
CONSTITUENCIES_PATH = ROOT / "public/data/elections/pru-15/constituencies.json"
BOUNDARY_ROOT = ROOT / "public/data/boundaries"
BOUNDARY_REGISTRY_PATH = BOUNDARY_ROOT / "registry.json"
LOCALITY_SOURCE_PATHS = (
    ROOT / "sources/spr/geography/localities.json",
    ROOT / "sources/spr/geography/localities.extracted.json",
)


class CoverageValidationError(ValueError):
    pass


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_geography(geography: dict[str, Any], constituencies: dict[str, Any]) -> None:
    metadata = geography["metadata"]
    pdms = geography["pdms"]
    localities = geography["localities"]
    pdm_by_id = {item["id"]: item for item in pdms}
    locality_by_id = {item["id"]: item for item in localities}
    if len(pdm_by_id) != len(pdms):
        raise CoverageValidationError("PDM IDs must be unique.")
    if len(locality_by_id) != len(localities):
        raise CoverageValidationError("Locality IDs must be unique.")

    state_ids = {item["id"] for item in constituencies["states"]}
    parliament_codes = {item["code"] for item in constituencies["parliaments"]}
    dun_ids = {item["id"] for item in constituencies["duns"]}
    for pdm in pdms:
        if pdm["stateId"] not in state_ids or pdm["parliamentCode"] not in parliament_codes:
            raise CoverageValidationError(f"PDM {pdm['id']} has an unknown state or Parliament parent.")
        if pdm["dunId"] is not None and pdm["dunId"] not in dun_ids:
            raise CoverageValidationError(f"PDM {pdm['id']} has an unknown DUN parent.")
        if len(pdm["localityIds"]) != len(set(pdm["localityIds"])):
            raise CoverageValidationError(f"PDM {pdm['id']} contains duplicate locality references.")
        for locality_id in pdm["localityIds"]:
            locality = locality_by_id.get(locality_id)
            if locality is None or locality["pdmId"] != pdm["id"]:
                raise CoverageValidationError(f"PDM {pdm['id']} has a broken locality reference.")

    known_source_ids: set[str] = set()
    for source_path in LOCALITY_SOURCE_PATHS:
        source_artifact = read_json(source_path)
        for source in source_artifact.get("sources", []):
            if source["id"] in known_source_ids:
                raise CoverageValidationError(f"Duplicate locality source ID {source['id']}.")
            known_source_ids.add(source["id"])
    for locality in localities:
        pdm = pdm_by_id.get(locality["pdmId"])
        if pdm is None:
            raise CoverageValidationError(f"Locality {locality['id']} has an unknown PDM parent.")
        if (
            locality["stateId"] != pdm["stateId"]
            or locality["parliamentCode"] != pdm["parliamentCode"]
            or locality["dunId"] != pdm["dunId"]
        ):
            raise CoverageValidationError(f"Locality {locality['id']} does not match its PDM hierarchy.")
        if not locality["sourceRefs"]:
            raise CoverageValidationError(f"Locality {locality['id']} has no official source reference.")
        if any(reference["id"] not in known_source_ids for reference in locality["sourceRefs"]):
            raise CoverageValidationError(f"Locality {locality['id']} references an unknown source.")

    covered_pdms = [item for item in pdms if item["localityIds"]]
    expected_coverage = round(len(covered_pdms) / len(pdms) * 100, 4)
    expected_by_state = {
        state_id: {
            "pdmCount": sum(item["stateId"] == state_id for item in pdms),
            "coveredPdmCount": sum(item["stateId"] == state_id and bool(item["localityIds"]) for item in pdms),
        }
        for state_id in sorted(state_ids)
    }
    expected_metadata = {
        "stateCount": len({item["stateId"] for item in pdms}),
        "parliamentCount": len({item["parliamentCode"] for item in pdms}),
        "dunCount": len({item["dunId"] for item in pdms if item["dunId"]}),
        "pdmCount": len(pdms),
        "scoresheetPdmCount": sum(bool(item["hasScoresheet"]) for item in pdms),
        "localityCount": len(localities),
        "localityPdmCount": len(covered_pdms),
        "localityCoveragePct": expected_coverage,
        "localityConflictCount": len(geography.get("localityConflicts", [])),
        "localityCoverageByState": expected_by_state,
    }
    for key, expected in expected_metadata.items():
        if metadata.get(key) != expected:
            raise CoverageValidationError(f"Geography metadata {key} is stale.")
    if metadata["localityConflictCount"] != 0:
        raise CoverageValidationError("Locality conflicts must be resolved before publication.")


def election_dates(snapshot: dict[str, Any]) -> dict[str, str]:
    if snapshot["scope"] == "federal":
        return {state_id: snapshot["electionDate"] for state_id in snapshot["states"]}
    return {event["stateId"]: event["electionDate"] for event in snapshot["events"]}


def validate_boundary_entry(
    entry_id: str,
    entry: dict[str, Any],
    *,
    boundary_root: Path,
    state_cache: dict[str, dict[str, Any]],
) -> None:
    snapshot_path = boundary_root / entry["snapshotFile"]
    if not snapshot_path.exists():
        raise CoverageValidationError(f"{entry_id} snapshot file does not exist.")
    snapshot = read_json(snapshot_path)
    dates = election_dates(snapshot)
    registry_states = entry.get("states", {})
    if set(registry_states) != set(snapshot["states"]):
        raise CoverageValidationError(f"{entry_id} registry and snapshot state coverage differ.")

    statuses: list[str] = []
    for state_id, snapshot_state in snapshot["states"].items():
        registry_state = registry_states[state_id]
        statuses.append(snapshot_state["status"])
        for key in ("boundaryVersion", "effectiveFrom", "status", "stateFile", "geometrySha256", "constituencyCount"):
            if registry_state.get(key) != snapshot_state.get(key):
                raise CoverageValidationError(f"{entry_id} {state_id} has inconsistent {key}.")
        if snapshot_state["status"] == "identity-only":
            if snapshot_state.get("stateFile") is not None or snapshot_state.get("geometrySha256") is not None:
                raise CoverageValidationError(f"{entry_id} {state_id} identity-only coverage must not claim geometry.")
            if not snapshot_state.get("constituencyCount"):
                raise CoverageValidationError(f"{entry_id} {state_id} identity-only coverage has no constituency count.")
            continue
        state_path = boundary_root / snapshot_state["stateFile"]
        if not state_path.exists() or sha256(state_path) != snapshot_state["geometrySha256"]:
            raise CoverageValidationError(f"{entry_id} {state_id} geometry hash does not match.")
        state_artifact = state_cache.setdefault(str(state_path), read_json(state_path))
        if state_artifact["state"]["id"] != state_id:
            raise CoverageValidationError(f"{entry_id} {state_id} geometry has the wrong state identity.")
        metadata = state_artifact["metadata"]
        if (
            metadata["parliamentFeatureCount"] != snapshot_state["parliamentFeatureCount"]
            or metadata["dunFeatureCount"] != snapshot_state["dunFeatureCount"]
        ):
            raise CoverageValidationError(f"{entry_id} {state_id} feature counts do not match.")
        if snapshot_state["status"] == "exact" and snapshot_state["effectiveFrom"] > dates[state_id]:
            raise CoverageValidationError(f"{entry_id} {state_id} exact boundary became effective after election day.")

    expected_status = "exact" if all(status == "exact" for status in statuses) else "compatible"
    if entry["status"] != expected_status:
        raise CoverageValidationError(f"{entry_id} aggregate boundary status is inconsistent.")


def validate_boundaries(registry: dict[str, Any], boundary_root: Path) -> None:
    if registry.get("version") != 3:
        raise CoverageValidationError("Boundary registry version 3 is required.")
    state_cache: dict[str, dict[str, Any]] = {}
    for election_id, entry in registry["federal"].items():
        validate_boundary_entry(election_id, entry, boundary_root=boundary_root, state_cache=state_cache)
    for assembly_number, entry in registry["stateAssemblies"].items():
        validate_boundary_entry(f"prn-{assembly_number}", entry, boundary_root=boundary_root, state_cache=state_cache)


def validate_all(
    geography_path: Path = GEOGRAPHY_PATH,
    constituencies_path: Path = CONSTITUENCIES_PATH,
    boundary_registry_path: Path = BOUNDARY_REGISTRY_PATH,
    boundary_root: Path = BOUNDARY_ROOT,
) -> None:
    validate_geography(read_json(geography_path), read_json(constituencies_path))
    validate_boundaries(read_json(boundary_registry_path), boundary_root)


def main() -> int:
    try:
        validate_all()
        print("Coverage governance is valid: geography, locality sources and boundary snapshots are consistent.")
        return 0
    except (CoverageValidationError, KeyError, OSError, json.JSONDecodeError) as error:
        print(f"Coverage validation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
