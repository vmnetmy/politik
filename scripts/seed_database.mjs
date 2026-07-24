import { readFile } from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const client = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === "false" ? false : "require",
});
try {
  const editions = JSON.parse(await readFile("public/data/elections/index.json", "utf8"));
  const boundaries = JSON.parse(await readFile("public/data/boundaries/registry.json", "utf8"));
  const stateElections = JSON.parse(await readFile("public/data/state-elections.json", "utf8"));
  const personRegistry = JSON.parse(await readFile("public/data/reference/persons.json", "utf8"));
  for (const edition of editions.elections) {
    await client`
      insert into election_editions
        (id, election_type, edition_number, election_date, term_id, boundary_version, publication_status, metadata)
      values
        (${edition.id}, 'pru', ${edition.number}, ${edition.electionDate}, ${edition.termId},
         ${edition.boundaryVersion}, 'published', ${client.json(edition)})
      on conflict (id) do update set metadata = excluded.metadata, boundary_version = excluded.boundary_version
    `;
  }
  for (const event of stateElections.events) {
    const registryEntry = boundaries.stateAssemblies[String(event.assemblyNumber)];
    const boundary = registryEntry?.states?.[event.stateId] ?? registryEntry;
    if (!boundary?.boundaryVersion) throw new Error(`No boundary version registered for ${event.id}.`);
    await client`
      insert into election_editions
        (id, election_type, edition_number, state_id, election_date, term_id, boundary_version, publication_status, metadata)
      values
        (${event.id}, 'prn', ${event.assemblyNumber}, ${event.stateId}, ${event.electionDate},
         ${`dun-${event.stateId}-${event.assemblyNumber}`}, ${boundary.boundaryVersion}, 'published', ${client.json(event)})
      on conflict (id) do update
      set metadata = excluded.metadata, boundary_version = excluded.boundary_version,
          election_date = excluded.election_date
    `;
  }
  const sources = new Map();
  for (const entry of Object.values(boundaries.federal)) {
    for (const state of Object.values(entry.states ?? {})) sources.set(state.boundaryVersion, state);
  }
  for (const entry of Object.values(boundaries.stateAssemblies)) {
    for (const state of Object.values(entry.states ?? {})) sources.set(state.boundaryVersion, state);
  }
  for (const [id, boundary] of sources) {
    await client`
      insert into boundary_versions (id, effective_from, source_url, order_reference, geometry_manifest)
      values (${id}, ${boundary.effectiveFrom}, ${boundary.evidenceUrl}, ${boundary.orderReference}, ${client.json(boundary)})
      on conflict (id) do update set geometry_manifest = excluded.geometry_manifest
    `;
  }
  for (const person of personRegistry.persons) {
    await client`
      insert into persons (id, display_name, metadata)
      values (${person.id}, ${person.canonicalName}, ${client.json(person)})
      on conflict (id) do update
      set display_name = excluded.display_name, metadata = excluded.metadata
    `;
  }
  console.log(`Seeded ${editions.elections.length} federal editions, ${stateElections.events.length} state elections, ${sources.size} boundary versions and ${personRegistry.persons.length} persons.`);
} finally {
  await client.end();
}
