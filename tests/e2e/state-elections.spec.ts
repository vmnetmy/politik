import { expect, test } from "@playwright/test";

test("PRN-14 DUN page lazily loads reconciled SPR saluran results", async ({ page }) => {
  await page.goto("/prn/14/johor/dun/buloh-kasap");
  await expect(page.getByRole("heading", { name: "Keputusan mengikut saluran" })).toBeVisible();
  await expect(page.getByText("SUMBER RASMI", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "ZAHARI SARIP" })).toBeVisible();
});

test("state-election directory exposes all 13 latest assemblies", async ({ page }) => {
  await page.goto("/prn");
  await expect(page.getByRole("heading", { name: /Mandat negeri/ })).toBeVisible();
  await expect(page.locator(".prn-event-card")).toHaveCount(13);
  await expect(page.getByRole("link", { name: /NEGERI SEMBILAN/ })).toContainText("01 Aug 26");
  await expect(page.getByRole("link", { name: /SABAH/ })).toContainText("29 Nov 25");
  await expect(page.getByRole("link", { name: "PRN-15" })).toHaveAttribute("href", "/prn/15");
});

test("PRN edition directories isolate assemblies 14, 15 and 16", async ({ page }) => {
  await page.goto("/prn/15");
  await expect(page.getByRole("heading", { name: /PRN ke-15/ })).toBeVisible();
  await expect(page.locator(".prn-event-card")).toHaveCount(12);
  await expect(page.getByText("505", { exact: true }).first()).toBeVisible();

  await page.goto("/prn/16/");
  await expect(page.getByRole("heading", { name: /PRN ke-16/ })).toBeVisible();
  await expect(page.locator(".prn-event-card")).toHaveCount(2);
  await expect(page.locator(".prn-event-card", { hasText: "JOHOR" })).toHaveCount(1);
  await expect(page.locator(".prn-event-card", { hasText: "NEGERI SEMBILAN" })).toHaveCount(1);

  await page.goto("/prn/14/");
  await expect(page.getByRole("heading", { level: 1, name: /PRN ke-14/ })).toBeVisible();
  await expect(page.locator(".prn-event-card")).toHaveCount(11);
  await expect(page.getByText("445", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1,394", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".prn-edition-empty")).toHaveCount(0);
});

test("Sabah Assembly-15 uses the historical 60-seat registry and PRU-14 scoresheets", async ({ page }) => {
  await page.goto("/prn/15/sabah/");
  await expect(page.getByRole("heading", { name: "SABAH", exact: true })).toBeVisible();
  await expect(page.getByText("60", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1.1J", { exact: true })).toBeVisible();

  await page.goto("/prn/15/sabah/dun/tanjong-kapor");
  await expect(page.getByRole("heading", { name: "TANJONG KAPOR", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keputusan mengikut saluran" })).toBeVisible();
  await expect(page.getByText("SUMBER RASMI", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /DUN → PDM → lokaliti/ })).toHaveCount(0);

  await page.goto("/prn/15/sabah/peta");
  await expect(page.getByRole("heading", { name: /sempadan pra-2019/ })).toBeVisible();
  await expect(page.getByText(/Peta tidak diterbitkan sebagai anggaran/)).toBeVisible();
});

test("PRN comparison animates selectable metrics without treating absent elections as zero", async ({ page }) => {
  await page.goto("/prn/perbandingan?edisi=14,15,16");
  await expect(page.getByRole("heading", { level: 1, name: /Bandingkan PRN/ })).toBeVisible();
  await expect(page.locator(".comparison-edition-card")).toHaveCount(3);
  await expect(page.locator(".comparison-chart canvas")).toHaveAttribute("aria-label", /Perubahan komposisi kerusi/);
  await expect(page.locator(".comparison-matrix-na").first()).toContainText("Tidak berkenaan");

  await page.getByRole("button", { name: "Keluar mengundi", exact: true }).click();
  await expect(page).toHaveURL(/metrik=turnout/);
  await expect(page.locator(".comparison-chart canvas")).toHaveAttribute("aria-label", /Kadar keluar mengundi/);
});

test("PRN comparison supports state, DUN, party and edition-shortcut endpoints", async ({ page }) => {
  await page.goto("/prn/perbandingan/negeri/selangor?edisi=14,15,16");
  await expect(page.getByText("SELANGOR", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".comparison-edition-card.is-na")).toHaveCount(1);

  await page.goto("/prn/perbandingan/negeri/negeri-sembilan/dun/rantau?edisi=14,15");
  await expect(page.getByText("N.27 RANTAU", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".comparison-edition-card:not(.is-na)")).toHaveCount(2);

  await page.goto("/prn/perbandingan/parti/pkr?edisi=14,15");
  await expect(page.getByText("Tiket PKR", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".comparison-chart canvas")).toHaveAttribute("aria-label", /Tiket PKR/);

  await page.goto("/prn/14/perbandingan?dengan=15");
  await expect(page).toHaveURL(/\/prn\/perbandingan\?edisi=14%2C15$/);
});

test("PRN-14 drills into a complete historical DUN result", async ({ page }) => {
  await page.goto("/prn/14/negeri-sembilan/dun/rantau");
  await expect(page.getByRole("heading", { name: "RANTAU", exact: true })).toBeVisible();
  await expect(page.getByText("TOK MAT", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".detail-facts")).toContainText("20,472");
  await expect(page.locator(".detail-facts")).toContainText("Tanpa pertandingan");
});

test("legacy single-state PRN links still redirect to canonical assembly routes", async ({ page }) => {
  await page.goto("/prn/selangor");
  await expect(page).toHaveURL(/\/prn\/15\/selangor\/$/);
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

test("Negeri Sembilan exposes every official MySPR PRN-16 result", async ({ page }) => {
  await page.goto("/prn/negeri-sembilan/2026");
  await expect(page).toHaveURL(/\/prn\/16\/negeri-sembilan\/$/);
  await expect(page.getByRole("heading", { name: "NEGERI SEMBILAN", exact: true })).toBeVisible();
  await expect(page.getByText("01 Aug 26", { exact: false })).toBeVisible();
  await expect(page.getByText("36", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".prn-composition-list")).toContainText("18");
  await expect(page.locator(".prn-composition-list")).toContainText("11");
  await expect(page.locator(".prn-composition-list")).toContainText("7");
  await expect(page.locator(".prn-filter-bar + .prn-results-inline-map")).toBeVisible();
  await expect(page.locator(".prn-results-inline-map + .prn-dun-grid")).toBeVisible();
  await expect(page.locator(".prn-results-inline-map .prn-map-features path")).toHaveCount(36);

  await page.getByPlaceholder("DUN atau calon").fill("Chennah");
  await expect(page.locator(".prn-dun-card")).toHaveCount(1);
  await expect(page.locator('.prn-results-inline-map .prn-map-features path[aria-hidden="false"]')).toHaveCount(1);
  await expect(page.locator('.prn-results-inline-map .prn-map-features path[aria-hidden="true"]')).toHaveCount(35);
  await page.getByRole("button", { name: "Set semula" }).click();

  await page.goto("/prn/16/negeri-sembilan/dun/chennah");
  await expect(page.getByRole("heading", { name: "CHENNAH", exact: true })).toBeVisible();
  await expect(page.getByText("SIOW KONG CHOON (JOHN)", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("5,726", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("688", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".detail-facts")).toContainText("—");
});

test("Johor PRN-15 exposes all official 2022 DUN results", async ({ page }) => {
  await page.goto("/prn/15/johor/");
  await expect(page.getByRole("heading", { name: "JOHOR", exact: true })).toBeVisible();
  await expect(page.getByText("12 Mar 22", { exact: false })).toBeVisible();
  await expect(page.getByText("56", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("54.6%", { exact: true })).toBeVisible();

  await page.goto("/prn/15/johor/dun/buloh-kasap");
  await expect(page.getByRole("heading", { name: "BULOH KASAP", exact: true })).toBeVisible();
  await expect(page.getByText("ZAHARI BIN SARIP", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("8,956", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("5,377", { exact: true }).first()).toBeVisible();
});
