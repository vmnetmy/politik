import { expect, test } from "@playwright/test";

test("state-election directory exposes all 13 latest assemblies", async ({ page }) => {
  await page.goto("/prn");
  await expect(page.getByRole("heading", { name: /Mandat negeri/ })).toBeVisible();
  await expect(page.locator(".prn-event-card")).toHaveCount(13);
  await expect(page.getByRole("link", { name: /SABAH/ })).toContainText("29 November 2025");
});

test("Selangor drills into a complete official DUN result", async ({ page }) => {
  await page.goto("/prn/selangor/2023");
  await expect(page.getByRole("heading", { name: "SELANGOR", exact: true })).toBeVisible();
  await expect(page.getByText("56", { exact: true }).first()).toBeVisible();
  await page.goto("/prn/selangor/2023/dun/sungai-air-tawar");
  await expect(page.getByRole("heading", { name: "SUNGAI AIR TAWAR", exact: true })).toBeVisible();
  await expect(page.getByText("DATUK HAJI RIZAM ISMAIL", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("846", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /DUN → PDM → lokaliti/ })).toHaveAttribute("href", /\/pru\/15\/negeri\/selangor\/parlimen\/sabak-bernam\/dun\/sungai-air-tawar/);
});

test("Johor uses the final 2026 MySPR result without inventing turnout", async ({ page }) => {
  await page.goto("/prn/johor/2026");
  await expect(page.getByRole("heading", { name: "JOHOR", exact: true })).toBeVisible();
  await expect(page.locator(".prn-composition-list")).toContainText("48");
  await expect(page.locator(".prn-composition-list")).toContainText("8");
  await page.goto("/prn/johor/2026/dun/buloh-kasap");
  await expect(page.getByRole("heading", { name: "BULOH KASAP", exact: true })).toBeVisible();
  await expect(page.getByText("ZAHARI SARIP", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".detail-facts")).toContainText("—");
});
