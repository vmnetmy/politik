import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function choose(page: Page, label: string, option: string) {
  const input = page.getByRole("combobox", { name: label });
  await input.fill(option);
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("voter age page drills from state to a reusable DUN identity", async ({ page }, testInfo) => {
  await page.goto("/pru/15/pengundi/umur");
  await expect(page.getByRole("heading", { name: /Siapa pengundi PRU-15/ })).toBeVisible();
  await expect(page.getByText("21.2J", { exact: true })).toBeVisible();
  await choose(page, "NEGERI / WILAYAH", "PERLIS");
  await choose(page, "PARLIMEN", "P.001 PADANG BESAR");
  await choose(page, "DUN", "N.01 TITI TINGGI");
  await expect(page.getByRole("heading", { name: "N.01 TITI TINGGI" })).toBeVisible();
  await expect(page.locator(".age-kpi-grid").getByText("13,403", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute("aria-label", /N\.01 TITI TINGGI/);
  await mkdir("visual-current", { recursive: true });
  await page.screenshot({ path: `visual-current/${testInfo.project.name}-voter-age.png`, fullPage: true, animations: "disabled" });
});

test("federal territory records do not invent DUN names", async ({ page }) => {
  await page.goto("/pru/15/pengundi/umur");
  await choose(page, "NEGERI / WILAYAH", "W.P KUALA LUMPUR");
  await choose(page, "PARLIMEN", "P.114 KEPONG");
  await expect(page.getByRole("combobox", { name: "DUN" })).toBeDisabled();
  await expect(page.getByText("Tiada kawasan DUN", { exact: true })).toBeVisible();
});
