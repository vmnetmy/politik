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
});
