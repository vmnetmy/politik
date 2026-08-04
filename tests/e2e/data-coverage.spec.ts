import { expect, test } from "@playwright/test";

test("publishes explicit locality and boundary coverage", async ({ page }) => {
  await page.goto("/settings/data/liputan");
  await expect(page.getByRole("heading", { name: "Jejak kelengkapan data." })).toBeVisible();
  await expect(page.getByText("7,748", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("7,747", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".coverage-table tbody tr")).toHaveCount(16);
  await expect(page.locator(".boundary-coverage-item")).toHaveCount(7);
  await expect(page.locator(".boundary-coverage-item.is-compatible", { hasText: "PRU-14" })).toBeVisible();
  await expect(page.locator(".boundary-coverage-item.is-compatible", { hasText: "PRN-15" })).toContainText("11/12");
  await expect(page.getByText("99.99%", { exact: true })).toBeVisible();
});

test("shows source-backed locality status in the geography drill-down", async ({ page }) => {
  await page.goto("/pru/15/negeri/kelantan/parlimen/pasir-puteh/dun/limbongan/pdm/padang-pak-amat");
  await expect(page.locator(".geography-list .data-coverage-status")).toContainText("Lengkap");
  await expect(page.getByRole("link", { name: /001.*PADANG PAK AMAT/s })).toBeVisible();
});
