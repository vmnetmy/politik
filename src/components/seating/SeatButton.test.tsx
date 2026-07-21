import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SeatButton } from "./SeatButton";
import type { Seat } from "../../types";

const seat = {
  code: "P.056",
  state: "PERAK",
  name: "LARUT",
  registered: 0,
  turnout: 0,
  turnoutPct: 0,
  candidateCount: 1,
  marginVotes: 0,
  marginShare: 0,
  winner: { id: "p056:dato-seri-hamzah-zainudin", name: "DATO SERI HAMZAH ZAINUDIN", alliance: "PERIKATAN NASIONAL (PN)", party: "BERSATU", votes: 1, share: 1, gender: "LELAKI", ethnicity: "MELAYU" },
  candidates: [],
} satisfies Seat;

describe("SeatButton", () => {
  it("uses roving focus and arrow-key navigation", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onSelect = vi.fn();
    render(<SeatButton seat={seat} position={{ seatCode: "P.056", physicalCode: "G1", sourceConstituency: "LARUT", sourceX: 100, sourceY: 100, x: 100, y: 100, section: "curved" }} viewBox={{ width: 1190, height: 842 }} alliance="PN" color="#186a58" status="active" selected visible onSelect={onSelect} onHover={() => undefined} onNavigate={onNavigate}/>);
    const button = screen.getByRole("button", { name: /P\.056 LARUT/ });
    expect(button).toHaveAttribute("tabindex", "0");
    await user.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
    await user.keyboard("{ArrowRight}");
    expect(onNavigate).toHaveBeenCalledWith("right");
  });

  it("keeps a vacant seat visible as an interactive marker", () => {
    render(<SeatButton seat={seat} position={{ seatCode: "P.056", physicalCode: "G1", sourceConstituency: "LARUT", sourceX: 100, sourceY: 100, x: 100, y: 100, section: "curved" }} viewBox={{ width: 1190, height: 842 }} alliance="BEBAS" color="#8b938f" status="vacant" selected={false} visible onSelect={() => undefined} onHover={() => undefined} onNavigate={() => undefined}/>);
    expect(screen.getByRole("button", { name: /P\.056 LARUT/ })).toHaveClass("status-vacant");
  });
});
