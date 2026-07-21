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

test("result review approval updates the historical snapshot atomically", async ({ page }) => {
  await page.goto("/settings/data/keputusan");
  const conflict = page.locator(".result-conflict").filter({ hasText: "PASIR PUTEH" });
  await expect(conflict).toContainText("80,978");
  await expect(conflict).toContainText("81,175");
  await conflict.getByRole("button", { name: "Luluskan" }).click();
  await expect(conflict).toHaveClass(/is-approved/);
  await page.goto("/pru/15/negeri/parlimen/pasir-puteh");
  await expect(page.locator(".candidate-detail").getByText("53,108", { exact: true })).toBeVisible();
  await expect(page.locator(".candidate-detail").getByText("81,175 undi", { exact: true })).toBeVisible();
});
