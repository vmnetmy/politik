import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("seating map exposes historical and current identity layers", async ({ page }, testInfo) => {
  await page.goto("/pru/15/negeri/parlimen");
  await expect(page.getByRole("heading", { name: "Kedudukan dalam dewan" })).toBeVisible();
  const map = page.getByRole("group", { name: /220 kerusi Parlimen/ });
  await expect(map).toBeVisible();
  await expect(map.getByRole("button")).toHaveCount(220);
  await expect(map.locator(".seating-empty-position")).toHaveCount(60);
  await expect(map.getByRole("button", { name: /^G1, P\.056 LARUT/ })).toBeVisible();
  await expect(map.locator(".seating-empty-position").first()).toContainText(/^[A-G]\d{1,2}$/);
  await expect(page.getByText("Catatan kualiti data", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Nota data", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "PRU-15", exact: true }).click();
  await expect(page.getByText("GABUNGAN PRU-15", { exact: true })).toBeVisible();
  await mkdir("visual-current", { recursive: true });
  await page.screenshot({ path: `visual-current/${testInfo.project.name}-parliament-seating.png`, fullPage: true, animations: "disabled" });
});

test("roving focus uses arrow keys instead of 220 tab stops", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen");
  const selected = page.locator(".seating-dot[tabindex='0']");
  await expect(selected).toHaveCount(1);
  await selected.focus();
  const initialId = await selected.getAttribute("id");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".seating-dot:focus")).not.toHaveAttribute("id", initialId ?? "");
});

test("mobile seat hit areas remain at least 24 pixels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile contract only");
  await page.goto("/pru/15/negeri/parlimen");
  const box = await page.locator(".seating-dot").first().boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(24);
  expect(box?.height).toBeGreaterThanOrEqual(24);
});

test("legend is independent from the responsive seating canvas", async ({ page }, testInfo) => {
  await page.goto("/pru/15/negeri/parlimen");
  const visual = page.locator(".seating-visual");
  const scroller = visual.locator(".seating-map-wrap");
  const legend = visual.locator(":scope > .seating-legend");
  await expect(legend).toHaveCount(1);
  await expect(scroller.locator(".seating-legend")).toHaveCount(0);

  const dimensions = await scroller.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  if (testInfo.project.name === "mobile-chromium") expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  const legendBox = await legend.boundingBox();
  const visualBox = await visual.boundingBox();
  expect(legendBox?.width).toBeLessThanOrEqual((visualBox?.width ?? 0) + 1);
});

test("desktop keeps the selection panel beside the chamber", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout contract only");
  await page.goto("/pru/15/negeri/parlimen");
  const chamber = await page.locator(".seating-visual").boundingBox();
  const detail = await page.locator(".seating-selection-detail").boundingBox();
  expect(detail?.x).toBeGreaterThan((chamber?.x ?? 0) + (chamber?.width ?? 0));
  expect(Math.abs((detail?.y ?? 0) - (chamber?.y ?? 0))).toBeLessThanOrEqual(1);
});

test("full-result actions retain the compact type scale", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen");
  const seatingActionSize = await page.locator(".seating-selection-detail > a").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(seatingActionSize).toBe(12);

  await page.goto("/pru/15/pemenang");
  const winnerActionSize = await page.locator(".winner-directory-link").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(winnerActionSize).toBe(12);
});

test("filter comboboxes retain their compact type scale", async ({ page }) => {
  await page.goto("/pru/15/pemenang");
  const bangsa = page.getByRole("combobox", { name: "BANGSA" });
  const inputSize = await bangsa.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const labelSize = await page.locator(".filter-combobox > label").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(inputSize).toBe(11);
  expect(labelSize).toBe(10);

  await bangsa.focus();
  const optionSize = await page.locator(".combobox-option span").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const selectedSize = await page.locator(".combobox-option b").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(optionSize).toBe(11);
  expect(selectedSize).toBe(9);
});
