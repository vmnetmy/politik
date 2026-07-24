import { createContext, useContext } from "react";
import type { ElectionEdition } from "./elections";
import {
  dunPath,
  electionBase,
  localityPath,
  parliamentBase,
  pdmPath,
  stateBase,
  stateParliamentPath,
  voterAreaBase,
  voterAgeBase,
  voterEthnicityBase,
  votersBase,
  winnersBase,
} from "./routes";

type ElectionContextValue = {
  edition: ElectionEdition;
  paths: {
    election: string;
    winners: string;
    states: string;
    parliament: string;
    voters: string;
    voterArea: string;
    voterAge: string;
    voterEthnicity: string;
    stateParliament: (stateSlug: string, parliamentSlug: string) => string;
    dun: (stateSlug: string, parliamentSlug: string, dunSlug: string) => string;
    pdm: (stateSlug: string, parliamentSlug: string, pdmSlug: string, dunSlug?: string) => string;
    locality: (stateSlug: string, parliamentSlug: string, pdmSlug: string, localitySlug: string, dunSlug?: string) => string;
  };
};

const ElectionContext = createContext<ElectionContextValue | null>(null);

export function ElectionProvider({ edition, children }: { edition: ElectionEdition; children: React.ReactNode }) {
  const electionNumber = edition.number;
  const value: ElectionContextValue = {
    edition,
    paths: {
      election: electionBase(electionNumber),
      winners: winnersBase(electionNumber),
      states: stateBase(electionNumber),
      parliament: parliamentBase(electionNumber),
      voters: votersBase(electionNumber),
      voterArea: voterAreaBase(electionNumber),
      voterAge: voterAgeBase(electionNumber),
      voterEthnicity: voterEthnicityBase(electionNumber),
      stateParliament: (stateSlug, parliamentSlug) => stateParliamentPath(electionNumber, stateSlug, parliamentSlug),
      dun: (stateSlug, parliamentSlug, dunSlug) => dunPath(electionNumber, stateSlug, parliamentSlug, dunSlug),
      pdm: (stateSlug, parliamentSlug, pdmSlug, dunSlug) => pdmPath(electionNumber, stateSlug, parliamentSlug, pdmSlug, dunSlug),
      locality: (stateSlug, parliamentSlug, pdmSlug, localitySlug, dunSlug) => localityPath(electionNumber, stateSlug, parliamentSlug, pdmSlug, localitySlug, dunSlug),
    },
  };
  return <ElectionContext.Provider value={value}>{children}</ElectionContext.Provider>;
}

export function useElection() {
  const value = useContext(ElectionContext);
  if (!value) throw new Error("useElection must be used inside ElectionProvider.");
  return value;
}
