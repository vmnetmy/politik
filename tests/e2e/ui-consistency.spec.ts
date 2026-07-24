import { expect, test } from "@playwright/test";

const representativeRoutes = [
  "/pru/15/negeri",
  "/pru/15/negeri/parlimen",
  "/pru/15/negeri/parlimen/pandan",
  "/pru/perbandingan/",
  "/prn/perbandingan",
  "/prn/15/negeri-sembilan/peta",
  "/peta?jenis=pru&edisi=15&mod=pemenang",
  "/pru/15/pengundi/umur",
  "/settings/data/calon",
];

test("representative routes remain contained within the viewport", async ({ page }) => {
  for (const route of representativeRoutes) {
    await page.goto(route);
    await expect.poll(async () => page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
  }
});

test("shared shell and data tables expose consistent accessible contracts", async ({ page }) => {
  await page.goto("/pru/15/negeri/parlimen/pandan");

  await expect(page.getByRole("link", { name: /Politik\.my/ }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Keputusan mengikut daerah dan pusat mengundi" })).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("link", { name: "Lihat sumber ↗" })).toHaveCSS("display", "inline-flex");
});

test("comparison controls use consistent Malay terminology", async ({ page }) => {
  for (const route of ["/pru/perbandingan/", "/prn/perbandingan"]) {
    await page.goto(route);
    const control = page.getByRole("button", { name: "Keluar mengundi", exact: true });
    await expect(control).toBeVisible();
    await control.click();
    await expect(page).toHaveURL(/metrik=turnout/);
  }
});
