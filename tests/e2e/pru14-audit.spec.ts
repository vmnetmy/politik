import { expect, test } from "@playwright/test";

test("PRU-14 audit exposes, filters and exports every source decision", async ({ page }) => {
  await page.goto("/pru/14/audit");
  await expect(page.getByRole("heading", { name: /Jejak audit/ })).toBeVisible();
  await expect(page.getByText("180/222", { exact: true })).toBeVisible();
  await expect(page.getByText("495/505", { exact: true })).toBeVisible();
  await expect(page.getByText("55/60", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "KONFLIK DISELESAIKAN" }).click();
  await expect(page.locator(".audit-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".audit-table tbody tr", { hasText: "P.075" })).toContainText("AHMAD ZAHID BIN HAMIDI");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksport jurang CSV" }).click();
  await expect((await download).suggestedFilename()).toBe("pru-14-audit-gaps.csv");
});
