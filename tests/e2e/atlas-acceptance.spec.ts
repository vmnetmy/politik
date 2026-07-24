import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("atlas passes the release acceptance contract", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname !== "/api/telemetry") failedRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && pathname !== "/api/telemetry") httpErrors.push(`${response.status()} ${pathname}`);
  });

  await page.goto("/peta?jenis=pru&edisi=15&mod=pemenang&negeri=selangor&kerusi=P.100&dun=selangor:n.25&pdm=pru-15:p.100:100%2F00%2F02");
  await expect(page.getByRole("heading", { name: "PANDAN" })).toBeVisible();
  await expect(page.locator(".atlas-hierarchy")).toContainText("PDM");
  await expect(page.locator(".atlas-source-note")).toContainText("Snapshot sempadan tepat");

  await page.reload();
  await expect(page.getByRole("heading", { name: "PANDAN" })).toBeVisible();
  await expect(page).toHaveURL(/kerusi=P\.100/);
  await expect(page).toHaveURL(/pdm=/);

  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const violations = await page.evaluate(async () => {
    const result = await (globalThis as typeof globalThis & {
      axe: { run: (root: Document, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> };
    }).axe.run(document, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    return result.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map((violation) => `${violation.id}:${violation.nodes.length}`);
  });

  expect(violations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(httpErrors).toEqual([]);

  await mkdir("visual-current", { recursive: true });
  await page.screenshot({
    path: `visual-current/${testInfo.project.name}-election-atlas.png`,
    fullPage: true,
    animations: "disabled",
  });
});

test("atlas supports spatial keyboard navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop keyboard acceptance contract.");
  await page.goto("/peta?jenis=pru&edisi=15&mod=majoriti&negeri=selangor");

  const firstSeat = page.locator('.atlas-map-geography path[role="button"][tabindex="0"]');
  await firstSeat.focus();
  await expect(firstSeat).toBeFocused();
  const initialLabel = await firstSeat.getAttribute("aria-label");
  await firstSeat.press("ArrowRight");

  const nextSeat = page.locator('.atlas-map-geography path[role="button"][tabindex="0"]');
  await expect(nextSeat).toBeFocused();
  await expect.poll(() => nextSeat.getAttribute("aria-label")).not.toBe(initialLabel);
  await nextSeat.press("Enter");
  await expect(page).toHaveURL(/kerusi=/);
});
