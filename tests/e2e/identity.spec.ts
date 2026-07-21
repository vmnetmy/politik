import { expect, test } from "@playwright/test";

test("Parti Bersama Malaysia uses the BERSAMA identity", async ({ page }) => {
  await page.goto("/settings/data/parti");
  const logo = page.getByRole("img", { name: "PARTI BERSAMA MALAYSIA" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", /26-parti-bersama-malaysia-bersama/);
  await logo.locator("xpath=ancestor::button").click();
  await expect(page.locator("#party-editor h2")).toHaveText("BERSAMA");
});
