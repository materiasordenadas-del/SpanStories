/**
 * CLI: validate the curator-authored image bindings and regenerate the
 * runtime registry.
 *
 *   npm run lexical-media:build
 *   npm run lexical-media:build -- --source=... --out-dir=...
 *
 * Exit code 0 on BUILD OK, 1 on BUILD FAIL. Runs offline against the
 * filesystem only — no network calls.
 */

import process from "node:process";

import { CANONICAL_SOURCE_FILE, REGISTRY_DIR } from "../../features/lexical-media/registry/files.ts";
import { buildImageRegistry } from "../../features/lexical-media/registry/serialize.ts";
import { formatMediaIssue, MediaRegistryError } from "../../features/lexical-media/domain/errors.ts";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match === null || match === undefined ? null : match.slice(prefix.length);
}

const sourceFile = argValue("source") ?? CANONICAL_SOURCE_FILE;
const outputDir = argValue("out-dir") ?? REGISTRY_DIR;

try {
  const bindings = buildImageRegistry(sourceFile, outputDir);
  console.log("BUILD OK");
  console.log(`source     ${sourceFile}`);
  console.log(`out        ${outputDir}`);
  console.log(`bindings   ${bindings.length}`);
} catch (error) {
  if (error instanceof MediaRegistryError) {
    console.error("BUILD FAIL");
    console.error(`source     ${sourceFile}`);
    console.error(`${error.issues.length} issue(s):`);
    for (const issue of error.issues.slice(0, 50)) {
      console.error(`  - ${formatMediaIssue(issue)}`);
    }
    process.exit(1);
  }
  throw error;
}
