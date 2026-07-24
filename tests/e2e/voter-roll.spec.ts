import { expect, test } from "@playwright/test";

test("PRU-15 voter overview exposes the 2022 roll and area drill-down", async ({ page }) => {
  await page.goto("/pru/15/pengundi");
  await expect(page.getByRole("heading", { name: /Pengundi dalam setiap angka/ })).toBeVisible();
  await expect(page.getByText("21.3J", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kawasan", exact: true })).toBeVisible();
  await expect(page.getByText(/Snapshot daftar 2022/)).toBeVisible();
});

test("PRU-14 voter overview stays on the 2018 historical snapshot", async ({ page }) => {
  await page.goto("/pru/14/pengundi");
  await expect(page.getByRole("heading", { name: /Pengundi dalam setiap angka/ })).toBeVisible();
  await expect(page.getByText("15J", { exact: true })).toBeVisible();
  await expect(page.getByText(/Snapshot daftar 2018/)).toBeVisible();
  const dimensions = page.getByRole("navigation", { name: "Dimensi statistik pengundi" });
  await expect(dimensions.getByRole("link", { name: "Ringkasan" })).toBeVisible();
  await expect(dimensions.getByRole("link", { name: "Kawasan" })).toBeVisible();
  await expect(dimensions.getByRole("link", { name: "Umur" })).toHaveCount(0);
  await expect(dimensions.getByRole("link", { name: "Bangsa" })).toHaveCount(0);
});

test("area pages resolve official Parliament and DUN identities in both editions", async ({ page }) => {
  await page.goto("/pru/15/pengundi/kawasan?negeri=kelantan&parlimen=P.028");
  await expect(page.getByRole("heading", { name: "P.028 PASIR PUTEH", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DUN dalam P.028 PASIR PUTEH" })).toBeVisible();
  await expect(page.getByText("N.29", { exact: true })).toBeVisible();

  await page.goto("/pru/14/pengundi/kawasan?negeri=perlis&parlimen=P.001");
  await expect(page.getByRole("heading", { name: "P.001 PADANG BESAR", exact: true })).toBeVisible();
  await expect(page.getByText("N.01", { exact: true })).toBeVisible();
  await expect(page.getByText("TITI TINGGI", { exact: true })).toBeVisible();
});
