import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const client = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === "false" ? false : "require",
});
try {
  const directory = resolve("database/migrations");
  const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const migration of migrations) {
    await client.file(resolve(directory, migration));
    console.log(`Applied ${migration}`);
  }
} finally {
  await client.end();
}
