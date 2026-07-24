#!/usr/bin/env python3
"""Extract governed, browser-ready DUN geometry from the official SPR KMZ."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://opendata.spr.gov.my/api/proxy-file?dataset_id=11"
SOURCE_PATH = ROOT / "sources/spr/boundaries/spr-boundaries-dataset-11.kmz"
OUTPUT_PATH = ROOT / "public/data/boundaries/semenanjung-2018/negeri-sembilan-dun.json"
STATE_ID = "negeri-sembilan"
STATE_NAME = "NEGERI SEMBILAN"
BOUNDARY_VERSION = "semenanjung-2018"
VIEWBOX_WIDTH = 1000
VIEWBOX_HEIGHT = 720
VIEWBOX_PADDING = 28
SIMPLIFY_TOLERANCE = 0.18


class BoundaryError(ValueError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalise(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]+", " ", ascii_value.upper()).strip()


def description_fields(value: str) -> dict[str, str]:
    rows = re.findall(
        r"<td[^>]*>\s*(.*?)\s*</td>\s*<td[^>]*>\s*(.*?)\s*</td>",
        value or "",
        flags=re.IGNORECASE | re.DOTALL,
    )
    fields: dict[str, str] = {}
    for raw_key, raw_value in rows:
        key = re.sub(r"<[^>]+>", "", raw_key).strip()
        item = re.sub(r"<[^>]+>", "", raw_value).strip()
        if key and item:
            fields[key] = item
    return fields


def parse_coordinates(value: str) -> list[tuple[float, float]]:
    points = []
    for token in value.strip().split():
        parts = token.split(",")
        if len(parts) >= 2:
            points.append((float(parts[0]), float(parts[1])))
    if len(points) < 4:
        raise BoundaryError("A polygon ring contains fewer than four coordinates.")
    return points


def mercator(point: tuple[float, float]) -> tuple[float, float]:
    longitude, latitude = point
    latitude = max(-85.05112878, min(85.05112878, latitude))
    radians = math.radians(latitude)
    return math.radians(longitude), math.log(math.tan(math.pi / 4 + radians / 2))


def point_segment_distance(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    px, py = point
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    if dx == 0 and dy == 0:
        return math.hypot(px - sx, py - sy)
    fraction = max(0.0, min(1.0, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (sx + fraction * dx), py - (sy + fraction * dy))


def rdp(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    distance, index = max(
        ((point_segment_distance(point, start, end), index) for index, point in enumerate(points[1:-1], 1)),
        default=(0.0, 0),
    )
    if distance <= tolerance:
        return [start, end]
    return rdp(points[: index + 1], tolerance)[:-1] + rdp(points[index:], tolerance)


def simplify_ring(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    ring = points[:-1] if points[0] == points[-1] else points[:]
    if len(ring) < 4:
        return points
    anchor = ring[0]
    split = max(range(1, len(ring)), key=lambda index: math.dist(anchor, ring[index]))
    first = rdp(ring[: split + 1], tolerance)
    second = rdp(ring[split:] + [anchor], tolerance)
    simplified = first + second[1:]
    return simplified if simplified[-1] == simplified[0] else simplified + [simplified[0]]


def polygon_centroid(points: list[tuple[float, float]]) -> tuple[float, float]:
    ring = points if points[0] == points[-1] else points + [points[0]]
    signed_area = 0.0
    x_total = 0.0
    y_total = 0.0
    for start, end in zip(ring, ring[1:]):
        cross = start[0] * end[1] - end[0] * start[1]
        signed_area += cross
        x_total += (start[0] + end[0]) * cross
        y_total += (start[1] + end[1]) * cross
    if abs(signed_area) < 1e-9:
        return sum(point[0] for point in ring[:-1]) / (len(ring) - 1), sum(point[1] for point in ring[:-1]) / (len(ring) - 1)
    return x_total / (3 * signed_area), y_total / (3 * signed_area)


def ring_area(points: list[tuple[float, float]]) -> float:
    ring = points if points[0] == points[-1] else points + [points[0]]
    return abs(sum(start[0] * end[1] - end[0] * start[1] for start, end in zip(ring, ring[1:]))) / 2


def format_number(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def path_from_rings(rings: list[list[tuple[float, float]]]) -> str:
    commands: list[str] = []
    for ring in rings:
        if len(ring) < 4:
            continue
        commands.append(f"M{format_number(ring[0][0])},{format_number(ring[0][1])}")
        commands.extend(f"L{format_number(x)},{format_number(y)}" for x, y in ring[1:-1])
        commands.append("Z")
    return "".join(commands)


def fetch_source() -> None:
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = SOURCE_PATH.with_suffix(".kmz.tmp")
    subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--location", "--output", str(temporary), SOURCE_URL],
        check=True,
    )
    if not zipfile.is_zipfile(temporary):
        temporary.unlink(missing_ok=True)
        raise BoundaryError("SPR boundary download is not a valid KMZ archive.")
    temporary.replace(SOURCE_PATH)


def read_official_duns() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with zipfile.ZipFile(SOURCE_PATH) as archive:
        kml_name = next((name for name in archive.namelist() if name.lower().endswith(".kml")), None)
        if not kml_name:
            raise BoundaryError("No KML document was found inside the official KMZ.")
        with archive.open(kml_name) as source:
            for _, element in ET.iterparse(source, events=("end",)):
                if not element.tag.endswith("Placemark"):
                    continue
                name = next((child.text or "" for child in element if child.tag.endswith("name")), "").strip()
                description = next((child.text or "" for child in element if child.tag.endswith("description")), "")
                fields = description_fields(description)
                if fields.get("NAMA_NEGERI", "").upper() != STATE_NAME or not re.match(r"^N\.\s*\d+", name, flags=re.IGNORECASE):
                    element.clear()
                    continue
                match = re.match(r"^(N\.)\s*(\d+)\s+(.+)$", name, flags=re.IGNORECASE)
                if not match:
                    raise BoundaryError(f"Cannot parse official DUN label {name!r}.")
                code = f"N.{int(match.group(2)):02d}"
                rings = [
                    parse_coordinates(child.text or "")
                    for child in element.iter()
                    if child.tag.endswith("coordinates") and child.text
                ]
                records.append(
                    {
                        "code": code,
                        "name": fields.get("NAMA_DUN", match.group(3)).strip().upper(),
                        "areaKm2": round(float(fields["LUAS_KILOMETER_PERSEGI"]), 3) if fields.get("LUAS_KILOMETER_PERSEGI") else None,
                        "rings": rings,
                    }
                )
                element.clear()
    return records


def build() -> dict[str, Any]:
    registry = json.loads((ROOT / "public/data/elections/pru-15/constituencies.json").read_text(encoding="utf-8"))
    state_duns = [item for item in registry["duns"] if item["stateId"] == STATE_ID]
    references = {item["code"]: item for item in state_duns}
    official = read_official_duns()
    if len(official) != 36 or len(references) != 36:
        raise BoundaryError(f"Expected 36 Negeri Sembilan DUN, found {len(official)} geometries and {len(references)} references.")
    if {item["code"] for item in official} != set(references):
        raise BoundaryError("Official geometry codes do not match the reusable constituency registry.")

    projected = [
        {
            **item,
            "rings": [[mercator(point) for point in ring] for ring in item["rings"]],
        }
        for item in official
    ]
    all_points = [point for item in projected for ring in item["rings"] for point in ring]
    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)
    scale = min(
        (VIEWBOX_WIDTH - 2 * VIEWBOX_PADDING) / (max_x - min_x),
        (VIEWBOX_HEIGHT - 2 * VIEWBOX_PADDING) / (max_y - min_y),
    )
    offset_x = (VIEWBOX_WIDTH - (max_x - min_x) * scale) / 2
    offset_y = (VIEWBOX_HEIGHT - (max_y - min_y) * scale) / 2

    def fit(point: tuple[float, float]) -> tuple[float, float]:
        return offset_x + (point[0] - min_x) * scale, VIEWBOX_HEIGHT - (offset_y + (point[1] - min_y) * scale)

    features = []
    for item in projected:
        reference = references[item["code"]]
        if normalise(reference["name"]) != normalise(item["name"]):
            raise BoundaryError(f"Name mismatch for {item['code']}: {reference['name']} != {item['name']}.")
        fitted_rings = [[fit(point) for point in ring] for ring in item["rings"]]
        simplified_rings = [simplify_ring(ring, SIMPLIFY_TOLERANCE) for ring in fitted_rings]
        largest_ring = max(simplified_rings, key=ring_area)
        centroid = polygon_centroid(largest_ring)
        feature_points = [point for ring in simplified_rings for point in ring]
        features.append(
            {
                "id": reference["id"],
                "code": reference["code"],
                "name": reference["name"],
                "parliamentCode": reference["parliamentCode"],
                "path": path_from_rings(simplified_rings),
                "centroid": [round(centroid[0], 2), round(centroid[1], 2)],
                "bounds": [
                    round(min(point[0] for point in feature_points), 2),
                    round(min(point[1] for point in feature_points), 2),
                    round(max(point[0] for point in feature_points), 2),
                    round(max(point[1] for point in feature_points), 2),
                ],
                "areaKm2": item["areaKm2"],
            }
        )
    return {
        "version": 1,
        "metadata": {
            "title": "Sempadan DUN Negeri Sembilan",
            "stateId": STATE_ID,
            "boundaryVersion": BOUNDARY_VERSION,
            "coordinateReference": "EPSG:4326",
            "sourceUrl": SOURCE_URL,
            "sourceSha256": sha256(SOURCE_PATH),
            "retrievedAt": date.today().isoformat(),
            "featureCount": len(features),
            "viewBox": {"width": VIEWBOX_WIDTH, "height": VIEWBOX_HEIGHT},
            "simplificationTolerancePx": SIMPLIFY_TOLERANCE,
        },
        "features": sorted(features, key=lambda item: int(item["code"].split(".")[1])),
    }


def validate(artifact: dict[str, Any]) -> None:
    metadata = artifact.get("metadata", {})
    features = artifact.get("features", [])
    if metadata.get("stateId") != STATE_ID or metadata.get("boundaryVersion") != BOUNDARY_VERSION:
        raise BoundaryError("Boundary metadata is not scoped to Negeri Sembilan and the Semenanjung 2018 boundary version.")
    if len(features) != 36 or metadata.get("featureCount") != 36:
        raise BoundaryError("The published map must contain exactly 36 DUN geometries.")
    ids = [item["id"] for item in features]
    codes = [item["code"] for item in features]
    if len(ids) != len(set(ids)) or len(codes) != len(set(codes)):
        raise BoundaryError("Published DUN geometry IDs and codes must be unique.")
    if codes != [f"N.{number:02d}" for number in range(1, 37)]:
        raise BoundaryError("Published Negeri Sembilan DUN codes must cover N.01 through N.36.")
    if not all(item.get("path", "").startswith("M") and item.get("parliamentCode", "").startswith("P.") for item in features):
        raise BoundaryError("Every DUN requires a renderable path and reusable Parliament relationship.")

    results = json.loads((ROOT / "public/data/state-elections.json").read_text(encoding="utf-8"))
    event = next(
        (item for item in results["events"] if item["stateId"] == STATE_ID and item["assemblyNumber"] == 15),
        None,
    )
    if not event or len(event["contestIds"]) != 36:
        raise BoundaryError("The PRN-15 Negeri Sembilan event must contain 36 contests.")
    contests = {item["dunId"] for item in results["contests"] if item["eventId"] == event["id"]}
    if set(ids) != contests:
        raise BoundaryError("Every map geometry must join one-to-one with a PRN-15 Negeri Sembilan contest.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Download the latest official SPR KMZ before extraction.")
    parser.add_argument("--check", action="store_true", help="Validate the published artifact without network access.")
    args = parser.parse_args()
    try:
        if args.check:
            artifact = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
            validate(artifact)
            if SOURCE_PATH.is_file() and artifact["metadata"]["sourceSha256"] != sha256(SOURCE_PATH):
                raise BoundaryError("Published boundary metadata does not match the archived official KMZ.")
            print("Validated 36 Negeri Sembilan DUN geometries and PRN-15 joins.")
            return 0
        if args.refresh or not SOURCE_PATH.is_file():
            fetch_source()
        artifact = build()
        validate(artifact)
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"Wrote {len(artifact['features'])} DUN geometries to {OUTPUT_PATH.relative_to(ROOT)}.")
        return 0
    except (BoundaryError, OSError, KeyError, ValueError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        print(f"Boundary extraction failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
