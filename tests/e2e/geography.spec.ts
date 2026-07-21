import { expect, test } from "@playwright/test";

test("drills through reusable DUN and PDM identities into a sourced locality", async ({ page }) => {
  await page.goto("/pru/15/negeri/kelantan/parlimen/pasir-puteh");
  await expect(page.getByRole("heading", { name: "PASIR PUTEH", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /N\.30.*LIMBONGAN/s }).click();
  await expect(page.getByRole("heading", { name: "LIMBONGAN", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /028\/30\/04.*PADANG PAK AMAT/s }).click();
  await expect(page.getByRole("heading", { name: "PADANG PAK AMAT", exact: true })).toBeVisible();
  await expect(page.getByText("KEPUTUSAN SCORESHEET PRU-15", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /001.*PADANG PAK AMAT/s }).click();
  await expect(page.getByRole("heading", { name: "PADANG PAK AMAT", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Buka dokumen DPT rasmi SPR/ })).toHaveAttribute("href", /sprinfo\.spr\.gov\.my/);
});

test("federal territories skip the DUN level", async ({ page }) => {
  await page.goto("/pru/15/negeri/wp-kuala-lumpur/parlimen/kepong");
  await expect(page.getByRole("heading", { name: "KEPONG", exact: true })).toBeVisible();
  const pdmLink = page.locator(".parliament-geography .geography-card").first();
  await expect(pdmLink).toHaveAttribute("href", /\/parlimen\/kepong\/pdm\//);
  await expect(pdmLink).not.toHaveAttribute("href", /\/dun\//);
});
