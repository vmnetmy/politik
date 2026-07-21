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
