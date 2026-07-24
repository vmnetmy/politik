import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/prn/15/negeri-sembilan/peta");
  await expect(page.getByRole("heading", { name: /NEGERI SEMBILAN/ })).toBeVisible();
});

test("renders and filters all 36 official DUN geometries", async ({ page }) => {
  await expect(page.locator(".prn-map-features path")).toHaveCount(36);
  await expect(page.locator(".prn-map-detail")).toContainText("CHENNAH");

  await page.getByRole("button", { name: "PN 5" }).click();
  await expect(page.locator(".prn-map-detail")).toContainText("SERTING");
  await expect(page.getByRole("button", { name: "PN 5" })).toHaveClass(/is-active/);
  await expect(page.locator(".prn-map-features path[aria-hidden='false']")).toHaveCount(5);
});

test("morphs selection between searched DUNs and exposes the full result", async ({ page }) => {
  const marker = page.locator(".prn-map-selection-marker");
  const before = await marker.getAttribute("cx");
  await page.getByRole("combobox", { name: "CARI DUN" }).click();
  await page.getByRole("option", { name: /N\.27 RANTAU/ }).click();
  await expect(page.locator(".prn-map-detail")).toContainText("RANTAU");
  await expect(marker).not.toHaveAttribute("cx", before ?? "");
  await expect(page.getByRole("link", { name: /Lihat keputusan penuh/ })).toHaveAttribute("href", "/prn/15/negeri-sembilan/dun/rantau");
});

test("supports spatial keyboard navigation without horizontal overflow", async ({ page }) => {
  const selected = page.locator(".prn-map-features path[aria-pressed='true']");
  await selected.focus();
  const before = await selected.getAttribute("aria-label");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".prn-map-features path[aria-pressed='true']")).not.toHaveAttribute("aria-label", before ?? "");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("supports trackpad-style zoom, reset, fullscreen and a draggable detail panel", async ({ page, isMobile }) => {
  const canvas = page.locator(".prn-map-canvas");
  const camera = canvas.locator("svg > g");
  await canvas.hover({ position: { x: 220, y: 180 } });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -80);
  await page.keyboard.up("Control");
  await expect(camera).not.toHaveAttribute("transform", "translate(0 0) scale(1)");
  await expect(canvas.locator(".prn-map-tools [aria-live='polite']")).not.toHaveText("100%");

  await page.getByRole("button", { name: "Tetapkan semula peta" }).click();
  await expect(camera).toHaveAttribute("transform", "translate(0 0) scale(1)");
  await expect(canvas.locator(".prn-map-tools [aria-live='polite']")).toHaveText("100%");

  await page.getByRole("button", { name: "Buka skrin penuh" }).click();
  await expect(canvas).toHaveClass(/is-fullscreen/);
  await expect(page.getByRole("button", { name: "Keluar skrin penuh" })).toBeVisible();
  const floatingDetail = page.locator(".prn-map-floating-detail");
  await expect(page.getByRole("complementary", { name: /Maklumat kawasan dipilih: CHENNAH/ })).toContainText("LOKE SIEW FOOK");
  await expect(page.getByRole("button", { name: "Seret panel maklumat" })).toBeVisible();
  await page.getByRole("button", { name: /N\.02 PERTANG/ }).click({ force: true });
  await expect(page.getByRole("complementary", { name: /Maklumat kawasan dipilih: PERTANG/ })).toBeVisible();
  if (!isMobile) {
    const before = await floatingDetail.boundingBox();
    const handle = page.getByRole("button", { name: "Seret panel maklumat" });
    const handleBox = await handle.boundingBox();
    expect(before).not.toBeNull();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x - 120, handleBox!.y + 90, { steps: 6 });
    await page.mouse.up();
    const after = await floatingDetail.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)).toBeGreaterThan(50);
  }
  await page.getByRole("button", { name: "Keluar skrin penuh" }).click();
  await expect(canvas).not.toHaveClass(/is-fullscreen/);
});

test("supports native two-finger pinch gestures on mobile", async ({ page, isMobile, context }) => {
  test.skip(!isMobile, "Mobile touch contract");
  const canvas = page.locator(".prn-map-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cdp = await context.newCDPSession(page);
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: centerX - 30, y: centerY }, { x: centerX + 30, y: centerY }],
  });
  for (let step = 1; step <= 5; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: centerX - 30 - step * 8, y: centerY }, { x: centerX + 30 + step * 8, y: centerY }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(canvas.locator("svg > g")).not.toHaveAttribute("transform", "translate(0 0) scale(1)");
  await expect(canvas.locator(".prn-map-tools [aria-live='polite']")).not.toHaveText("100%");
});
