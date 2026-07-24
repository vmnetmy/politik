import { describe, expect, it } from "vitest";
import { atlasSearchParams, atlasStateWith, quantileThresholds, readAtlasUrlState, thresholdIndex } from "./atlas";

const editions = { pru: [15, 14], prn: [16, 15, 14] };

describe("election atlas URL state", () => {
  it("uses governed defaults for an empty URL", () => {
    expect(readAtlasUrlState(new URLSearchParams(), editions)).toEqual({
      electionType: "pru",
      edition: 15,
      metric: "pemenang",
      stateId: "",
      seatId: "",
      dunId: "",
      pdmId: "",
      localityId: "",
      compareEdition: 14,
    });
  });

  it("round-trips a shareable drill-down state", () => {
    const state = {
      electionType: "prn" as const,
      edition: 15,
      metric: "keluar-mengundi" as const,
      stateId: "negeri-sembilan",
      seatId: "P.126:N.01",
      dunId: "",
      pdmId: "",
      localityId: "",
      compareEdition: 16,
    };
    expect(readAtlasUrlState(atlasSearchParams(state), editions)).toEqual(state);
  });

  it("clears descendants when the edition or parent geography changes", () => {
    const state = readAtlasUrlState(
      new URLSearchParams("jenis=pru&edisi=15&mod=majoriti&negeri=selangor&kerusi=P.100"),
      editions,
    );
    expect(atlasStateWith(state, { stateId: "perak" })).toMatchObject({ stateId: "perak", seatId: "" });
    expect(atlasStateWith(state, { edition: 14 })).toMatchObject({ edition: 14, stateId: "", seatId: "" });
  });

  it("preserves an explicitly supplied hierarchy for search and shared links", () => {
    const state = readAtlasUrlState(new URLSearchParams(), editions);
    expect(atlasStateWith(state, { stateId: "selangor", seatId: "P.100" })).toMatchObject({
      stateId: "selangor",
      seatId: "P.100",
    });
  });
});

describe("election atlas metric scale", () => {
  it("builds stable quartile thresholds and buckets", () => {
    const thresholds = quantileThresholds([10, 20, 30, 40, 50]);
    expect(thresholds).toEqual([20, 30, 40]);
    expect([10, 25, 35, 50].map((value) => thresholdIndex(value, thresholds))).toEqual([0, 1, 2, 3]);
  });
});
