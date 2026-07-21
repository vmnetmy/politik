import { expect, test } from "@playwright/test";

test("state-election directory exposes all 13 latest assemblies", async ({ page }) => {
  await page.goto("/prn");
  await expect(page.getByRole("heading", { name: /Mandat negeri/ })).toBeVisible();
  await expect(page.locator(".prn-event-card")).toHaveCount(13);
  await expect(page.getByRole("link", { name: /SABAH/ })).toContainText("29 November 2025");
});

test("Selangor drills into a complete official DUN result", async ({ page }) => {
  await page.goto("/prn/15/selangor/");
  await expect(page.getByRole("heading", { name: "SELANGOR", exact: true })).toBeVisible();
  await expect(page.getByText("56", { exact: true }).first()).toBeVisible();
  await page.goto("/prn/15/selangor/dun/sungai-air-tawar");
  await expect(page.getByRole("heading", { name: "SUNGAI AIR TAWAR", exact: true })).toBeVisible();
  await expect(page.getByText("DATUK HAJI RIZAM ISMAIL", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("846", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /DUN → PDM → lokaliti/ })).toHaveAttribute("href", /\/pru\/15\/negeri\/selangor\/parlimen\/sabak-bernam\/dun\/sungai-air-tawar/);
});

test("Johor uses all gazetted Form 16 totals at its canonical PRN-16 route", async ({ page }) => {
  await page.goto("/prn/johor/2026");
  await expect(page).toHaveURL(/\/prn\/16\/johor\/$/);
  await expect(page.getByRole("heading", { name: "JOHOR", exact: true })).toBeVisible();
  await expect(page.getByText("69.6%", { exact: true })).toBeVisible();
  await expect(page.locator(".prn-composition-list")).toContainText("48");
  await expect(page.locator(".prn-composition-list")).toContainText("8");
  await page.goto("/prn/16/johor/dun/buloh-kasap");
  await expect(page.getByRole("heading", { name: "BULOH KASAP", exact: true })).toBeVisible();
  await expect(page.getByText("ZAHARI SARIP", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".detail-facts")).toContainText("28,973");
  await expect(page.locator(".detail-facts")).toContainText("68.24%");
  await expect(page.locator(".detail-facts")).toContainText("228");
  await expect(page.locator(".detail-facts")).toContainText("35");
});
