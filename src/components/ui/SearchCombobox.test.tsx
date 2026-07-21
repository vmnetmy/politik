import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchCombobox } from "./SearchCombobox";

describe("SearchCombobox", () => {
  it("filters and selects an option with the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchCombobox label="Parti" value="" options={["BERSATU", "PARTI WAWASAN NEGARA"]} onChange={onChange} allowCustom={false}/>);
    const input = screen.getByRole("combobox", { name: "Parti" });
    await user.click(input);
    await user.type(input, "wawasan");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("PARTI WAWASAN NEGARA");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("closes after a pointer selection while returning focus", async () => {
    const user = userEvent.setup();
    render(<SearchCombobox label="DUN" value="SEMUA DUN" options={["SEMUA DUN", "N.01 TITI TINGGI"]} onChange={() => undefined} allowCustom={false}/>);
    const input = screen.getByRole("combobox", { name: "DUN" });
    await user.click(input);
    await user.click(screen.getByRole("option", { name: "N.01 TITI TINGGI" }));
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("has no detectable structural accessibility violations", async () => {
    const { container } = render(<SearchCombobox label="Gabungan" value="PN" options={["PN", "PH"]} onChange={() => undefined} allowCustom={false}/>);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
