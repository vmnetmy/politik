import { useEffect, useState } from "react";
import { ELECTION_EDITIONS, type ElectionEdition } from "../../elections";
import type { ElectionData } from "../../types";

export type PublishedFederalElection = {
  edition: ElectionEdition;
  data: ElectionData;
};

let comparisonDataPromise: Promise<PublishedFederalElection[]> | null = null;

export function loadFederalElectionComparisonData() {
  comparisonDataPromise ??= Promise.all(ELECTION_EDITIONS.map(async (edition) => {
    const response = await fetch(`${edition.dataPath}/election.json`);
    if (!response.ok) throw new Error(`${edition.shortTitle}: HTTP ${response.status}`);
    const data = await response.json() as ElectionData;
    if (
      data.metadata.electionId !== edition.id
      || data.metadata.electionNumber !== edition.number
      || data.metadata.termId !== edition.termId
      || data.metadata.boundaryVersion !== edition.boundaryVersion
    ) {
      throw new Error(`Metadata ${edition.shortTitle} tidak sepadan dengan katalog edisi.`);
    }
    return { edition, data };
  })).then((records) => records.sort((first, second) => first.edition.number - second.edition.number));
  return comparisonDataPromise;
}

export function useFederalElectionComparisonData(enabled = true) {
  const [value, setValue] = useState<PublishedFederalElection[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setValue(null);
      setError("");
      return;
    }
    let active = true;
    loadFederalElectionComparisonData()
      .then((records) => {
        if (active) setValue(records);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Data perbandingan PRU tidak dapat dimuatkan.");
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { value, error };
}
