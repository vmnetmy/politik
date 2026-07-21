import { describe, expect, it } from "vitest";
import { cleanPath } from "./telemetry";

describe("telemetry privacy", () => {
  it("drops query strings and fragments from reported routes", () => {
    expect(cleanPath("https://nadirakyat.my/pru/15/negeri/parlimen?calon=nama#detail")).toBe("/pru/15/negeri/parlimen");
  });
});
