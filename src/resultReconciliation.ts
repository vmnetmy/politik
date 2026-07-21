import type { ReconciliationConflict, ReconciliationData, Seat } from "./types";

export const LOCAL_RESULT_RECONCILIATION_KEY = "politik:result-reconciliation:v1";

export function parseReconciliationFile(value: unknown): ReconciliationData {
  if (!value || typeof value !== "object") throw new Error("Fail rekonsiliasi keputusan tidak sah.");
  const candidate = value as Partial<ReconciliationData>;
  if (candidate.version !== 1 || !Array.isArray(candidate.conflicts)) throw new Error("Fail rekonsiliasi mesti mengandungi senarai 'conflicts'.");
  const conflicts = candidate.conflicts.map((conflict, index) => {
    if (!conflict || typeof conflict !== "object") throw new Error(`Rekod rekonsiliasi #${index + 1} tidak sah.`);
    const item = conflict as ReconciliationConflict;
    if (
      typeof item.id !== "string"
      || !/^P\.\d{3}$/.test(item.parliamentCode)
      || !["pending", "approved", "rejected"].includes(item.decision)
      || !Array.isArray(item.candidates)
      || typeof item.sourceSha256 !== "string"
    ) throw new Error(`Rekod rekonsiliasi #${index + 1} tidak lengkap.`);
    return item;
  });
  return { version: 1, sourceGeneratedAt: String(candidate.sourceGeneratedAt ?? ""), conflicts };
}

export function mergeReconciliation(baseline: ReconciliationData, local?: ReconciliationData): ReconciliationData {
  if (!local) return baseline;
  const localById = new Map(local.conflicts.map((item) => [item.id, item]));
  return {
    ...baseline,
    conflicts: baseline.conflicts.map((item) => {
      const override = localById.get(item.id);
      if (!override || override.sourceSha256 !== item.sourceSha256) return item;
      return { ...item, decision: override.decision, reviewedAt: override.reviewedAt };
    }),
  };
}

export function applyApprovedReconciliation(seats: Seat[], conflicts: ReconciliationConflict[]): Seat[] {
  const approved = new Map(conflicts.filter((item) => item.decision === "approved").map((item) => [item.parliamentCode, item]));
  return seats.map((seat) => {
    const conflict = approved.get(seat.code);
    if (!conflict) return seat;
    const correctedVotes = new Map(conflict.candidates.map((item) => [item.candidateId, item.scoresheetVotes]));
    const turnout = conflict.scoresheetValidVotes;
    const candidates = seat.candidates
      .map((candidate) => {
        const votes = correctedVotes.get(candidate.id) ?? candidate.votes;
        return { ...candidate, votes, share: turnout ? Math.round((votes / turnout) * 1_000_000) / 1_000_000 : 0 };
      })
      .sort((a, b) => b.votes - a.votes);
    const winnerCandidate = candidates[0];
    const runnerUp = candidates[1];
    const winner = {
      ...winnerCandidate,
      gender: winnerCandidate.id === seat.winner.id ? seat.winner.gender : "TIDAK DINYATAKAN",
      ethnicity: winnerCandidate.id === seat.winner.id ? seat.winner.ethnicity : "TIDAK DINYATAKAN",
    };
    return {
      ...seat,
      turnout,
      turnoutPct: seat.registered ? Math.round((turnout / seat.registered) * 1_000_000) / 1_000_000 : 0,
      candidates,
      winner,
      marginVotes: winnerCandidate.votes - (runnerUp?.votes ?? 0),
      marginShare: Math.round((winnerCandidate.share - (runnerUp?.share ?? 0)) * 1_000_000) / 1_000_000,
    };
  });
}
