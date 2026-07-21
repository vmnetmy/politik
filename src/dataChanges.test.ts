import { describe, expect, it } from "vitest";
import election from "../public/data/election.json";
import affiliationFile from "../public/data/affiliations.json";
import {
  applyAffiliationEvents,
  buildDefaultAllianceCatalog,
  buildDefaultPartyCatalog,
  currentAlliance,
  currentParty,
  parseAffiliationFile,
  parsePartyCatalogFile,
} from "./dataChanges";
import type { ElectionData } from "./types";

const data = election as ElectionData;
const events = parseAffiliationFile(affiliationFile);
const parties = buildDefaultPartyCatalog(data);
const alliances = buildDefaultAllianceCatalog(data);

describe("effective-dated affiliations", () => {
  it.each([
    ["2026-02-12", "PARTI PRIBUMI BERSATU MALAYSIA (BERSATU)", "PERIKATAN NASIONAL (PN)"],
    ["2026-02-13", "BEBAS", "LAIN-LAIN / BEBAS"],
    ["2026-06-13", "PARTI WAWASAN NEGARA", "LAIN-LAIN / BEBAS"],
    ["2026-07-06", "PARTI WAWASAN NEGARA", "PERIKATAN NASIONAL (PN)"],
  ])("resolves Hamzah's membership on %s", (date, party, alliance) => {
    const seat = applyAffiliationEvents(data.seats, events, parties, alliances, date).find((item) => item.code === "P.056");
    expect(seat).toBeDefined();
    expect(currentParty(seat!)).toBe(party);
    expect(currentAlliance(seat!)).toBe(alliance);
    expect(seat!.winner.party).toBe("PARTI PRIBUMI BERSATU MALAYSIA (BERSATU)");
    expect(seat!.winner.alliance).toBe("PERIKATAN NASIONAL (PN)");
  });

  it.each([
    ["2026-05-16", "PARTI KEADILAN RAKYAT (PKR)", "PAKATAN HARAPAN (PH)"],
    ["2026-05-17", "PARTI BERSAMA MALAYSIA", "LAIN-LAIN / BEBAS"],
  ])("resolves Rafizi's membership on %s without rewriting PRU-15", (date, party, alliance) => {
    const seat = applyAffiliationEvents(data.seats, events, parties, alliances, date).find((item) => item.code === "P.100");
    expect(seat).toBeDefined();
    expect(currentParty(seat!)).toBe(party);
    expect(currentAlliance(seat!)).toBe(alliance);
    expect(seat!.winner.party).toBe("PARTI KEADILAN RAKYAT (PKR)");
    expect(seat!.winner.alliance).toBe("PAKATAN HARAPAN (PH)");
  });
});

describe("party identity catalogue", () => {
  it("keeps Parti Bersama Malaysia separate from Parti Bangsa Malaysia", () => {
    const bersama = parties.find((party) => party.name === "PARTI BERSAMA MALAYSIA");
    const pbm = parties.find((party) => party.name === "PARTI BANGSA MALAYSIA (PBM)");
    expect(bersama?.shortName).toBe("BERSAMA");
    expect(pbm?.shortName).toBe("PBM");
  });

  it("migrates an edited PBM catalogue record to the BERSAMA abbreviation", () => {
    const [record] = parsePartyCatalogFile({ parties: [{
      id: "party-local-pbm",
      sourceName: "PARTI BANGSA MALAYSIA (PBM)",
      aliases: ["PBM", "PARTI BANGSA MALAYSIA (PBM)"],
      name: "PARTI BERSAMA MALAYSIA",
      shortName: "PBM",
      alliance: "LAIN-LAIN / BEBAS",
      active: true,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    }] });
    expect(record).toMatchObject({ sourceName: "PARTI BERSAMA MALAYSIA", name: "PARTI BERSAMA MALAYSIA", shortName: "BERSAMA" });
    expect(record.aliases).toEqual(["BERSAMA"]);
  });
});
