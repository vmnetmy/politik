import { useMemo, useState } from "react";
import { currentAlliance, currentParty } from "../../dataChanges";
import { useElection } from "../../ElectionContext";
import type { ElectionData, Seat } from "../../types";
import type { SeatingData, SeatingPosition, SeatingView } from "../types/seating";
import { normalise } from "../../utils";

type Direction = "up" | "down" | "left" | "right";

export function useParliament({ data, seating, search, stateFilter, allianceFilter }: {
  data: ElectionData;
  seating: SeatingData;
  search: string;
  stateFilter: string;
  allianceFilter: string;
}) {
  const { edition } = useElection();
  const [view, setView] = useState<SeatingView>(edition.isCurrentTerm ? "current" : "election");
  const [selectedCode, setSelectedCode] = useState(seating.positions[0]?.seatCode ?? "");
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const seatByCode = useMemo(() => new Map(data.seats.map((seat) => [seat.code, seat])), [data]);
  const positionByCode = useMemo(() => new Map(seating.positions.map((position) => [position.seatCode, position])), [seating]);
  const selectedSeat = seatByCode.get(selectedCode) ?? data.seats[0];
  const hoveredSeat = hoveredCode ? seatByCode.get(hoveredCode) : undefined;
  const hoveredPosition = hoveredCode ? positionByCode.get(hoveredCode) : undefined;
  const identityAlliance = (seat: Seat) => view === "current" ? currentAlliance(seat) : seat.winner.alliance;
  const normalisedQuery = normalise(search.trim());
  const matchesFilters = (seat: Seat) => (stateFilter === "SEMUA NEGERI" || seat.state === stateFilter)
    && (allianceFilter === "SEMUA GABUNGAN" || currentAlliance(seat) === allianceFilter)
    && (!normalisedQuery || [seat.code, seat.name, seat.state, seat.winner.name, seat.winner.party, currentParty(seat)].some((value) => normalise(value).includes(normalisedQuery)));
  const alliances = [...new Set(seating.positions.map((position) => seatByCode.get(position.seatCode)).filter((seat): seat is Seat => Boolean(seat)).map(identityAlliance))].sort();
  const unmappedSeats = seating.unmappedSeatCodes.map((code) => seatByCode.get(code)).filter((seat): seat is Seat => Boolean(seat));

  const navigateFrom = (origin: SeatingPosition, direction: Direction) => {
    const candidates = seating.positions
      .filter((position) => position.seatCode !== origin.seatCode)
      .map((position) => ({ position, dx: position.x - origin.x, dy: position.y - origin.y }))
      .filter(({ dx, dy }) => direction === "left" ? dx < 0 : direction === "right" ? dx > 0 : direction === "up" ? dy < 0 : dy > 0)
      .sort((a, b) => {
        const primaryA = direction === "left" || direction === "right" ? Math.abs(a.dx) : Math.abs(a.dy);
        const secondaryA = direction === "left" || direction === "right" ? Math.abs(a.dy) : Math.abs(a.dx);
        const primaryB = direction === "left" || direction === "right" ? Math.abs(b.dx) : Math.abs(b.dy);
        const secondaryB = direction === "left" || direction === "right" ? Math.abs(b.dy) : Math.abs(b.dx);
        return primaryA + secondaryA * 2 - (primaryB + secondaryB * 2);
      });
    const next = candidates[0]?.position;
    if (!next) return;
    setSelectedCode(next.seatCode);
    requestAnimationFrame(() => document.getElementById(`seat-marker-${next.seatCode.replace(".", "-")}`)?.focus());
  };

  return {
    view,
    setView,
    selectedCode,
    setSelectedCode,
    hoveredCode,
    setHoveredCode,
    seatByCode,
    positionByCode,
    selectedSeat,
    hoveredSeat,
    hoveredPosition,
    identityAlliance,
    matchesFilters,
    alliances,
    unmappedSeats,
    navigateFrom,
  };
}
