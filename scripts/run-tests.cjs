const { readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

function collectTestFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...collectTestFiles(path));
      continue;
    }

    if (entry.endsWith(".test.ts")) {
      files.push(path);
    }
  }

  return files.sort();
}

const testFiles = collectTestFiles("tests");

if (testFiles.length === 0) {
  console.error("No TypeScript test files found under tests/.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", "--require", "ts-node/register", ...testFiles],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
