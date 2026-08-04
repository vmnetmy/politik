import { useEffect, useState } from "react";
import type { ConstituencyRegistry } from "../types/voterAge";
import type { StateElectionData } from "../types/stateElection";

export type LoadedStateElectionData = {
  results: StateElectionData;
  constituencies: ConstituencyRegistry;
};

let dataPromise: Promise<LoadedStateElectionData> | null = null;

export function loadStateElectionData() {
  dataPromise ??= Promise.all([
    fetch("/data/state-elections.json").then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }),
    fetch("/data/elections/pru-15/constituencies.json").then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }),
  ]).then(([results, constituencies]) => ({
    results,
    constituencies: {
      ...constituencies,
      duns: [...constituencies.duns, ...(results.historicalConstituencies ?? [])],
    },
  }));
  return dataPromise;
}

export function useStateElectionData(enabled = true) {
  const [value, setValue] = useState<LoadedStateElectionData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setValue(null);
      setError("");
      return;
    }
    let active = true;
    loadStateElectionData()
      .then((loaded) => active && setValue(loaded))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [enabled]);
  return { value, error };
}
