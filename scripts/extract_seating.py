#!/usr/bin/env python3
"""Extract and validate Dewan Rakyat seating data from the official sources.

The PDF text layer supplies constituency labels and representative matching. The
SVG supplies the authoritative A1-G28 physical-seat geometry in its 1190 x 842
coordinate system. Display coordinates are never reflowed or regularized.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pdfplumber


EXPECTED_SEAT_COUNT = 222
EXPECTED_PDF_SHA256 = "8dd8188341dafa69493b316d7247ee64c32e8f7be3353da98796b518d4a068f4"
EXPECTED_SVG_SHA256 = "9e3a21a3e420ef42805928b168f3b45e42389efa04350908228e4504c7427fe0"
EXPECTED_RASTER_SHA256 = "6cb79023896ab27ebe2e0d80f81387cf7ba88d7ddb56bf7eaa1f1a73e9ce0690"
DEFAULT_UNMAPPED = {"P.100", "P.118"}
PDF_NAME_ALIASES = {
    "P.064": "IPOH TIMOR",
    "P.157": "PENGERANG",
}


class SeatingExtractionError(RuntimeError):
    pass


@dataclass(frozen=True)
class LabelSegment:
    id: int
    text: str
    x0: float
    x1: float
    top: float

    @property
    def centre_x(self) -> float:
        return (self.x0 + self.x1) / 2


@dataclass(frozen=True)
class LabelCandidate:
    text: str
    segments: tuple[LabelSegment, ...]


def normalise(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]", "", ascii_value.upper())


def load_election(path: Path) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SeatingExtractionError(f"Cannot read election data: {exc}") from exc
    seats = value.get("seats")
    if not isinstance(seats, list):
        raise SeatingExtractionError("Election JSON must contain a seats array.")
    codes = [seat.get("code") for seat in seats]
    if len(seats) != EXPECTED_SEAT_COUNT or len(set(codes)) != EXPECTED_SEAT_COUNT:
        raise SeatingExtractionError(f"Election data must contain {EXPECTED_SEAT_COUNT} unique seats; found {len(seats)}.")
    return seats


def extract_segments(page: Any) -> list[LabelSegment]:
    chars = [
        char for char in page.chars
        if char.get("fontname") == "Helvetica-Bold" and abs(float(char.get("size", 0)) - 4.0) < 0.1
    ]
    lines: dict[float, list[dict[str, Any]]] = {}
    for char in chars:
        lines.setdefault(round(float(char["top"]), 3), []).append(char)

    segments: list[LabelSegment] = []
    segment_id = 0
    for top, line_chars in lines.items():
        line_chars.sort(key=lambda char: float(char["x0"]))
        current: list[dict[str, Any]] = []
        groups: list[list[dict[str, Any]]] = []
        for char in line_chars:
            if current and float(char["x0"]) - float(current[-1]["x1"]) > 3.5:
                groups.append(current)
                current = []
            current.append(char)
        if current:
            groups.append(current)

        for group in groups:
            text = "".join(str(char["text"]) for char in group).strip()
            if not text:
                continue
            segments.append(LabelSegment(
                id=segment_id,
                text=text,
                x0=float(group[0]["x0"]),
                x1=float(group[-1]["x1"]),
                top=top,
            ))
            segment_id += 1
    return segments


def build_candidates(segments: list[LabelSegment]) -> list[LabelCandidate]:
    candidates = [LabelCandidate(segment.text, (segment,)) for segment in segments]
    for first in segments:
        for second in segments:
            vertical_gap = second.top - first.top
            if 4.3 <= vertical_gap <= 5.0 and abs(first.centre_x - second.centre_x) <= 6:
                candidates.append(LabelCandidate(f"{first.text} {second.text}", (first, second)))
    return candidates


def source_date(metadata: dict[str, Any] | None, pdf_path: Path) -> str:
    creation_date = str((metadata or {}).get("CreationDate", ""))
    match = re.search(r"(\d{4})(\d{2})(\d{2})", creation_date)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
    return datetime.fromtimestamp(pdf_path.stat().st_mtime).date().isoformat()


def minimum_cost_assignment(
    positions: list[dict[str, Any]],
    targets: list[tuple[float, float]],
) -> dict[int, int]:
    """Assign every source point to a unique target with minimum total movement."""
    if len(positions) > len(targets):
        raise SeatingExtractionError("The physical source has fewer coded slots than constituency labels.")
    row_count = len(positions)
    column_count = len(targets)
    potential_rows = [0.0] * (row_count + 1)
    potential_columns = [0.0] * (column_count + 1)
    matched_row = [0] * (column_count + 1)
    previous_column = [0] * (column_count + 1)

    for row in range(1, row_count + 1):
        matched_row[0] = row
        column = 0
        minimum = [float("inf")] * (column_count + 1)
        used = [False] * (column_count + 1)
        while True:
            used[column] = True
            current_row = matched_row[column]
            delta = float("inf")
            next_column = 0
            source = positions[current_row - 1]
            for candidate_column in range(1, column_count + 1):
                if used[candidate_column]:
                    continue
                target_x, target_y = targets[candidate_column - 1]
                cost = (float(source["x"]) - target_x) ** 2 + (float(source["y"]) - target_y) ** 2
                reduced = cost - potential_rows[current_row] - potential_columns[candidate_column]
                if reduced < minimum[candidate_column]:
                    minimum[candidate_column] = reduced
                    previous_column[candidate_column] = column
                if minimum[candidate_column] < delta:
                    delta = minimum[candidate_column]
                    next_column = candidate_column
            for candidate_column in range(column_count + 1):
                if used[candidate_column]:
                    potential_rows[matched_row[candidate_column]] += delta
                    potential_columns[candidate_column] -= delta
                else:
                    minimum[candidate_column] -= delta
            column = next_column
            if matched_row[column] == 0:
                break
        while True:
            prior = previous_column[column]
            matched_row[column] = matched_row[prior]
            column = prior
            if column == 0:
                break

    return {
        matched_row[column] - 1: column - 1
        for column in range(1, column_count + 1)
        if matched_row[column] != 0
    }


def source_seating_slots() -> list[dict[str, Any]]:
    """Return the 280 coded physical locations visible in SeatingDR.svg."""
    slots: dict[str, tuple[float, float]] = {}
    left_x = [443, 396, 348, 300, 249]
    right_x = [740, 787, 834, 885, 939]

    for group, x in enumerate(left_x):
        for offset, y in enumerate([634, 600, 566, 530], 1):
            slots[f"F{group * 4 + offset}"] = (x, y)
        for offset, y in enumerate([805, 770, 735, 700, 668], 1):
            slots[f"G{group * 5 + offset}"] = (x, y)
    slots.update({"F21": (199, 634), "F22": (199, 600), "G26": (198, 735), "G27": (199, 700), "G28": (199, 668)})

    for group, x in enumerate(right_x):
        for offset, y in enumerate([634, 600, 566, 530], 1):
            slots[f"B{group * 4 + offset}"] = (x, y)
        for offset, y in enumerate([805, 770, 735, 700, 668], 1):
            slots[f"A{group * 5 + offset}"] = (x, y)
    slots.update({"B21": (999, 634), "B22": (999, 600), "A26": (999, 735), "A27": (999, 700), "A28": (999, 668)})

    d_rows = [
        (range(60, 47, -1), [(317, 45), (362, 40), (408, 37), (453, 35), (498, 33), (543, 32), (589, 33), (637, 32), (682, 33), (726, 35), (771, 37), (817, 40), (862, 45)]),
        (range(47, 36, -1), [(365, 95), (410, 88), (451, 83), (494, 80), (541, 79), (589, 76), (636, 79), (682, 80), (725, 83), (770, 88), (816, 95)]),
        (range(36, 25, -1), [(385, 140), (423, 139), (465, 135), (506, 132), (547, 131), (589, 131), (632, 131), (674, 132), (715, 135), (755, 139), (796, 143)]),
        (range(25, 16, -1), [(427, 203), (468, 193), (508, 189), (549, 188), (591, 186), (634, 188), (678, 189), (718, 193), (758, 195)]),
        (range(16, 9, -1), [(459, 246), (502, 239), (545, 236), (588, 234), (634, 236), (677, 239), (720, 246)]),
        (range(9, 4, -1), [(494, 296), (540, 283), (588, 279), (637, 283), (682, 296)]),
        (range(4, 0, -1), [(526, 338), (568, 328), (612, 328), (654, 336)]),
    ]
    for numbers, points in d_rows:
        for number, point in zip(numbers, points):
            slots[f"D{number}"] = point

    c_runs = {
        **{f"C{number}": point for number, point in zip(range(1, 9), [(728, 488), (714, 436), (687, 388), (773, 488), (773, 451), (763, 410), (740, 373), (718, 338)])},
        **{f"C{number}": point for number, point in zip(range(9, 17), [(825, 489), (825, 458), (823, 426), (819, 398), (809, 363), (793, 336), (781, 301), (766, 273)])},
        **{f"C{number}": point for number, point in zip(range(17, 27), [(879, 492), (878, 457), (875, 427), (874, 400), (869, 369), (861, 339), (851, 309), (840, 279), (828, 248), (804, 221)])},
        **{f"C{number}": point for number, point in zip(range(27, 40), [(933, 498), (934, 470), (933, 441), (933, 413), (933, 384), (932, 357), (926, 327), (922, 296), (911, 269), (899, 240), (887, 209), (865, 183), (854, 156)])},
        **{f"C{number}": point for number, point in zip(range(40, 53), [(992, 493), (991, 463), (988, 434), (987, 404), (987, 339), (979, 309), (975, 278), (967, 248), (956, 218), (940, 189), (916, 160), (898, 135), (887, 105)])},
        **{f"C{number}": point for number, point in zip(range(53, 61), [(1044, 340), (1043, 311), (1041, 280), (1038, 247), (1027, 219), (977, 127), (956, 96), (932, 64)])},
    }
    slots.update(c_runs)
    slots.update({f"E{code[1:]}": (1170 - x, y) for code, (x, y) in c_runs.items()})

    expected = {"A": 28, "B": 22, "C": 60, "D": 60, "E": 60, "F": 22, "G": 28}
    if len(slots) != sum(expected.values()) or any(sum(code.startswith(letter) for code in slots) != count for letter, count in expected.items()):
        raise SeatingExtractionError("The PDF physical-seat code map must contain A1-G28 exactly once.")
    return [
        {
            "physicalCode": code,
            "x": float(x),
            "y": float(y),
            "section": "straight-left" if code[0] in {"F", "G"} else "straight-right" if code[0] in {"A", "B"} else "curved",
        }
        for code, (x, y) in sorted(slots.items(), key=lambda item: (item[0][0], int(item[0][1:])))
    ]


def map_source_positions(positions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Attach each PDF constituency to its exact coded SVG seat position."""
    source_slots = source_seating_slots()
    ordered_positions = sorted(positions, key=lambda position: int(str(position["seatCode"]).split(".")[1]))
    source_targets = [(float(slot["x"]), float(slot["y"])) for slot in source_slots]
    seat_assignment = minimum_cost_assignment(ordered_positions, source_targets)
    used_physical_codes: set[str] = set()
    mapped: list[dict[str, Any]] = []
    for position_index, slot_index in seat_assignment.items():
        position = ordered_positions[position_index]
        slot = source_slots[slot_index]
        distance = math.hypot(float(position["x"]) - float(slot["x"]), float(position["y"]) - float(slot["y"]))
        if distance > 12:
            raise SeatingExtractionError(f"{position['seatCode']} is {distance:.2f} points from its nearest coded PDF seat {slot['physicalCode']}.")
        physical_code = str(slot["physicalCode"])
        used_physical_codes.add(physical_code)
        mapped.append({
            **position,
            "physicalCode": physical_code,
            "sourceX": position["x"],
            "sourceY": position["y"],
            "x": slot["x"],
            "y": slot["y"],
            "section": slot["section"],
        })

    empty_positions = []
    for slot in source_slots:
        physical_code = str(slot["physicalCode"])
        if physical_code in used_physical_codes:
            continue
        empty_positions.append({
            "id": f"EMPTY-{physical_code}",
            "physicalCode": physical_code,
            "sourceX": slot["x"],
            "sourceY": slot["y"],
            "x": slot["x"],
            "y": slot["y"],
            "section": slot["section"],
        })
    return mapped, empty_positions


