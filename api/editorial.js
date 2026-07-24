import { createHash, timingSafeEqual } from "node:crypto";
import { databaseConfigured, sql } from "../server/db.js";
import { transitionViolation, validateRevisionInput } from "../server/editorial-policy.js";

function authorised(request) {
  const expected = process.env.EDITORIAL_API_TOKEN;
  const supplied = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(left, right);
}

function json(response, status, body) {
  response.setHeader("cache-control", "no-store");
  return response.status(status).json(body);
}

export default async function handler(request, response) {
  if (!databaseConfigured()) return json(response, 503, { error: "database_not_configured" });
  if (!authorised(request)) return json(response, 401, { error: "unauthorised" });
  const db = sql();
  try {
    if (request.method === "GET") {
      const electionId = String(request.query?.electionId ?? "");
      const rows = await db`
        select id, election_id, data_kind, status, reason, source_url, effective_at,
               created_by, reviewed_by, published_by, created_at, reviewed_at, published_at
        from editorial_revisions
        where (${electionId} = '' or election_id = ${electionId})
        order by created_at desc
        limit 100
      `;
      return json(response, 200, { revisions: rows });
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "GET, POST");
      return json(response, 405, { error: "method_not_allowed" });
    }
    if (Number(request.headers["content-length"] || 0) > 1_000_000) return json(response, 413, { error: "payload_too_large" });
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (body?.action === "rollback") {
      const revisionId = String(body.revisionId ?? "");
      const actor = String(body.actor ?? "").trim();
      if (actor.length < 2 || actor.length > 120) return json(response, 400, { error: "invalid_actor" });
      const outcome = await db.begin(async (transaction) => {
        const [revision] = await transaction`select * from editorial_revisions where id = ${revisionId}::uuid for update`;
        if (!revision || !["published", "superseded"].includes(revision.status)) {
          return { error: "revision_not_publishable" };
        }
        const etag = createHash("sha256").update(JSON.stringify(revision.payload)).digest("hex");
        await transaction`
          insert into published_read_models (election_id, data_kind, revision_id, payload, etag)
          values (${revision.election_id}, ${revision.data_kind}, ${revisionId}::uuid, ${db.json(revision.payload)}, ${etag})
          on conflict (election_id, data_kind) do update
          set revision_id = excluded.revision_id, payload = excluded.payload,
              etag = excluded.etag, published_at = now()
        `;
        await transaction`
          insert into editorial_revision_events (revision_id, from_status, to_status, actor, note)
          values (${revisionId}::uuid, ${revision.status}, ${revision.status}, ${actor}, 'Published read model rolled back to this revision')
        `;
        return { revision };
      });
      if (outcome.error) return json(response, 409, outcome);
      return json(response, 200, { revision: outcome.revision, rolledBack: true });
    }
    if (body?.action === "transition") {
      const revisionId = String(body.revisionId ?? "");
      const target = String(body.status ?? "");
      const actor = String(body.actor ?? "").trim();
      const outcome = await db.begin(async (transaction) => {
        const [current] = await transaction`select * from editorial_revisions where id = ${revisionId}::uuid for update`;
        if (!current) return { error: "revision_not_found" };
        const violation = transitionViolation(current, target, actor);
        if (violation) return { error: violation, from: current.status, to: target };
        if (target === "published") {
          const superseded = await transaction`
            update editorial_revisions
            set status = 'superseded', superseded_at = now()
            where election_id = ${current.election_id}
              and data_kind = ${current.data_kind}
              and status = 'published'
              and id <> ${revisionId}::uuid
            returning id
          `;
          for (const revision of superseded) {
            await transaction`
              insert into editorial_revision_events (revision_id, from_status, to_status, actor, note)
              values (${revision.id}, 'published', 'superseded', ${actor}, 'Superseded by a newly published revision')
            `;
          }
        }
        const rows = await transaction`
          update editorial_revisions set
            status = ${target},
            reviewed_by = case when ${target} = 'reviewed' then ${actor} else reviewed_by end,
            reviewed_at = case when ${target} = 'reviewed' then now() else reviewed_at end,
            published_by = case when ${target} = 'published' then ${actor} else published_by end,
            published_at = case when ${target} = 'published' then now() else published_at end,
            superseded_at = case when ${target} = 'superseded' then now() else superseded_at end
          where id = ${revisionId}::uuid
          returning *
        `;
        await transaction`
          insert into editorial_revision_events (revision_id, from_status, to_status, actor, note)
          values (${revisionId}::uuid, ${current.status}, ${target}, ${actor}, ${String(body.note ?? "").slice(0, 1000) || null})
        `;
        if (target === "published") {
          const etag = createHash("sha256").update(JSON.stringify(current.payload)).digest("hex");
          await transaction`
            insert into published_read_models (election_id, data_kind, revision_id, payload, etag)
            values (${current.election_id}, ${current.data_kind}, ${revisionId}::uuid, ${db.json(current.payload)}, ${etag})
            on conflict (election_id, data_kind) do update
            set revision_id = excluded.revision_id, payload = excluded.payload,
                etag = excluded.etag, published_at = now()
          `;
        }
        return { revision: rows[0] };
      });
      if (outcome.error) {
        return json(response, outcome.error === "revision_not_found" ? 404 : 409, outcome);
      }
      return json(response, 200, { revision: outcome.revision });
    }
    const input = validateRevisionInput(body);
    const [created] = await db.begin(async (transaction) => {
      const rows = await transaction`
        insert into editorial_revisions
          (election_id, data_kind, payload, reason, source_url, effective_at, created_by)
        values
          (${input.electionId}, ${input.dataKind}, ${db.json(input.payload)}, ${input.reason},
           ${input.sourceUrl}, ${input.effectiveAt}, ${input.actor})
        returning *
      `;
      await transaction`
        insert into editorial_revision_events (revision_id, from_status, to_status, actor, note)
        values (${rows[0].id}, null, 'draft', ${input.actor}, 'Revision created')
      `;
      return rows;
    });
    return json(response, 201, { revision: created });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: "editorial_operation_failed" });
  }
}
