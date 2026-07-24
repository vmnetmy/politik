import { describe, expect, it } from "vitest";
import { canTransitionRevision, transitionViolation, validateRevisionInput } from "./editorial-policy.js";

describe("editorial publication policy", () => {
  it("allows only the governed state machine", () => {
    expect(canTransitionRevision("draft", "reviewed")).toBe(true);
    expect(canTransitionRevision("reviewed", "published")).toBe(true);
    expect(canTransitionRevision("published", "draft")).toBe(false);
  });

  it("requires another actor to review and publish a creator's revision", () => {
    const revision = { status: "draft", created_by: "editor-a" };
    expect(transitionViolation(revision, "reviewed", "editor-a")).toBe("separation_of_duties_required");
    expect(transitionViolation(revision, "reviewed", "editor-b")).toBeNull();
  });

  it("validates election-scoped revision payloads", () => {
    expect(validateRevisionInput({
      electionId: "pru-15",
      dataKind: "candidate-affiliation",
      reason: "Source-backed membership correction",
      actor: "editor-a",
      payload: { personId: "rafizi-ramli" },
    }).electionId).toBe("pru-15");
    expect(() => validateRevisionInput({
      dataKind: "candidate-affiliation",
      reason: "Source-backed membership correction",
      actor: "editor-a",
      payload: {},
    })).toThrow("invalid_election_id");
  });
});
