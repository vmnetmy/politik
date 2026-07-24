import { describe, expect, it } from "vitest";
import registry from "../public/data/elections/index.json";
import election from "../public/data/elections/pru-15/election.json";
import affiliations from "../public/data/elections/pru-15/affiliations.json";
import {
  electionBase,
  federalElectionComparisonPath,
  localityPath,
  parliamentBase,
  stateBase,
  stateElectionComparisonPath,
  stateElectionDunComparisonPath,
  stateElectionEditionPath,
  stateElectionMapPath,
  stateElectionPartyComparisonPath,
  stateElectionStateComparisonPath,
  voterAreaBase,
  voterEthnicityBase,
  votersBase,
} from "./routes";
import { ELECTION_EDITIONS, electionEdition, electionNumberForLocation } from "./elections";

describe("multi-election isolation", () => {
  it("resolves edition-scoped routes and settings context", () => {
    expect(electionBase(14)).toBe("/pru/14");
    expect(federalElectionComparisonPath()).toBe("/pru/perbandingan");
    expect(stateBase(14)).toBe("/pru/14/negeri");
    expect(parliamentBase(14)).toBe("/pru/14/negeri/parlimen");
    expect(voterEthnicityBase(15)).toBe("/pru/15/pengundi/kaum");
    expect(votersBase(14)).toBe("/pru/14/pengundi");
    expect(voterAreaBase(15)).toBe("/pru/15/pengundi/kawasan");
    expect(stateElectionEditionPath(16)).toBe("/prn/16");
    expect(stateElectionMapPath("negeri-sembilan", 15)).toBe("/prn/15/negeri-sembilan/peta");
    expect(stateElectionComparisonPath()).toBe("/prn/perbandingan");
    expect(stateElectionStateComparisonPath("selangor")).toBe("/prn/perbandingan/negeri/selangor");
    expect(stateElectionDunComparisonPath("negeri-sembilan", "rantau")).toBe("/prn/perbandingan/negeri/negeri-sembilan/dun/rantau");
    expect(stateElectionPartyComparisonPath("pkr")).toBe("/prn/perbandingan/parti/pkr");
    expect(localityPath(14, "selangor", "pandan", "pdm-1", "lokaliti-1", "dun-1"))
      .toBe("/pru/14/negeri/selangor/parlimen/pandan/dun/dun-1/pdm/pdm-1/lokaliti/lokaliti-1");
    expect(electionNumberForLocation("/pru/15/negeri", "")).toBe(15);
    expect(electionNumberForLocation("/settings/data/calon", "?election=15")).toBe(15);
    expect(electionEdition(99)).toBeUndefined();
  });

  it("publishes edition, contest, candidacy, person and term identities", () => {
    expect(registry.defaultElectionId).toBe("pru-15");
    expect(election.metadata).toMatchObject({ electionId: "pru-15", electionNumber: 15, termId: "dr-15" });
    expect(new Set(election.seats.map((seat) => seat.contestId)).size).toBe(222);
    const candidacies = election.seats.flatMap((seat) => seat.candidates.map((candidate) => candidate.candidacyId));
    expect(new Set(candidacies).size).toBe(election.metadata.candidateCount);
    expect(candidacies.every((id) => id.startsWith("pru-15:"))).toBe(true);
    expect(affiliations.affiliations.every((event) => event.electionId === "pru-15" && event.termId === "dr-15" && event.personId.startsWith("person:"))).toBe(true);
  });

  it("keeps the runtime registry aligned with the published catalogue", () => {
    const runtime = ELECTION_EDITIONS.map(({ id, number, shortTitle, electionDate, termId, boundaryVersion, isCurrentTerm, capabilities }) => ({ id, number, shortTitle, electionDate, termId, boundaryVersion, isCurrentTerm, capabilities }));
    const published = registry.elections.map(({ id, number, shortTitle, electionDate, termId, boundaryVersion, isCurrentTerm, capabilities }) => ({ id, number, shortTitle, electionDate, termId, boundaryVersion, isCurrentTerm, capabilities }));
    expect(runtime).toEqual(published);
    expect(ELECTION_EDITIONS.filter((edition) => edition.isCurrentTerm)).toHaveLength(1);
  });

  it("registers PRU-14 as a historical, core-only edition", () => {
    const edition = ELECTION_EDITIONS.find((item) => item.number === 14);
    expect(edition).toMatchObject({ id: "pru-14", termId: "dr-14", isCurrentTerm: false });
    expect(edition?.capabilities).toEqual({ seating: false, scoresheets: false, voterRoll: true, voterAge: false, voterEthnicity: false, geography: false });
  });
});
