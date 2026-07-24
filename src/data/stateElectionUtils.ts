import type { StateElectionContest, StateElectionEvent } from "./types/stateElection";

export const STATE_TICKET_COLORS: Record<string, string> = {
  PH: "#df4b43",
  PN: "#08725d",
  BN: "#2864a5",
  GPS: "#e2a323",
  GRS: "#65afc1",
  PAS: "#08725d",
  WARISAN: "#55a8bf",
  BEBAS: "#818b86",
  PSB: "#dd7853",
  DAP: "#dc4039",
  PKR: "#48a8c9",
  MUDA: "#202b42",
};

export function ticketColor(shortName: string) {
  if (STATE_TICKET_COLORS[shortName]) return STATE_TICKET_COLORS[shortName];
  let hash = 0;
  for (const character of shortName) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 38% 45%)`;
}

export function eventWinner(event: StateElectionEvent): [string, number] {
  return Object.entries(event.seatCounts).sort((a, b) => b[1] - a[1])[0];
}

export function contestWinner(contest: StateElectionContest) {
  return contest.candidates.find((candidate) => candidate.id === contest.winnerCandidateId)!;
}
