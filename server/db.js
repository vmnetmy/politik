import postgres from "postgres";

let client;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function sql() {
  if (!databaseConfigured()) throw new Error("DATABASE_URL is not configured.");
  client ??= postgres(process.env.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: process.env.DATABASE_SSL === "false" ? false : "require",
  });
  return client;
}
