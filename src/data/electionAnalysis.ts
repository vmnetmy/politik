import { currentAlliance, currentStatus } from "../dataChanges";
import type { Seat } from "../types";

export type ElectionSeatSummary = {
  seatCounts: Record<string, number>;
  genderCounts: Record<string, number>;
  occupiedSeats: number;
  registered: number;
  validVotes: number;
  turnout: number;
  turnoutPct: number;
  candidateCount: number;
};

export function summarizeElectionSeats(
  seats: Seat[],
  view: "historical" | "current" = "current",
): ElectionSeatSummary {
  const seatCounts: Record<string, number> = {};
  const genderCounts: Record<string, number> = {};
  let occupiedSeats = 0;

  seats.forEach((seat) => {
    const alliance = view === "historical" ? seat.winner.alliance : currentAlliance(seat);
    seatCounts[alliance] = (seatCounts[alliance] ?? 0) + 1;
    const occupied = view === "historical" || currentStatus(seat) !== "vacant";
    if (occupied) {
      occupiedSeats += 1;
      genderCounts[seat.winner.gender] = (genderCounts[seat.winner.gender] ?? 0) + 1;
    }
  });

  const registered = seats.reduce((sum, seat) => sum + seat.registered, 0);
  const validVotes = seats.reduce((sum, seat) => sum + (seat.validVotes ?? seat.candidates.reduce((total, candidate) => total + candidate.votes, 0)), 0);
  const turnout = seats.reduce((sum, seat) => sum + seat.turnout, 0);
  const turnoutEstimate = seats.reduce((sum, seat) => sum + (seat.registered * seat.turnoutPct), 0);
  const hasBallotAccounting = seats.every((seat) => seat.validVotes !== undefined);

  return {
    seatCounts,
    genderCounts,
    occupiedSeats,
    registered,
    validVotes,
    turnout,
    turnoutPct: registered ? (hasBallotAccounting ? turnout : turnoutEstimate) / registered : 0,
    candidateCount: seats.reduce((sum, seat) => sum + seat.candidateCount, 0),
  };
}
