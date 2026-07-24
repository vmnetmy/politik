import { databaseConfigured, sql } from "../server/db.js";

const EVENT_KINDS = new Set(["web-vital", "client-error", "interaction"]);
const METRIC_NAMES = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);

function cleanText(value, maximum) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, maximum);
}

export default async function handler(request, response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  if (Number(request.headers["content-length"] || 0) > 4096) return response.status(413).json({ error: "payload_too_large" });
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) return response.status(403).json({ error: "origin_not_allowed" });
    } catch {
      return response.status(403).json({ error: "origin_not_allowed" });
    }
  }
  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch {
    return response.status(400).json({ error: "invalid_json" });
  }
  if (!body || !EVENT_KINDS.has(body.kind)) return response.status(400).json({ error: "invalid_event" });
  if (body.kind === "web-vital" && !METRIC_NAMES.has(body.name)) return response.status(400).json({ error: "invalid_metric" });
  const event = {
    kind: body.kind,
    name: cleanText(body.name, body.kind === "interaction" ? 80 : 50),
    value: typeof body.value === "number" && Number.isFinite(body.value) ? body.value : undefined,
    rating: cleanText(body.rating, 20) || undefined,
    path: cleanText(body.path, 180).startsWith("/") ? cleanText(body.path, 180) : "/",
    message: cleanText(body.message, 400) || undefined,
    occurredAt: cleanText(body.occurredAt, 40),
    receivedAt: new Date().toISOString(),
  };
  if (databaseConfigured()) {
    try {
      await sql()`
        insert into telemetry_events
          (kind, name, value, rating, path, message, occurred_at, received_at)
        values
          (${event.kind}, ${event.name}, ${event.value ?? null}, ${event.rating ?? null},
           ${event.path}, ${event.message ?? null}, ${event.occurredAt || event.receivedAt}, ${event.receivedAt})
      `;
    } catch (error) {
      console.error("telemetry_database_write_failed", error);
    }
  } else {
    console.info(JSON.stringify(event));
  }
  return response.status(204).end();
}
