import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PartyLogo } from "./PartyLogo";

describe("PartyLogo", () => {
  it("uses the dedicated BERSAMA image without replacing the historical PBM identity", () => {
    const { rerender } = render(<PartyLogo name="PARTI BERSAMA MALAYSIA"/>);
    expect(screen.getByRole("img", { name: "PARTI BERSAMA MALAYSIA" })).toHaveAttribute("src", expect.stringContaining("26-parti-bersama-malaysia-bersama"));

    rerender(<PartyLogo name="PARTI BANGSA MALAYSIA (PBM)"/>);
    expect(screen.getByRole("img", { name: "PARTI BANGSA MALAYSIA (PBM)" })).toHaveAttribute("src", expect.stringContaining("13-parti-bangsa-malaysia-pbm"));
  });
});
