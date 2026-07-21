#!/usr/bin/env python3
"""Extract and validate Dewan Rakyat seating coordinates from SeatingDR.pdf.

The source is a JasperReports PDF containing one rendered page plus a text layer.
Constituency labels use 4pt Helvetica Bold. Their label centres map directly to
the seat-card centres in the 1190 x 842 source coordinate system.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pdfplumber


EXPECTED_SEAT_COUNT = 222
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


def extract(pdf_path: Path, election_path: Path, allowed_unmapped: set[str]) -> dict[str, Any]:
    seats = load_election(election_path)
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
    positions.sort(key=lambda position: int(str(position["seatCode"]).split(".")[1]))
    validate_positions(positions, missing, view_box, seats)
    return {
        "version": 1,
        "sourceFile": pdf_path.name,
        "sourceUpdatedAt": updated_at,
        "viewBox": view_box,
        "mappedSeatCount": len(positions),
        "unmappedSeatCodes": sorted(missing, key=lambda code: int(code.split(".")[1])),
        "positions": positions,
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
            raise SeatingExtractionError(f"{position['seatCode']} is outside the PDF coordinate bounds.")
        if not str(position["sourceConstituency"]).strip():
            raise SeatingExtractionError(f"{position['seatCode']} has an empty source constituency.")


def serialise(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract and validate Parliament seat positions from SeatingDR.pdf.")
    parser.add_argument("pdf", nargs="?", type=Path, default=Path("SeatingDR.pdf"))
    parser.add_argument("--election", type=Path, default=Path("public/data/election.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/seating.json"))
    parser.add_argument("--allow-unmapped", default=",".join(sorted(DEFAULT_UNMAPPED)), help="Comma-separated seat codes expected to have no PDF label.")
    parser.add_argument("--check", action="store_true", help="Fail if the committed output differs from regenerated data.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    allowed_unmapped = {code.strip() for code in args.allow_unmapped.split(",") if code.strip()}
    try:
        value = extract(args.pdf, args.election, allowed_unmapped)
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
