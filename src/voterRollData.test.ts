import { describe, expect, it } from "vitest";
import pru14 from "../public/data/elections/pru-14/voter-roll.json";
import pru15 from "../public/data/elections/pru-15/voter-roll.json";

describe("cross-election voter-roll geography", () => {
  it("keeps each edition tied to its historical snapshot", () => {
    expect(pru14.metadata).toMatchObject({ electionId: "pru-14", snapshotYear: 2018, snapshotRegistered: 15033004 });
    expect(pru15.metadata).toMatchObject({ electionId: "pru-15", snapshotYear: 2022, snapshotRegistered: 21290400 });
  });

  it("publishes complete reusable geography", () => {
    expect([pru14.parliaments.length, pru15.parliaments.length]).toEqual([222, 222]);
    expect([pru14.duns.length, pru15.duns.length]).toEqual([587, 600]);
    expect([pru14.pdms.length, pru15.pdms.length]).toEqual([7747, 7748]);
    expect(pru14.parliaments.find((item) => item.code === "P.001")).toMatchObject({ name: "PADANG BESAR", stateId: "perlis" });
    expect(pru15.parliaments.find((item) => item.code === "P.028")).toMatchObject({ name: "PASIR PUTEH", stateId: "kelantan" });
  });
});
