#!/usr/bin/env python3
"""Publish nationwide SPR Parliament and DUN boundaries for the election atlas."""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path
from typing import Any

from extract_election_boundaries import (
    BoundaryError,
    SOURCE_PATH,
    SOURCE_URL,
    description_fields,
    fetch_source,
    normalise,
    parse_coordinates,
    sha256,
    simplify_ring,
)


ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "public/data/elections/pru-15/constituencies.json"
STATE_EVENTS_PATH = ROOT / "sources/spr/state-elections/events.json"
BOUNDARY_DIRECTORY_NAME = "my-sarawak-2015-peninsula-2018-sabah-2019"
ATLAS_DIRECTORY = ROOT / f"public/data/boundaries/{BOUNDARY_DIRECTORY_NAME}/atlas"
INDEX_PATH = ATLAS_DIRECTORY / "index.json"
BOUNDARY_REGISTRY_PATH = ROOT / "public/data/boundaries/registry.json"
LEGACY_OUTPUT_PATH = ROOT / "public/data/boundaries/malaysia-2018/election-atlas.json"
BOUNDARY_VERSION = "my-sarawak-2015-peninsula-2018-sabah-2019"
SIMPLIFY_TOLERANCE_DEGREES = 0.0007
INDEX_SIMPLIFY_TOLERANCE_DEGREES = 0.01
EXPECTED_PARLIAMENTS = 222
EXPECTED_DUNS = 600

PENINSULA_STATE_IDS = {
    "perlis",
    "kedah",
    "kelantan",
    "terengganu",
    "pulau-pinang",
    "perak",
    "pahang",
    "selangor",
    "wp-kuala-lumpur",
    "wp-putrajaya",
    "negeri-sembilan",
    "melaka",
    "johor",
    "wp-labuan",
}

BOUNDARY_PROVENANCE = {
    "peninsula": {
        "boundaryVersion": "my-peninsula-2018",
        "effectiveFrom": "2018-03-29",
        "orderReference": "Kajian Semula Persempadanan Negeri-Negeri Tanah Melayu 2018",
        "evidenceUrl": "https://spr.gov.my/utama-2/",
        "note": "Sempadan Negeri-Negeri Tanah Melayu yang berkuat kuasa sejak 29 Mac 2018.",
    },
    "sarawak": {
        "boundaryVersion": "my-sarawak-2015",
        "effectiveFrom": "2015-12-19",
        "orderReference": "P.U.(A) 299/2015",
        "evidenceUrl": "https://www.pmo.gov.my/ucapan/?id=4310&m=p&p=najib",
        "note": "Sempadan 82 DUN Sarawak berkuat kuasa mulai 19 Disember 2015.",
    },
    "sabah": {
        "boundaryVersion": "my-sabah-2019",
        "effectiveFrom": "2019-08-22",
        "orderReference": "P.U.(A) 225/2019",
        "evidenceUrl": "https://www.spr.gov.my/sites/default/files/Kenyataan%20Media%20UPDM%20Sabah%202019.pdf",
        "note": "Sempadan 73 DUN Sabah berkuat kuasa mulai 22 Ogos 2019.",
    },
}


def signed_area(ring: list[tuple[float, float]]) -> float:
    return sum(
        start[0] * end[1] - end[0] * start[1]
        for start, end in zip(ring, ring[1:])
    ) / 2


def orient_ring(ring: list[tuple[float, float]], *, outer: bool) -> list[tuple[float, float]]:
    """Use d3-geo's spherical winding convention: outer clockwise, holes anticlockwise."""
    should_reverse = (outer and signed_area(ring) > 0) or (not outer and signed_area(ring) < 0)
    return list(reversed(ring)) if should_reverse else ring


def rounded_ring(ring: list[tuple[float, float]], *, outer: bool) -> list[list[float]]:
    simplified = simplify_ring(ring, SIMPLIFY_TOLERANCE_DEGREES)
    oriented = orient_ring(simplified, outer=outer)
    return [[round(longitude, 5), round(latitude, 5)] for longitude, latitude in oriented]


