import type { AffiliationEvent, AllianceCatalogItem, CandidateChange, DataChange, ElectionData, PartyCatalogItem, Seat } from "./types";

export const VACANT_ALLIANCE = "KERUSI KOSONG";
export const LOCAL_CHANGES_KEY = "politik:data-overrides:v1";
export const LOCAL_CANDIDATE_CHANGES_KEY = "politik:candidate-overrides:v1";
export const LOCAL_PARTY_CATALOG_KEY = "politik:party-catalog:v1";
export const LOCAL_ALLIANCE_CATALOG_KEY = "politik:alliance-catalog:v1";
export const LOCAL_AFFILIATIONS_KEY = "politik:affiliation-events:v1";
export const INDEPENDENT_ALLIANCE = "LAIN-LAIN / BEBAS";
export const INDEPENDENT_PARTY = "BEBAS";
export const BERSAMA_PARTY_NAME = "PARTI BERSAMA MALAYSIA";
export const BERSAMA_PARTY_SHORT_NAME = "BERSAMA";

export const personIdForSeat = (seatCode: string) => `pru15:${seatCode}:winner`;

const today = () => new Date().toISOString().slice(0, 10);
const baselineTimestamp = (data: ElectionData) => `${data.metadata.electionDate}T00:00:00.000Z`;
const catalogId = (prefix: string, name: string) => `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
const inferredShortName = (name: string) => name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name;
const canonicalName = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const isBersamaParty = (value: string) => canonicalName(value) === BERSAMA_PARTY_NAME;
const isHistoricalPbmAlias = (value: string) => ["PBM", "PARTI BANGSA MALAYSIA", "PARTI BANGSA MALAYSIA PBM"].includes(canonicalName(value));

export function currentAlliance(seat: Seat) {
  if (seat.current?.status === "vacant") return VACANT_ALLIANCE;
  return seat.current?.affiliation?.alliance ?? seat.current?.alliance ?? seat.winner.alliance;
}

export function currentParty(seat: Seat) {
  if (seat.current?.status === "vacant") return "—";
  return seat.current?.affiliation?.party ?? seat.current?.party ?? seat.winner.party;
}

export function currentStatus(seat: Seat) {
  return seat.current?.status ?? "active";
}

export function applyDataChanges(seats: Seat[], changes: DataChange[], asOf = today()): Seat[] {
  const bySeat = new Map<string, DataChange[]>();
  changes
    .filter((change) => change.effectiveDate <= asOf)
    .forEach((change) => bySeat.set(change.seatCode, [...(bySeat.get(change.seatCode) ?? []), change]));

  return seats.map((seat) => {
    const latest = (bySeat.get(seat.code) ?? []).sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
    ).at(-1);
    if (!latest) {
      return {
        ...seat,
        current: {
          status: "active",
          alliance: seat.winner.alliance,
          party: seat.winner.party,
          effectiveDate: "2022-11-19",
          reason: "Keputusan asal PRU-15",
          isChanged: false,
        },
      };
    }
    return {
      ...seat,
      current: {
        status: latest.status,
        alliance: latest.status === "vacant" ? VACANT_ALLIANCE : latest.alliance,
        party: latest.status === "vacant" ? "—" : latest.party,
        effectiveDate: latest.effectiveDate,
        reason: latest.reason,
        sourceUrl: latest.sourceUrl,
        changeId: latest.id,
        isChanged: true,
      },
    };
  });
}

export function applyAffiliationEvents(
  seats: Seat[],
  events: AffiliationEvent[],
  parties: PartyCatalogItem[],
  alliances: AllianceCatalogItem[],
  asOf = today(),
): Seat[] {
  const latestBySeat = new Map<string, AffiliationEvent>();
  events
    .filter((event) => event.effectiveDate <= asOf)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt))
    .forEach((event) => latestBySeat.set(event.seatCode, event));

  return seats.map((seat) => {
    const event = latestBySeat.get(seat.code);
    if (!event) return seat;
    const party = event.status === "independent"
      ? INDEPENDENT_PARTY
      : parties.find((item) => item.id === event.partyId)?.name ?? event.partyName;
    const alliance = event.status === "independent"
      ? INDEPENDENT_ALLIANCE
      : alliances.find((item) => item.id === event.allianceId)?.name ?? event.allianceName;
    const baseline = seat.current ?? {
      status: "active" as const,
      alliance: seat.winner.alliance,
      party: seat.winner.party,
      effectiveDate: "2022-11-19",
      reason: "Keputusan asal PRU-15",
      isChanged: false,
    };
    return {
      ...seat,
      current: {
        ...baseline,
        isChanged: true,
        affiliation: {
          status: event.status,
          partyId: event.partyId,
          party,
          allianceId: event.allianceId,
          alliance,
          effectiveDate: event.effectiveDate,
          reason: event.reason,
          sourceUrl: event.sourceUrl,
          eventId: event.id,
          isChanged: true,
        },
      },
    };
  });
}

export function applyCandidateChanges(seats: Seat[], changes: CandidateChange[], asOf = today()): Seat[] {
  const latestByCandidate = new Map<string, CandidateChange>();
  changes
    .filter((change) => change.effectiveDate <= asOf)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt))
    .forEach((change) => latestByCandidate.set(`${change.seatCode}:${change.candidateIndex}`, change));

  return seats.map((seat) => {
    const candidates = seat.candidates.map((candidate, candidateIndex) => {
      const change = latestByCandidate.get(`${seat.code}:${candidateIndex}`);
      return change ? { ...candidate, name: change.name, alliance: change.alliance, party: change.party } : candidate;
    });
    const winnerChange = latestByCandidate.get(`${seat.code}:0`);
    const winner = winnerChange
      ? {
          ...seat.winner,
          name: winnerChange.name,
          alliance: winnerChange.alliance,
          party: winnerChange.party,
          gender: winnerChange.gender || seat.winner.gender,
          ethnicity: winnerChange.ethnicity || seat.winner.ethnicity,
        }
      : seat.winner;
    return { ...seat, candidates, winner };
  });
}

function catalogMap<T extends { sourceName: string; aliases: string[]; name: string }>(items: T[]) {
  const values = new Map<string, string>();
  items.forEach((item) => {
    [item.sourceName, item.name, ...item.aliases].filter(Boolean).forEach((name) => values.set(name, item.name));
  });
  return values;
}

export function resolveCatalogValue<T extends { sourceName: string; aliases: string[]; name: string }>(value: string, items: T[]) {
  return catalogMap(items).get(value) ?? value;
}

export function applyReferenceCatalog(seats: Seat[], parties: PartyCatalogItem[], alliances: AllianceCatalogItem[]): Seat[] {
  const partyNames = catalogMap(parties);
  const allianceNames = catalogMap(alliances);
  const mapParty = (value: string) => partyNames.get(value) ?? value;
  const mapAlliance = (value: string) => allianceNames.get(value) ?? value;
  return seats.map((seat) => ({
    ...seat,
    current: seat.current ? {
      ...seat.current,
      party: mapParty(seat.current.party),
      alliance: mapAlliance(seat.current.alliance),
      affiliation: seat.current.affiliation ? {
        ...seat.current.affiliation,
        party: mapParty(seat.current.affiliation.party),
        alliance: mapAlliance(seat.current.affiliation.alliance),
      } : undefined,
    } : seat.current,
  }));
}

export function parseAffiliationFile(value: unknown): AffiliationEvent[] {
  const candidate = Array.isArray(value) ? value : (value as { affiliations?: unknown })?.affiliations;
  if (!Array.isArray(candidate)) throw new Error("Fail keahlian mesti mengandungi senarai 'affiliations'.");
  const validStatuses = new Set(["party", "independent"]);
  return candidate.map((item, index) => {
    const event = item as Partial<AffiliationEvent>;
    if (!event.id || !event.seatCode || !event.effectiveDate || !event.reason?.trim() || !event.createdAt || !validStatuses.has(event.status ?? "")) {
      throw new Error(`Rekod keahlian #${index + 1} tidak lengkap.`);
    }
    if (event.status === "party" && (!event.partyName?.trim() || !event.allianceName?.trim())) {
      throw new Error(`Parti dan gabungan diperlukan untuk rekod keahlian #${index + 1}.`);
    }
    return {
      id: event.id,
      personId: event.personId || personIdForSeat(event.seatCode),
      seatCode: event.seatCode,
      effectiveDate: event.effectiveDate,
      status: event.status as AffiliationEvent["status"],
      partyId: event.partyId ?? null,
      partyName: event.partyName?.trim() || INDEPENDENT_PARTY,
      allianceId: event.allianceId ?? null,
      allianceName: event.allianceName?.trim() || INDEPENDENT_ALLIANCE,
      reason: event.reason.trim(),
      sourceUrl: event.sourceUrl?.trim() || undefined,
      createdAt: event.createdAt,
    };
  });
}

