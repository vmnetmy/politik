import { expect, test } from "@playwright/test";

test("operations console reports an unconfigured database without exposing secrets", async ({ page }) => {
  await page.goto("/settings/data/operasi?election=15");
  await expect(page.getByRole("heading", { name: "Terbit dengan jejak audit." })).toBeVisible();
  await expect(page.getByText("Belum dikonfigurasi", { exact: true })).toBeVisible();
  await expect(page.getByText(/Tetapkan DATABASE_URL/)).toBeVisible();
  await expect(page.getByLabel("Token editorial")).toHaveAttribute("type", "password");
});
