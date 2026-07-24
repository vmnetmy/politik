import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";
const failures = [];

async function requireFile(relativePath) {
  try {
    const value = await stat(join(DIST, relativePath));
    if (!value.isFile() || value.size === 0) failures.push(`${relativePath} is empty or not a file`);
    return value.size;
  } catch {
    failures.push(`${relativePath} is missing`);
    return 0;
  }
}

await Promise.all([
  requireFile("index.html"),
  requireFile("atlas.html"),
  requireFile("_headers"),
  requireFile("_redirects"),
  requireFile("data/boundaries/registry.json"),
  requireFile("data/boundaries/manifest.json"),
  requireFile("data/boundaries/my-sarawak-2015-peninsula-2018-sabah-2019/atlas/index.json"),
]);

const html = await readFile(join(DIST, "index.html"), "utf8");
const entryMatch = html.match(/<script[^>]+src="([^"]+)"/);
if (!entryMatch) {
  failures.push("index.html has no JavaScript entry");
} else {
  const entrySize = await requireFile(entryMatch[1].replace(/^\//, ""));
  if (entrySize > 350_000) failures.push(`main JavaScript entry is ${entrySize} bytes; budget is 350000`);
}

const atlasHtml = await readFile(join(DIST, "atlas.html"), "utf8");
const atlasEntryMatch = atlasHtml.match(/<script[^>]+src="([^"]+)"/);
if (!atlasEntryMatch) {
  failures.push("atlas.html has no JavaScript entry");
} else {
  const atlasEntrySize = await requireFile(atlasEntryMatch[1].replace(/^\//, ""));
  if (atlasEntrySize > 200_000) failures.push(`Atlas JavaScript entry is ${atlasEntrySize} bytes; budget is 200000`);
}

const assets = await readdir(join(DIST, "assets"));
const atlasChunk = assets.find((name) => name.startsWith("NationalElectionAtlasPage-") && name.endsWith(".js"));
if (!atlasChunk) {
  failures.push("Atlas route chunk is missing");
} else {
  const atlasSize = await requireFile(join("assets", atlasChunk));
  if (atlasSize > 90_000) failures.push(`Atlas route chunk is ${atlasSize} bytes; budget is 90000`);
}

const indexSize = await requireFile("data/boundaries/my-sarawak-2015-peninsula-2018-sabah-2019/atlas/index.json");
if (indexSize > 220_000) failures.push(`Atlas national geometry is ${indexSize} bytes; budget is 220000`);

const headers = await readFile(join(DIST, "_headers"), "utf8");
for (const required of ["Content-Security-Policy", "X-Content-Type-Options", "stale-while-revalidate", "immutable", "frame-ancestors https:"]) {
  if (!headers.includes(required)) failures.push(`_headers does not contain ${required}`);
}

if (failures.length) {
  console.error(`Staging artifact verification failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log("Staging artifact, routing, cache policy, security headers and size budgets passed.");
