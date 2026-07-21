import { expect, test } from "@playwright/test";

test("covered Parliament lazily loads polling-stream results", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen/kangar");
  await expect(page.getByRole("heading", { name: "Keputusan mengikut saluran" })).toBeVisible();
  await expect(page.getByText("139 saluran", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: /Perbandingan undi calon/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "CIKGU ZAKRI" })).toBeVisible();
});

test("uncovered Parliament states detailed-source availability honestly", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen/padang-besar");
  await expect(page.getByText("Helaian mata terperinci belum tersedia", { exact: true })).toBeVisible();
});

test("scoresheet totals are the published historical result", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen/pasir-puteh");
  await expect(page.locator(".candidate-detail").getByText("53,108", { exact: true })).toBeVisible();
  await expect(page.locator(".candidate-detail").getByText("81,175 undi", { exact: true })).toBeVisible();
  await expect(page.getByText("SUMBER RASMI", { exact: true })).toBeVisible();
});