def validate_geometry_sources(svg_path: Path, raster_path: Path) -> tuple[str, str]:
    """Lock the SVG canvas and embedded raster used to derive coded coordinates."""
    try:
        svg_sha256 = hashlib.sha256(svg_path.read_bytes()).hexdigest()
        raster_sha256 = hashlib.sha256(raster_path.read_bytes()).hexdigest()
    except OSError as exc:
        raise SeatingExtractionError(f"Cannot read seating geometry source: {exc}") from exc
    if svg_sha256 != EXPECTED_SVG_SHA256:
        raise SeatingExtractionError("SeatingDR.svg changed; review the A1-G28 coordinate map before regenerating seating.json.")
    if raster_sha256 != EXPECTED_RASTER_SHA256:
        raise SeatingExtractionError("SeatingDR-1.png changed; review the A1-G28 coordinate map before regenerating seating.json.")

    try:
        root = ET.parse(svg_path).getroot()
    except ET.ParseError as exc:
        raise SeatingExtractionError(f"Cannot parse SeatingDR.svg: {exc}") from exc
    if root.get("viewBox") != "0 0 1190 842":
        raise SeatingExtractionError(f"Unexpected SeatingDR.svg viewBox: {root.get('viewBox')!r}.")
    image = root.find(".//{http://www.w3.org/2000/svg}image")
    href = image.get("{http://www.w3.org/1999/xlink}href") if image is not None else None
    if image is None or href != raster_path.name or image.get("transform") != "translate(12 9) scale(.146)":
        raise SeatingExtractionError("SeatingDR.svg no longer references the expected raster geometry.")
    return svg_sha256, raster_sha256


