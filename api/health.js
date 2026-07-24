import { databaseConfigured, sql } from "../server/db.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  response.setHeader("cache-control", "private, max-age=30");
  if (!databaseConfigured()) return response.status(200).json({ database: "not-configured", telemetry: [], reconciliation: null, revisions: {} });
  try {
    const db = sql();
    const [telemetry, reconciliation, revisions] = await Promise.all([
      db`
        select kind, name, count(*)::int as samples,
               round(avg(value)::numeric, 3)::float as average,
               count(*) filter (where rating = 'poor')::int as poor
        from telemetry_events
        where received_at >= now() - interval '7 days'
        group by kind, name
        order by kind, name
      `,
      db`select release_id, status, summary, completed_at from reconciliation_runs order by completed_at desc limit 1`,
      db`select status, count(*)::int as count from editorial_revisions group by status`,
    ]);
    return response.status(200).json({
      database: "connected",
      telemetry,
      reconciliation: reconciliation[0] ?? null,
      revisions: Object.fromEntries(revisions.map((item) => [item.status, item.count])),
    });
  } catch (error) {
    console.error(error);
    return response.status(503).json({ database: "error", telemetry: [], reconciliation: null, revisions: {} });
  }
}
