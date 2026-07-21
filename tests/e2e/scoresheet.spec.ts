import { expect, test } from "@playwright/test";

test("covered Parliament lazily loads polling-stream results", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen/kangar");
  await expect(page.getByRole("heading", { name: "Keputusan mengikut saluran" })).toBeVisible();
  await expect(page.getByText("139 saluran", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: /Perbandingan undi calon/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "CIKGU ZAKRI" })).toBeVisible();
});

test("Parliament without SPR 760 uses the labelled CC0 fallback", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen/padang-besar");
  await expect(page.getByRole("heading", { name: "Keputusan mengikut saluran" })).toBeVisible();
  await expect(page.getByText("119 saluran", { exact: false })).toBeVisible();
  await expect(page.getByText("DATA TERBUKA · CC0", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Katalog undi calon ↗" })).toHaveAttribute("href", "https://electiondata.my/data-catalogue/saluran-ballots-ge15/");
});

test("scoresheet totals are the published historical result", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen/pasir-puteh");
  await expect(page.locator(".candidate-detail").getByText("53,108", { exact: true })).toBeVisible();
  await expect(page.locator(".candidate-detail").getByText("81,175 undi", { exact: true })).toBeVisible();
  await expect(page.getByText("SUMBER RASMI", { exact: true })).toBeVisible();
});

test("operational typography stays readable at 100% zoom", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen/jerai");
  await expect(page.getByRole("heading", { name: "Keputusan mengikut saluran" })).toBeVisible();
  const selectors = [
    ".global-search input",
    ".breadcrumbs",
    ".candidate-meta",
    ".geography-card-code",
    ".scoresheet-section-filter button",
    ".scoresheet-table-wrap th",
    ".scoresheet-table-wrap td",
  ];
  for (const selector of selectors) {
    const size = await page.locator(selector).first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(size, selector).toBeGreaterThanOrEqual(12);
  }
  const sidebarSize = await page.locator(".sidebar nav a").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(sidebarSize).toBe((page.viewportSize()?.width ?? 0) <= 820 ? 10 : 13);
});