export function buildDefaultAllianceCatalog(data: ElectionData): AllianceCatalogItem[] {
  const timestamp = baselineTimestamp(data);
  return data.alliances.map((alliance) => ({
    id: catalogId("alliance", alliance.name),
    sourceName: alliance.name,
    aliases: [],
    name: alliance.name,
    shortName: alliance.shortName,
    color: alliance.color,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function buildDefaultPartyCatalog(data: ElectionData): PartyCatalogItem[] {
  const timestamp = baselineTimestamp(data);
  const candidates = data.seats.flatMap((seat) => seat.candidates);
  const electionParties = [...new Set(candidates.map((candidate) => candidate.party).filter(Boolean))].sort().map((name) => {
    const allianceCounts = candidates.filter((candidate) => candidate.party === name).reduce<Record<string, number>>((counts, candidate) => ({ ...counts, [candidate.alliance]: (counts[candidate.alliance] ?? 0) + 1 }), {});
    const alliance = Object.entries(allianceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "LAIN-LAIN / BEBAS";
    return {
      id: catalogId("party", name),
      sourceName: name,
      aliases: [],
      name,
      shortName: inferredShortName(name),
      alliance,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  return [
    ...electionParties,
    {
      id: "party-parti-wawasan-negara",
      sourceName: "PARTI WAWASAN NEGARA",
      aliases: ["WAWASAN", "PWN"],
      name: "PARTI WAWASAN NEGARA",
      shortName: "PWN",
      alliance: "PERIKATAN NASIONAL (PN)",
      active: true,
      createdAt: "2026-06-13T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    },
    {
      id: "party-parti-bersama-malaysia",
      sourceName: BERSAMA_PARTY_NAME,
      aliases: [BERSAMA_PARTY_SHORT_NAME],
      name: BERSAMA_PARTY_NAME,
      shortName: BERSAMA_PARTY_SHORT_NAME,
      alliance: INDEPENDENT_ALLIANCE,
      active: true,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    },
  ];
}

export function parseChangeFile(value: unknown): DataChange[] {
  const candidate = Array.isArray(value) ? value : (value as { changes?: unknown })?.changes;
  if (!Array.isArray(candidate)) throw new Error("Fail perubahan mesti mengandungi senarai 'changes'.");
  const validStatuses = new Set(["active", "vacant", "suspended"]);
  return candidate.map((item, index) => {
    const change = item as Partial<DataChange>;
    if (!change.id || !change.seatCode || !change.effectiveDate || !change.reason || !change.createdAt || !validStatuses.has(change.status ?? "")) {
      throw new Error(`Rekod perubahan #${index + 1} tidak lengkap.`);
    }
    return {
      id: change.id,
      seatCode: change.seatCode,
      effectiveDate: change.effectiveDate,
      status: change.status as DataChange["status"],
      alliance: change.alliance ?? "",
      party: change.party ?? "",
      reason: change.reason,
      sourceUrl: change.sourceUrl,
      createdAt: change.createdAt,
    };
  });
}

export function parseCandidateChangeFile(value: unknown): CandidateChange[] {
  const candidate = Array.isArray(value) ? value : (value as { candidateChanges?: unknown })?.candidateChanges;
  if (!Array.isArray(candidate)) throw new Error("Fail perubahan mesti mengandungi senarai 'candidateChanges'.");
  return candidate.map((item, index) => {
    const change = item as Partial<CandidateChange>;
    if (
      !change.id ||
      !change.seatCode ||
      !Number.isInteger(change.candidateIndex) ||
      (change.candidateIndex ?? -1) < 0 ||
      !change.effectiveDate ||
      !change.name?.trim() ||
      !change.alliance?.trim() ||
      !change.party?.trim() ||
      !change.reason?.trim() ||
      !change.createdAt
    ) {
      throw new Error(`Rekod perubahan calon #${index + 1} tidak lengkap.`);
    }
    return {
      id: change.id,
      seatCode: change.seatCode,
      candidateIndex: change.candidateIndex as number,
      effectiveDate: change.effectiveDate,
      name: change.name.trim(),
      alliance: change.alliance.trim(),
      party: change.party.trim(),
      gender: change.gender?.trim() || undefined,
      ethnicity: change.ethnicity?.trim() || undefined,
      reason: change.reason.trim(),
      sourceUrl: change.sourceUrl?.trim() || undefined,
      createdAt: change.createdAt,
    };
  });
}

export function parseAllianceCatalogFile(value: unknown): AllianceCatalogItem[] {
  const candidate = Array.isArray(value) ? value : (value as { alliances?: unknown })?.alliances;
  if (!Array.isArray(candidate)) throw new Error("Fail gabungan mesti mengandungi senarai 'alliances'.");
  return candidate.map((item, index) => {
    const record = item as Partial<AllianceCatalogItem>;
    if (!record.id || !record.sourceName?.trim() || !record.name?.trim() || !record.shortName?.trim() || !record.color?.trim()) throw new Error(`Rekod gabungan #${index + 1} tidak lengkap.`);
    const createdAt = record.createdAt ?? new Date().toISOString();
    return { id: record.id, sourceName: record.sourceName.trim(), aliases: Array.isArray(record.aliases) ? record.aliases.filter((alias): alias is string => typeof alias === "string" && Boolean(alias.trim())).map((alias) => alias.trim()) : [], name: record.name.trim(), shortName: record.shortName.trim(), color: record.color.trim(), active: record.active !== false, createdAt, updatedAt: record.updatedAt ?? createdAt };
  });
}

export function parsePartyCatalogFile(value: unknown): PartyCatalogItem[] {
  const candidate = Array.isArray(value) ? value : (value as { parties?: unknown })?.parties;
  if (!Array.isArray(candidate)) throw new Error("Fail parti mesti mengandungi senarai 'parties'.");
  return candidate.map((item, index) => {
    const record = item as Partial<PartyCatalogItem>;
    if (!record.id || !record.sourceName?.trim() || !record.name?.trim() || !record.shortName?.trim() || !record.alliance?.trim()) throw new Error(`Rekod parti #${index + 1} tidak lengkap.`);
    const createdAt = record.createdAt ?? new Date().toISOString();
    const sourceName = record.sourceName.trim();
    const name = record.name.trim();
    const aliases = Array.isArray(record.aliases) ? record.aliases.filter((alias): alias is string => typeof alias === "string" && Boolean(alias.trim())).map((alias) => alias.trim()) : [];
    const isBersama = isBersamaParty(name) || isBersamaParty(sourceName);
    return {
      id: record.id,
      sourceName: isBersama ? BERSAMA_PARTY_NAME : sourceName,
      aliases: isBersama ? [...new Set([...aliases.filter((alias) => !isHistoricalPbmAlias(alias)), BERSAMA_PARTY_SHORT_NAME])] : aliases,
      name: isBersama ? BERSAMA_PARTY_NAME : name,
      shortName: isBersama ? BERSAMA_PARTY_SHORT_NAME : record.shortName.trim(),
      alliance: record.alliance.trim(),
      active: record.active !== false,
      createdAt,
      updatedAt: record.updatedAt ?? createdAt,
    };
  });
}
