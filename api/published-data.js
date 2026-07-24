import { databaseConfigured, sql } from "../server/db.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  if (!databaseConfigured()) return response.status(503).json({ error: "database_not_configured" });
  const electionId = String(request.query?.electionId ?? "");
  const dataKind = String(request.query?.dataKind ?? "");
  if (!/^(pru|prn)-[a-z0-9-]+$/.test(electionId) || !/^[a-z][a-z0-9-]{1,60}$/.test(dataKind)) {
    return response.status(400).json({ error: "invalid_query" });
  }
  const [record] = await sql()`
    select payload, etag, published_at
    from published_read_models
    where election_id = ${electionId} and data_kind = ${dataKind}
  `;
  if (!record) return response.status(404).json({ error: "not_found" });
  response.setHeader("etag", `"${record.etag}"`);
  response.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=600");
  return response.status(200).json({ electionId, dataKind, publishedAt: record.published_at, payload: record.payload });
}
