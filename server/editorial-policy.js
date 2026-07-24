export const REVISION_STATUSES = ["draft", "reviewed", "published", "superseded"];

const transitions = {
  draft: new Set(["reviewed"]),
  reviewed: new Set(["draft", "published"]),
  published: new Set(["superseded"]),
  superseded: new Set(),
};

export function canTransitionRevision(from, to) {
  return Boolean(transitions[from]?.has(to));
}

export function transitionViolation(revision, target, actor) {
  if (!actor || actor.length < 2 || actor.length > 120) return "invalid_actor";
  if (!canTransitionRevision(revision.status, target)) return "invalid_transition";
  if (["reviewed", "published"].includes(target) && actor === revision.created_by) {
    return "separation_of_duties_required";
  }
  return null;
}

export function validateRevisionInput(body) {
  if (!body || typeof body !== "object") throw new Error("invalid_payload");
  const dataKind = String(body.dataKind ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const actor = String(body.actor ?? "").trim();
  if (!/^[a-z][a-z0-9-]{1,60}$/.test(dataKind)) throw new Error("invalid_data_kind");
  if (reason.length < 8 || reason.length > 1000) throw new Error("invalid_reason");
  if (actor.length < 2 || actor.length > 120) throw new Error("invalid_actor");
  if (body.payload === undefined) throw new Error("missing_revision_payload");
  const electionId = String(body.electionId ?? "").trim();
  if (!/^(pru|prn)-[a-z0-9-]+$/.test(electionId)) throw new Error("invalid_election_id");
  return {
    electionId,
    dataKind,
    reason,
    actor,
    sourceUrl: body.sourceUrl ? String(body.sourceUrl).slice(0, 500) : null,
    effectiveAt: body.effectiveAt ? String(body.effectiveAt) : null,
    payload: body.payload,
  };
}
