import { expect, test } from "@playwright/test";

test("national atlas switches editions and preserves hierarchical URL state", async ({ page }) => {
  await page.goto("/peta?jenis=pru&edisi=15&mod=majoriti");
  await expect(page.getByRole("heading", { name: /Mandat Malaysia/ })).toBeVisible();
  await expect(page.locator(".atlas-map-geography path")).toHaveCount(222);

  const sabakBernam = page.locator('.atlas-map-geography path[aria-label="Buka SELANGOR"]');
  await sabakBernam.focus();
  await sabakBernam.press("Enter");
  await expect(page).toHaveURL(/negeri=selangor/);
  const firstSeat = page.locator('.atlas-map-geography path[aria-label^="P.092 "]');
  await firstSeat.focus();
  await firstSeat.press("Enter");
  await expect(page).toHaveURL(/kerusi=P\.092/);
  await expect(page.locator(".atlas-detail-panel h2")).toHaveText("SABAK BERNAM");

  await page.locator(".atlas-election-switch button").filter({ hasText: "PRN" }).click();
  await expect(page).toHaveURL(/jenis=prn/);
  await expect(page).not.toHaveURL(/negeri=/);
  await expect(page.locator(".atlas-map-geography path")).toHaveCount(222);
  await page.locator('.atlas-map-geography path[aria-label="Buka SABAH"]').click();
  await expect(page).toHaveURL(/negeri=sabah/);
  await expect(page.locator(".atlas-map-geography path")).toHaveCount(73);
});

test("national atlas stays within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/peta?jenis=prn&edisi=15&mod=keluar-mengundi&negeri=negeri-sembilan&kerusi=P.126%3AN.01");
  await expect(page.locator(".atlas-detail-panel h2")).toHaveText("CHENNAH");
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("national atlas normalizes a PRN state that has no results in the selected edition", async ({ page }) => {
  await page.goto("/peta?jenis=prn&edisi=17&mod=pemenang&negeri=selangor");
  await expect(page).toHaveURL(/jenis=prn&edisi=17&mod=pemenang&negeri=sabah/);
  await expect(page.locator(".atlas-map-geography path")).toHaveCount(73);
  await expect(page.locator(".atlas-detail-panel")).toContainText("SABAH");
  await expect(page.locator(".atlas-detail-panel")).toContainText("73");
  await expect(page.locator(".atlas-results-table")).toContainText("73 kawasan");
});

test("national atlas lazy-loads state geometry and exposes comparison and hierarchy state", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/data/boundaries/")) requested.push(new URL(request.url()).pathname);
  });

  await page.goto("/peta?jenis=pru&edisi=15&mod=pemenang");
  await expect(page.locator(".atlas-map-geography path")).toHaveCount(222);
  expect(requested).toContain("/data/boundaries/my-sarawak-2015-peninsula-2018-sabah-2019/atlas/index.json");
  expect(requested.some((path) => path.includes("/atlas/states/"))).toBe(false);

  await page.locator('.atlas-map-geography path[aria-label="Buka SELANGOR"]').click();
  await expect.poll(() => requested.some((path) => path.endsWith("/atlas/states/selangor.json"))).toBe(true);
  await page.locator('.atlas-map-geography path[aria-label^="P.100 "]').click();
  await expect(page).toHaveURL(/kerusi=P\.100/);
  await expect(page.locator(".atlas-hierarchy")).toContainText("DUN");
  const hierarchySearch = page.getByRole("combobox", { name: "CARI DALAM KAWASAN" });
  await hierarchySearch.fill("PDM");
  await page.getByRole("option", { name: /^PDM ·/ }).first().click();
  await expect(page).toHaveURL(/pdm=/);

  await page.locator(".atlas-metric-switch button").filter({ hasText: "Δ Majoriti" }).click();
  await expect(page).toHaveURL(/mod=perubahan-majoriti/);
  await expect(page).toHaveURL(/banding=14/);
  await expect(page.locator(".atlas-comparison-note")).toContainText("PRU-14");

  await page.locator(".atlas-map-tools button").filter({ has: page.locator('svg') }).first().click();
  await expect(page.locator(".atlas-map-tools")).toContainText(/1\d\d%/);
});

test("national atlas search and fullscreen detail remain interactive", async ({ page }) => {
  await page.goto("/peta?jenis=pru&edisi=15&mod=pemenang");
  const search = page.getByRole("combobox", { name: "CARI ATLAS" });
  await search.fill("PANDAN");
  await page.getByRole("option", { name: /P\.100 PANDAN/ }).first().click();
  await expect(page).toHaveURL(/negeri=selangor/);
  await expect(page).toHaveURL(/kerusi=P\.100/);

  await page.getByRole("button", { name: "Buka skrin penuh" }).click();
  await expect(page.locator(".atlas-floating-detail")).toBeVisible();
  await expect(page.locator(".atlas-floating-detail")).toContainText("PANDAN");
  await page.keyboard.press("f");
  await expect(page.locator(".atlas-floating-detail")).toBeHidden();
});

test("national atlas exports a governed SVG snapshot", async ({ page }) => {
  await page.goto("/peta?jenis=pru&edisi=15&mod=majoriti&negeri=sarawak&kerusi=P.203");
  await expect(page.locator(".atlas-detail-panel h2")).toHaveText("LUBOK ANTU");
  await expect(page.locator(".atlas-editorial-insights")).toContainText("Pertandingan sengit");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Muat turun peta SVG" }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toBe("politik-my-pru-15-sarawak-majoriti.svg");
  const path = await artifact.path();
  expect(path).not.toBeNull();
});

test("embedded atlas keeps state while removing platform chrome", async ({ page }) => {
  await page.goto("/peta/embed?jenis=pru&edisi=15&mod=pemenang&negeri=selangor&kerusi=P.100");
  await expect(page.locator("body")).toHaveClass(/atlas-embed/);
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.getByRole("heading", { name: "PANDAN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Benamkan atlas" })).toHaveCount(0);
  await expect(page).toHaveURL(/kerusi=P\.100/);
});