def polygon_coordinates(element: ET.Element) -> list[list[list[list[float]]]]:
    polygons: list[list[list[list[float]]]] = []
    for polygon in element.iter():
        if not polygon.tag.endswith("Polygon"):
            continue
        rings: list[list[list[float]]] = []
        for boundary_name, outer in (("outerBoundaryIs", True), ("innerBoundaryIs", False)):
            for boundary in polygon:
                if not boundary.tag.endswith(boundary_name):
                    continue
                coordinate_node = next(
                    (node for node in boundary.iter() if node.tag.endswith("coordinates") and node.text),
                    None,
                )
                if coordinate_node is not None:
                    rings.append(rounded_ring(parse_coordinates(coordinate_node.text or ""), outer=outer))
        if rings:
            polygons.append(rings)
    return polygons


def state_aliases(name: str) -> set[str]:
    value = normalise(name)
    return {
        value,
        re.sub(r"^W P\s+", "", value),
        re.sub(r"^WILAYAH PERSEKUTUAN\s+", "", value),
    }


def read_geometry() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with zipfile.ZipFile(SOURCE_PATH) as archive:
        kml_name = next((name for name in archive.namelist() if name.lower().endswith(".kml")), None)
        if not kml_name:
            raise BoundaryError("No KML document was found inside the official SPR KMZ.")
        with archive.open(kml_name) as source:
            for _, element in ET.iterparse(source, events=("end",)):
                if not element.tag.endswith("Placemark"):
                    continue
                label = next((child.text or "" for child in element if child.tag.endswith("name")), "").strip()
                match = re.match(r"^([PN])\.\s*(\d+)\s+(.+)$", label, flags=re.IGNORECASE)
                if not match:
                    element.clear()
                    continue
                description = next((child.text or "" for child in element if child.tag.endswith("description")), "")
                fields = description_fields(description)
                polygons = polygon_coordinates(element)
                if not polygons:
                    raise BoundaryError(f"No polygon geometry was found for {label}.")
                layer = "parliament" if match.group(1).upper() == "P" else "dun"
                width = 3 if layer == "parliament" else 2
                records.append(
                    {
                        "layer": layer,
                        "code": f"{match.group(1).upper()}.{int(match.group(2)):0{width}d}",
                        "labelName": match.group(3).strip().upper(),
                        "stateName": fields.get("NAMA_NEGERI", "").strip().upper(),
                        "areaKm2": round(float(fields["LUAS_KILOMETER_PERSEGI"]), 3)
                        if fields.get("LUAS_KILOMETER_PERSEGI")
                        else None,
                        "polygons": polygons,
                    }
                )
                element.clear()
    return records