def extract(
    pdf_path: Path,
    election_path: Path,
    allowed_unmapped: set[str],
    svg_path: Path | None = None,
    raster_path: Path | None = None,
) -> dict[str, Any]:
    svg_path = svg_path or pdf_path.with_name("SeatingDR.svg")
    raster_path = raster_path or pdf_path.with_name("SeatingDR-1.png")
    svg_sha256, raster_sha256 = validate_geometry_sources(svg_path, raster_path)
    seats = load_election(election_path)
    with pdf_path.open("rb") as source:
        pdf_sha256 = hashlib.file_digest(source, "sha256").hexdigest()
    if pdf_sha256 != EXPECTED_PDF_SHA256:
        raise SeatingExtractionError("SeatingDR.pdf changed; review the physical A1-G28 code map before regenerating seating.json.")
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if len(pdf.pages) != 1:
                raise SeatingExtractionError(f"Expected a one-page seating PDF; found {len(pdf.pages)} pages.")
            page = pdf.pages[0]
            view_box = {"width": int(round(float(page.width))), "height": int(round(float(page.height)))}
            segments = extract_segments(page)
            candidates = build_candidates(segments)
            updated_at = source_date(pdf.metadata, pdf_path)
    except SeatingExtractionError:
        raise
    except Exception as exc:
        raise SeatingExtractionError(f"Cannot parse seating PDF: {exc}") from exc

    used_segments: set[int] = set()
    positions: list[dict[str, Any]] = []
    missing: list[str] = []
    seats_by_specificity = sorted(
        seats,
        key=lambda seat: len(normalise(PDF_NAME_ALIASES.get(str(seat["code"]), str(seat["name"])))),
        reverse=True,
    )

    for seat in seats_by_specificity:
        seat_code = str(seat["code"])
        source_name = PDF_NAME_ALIASES.get(seat_code, str(seat["name"]))
        target = normalise(source_name)
        matches = [
            candidate for candidate in candidates
            if normalise(candidate.text) == target
            and not any(segment.id in used_segments for segment in candidate.segments)
        ]
        if not matches:
            missing.append(seat_code)
            continue
        matches.sort(key=lambda candidate: (-len(candidate.segments), candidate.segments[0].top))
        match = matches[0]
        used_segments.update(segment.id for segment in match.segments)
        first_line = match.segments[0]
        x = round((min(segment.x0 for segment in match.segments) + max(segment.x1 for segment in match.segments)) / 2, 2)
        y = round(first_line.top + (11.972 if len(match.segments) == 2 else 9.642), 2)
        positions.append({
            "seatCode": seat_code,
            "sourceConstituency": match.text,
            "x": x,
            "y": y,
        })

    missing_set = set(missing)
    if missing_set != allowed_unmapped:
        raise SeatingExtractionError(
            "Unexpected unmapped seats. "
            f"Expected {sorted(allowed_unmapped)}, extracted {sorted(missing_set)}."
        )
    positions, empty_positions = map_source_positions(positions)
    validate_positions(positions, missing, view_box, seats)
    return {
        "version": 4,
        "sourceFile": pdf_path.name,
        "sourceSha256": pdf_sha256,
        "sourceUpdatedAt": updated_at,
        "viewBox": view_box,
        "layout": {
            "strategy": "svg-source-rect-v3",
            "geometryFile": svg_path.name,
            "geometrySha256": svg_sha256,
            "rasterFile": raster_path.name,
            "rasterSha256": raster_sha256,
            "physicalSeatCount": len(positions) + len(empty_positions),
        },
        "mappedSeatCount": len(positions),
        "unmappedSeatCodes": sorted(missing, key=lambda code: int(code.split(".")[1])),
        "positions": positions,
        "emptyPositions": empty_positions,
    }


