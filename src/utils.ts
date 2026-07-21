import type { Alliance, Seat, StateSummary } from "./types";
import { currentAlliance } from "./dataChanges";

export const formatNumber = new Intl.NumberFormat("ms-MY").format;
export const formatCompact = new Intl.NumberFormat("ms-MY", {
  notation: "compact",
  maximumFractionDigits: 1,
}).format;

export const formatPct = (value: number, digits = 1) =>
  `${(value * 100).toFixed(digits)}%`;

export const normalise = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const toSlug = (value: string) =>
  value
    .replace(/W\.P\.?/gi, "WP")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const shortAlliance = (name: string, alliances: Alliance[]) =>
  alliances.find((alliance) => alliance.name === name)?.shortName ?? name;

export const allianceColor = (name: string, alliances: Alliance[]) =>
  alliances.find((alliance) => alliance.name === name)?.color ?? "#7b8580";

export function buildStateSummaries(seats: Seat[]): StateSummary[] {
  const states = new Map<string, Seat[]>();
  seats.forEach((seat) => states.set(seat.state, [...(states.get(seat.state) ?? []), seat]));

  return [...states.entries()]
    .map(([state, stateSeats]) => {
      const seatCounts: Record<string, number> = {};
      stateSeats.forEach((seat) => {
        const alliance = currentAlliance(seat);
        seatCounts[alliance] = (seatCounts[alliance] ?? 0) + 1;
      });
      const [leader, leaderSeats] = Object.entries(seatCounts).sort((a, b) => b[1] - a[1])[0];
      const registered = stateSeats.reduce((sum, seat) => sum + seat.registered, 0);
      const turnout = stateSeats.reduce((sum, seat) => sum + seat.turnout, 0);
      return {
        state,
        seats: stateSeats.length,
        registered,
        turnout,
        turnoutPct: registered ? turnout / registered : 0,
        leader,
        leaderSeats,
        seatCounts,
      };
    })
    .sort((a, b) => b.seats - a.seats || a.state.localeCompare(b.state));
}