def geometry_object(polygons: list[list[list[list[float]]]]) -> dict[str, Any]:
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def build() -> dict[str, Any]:
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    states = registry["states"]
    state_lookup: dict[str, dict[str, Any]] = {}
    for state in states:
        for alias in state_aliases(state["name"]):
            state_lookup[alias] = state

    parliaments = {item["code"]: item for item in registry["parliaments"]}
    duns = {(item["stateId"], item["code"]): item for item in registry["duns"]}
    layers: dict[str, list[dict[str, Any]]] = {"parliament": [], "dun": []}

    for record in read_geometry():
        state = next(
            (state_lookup[alias] for alias in state_aliases(record["stateName"]) if alias in state_lookup),
            None,
        )
        if not state:
            raise BoundaryError(f"Cannot match SPR state {record['stateName']!r} to the constituency registry.")
        if record["layer"] == "parliament":
            reference = parliaments.get(record["code"])
        else:
            reference = duns.get((state["id"], record["code"]))
        if not reference:
            raise BoundaryError(f"Cannot match {state['id']} {record['code']} to the constituency registry.")
        if normalise(reference["name"]) != normalise(record["labelName"]):
            raise BoundaryError(
                f"Name mismatch for {state['id']} {record['code']}: "
                f"{reference['name']} != {record['labelName']}."
            )
        layers[record["layer"]].append(
            {
                "type": "Feature",
                "id": reference.get("id", reference["code"]),
                "properties": {
                    "id": reference.get("id", reference["code"]),
                    "code": reference["code"],
                    "name": reference["name"],
                    "stateId": state["id"],
                    "stateName": state["name"],
                    "parliamentCode": reference.get("parliamentCode"),
                    "areaKm2": record["areaKm2"],
                },
                "geometry": geometry_object(record["polygons"]),
            }
        )

    layers["parliament"].sort(key=lambda item: int(item["properties"]["code"].split(".")[1]))
    layers["dun"].sort(key=lambda item: (item["properties"]["stateId"], int(item["properties"]["code"].split(".")[1])))
    return {
        "version": 1,
        "metadata": {
            "title": "Sempadan pilihan raya Malaysia",
            "boundaryVersion": BOUNDARY_VERSION,
            "coordinateReference": "EPSG:4326",
            "sourceUrl": SOURCE_URL,
            "sourceSha256": sha256(SOURCE_PATH),
            "retrievedAt": date.today().isoformat(),
            "simplificationToleranceDegrees": SIMPLIFY_TOLERANCE_DEGREES,
            "parliamentFeatureCount": len(layers["parliament"]),
            "dunFeatureCount": len(layers["dun"]),
        },
        "states": [{"id": state["id"], "name": state["name"]} for state in states],
        "layers": {
            "parliament": {"type": "FeatureCollection", "features": layers["parliament"]},
            "dun": {"type": "FeatureCollection", "features": layers["dun"]},
        },
    }


def validate(artifact: dict[str, Any]) -> None:
    metadata = artifact.get("metadata", {})
    parliament_features = artifact.get("layers", {}).get("parliament", {}).get("features", [])
    dun_features = artifact.get("layers", {}).get("dun", {}).get("features", [])
    if metadata.get("boundaryVersion") != BOUNDARY_VERSION:
        raise BoundaryError("Atlas boundary version does not match the registered election boundary.")
    if len(parliament_features) != EXPECTED_PARLIAMENTS or metadata.get("parliamentFeatureCount") != EXPECTED_PARLIAMENTS:
        raise BoundaryError(f"Atlas requires exactly {EXPECTED_PARLIAMENTS} Parliament geometries.")
    if len(dun_features) != EXPECTED_DUNS or metadata.get("dunFeatureCount") != EXPECTED_DUNS:
        raise BoundaryError(f"Atlas requires exactly {EXPECTED_DUNS} DUN geometries.")
    if len(artifact.get("states", [])) != 16:
        raise BoundaryError("Atlas requires all 16 state and Federal Territory registry entries.")
    for layer, features in (("Parliament", parliament_features), ("DUN", dun_features)):
        ids = [feature["properties"]["id"] for feature in features]
        if len(ids) != len(set(ids)):
            raise BoundaryError(f"{layer} feature IDs must be unique.")
        if not all(
            feature.get("geometry", {}).get("type") in {"Polygon", "MultiPolygon"}
            and feature["properties"].get("stateId")
            and feature["properties"].get("code")
            for feature in features
        ):
            raise BoundaryError(f"Every {layer} feature requires governed geometry and registry properties.")


def simplify_published_ring(ring: list[list[float]], tolerance: float, *, outer: bool) -> list[list[float]]:
    points = [(float(point[0]), float(point[1])) for point in ring]
    simplified = simplify_ring(points, tolerance)
    oriented = orient_ring(simplified, outer=outer)
    return [[round(longitude, 4), round(latitude, 4)] for longitude, latitude in oriented]