def validate_positions(positions: list[dict[str, Any]], missing: list[str], view_box: dict[str, int], seats: list[dict[str, Any]]) -> None:
    position_codes = [str(position["seatCode"]) for position in positions]
    election_codes = {str(seat["code"]) for seat in seats}
    combined_codes = set(position_codes) | set(missing)
    if len(position_codes) != len(set(position_codes)):
        raise SeatingExtractionError("Extracted seating contains duplicate seat codes.")
    if combined_codes != election_codes or len(position_codes) + len(missing) != EXPECTED_SEAT_COUNT:
        raise SeatingExtractionError("Mapped and explicitly unmapped seats must cover all 222 election seats exactly once.")
    for position in positions:
        if not 0 <= float(position["x"]) <= view_box["width"] or not 0 <= float(position["y"]) <= view_box["height"]:
            raise SeatingExtractionError(f"{position['seatCode']} is outside the SVG view bounds.")
        if not 0 <= float(position["sourceX"]) <= view_box["width"] or not 0 <= float(position["sourceY"]) <= view_box["height"]:
            raise SeatingExtractionError(f"{position['seatCode']} has source coordinates outside the PDF bounds.")
        if not str(position["sourceConstituency"]).strip():
            raise SeatingExtractionError(f"{position['seatCode']} has an empty source constituency.")


