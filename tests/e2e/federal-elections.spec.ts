import { expect, test } from "@playwright/test";

test("federal election archive exposes PRU-14 as an isolated historical edition", async ({ page }) => {
  await page.goto("/pru");
  await expect(page.getByRole("heading", { name: /Mandat Malaysia/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /PRU-14/ })).toBeVisible();

  await page.getByRole("link", { name: /PRU-14/ }).click();
  await expect(page).toHaveURL(/\/pru\/14$/);
  await expect(page.getByRole("heading", { name: "PRU-14", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keputusan PRU-14" })).toBeVisible();
  await expect(page.getByText("14.9J", { exact: true })).toBeVisible();
});

test("PRU-14 constituency retains election-time party without current-term overlays", async ({ page }) => {
  await page.goto("/pru/14/negeri/parlimen/padang-besar");
  await expect(page.getByRole("heading", { name: "PADANG BESAR", exact: true })).toBeVisible();
  await expect(page.getByText("PARTI KETIKA PRU-14", { exact: true })).toBeVisible();
  await expect(page.getByText("KEDUDUKAN SEMASA", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Keputusan mengikut saluran" })).toBeVisible();
  await expect(page.getByText("SUMBER RASMI", { exact: true })).toBeVisible();
});

test("PRU-14 affiliation history exposes the PKR departure and Bersatu membership phases", async ({ page }) => {
  await page.goto("/settings/data/keahlian?election=14");
  await expect(page.getByRole("heading", { name: "Urus keahlian semasa." })).toBeVisible();
  await expect(page.locator(".settings-kpis")).toContainText("11");
  await expect(page.locator(".change-history tbody tr")).toHaveCount(21);
  await expect(page.locator(".change-history")).toContainText("DATO' SERI AZMIN ALI");
  await expect(page.locator(".change-history")).toContainText("ZURAIDA KAMARUDDIN");
  await expect(page.locator(".change-history tbody tr").first()).toContainText("11 Mar 20");
  await expect(page.locator(".change-history tbody tr").first().locator("td").first()).toHaveCSS("white-space", "nowrap");
  await expect(page.locator(".change-history tbody tr").first().getByRole("link", { name: "Sumber ↗" })).toHaveAttribute("href", /sinarharian\.com\.my\/article\/73396/);
  await expect(page.locator(".change-history")).toContainText("ahli bersekutu Bersatu");
});

test("federal comparison derives editions, metrics and historical deltas from the catalogue", async ({ page }) => {
  await page.goto("/pru/perbandingan/");
  await expect(page.getByRole("heading", { level: 1, name: /Bandingkan PRU/ })).toBeVisible();
  await expect(page.locator(".comparison-edition-card")).toHaveCount(2);
  await expect(page.locator(".comparison-chart canvas")).toHaveAttribute("aria-label", /Perubahan komposisi Dewan Rakyat/);
  await expect(page.locator(".federal-comparison-shift")).toContainText("+41.7%");
  await expect(page.locator(".federal-comparison-shift")).toContainText("+258");

  const turnoutMetric = page.getByRole("button", { name: "Keluar mengundi", exact: true });
  await turnoutMetric.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await turnoutMetric.click({ force: true });
  await expect(page).toHaveURL(/metrik=turnout/);
  await expect(page.locator(".comparison-chart canvas")).toHaveAttribute("aria-label", /Perubahan kadar keluar mengundi/);
});

test("federal comparison filters state and historical ballot alliance without new routes", async ({ page }) => {
  await page.goto("/pru/perbandingan/?negeri=selangor&gabungan=ph&metrik=bahagian");
  await expect(page.getByText("Tiket PH", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".comparison-chart canvas")).toHaveAttribute("aria-label", /Bahagian undi PH bagi Tiket PH/);
  await expect(page.locator(".comparison-edition-card")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Lihat keputusan/ }).first()).toHaveAttribute("href", /\/pru\/14\/negeri\/selangor/);
});