def simplify_feature(feature: dict[str, Any], tolerance: float) -> dict[str, Any]:
    geometry = feature["geometry"]
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    simplified = [
        [simplify_published_ring(ring, tolerance, outer=index == 0) for index, ring in enumerate(polygon)]
        for polygon in polygons
    ]
    return {
        **feature,
        "geometry": {
            "type": "Polygon" if len(simplified) == 1 else "MultiPolygon",
            "coordinates": simplified[0] if len(simplified) == 1 else simplified,
        },
    }


def state_boundary_provenance(state_id: str) -> dict[str, str]:
    if state_id == "sarawak":
        region = "sarawak"
    elif state_id == "sabah":
        region = "sabah"
    elif state_id in PENINSULA_STATE_IDS:
        region = "peninsula"
    else:
        raise BoundaryError(f"No regional boundary provenance is registered for {state_id}.")
    return BOUNDARY_PROVENANCE[region]


def boundary_registry(states: list[dict[str, str]]) -> dict[str, Any]:
    state_files = {state["id"]: f"{BOUNDARY_DIRECTORY_NAME}/atlas/states/{state['id']}.json" for state in states}
    state_entries = {
        state["id"]: {
            **state_boundary_provenance(state["id"]),
            "status": "exact",
            "stateFile": state_files[state["id"]],
        }
        for state in states
    }
    exact = {
        "boundaryVersion": BOUNDARY_VERSION,
        "effectiveFrom": "2015-12-19",
        "status": "exact",
        "note": "Setiap negeri dipadankan kepada perintah persempadanan wilayah yang berkuat kuasa pada tarikh pilihan raya.",
        "stateFiles": state_files,
        "states": state_entries,
    }
    event_registry = json.loads(STATE_EVENTS_PATH.read_text(encoding="utf-8"))
    assembly_states: dict[str, set[str]] = {}
    for event in event_registry["events"]:
        assembly_states.setdefault(str(event["assemblyNumber"]), set()).add(event["stateId"])
    state_assemblies = {
        assembly_number: {
            **exact,
            "states": {state_id: state_entries[state_id] for state_id in sorted(event_state_ids)},
            "note": f"Sempadan tepat untuk {len(event_state_ids)} negeri yang diterbitkan bagi PRN-{assembly_number}.",
        }
        for assembly_number, event_state_ids in assembly_states.items()
    }
    return {
        "version": 2,
        "defaultBoundaryVersion": BOUNDARY_VERSION,
        "indexFile": f"{BOUNDARY_DIRECTORY_NAME}/atlas/index.json",
        "federal": {
            "pru-14": {**exact, "note": "Sempadan wilayah rasmi yang berkuat kuasa bagi PRU-14."},
            "pru-15": {**exact, "note": "Sempadan wilayah PRU-14 kekal berkuat kuasa bagi PRU-15."},
        },
        "stateAssemblies": state_assemblies,
    }


