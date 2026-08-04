import { formatShortDate } from "./utils";

export type ElectionEdition = {
  id: string;
  number: number;
  slug: string;
  shortTitle: string;
  electionDate: string;
  termId: string;
  boundaryVersion: string;
  isCurrentTerm: boolean;
  dataPath: string;
  capabilities: {
    seating: boolean;
    scoresheets: boolean;
    voterRoll: boolean;
    voterAge: boolean;
    voterEthnicity: boolean;
    geography: boolean;
  };
};

export const DEFAULT_ELECTION_NUMBER = 15;

export const ELECTION_EDITIONS: ElectionEdition[] = [
  {
    id: "pru-15",
    number: 15,
    slug: "pru-15",
    shortTitle: "PRU-15",
    electionDate: "2022-11-19",
    termId: "dr-15",
    boundaryVersion: "my-sarawak-2015-peninsula-2018-sabah-2019",
    isCurrentTerm: true,
    dataPath: "/data/elections/pru-15",
    capabilities: {
      seating: true,
      scoresheets: true,
      voterRoll: true,
      voterAge: true,
      voterEthnicity: true,
      geography: true,
    },
  },
  {
    id: "pru-14",
    number: 14,
    slug: "pru-14",
    shortTitle: "PRU-14",
    electionDate: "2018-05-09",
    termId: "dr-14",
    boundaryVersion: "my-sarawak-2015-peninsula-2018-sabah-2019",
    isCurrentTerm: false,
    dataPath: "/data/elections/pru-14",
    capabilities: {
      seating: false,
      scoresheets: true,
      voterRoll: true,
      voterAge: false,
      voterEthnicity: false,
      geography: false,
    },
  },
];

export function electionEdition(number: number | string) {
  return ELECTION_EDITIONS.find((edition) => edition.number === Number(number));
}

export function electionNumberFromPath(pathname: string) {
  const match = pathname.match(/^\/pru\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

export function electionNumberForLocation(pathname: string, search: string) {
  const routeNumber = electionNumberFromPath(pathname);
  if (routeNumber !== null) return routeNumber;
  if (pathname.startsWith("/settings/data")) {
    const requested = Number(new URLSearchParams(search).get("election"));
    if (electionEdition(requested)) return requested;
  }
  return DEFAULT_ELECTION_NUMBER;
}

export function formatElectionDate(value: string) {
  return formatShortDate(value);
}
