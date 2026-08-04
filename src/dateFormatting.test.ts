import { describe, expect, it } from "vitest";
import { formatElectionDate } from "./elections";
import { formatDatesInText, formatShortDate } from "./utils";

describe("platform date formatting", () => {
  it("uses DD Mon YY for ISO dates and timestamps", () => {
    expect(formatShortDate("2020-02-24")).toBe("24 Feb 20");
    expect(formatShortDate("2020-03-11T00:30:00+08:00")).toBe("11 Mar 20");
    expect(formatElectionDate("2022-11-19")).toBe("19 Nov 22");
  });

  it("keeps invalid values visible and handles missing values", () => {
    expect(formatShortDate("not-a-date")).toBe("not-a-date");
    expect(formatShortDate(null)).toBe("—");
  });

  it("normalises dates embedded in platform copy", () => {
    expect(formatDatesInText("Berkuat kuasa sejak 29 Mac 2018.")).toBe("Berkuat kuasa sejak 29 Mar 18.");
  });
});
