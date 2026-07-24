import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const target = process.env.LIGHTHOUSE_URL ?? "http://127.0.0.1:4173/pru/15/negeri/parlimen";
const output = process.env.LIGHTHOUSE_OUTPUT ?? "lighthouse-report.json";
const command = process.platform === "win32" ? "node_modules/.bin/lighthouse.cmd" : "node_modules/.bin/lighthouse";
const child = spawn(command, [target, "--quiet", "--output=json", `--output-path=${output}`, "--chrome-flags=--headless=new --no-sandbox", "--throttling-method=devtools"], {
  stdio: "inherit",
  env: { ...process.env, CHROME_PATH: chromium.executablePath() },
});
const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0) process.exit(Number(exitCode) || 1);

const report = JSON.parse(await readFile(output, "utf8"));
const thresholds = { performance: 0.8, accessibility: 0.9, "best-practices": 0.9, seo: 0.9 };
const failures = [];
for (const [category, minimum] of Object.entries(thresholds)) {
  const score = report.categories?.[category]?.score ?? 0;
  if (score < minimum) failures.push(`${category}: ${score} < ${minimum}`);
}
const metrics = {
  "largest-contentful-paint": target.includes("/peta") ? 2500 : 3000,
  "cumulative-layout-shift": 0.1,
  "total-blocking-time": target.includes("/peta") ? 200 : 300,
};
for (const [audit, maximum] of Object.entries(metrics)) {
  const value = report.audits?.[audit]?.numericValue ?? Number.POSITIVE_INFINITY;
  if (value > maximum) failures.push(`${audit}: ${value} > ${maximum}`);
}
if (failures.length) {
  console.error(`Lighthouse budgets failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Lighthouse category and Core Web Vitals proxy budgets passed.");
