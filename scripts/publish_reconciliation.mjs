import { readFile } from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const report = JSON.parse(await readFile("public/data/reports/latest.json", "utf8"));
const client = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === "false" ? false : "require",
});
try {
  await client.begin(async (transaction) => {
    const [run] = await transaction`
      insert into reconciliation_runs (release_id, status, summary, started_at, completed_at)
      values (${report.releaseId}, ${report.status}, ${client.json(report.summary)}, ${report.startedAt}, ${report.completedAt})
      returning id
    `;
    for (const item of report.issues) {
      await transaction`
        insert into reconciliation_issues
          (run_id, severity, election_id, constituency_code, rule_id, message, details)
        values
          (${run.id}, ${item.severity}, ${item.electionId}, ${item.constituencyCode},
           ${item.ruleId}, ${item.message}, ${client.json(item.details)})
      `;
    }
  });
  console.log(`Published reconciliation ${report.releaseId}.`);
} finally {
  await client.end();
}
