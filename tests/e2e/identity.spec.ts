import { expect, test } from "@playwright/test";

test("Parti Bersama Malaysia uses the BERSAMA identity", async ({ page }) => {
  await page.goto("/settings/data/parti");
  const logo = page.getByRole("img", { name: "PARTI BERSAMA MALAYSIA" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", /26-parti-bersama-malaysia-bersama/);
  await logo.locator("xpath=ancestor::button").click();
  await expect(page.locator("#party-editor h2")).toHaveText("BERSAMA");
});

test("Rafizi keeps his PKR election identity and shows BERSAMA as current", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("politik:candidate-overrides:v1", JSON.stringify({ version: 1, candidateChanges: [{
      id: "misfiled-rafizi-membership",
      seatCode: "P.100",
      candidateIndex: 0,
      effectiveDate: "2022-11-19",
      name: "RAFIZI RAMLI",
      alliance: "LAIN-LAIN / BEBAS",
      party: "PARTI BERSAMA MALAYSIA",
      gender: "LELAKI",
      ethnicity: "MELAYU",
      reason: "Keahlian semasa tersalah direkod sebagai pembetulan PRU-15",
      createdAt: "2026-07-22T00:00:00.000Z",
    }] }));
  });
  await page.goto("/pru/15/negeri/parlimen/pandan");

  const historicalResult = page.locator(".candidate-detail").getByRole("img", { name: "PARTI KEADILAN RAKYAT (PKR)" });
  const historicalWinner = page.locator(".winner-card").getByRole("img", { name: "PARTI KEADILAN RAKYAT (PKR)" });
  const currentStatus = page.locator(".current-status-card");
  await expect(historicalResult).toBeVisible();
  await expect(historicalWinner).toBeVisible();
  await expect(currentStatus.getByRole("img", { name: "PARTI BERSAMA MALAYSIA" })).toBeVisible();
  await expect(currentStatus).toContainText("Keluar PKR");
  await expect(page.getByText("Tiada perubahan keahlian direkodkan sejak PRU-15.")).toHaveCount(0);
});
