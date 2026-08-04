import type { Alliance, Seat, StateSummary } from "./types";
import { currentAlliance } from "./dataChanges";

export const formatNumber = new Intl.NumberFormat("ms-MY").format;
export const formatCompact = new Intl.NumberFormat("ms-MY", {
  notation: "compact",
  maximumFractionDigits: 1,
}).format;

export const formatPct = (value: number, digits = 1) =>
  `${(value * 100).toFixed(digits)}%`;

const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

export function formatShortDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const isoDate = typeof value === "string" ? value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] : undefined;
  const date = value instanceof Date ? value : new Date(isoDate ? `${isoDate}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? String(value) : shortDateFormatter.format(date);
}

const malayMonthAbbreviations: Record<string, string> = {
  Januari: "Jan",
  Februari: "Feb",
  Mac: "Mar",
  April: "Apr",
  Mei: "May",
  Jun: "Jun",
  Julai: "Jul",
  Ogos: "Aug",
  September: "Sep",
  Oktober: "Oct",
  November: "Nov",
  Disember: "Dec",
};

export function formatDatesInText(value: string) {
  return value
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (date) => formatShortDate(date))
    .replace(
      /\b(\d{1,2}) (Januari|Februari|Mac|April|Mei|Jun|Julai|Ogos|September|Oktober|November|Disember) (\d{4})\b/g,
      (_, day: string, month: string, year: string) => `${day.padStart(2, "0")} ${malayMonthAbbreviations[month]} ${year.slice(-2)}`,
    );
}

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
      const validVotes = stateSeats.reduce((sum, seat) => sum + (seat.validVotes ?? seat.candidates.reduce((total, candidate) => total + candidate.votes, 0)), 0);
      const turnout = stateSeats.reduce((sum, seat) => sum + seat.turnout, 0);
      const turnoutEstimate = stateSeats.reduce((sum, seat) => sum + (seat.registered * seat.turnoutPct), 0);
      const hasBallotAccounting = stateSeats.every((seat) => seat.validVotes !== undefined);
      return {
        state,
        seats: stateSeats.length,
        registered,
        validVotes,
        turnout,
        turnoutPct: registered ? (hasBallotAccounting ? turnout : turnoutEstimate) / registered : 0,
        leader,
        leaderSeats,
        seatCounts,
      };
    })
    .sort((a, b) => b.seats - a.seats || a.state.localeCompare(b.state));
}
