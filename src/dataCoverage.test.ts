import { describe, expect, it } from "vitest";
import geography from "../public/data/elections/pru-15/geography.json";
import constituencies from "../public/data/elections/pru-15/constituencies.json";
import boundaryRegistry from "../public/data/boundaries/registry.json";
import { buildBoundaryCoverage, buildStateCoverage, coverageStatus } from "./data/coverage";
import type { ConstituencyRegistry, GeographyData } from "./types";
import type { ElectionBoundaryRegistry } from "./data/types/atlas";

describe("data coverage model", () => {
  it("derives state locality coverage from the governed hierarchy", () => {
    const rows = buildStateCoverage(geography as GeographyData, constituencies as ConstituencyRegistry);
    expect(rows).toHaveLength(16);
    expect(rows.reduce((sum, row) => sum + row.pdmCount, 0)).toBe(7748);
    expect(rows.reduce((sum, row) => sum + row.coveredPdmCount, 0)).toBe(2);
    expect(rows.find((row) => row.id === "kelantan")).toMatchObject({ coveredPdmCount: 2, localityCount: 13 });
  });

  it("lists every immutable PRU and PRN boundary snapshot", () => {
    const rows = buildBoundaryCoverage(boundaryRegistry as ElectionBoundaryRegistry);
    expect(rows.map((row) => row.label)).toEqual(expect.arrayContaining(["PRU-14", "PRU-15", "PRN-12", "PRN-17"]));
    expect(rows.find((row) => row.label === "PRU-14")?.status).toBe("compatible");
    expect(rows.find((row) => row.label === "PRU-15")?.exactStateCount).toBe(16);
  });

  it("uses explicit complete, partial and unavailable states", () => {
    expect(coverageStatus(10, 10)).toBe("complete");
    expect(coverageStatus(2, 10)).toBe("partial");
    expect(coverageStatus(0, 10)).toBe("unavailable");
  });
});
