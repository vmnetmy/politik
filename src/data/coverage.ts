import type { ConstituencyRegistry, GeographyData } from "../types";
import type { ElectionBoundaryRegistry } from "./types/atlas";

export type CoverageStatus = "complete" | "partial" | "unavailable";

export type StateCoverageRow = {
  id: string;
  name: string;
  parliamentCount: number;
  dunCount: number;
  pdmCount: number;
  scoresheetPdmCount: number;
  coveredPdmCount: number;
  localityCount: number;
  localityCoveragePct: number;
};

export type BoundaryCoverageRow = {
  id: string;
  label: string;
  scope: "PRU" | "PRN";
  status: "exact" | "compatible" | "approximate" | "identity-only";
  stateCount: number;
  snapshotFile: string;
  exactStateCount: number;
  compatibleStateCount: number;
  identityOnlyStateCount: number;
};

export function coveragePercent(covered: number, total: number) {
  return total > 0 ? covered / total * 100 : 0;
}

export function coverageStatus(covered: number, total: number): CoverageStatus {
  if (total <= 0 || covered <= 0) return "unavailable";
  return covered >= total ? "complete" : "partial";
}

export function buildStateCoverage(geography: GeographyData, constituencies: ConstituencyRegistry): StateCoverageRow[] {
  const localityCountByState = geography.localities.reduce<Record<string, number>>((counts, locality) => {
    counts[locality.stateId] = (counts[locality.stateId] ?? 0) + 1;
    return counts;
  }, {});
  return constituencies.states.map((state) => {
    const pdms = geography.pdms.filter((pdm) => pdm.stateId === state.id);
    const coveredPdmCount = pdms.filter((pdm) => pdm.localityIds.length > 0).length;
    return {
      id: state.id,
      name: state.name,
      parliamentCount: constituencies.parliaments.filter((item) => item.stateId === state.id).length,
      dunCount: constituencies.duns.filter((item) => item.stateId === state.id).length,
      pdmCount: pdms.length,
      scoresheetPdmCount: pdms.filter((pdm) => pdm.hasScoresheet).length,
      coveredPdmCount,
      localityCount: localityCountByState[state.id] ?? 0,
      localityCoveragePct: coveragePercent(coveredPdmCount, pdms.length),
    };
  });
}

export function buildBoundaryCoverage(registry: ElectionBoundaryRegistry): BoundaryCoverageRow[] {
  const toRow = (
    id: string,
    scope: "PRU" | "PRN",
    entry: ElectionBoundaryRegistry["federal"][string],
  ): BoundaryCoverageRow => {
    const states = Object.values(entry.states ?? {});
    return {
      id: `${scope.toLowerCase()}-${id}`,
      label: scope === "PRU" ? `PRU-${id.replace("pru-", "")}` : `PRN-${id}`,
      scope,
      status: entry.status,
      stateCount: states.length,
      snapshotFile: entry.snapshotFile,
      exactStateCount: states.filter((state) => state.status === "exact").length,
      compatibleStateCount: states.filter((state) => state.status === "compatible").length,
      identityOnlyStateCount: states.filter((state) => state.status === "identity-only").length,
    };
  };
  return [
    ...Object.entries(registry.federal).map(([id, entry]) => toRow(id, "PRU", entry)),
    ...Object.entries(registry.stateAssemblies).map(([id, entry]) => toRow(id, "PRN", entry)),
  ].sort((first, second) => first.scope.localeCompare(second.scope) || first.label.localeCompare(second.label));
}
