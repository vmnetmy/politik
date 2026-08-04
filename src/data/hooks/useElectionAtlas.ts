import { useEffect, useState } from "react";
import { electionEdition } from "../../elections";
import type { ElectionData } from "../../types";
import type { ConstituencyRegistry, GeographyData } from "../../types";
import type { ElectionAtlasBoundaries, ElectionAtlasStateBoundaries, ElectionBoundaryRegistry } from "../types/atlas";

let boundaryPromise: Promise<ElectionAtlasBoundaries> | null = null;
let boundaryRegistryPromise: Promise<ElectionBoundaryRegistry> | null = null;
let hierarchyPromise: Promise<{ constituencies: ConstituencyRegistry; geography: GeographyData }> | null = null;
const stateBoundaryPromises = new Map<string, Promise<ElectionAtlasStateBoundaries>>();
const electionPromises = new Map<number, Promise<ElectionData>>();

export function loadAtlasBoundaries() {
  boundaryPromise ??= fetch("/data/boundaries/my-sarawak-2015-peninsula-2018-sabah-2019/atlas/index.json").then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
  return boundaryPromise;
}

export function loadAtlasBoundaryRegistry() {
  boundaryRegistryPromise ??= fetch("/data/boundaries/registry.json").then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
  return boundaryRegistryPromise;
}

export function loadAtlasStateBoundaries(stateId: string, filename?: string) {
  const cacheKey = filename ?? stateId;
  const existing = stateBoundaryPromises.get(cacheKey);
  if (existing) return existing;
  const path = filename
    ? `/data/boundaries/${filename}`
    : `/data/boundaries/my-sarawak-2015-peninsula-2018-sabah-2019/atlas/states/${stateId}.json`;
  const promise = fetch(path).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
  stateBoundaryPromises.set(cacheKey, promise);
  return promise;
}

export function loadAtlasHierarchy() {
  hierarchyPromise ??= Promise.all([
    fetch("/data/elections/pru-15/constituencies.json").then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }),
    fetch("/data/elections/pru-15/geography.json").then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }),
  ]).then(([constituencies, geography]) => ({ constituencies, geography }));
  return hierarchyPromise;
}

function loadFederalEdition(electionNumber: number) {
  const edition = electionEdition(electionNumber);
  if (!edition) return Promise.reject(new Error(`PRU-${electionNumber} belum didaftarkan.`));
  const existing = electionPromises.get(electionNumber);
  if (existing) return existing;
  const promise = fetch(`${edition.dataPath}/election.json`).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
  electionPromises.set(electionNumber, promise);
  return promise;
}

export function useAtlasBoundaries() {
  const [value, setValue] = useState<ElectionAtlasBoundaries | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadAtlasBoundaries()
      .then((loaded) => active && setValue(loaded))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, []);
  return { value, error };
}

export function useAtlasBoundaryRegistry() {
  const [value, setValue] = useState<ElectionBoundaryRegistry | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadAtlasBoundaryRegistry()
      .then((loaded) => active && setValue(loaded))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, []);
  return { value, error };
}

export function useAtlasStateBoundaries(stateId: string, filename?: string) {
  const [value, setValue] = useState<ElectionAtlasStateBoundaries | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!stateId || !filename) {
      setValue(null);
      setError("");
      return;
    }
    let active = true;
    setValue(null);
    const startedAt = performance.now();
    loadAtlasStateBoundaries(stateId, filename)
      .then((loaded) => {
        if (active) {
          performance.measure("atlas-state-geometry", { start: startedAt, end: performance.now(), detail: { stateId } });
          setValue(loaded);
        }
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [filename, stateId]);
  return { value, error };
}

export function useAtlasHierarchy(enabled = true) {
  const [value, setValue] = useState<{ constituencies: ConstituencyRegistry; geography: GeographyData } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setValue(null);
      setError("");
      return;
    }
    let active = true;
    loadAtlasHierarchy()
      .then((loaded) => active && setValue(loaded))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [enabled]);
  return { value, error };
}

export function useFederalAtlasEdition(
  electionNumber: number,
  currentElectionData: ElectionData | null,
  enabled = true,
) {
  const [value, setValue] = useState<ElectionData | null>(
    currentElectionData?.metadata.electionNumber === electionNumber ? currentElectionData : null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setValue(null);
      setError("");
      return;
    }
    if (currentElectionData?.metadata.electionNumber === electionNumber) {
      setValue(currentElectionData);
      setError("");
      return;
    }
    let active = true;
    setValue(null);
    setError("");
    loadFederalEdition(electionNumber)
      .then((loaded) => active && setValue(loaded))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [currentElectionData, electionNumber, enabled]);
  return { value, error };
}