def publish_split(artifact: dict[str, Any]) -> None:
    ATLAS_DIRECTORY.mkdir(parents=True, exist_ok=True)
    states_directory = ATLAS_DIRECTORY / "states"
    states_directory.mkdir(parents=True, exist_ok=True)
    parliament_features = artifact["layers"]["parliament"]["features"]
    dun_features = artifact["layers"]["dun"]["features"]
    state_files: dict[str, str] = {}
    for state in artifact["states"]:
        state_id = state["id"]
        relative_file = f"states/{state_id}.json"
        state_files[state_id] = relative_file
        state_artifact = {
            "version": 1,
            "metadata": {
                **artifact["metadata"],
                "title": f"Sempadan pilihan raya {state['name']}",
                "stateId": state_id,
                "parliamentFeatureCount": sum(feature["properties"]["stateId"] == state_id for feature in parliament_features),
                "dunFeatureCount": sum(feature["properties"]["stateId"] == state_id for feature in dun_features),
            },
            "state": state,
            "layers": {
                "parliament": {
                    "type": "FeatureCollection",
                    "features": [feature for feature in parliament_features if feature["properties"]["stateId"] == state_id],
                },
                "dun": {
                    "type": "FeatureCollection",
                    "features": [feature for feature in dun_features if feature["properties"]["stateId"] == state_id],
                },
            },
        }
        (states_directory / f"{state_id}.json").write_text(
            json.dumps(state_artifact, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )

    index = {
        "version": 1,
        "metadata": {
            **artifact["metadata"],
            "title": "Indeks sempadan Atlas Pilihan Raya Malaysia",
            "dunFeatureCount": 0,
            "indexFeatureCount": len(parliament_features),
            "delivery": "national-index-plus-state-chunks",
        },
        "states": artifact["states"],
        "stateFiles": state_files,
        "layers": {
            "parliament": {
                "type": "FeatureCollection",
                "features": [simplify_feature(feature, INDEX_SIMPLIFY_TOLERANCE_DEGREES) for feature in parliament_features],
            },
            "dun": {"type": "FeatureCollection", "features": []},
        },
    }
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    BOUNDARY_REGISTRY_PATH.write_text(
        json.dumps(boundary_registry(artifact["states"]), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    LEGACY_OUTPUT_PATH.unlink(missing_ok=True)


def validate_published() -> None:
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    registry = json.loads(BOUNDARY_REGISTRY_PATH.read_text(encoding="utf-8"))
    if len(index.get("layers", {}).get("parliament", {}).get("features", [])) != EXPECTED_PARLIAMENTS:
        raise BoundaryError("National Atlas index requires 222 simplified Parliament geometries.")
    if index["metadata"]["sourceSha256"] != sha256(SOURCE_PATH):
        raise BoundaryError("Published Atlas index does not match the archived official KMZ.")
    parliament_total = 0
    dun_total = 0
    for state in index.get("states", []):
        path = ATLAS_DIRECTORY / index["stateFiles"][state["id"]]
        artifact = json.loads(path.read_text(encoding="utf-8"))
        parliament_total += len(artifact["layers"]["parliament"]["features"])
        dun_total += len(artifact["layers"]["dun"]["features"])
        if artifact["metadata"]["stateId"] != state["id"]:
            raise BoundaryError(f"State chunk identity mismatch for {state['id']}.")
    if parliament_total != EXPECTED_PARLIAMENTS or dun_total != EXPECTED_DUNS:
        raise BoundaryError(f"Split Atlas requires 222 Parliament and 600 DUN geometries, found {parliament_total} and {dun_total}.")
    if set(registry.get("federal", {})) != {"pru-14", "pru-15"}:
        raise BoundaryError("Boundary registry must cover both published federal editions.")
    event_registry = json.loads(STATE_EVENTS_PATH.read_text(encoding="utf-8"))
    for event in event_registry["events"]:
        assembly = registry.get("stateAssemblies", {}).get(str(event["assemblyNumber"]))
        state = assembly.get("states", {}).get(event["stateId"]) if assembly else None
        if not state or state.get("status") != "exact":
            raise BoundaryError(f"Boundary registry does not certify {event['id']} with exact state geometry.")
        if state.get("stateFile") != f"{BOUNDARY_DIRECTORY_NAME}/atlas/states/{event['stateId']}.json":
            raise BoundaryError(f"Boundary registry state file mismatch for {event['id']}.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Download the official SPR KMZ before extraction.")
    parser.add_argument("--check", action="store_true", help="Validate the published atlas artifact.")
    args = parser.parse_args()
    try:
        if args.refresh or not SOURCE_PATH.is_file():
            fetch_source()
        if args.check:
            validate_published()
            print("Validated split Atlas index, 16 state chunks, 222 Parliament and 600 DUN geometries.")
            return 0
        artifact = build()
        validate(artifact)
        publish_split(artifact)
        validate_published()
        size_kb = INDEX_PATH.stat().st_size / 1024
        print(f"Wrote the split national Atlas index ({size_kb:.0f} KB) and 16 lazy state chunks.")
        return 0
    except (BoundaryError, OSError, KeyError, ValueError, zipfile.BadZipFile) as error:
        print(f"Atlas boundary extraction failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
