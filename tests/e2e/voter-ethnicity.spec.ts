import { expect, test, type Page } from "@playwright/test";

async function choose(page: Page, label: string, option: string) {
  const input = page.getByRole("combobox", { name: label });
  await input.fill(option);
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("voter ethnicity page exposes official taxonomy and the publication limit", async ({ page }) => {
  await page.goto("/pru/15/pengundi/kaum");
  await expect(page.getByRole("heading", { name: /Bangsa pengundi PRU-15/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tiada angka agregat rasmi untuk dipaparkan" })).toBeVisible();
  await expect(page.locator(".ethnicity-taxonomy-panel li")).toHaveCount(9);
  await expect(page.getByText("ORANG ASLI (SEMENANJUNG)", { exact: true })).toBeVisible();

  await choose(page, "NEGERI / WILAYAH", "PERLIS");
  await choose(page, "PARLIMEN", "P.001 PADANG BESAR");
  await choose(page, "DUN", "N.01 TITI TINGGI");
  await expect(page.locator(".ethnicity-kpi-grid").getByText("N.01 TITI TINGGI", { exact: true })).toBeVisible();
  await expect(page.locator(".ethnicity-kpi-grid").getByText("13,403", { exact: true })).toBeVisible();
});
