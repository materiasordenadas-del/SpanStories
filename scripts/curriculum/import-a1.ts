/**
 * CLI: import the published A1 curriculum and regenerate the runtime registry.
 *
 *   npm run curriculum:import
 *   npm run curriculum:import -- --check           # validate, write nothing
 *   npm run curriculum:import -- --source-dir=... --out-dir=...
 *
 * Exit code 0 on IMPORT OK, 1 on IMPORT FAIL. Runs offline against the
 * filesystem only.
 */

import process from "node:process";

import { formatIssue } from "../../features/curriculum/domain/errors.ts";
import {
  CANONICAL_SOURCE_DIR,
  importCurriculum,
} from "../../features/curriculum/import/importer.ts";
import { REGISTRY_DIR } from "../../features/curriculum/registry/files.ts";
import { writeRegistry } from "../../features/curriculum/registry/serialize.ts";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match === undefined ? null : match.slice(prefix.length);
}

const sourceDir = argValue("source-dir") ?? CANONICAL_SOURCE_DIR;
const outputDir = argValue("out-dir") ?? REGISTRY_DIR;
const checkOnly = process.argv.includes("--check");

const result = importCurriculum({ sourceDir });

if (result.status === "IMPORT_FAIL") {
  console.error("IMPORT FAIL");
  console.error(`sources: ${sourceDir}`);
  console.error(`${result.issues.length} issue(s):`);
  for (const issue of result.issues.slice(0, 50)) {
    console.error(`  - ${formatIssue(issue)}`);
  }
  if (result.issues.length > 50) {
    console.error(`  ... and ${result.issues.length - 50} more`);
  }
  process.exit(1);
}

const { release, data } = result;

console.log("IMPORT OK");
console.log(`release        ${release.releaseId}`);
console.log(`schema         ${release.schemaVersion}`);
console.log(`content hash   ${release.contentHash}`);
console.log(`sources        ${sourceDir}`);
for (const source of release.sourceFiles) {
  console.log(
    `  ${source.sha256.slice(0, 16)}…  ${String(source.recordCount).padStart(5)} rec  ${source.file}`,
  );
}

console.log("counts (expected = actual):");
for (const [key, actual] of Object.entries(release.actualCounts)) {
  const expected = release.expectedCounts[key];
  console.log(
    `  ${key.padEnd(44)} ${String(actual).padStart(5)}${expected === actual ? "" : `  != expected ${expected}`}`,
  );
}

console.log("invariants:");
for (const invariant of release.validationResult.invariants) {
  console.log(
    `  ${invariant.status === "PASS" ? "PASS" : "FAIL"}  ${invariant.name.padEnd(48)} ${invariant.observed}`,
  );
}

if (checkOnly) {
  console.log("--check: registry not written");
  process.exit(0);
}

const written = writeRegistry(release, data, outputDir);
console.log(`registry written to ${outputDir}:`);
let total = 0;
for (const file of written) {
  total += file.byteLength;
  console.log(`  ${String(file.byteLength).padStart(9)} B  ${file.file}`);
}
console.log(`  ${String(total).padStart(9)} B  total`);
