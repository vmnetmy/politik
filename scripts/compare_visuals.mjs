import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const baselineDirectory = "visual-baseline";
const currentDirectory = "visual-current";
const diffDirectory = "visual-diff";
const maximumDiffRatio = 0.005;

const filenames = (await readdir(currentDirectory)).filter((name) => name.endsWith(".png")).sort();
if (!filenames.length) throw new Error("No current visual screenshots were produced.");
await mkdir(diffDirectory, { recursive: true });
const failures = [];
const seeded = [];

for (const filename of filenames) {
  try {
    await access(join(baselineDirectory, filename));
  } catch {
    seeded.push(filename);
    continue;
  }
  const baseline = PNG.sync.read(await readFile(join(baselineDirectory, filename)));
  const current = PNG.sync.read(await readFile(join(currentDirectory, filename)));
  if (baseline.width !== current.width || baseline.height !== current.height) {
    failures.push(`${filename}: dimensions changed from ${baseline.width}x${baseline.height} to ${current.width}x${current.height}`);
    continue;
  }
  const diff = new PNG({ width: current.width, height: current.height });
  const changedPixels = pixelmatch(baseline.data, current.data, diff.data, current.width, current.height, { threshold: 0.12 });
  const ratio = changedPixels / (current.width * current.height);
  await writeFile(join(diffDirectory, filename), PNG.sync.write(diff));
  if (ratio > maximumDiffRatio) failures.push(`${filename}: ${(ratio * 100).toFixed(3)}% pixels changed (maximum ${(maximumDiffRatio * 100).toFixed(3)}%)`);
}

if (failures.length) {
  console.error(`Visual regression failed:\n${failures.join("\n")}`);
  process.exit(1);
}
if (seeded.length) console.log(`New visual baselines will be seeded after merge: ${seeded.join(", ")}.`);
console.log(`Visual regression passed for ${filenames.length} responsive screenshots.`);