def serialise(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract and validate Parliament seat data from SeatingDR.pdf and SeatingDR.svg.")
    parser.add_argument("pdf", nargs="?", type=Path, default=Path("SeatingDR.pdf"))
    parser.add_argument("--geometry", type=Path, default=Path("SeatingDR.svg"))
    parser.add_argument("--geometry-raster", type=Path, default=Path("SeatingDR-1.png"))
    parser.add_argument("--election", type=Path, default=Path("public/data/election.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/seating.json"))
    parser.add_argument("--allow-unmapped", default=",".join(sorted(DEFAULT_UNMAPPED)), help="Comma-separated seat codes expected to have no PDF label.")
    parser.add_argument("--check", action="store_true", help="Fail if the committed output differs from regenerated data.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    allowed_unmapped = {code.strip() for code in args.allow_unmapped.split(",") if code.strip()}
    try:
        value = extract(args.pdf, args.election, allowed_unmapped, args.geometry, args.geometry_raster)
        rendered = serialise(value)
        if args.check:
            current = args.output.read_text(encoding="utf-8")
            if current != rendered:
                raise SeatingExtractionError(f"{args.output} is stale. Run scripts/extract_seating.py to regenerate it.")
            print(f"Validated {len(value['positions'])} mapped + {len(value['unmappedSeatCodes'])} unmapped seats.")
            return 0
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
        print(f"Wrote {len(value['positions'])} mapped seats to {args.output}; unmapped: {value['unmappedSeatCodes']}.")
        return 0
    except (OSError, SeatingExtractionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
