const { createHash } = require('node:crypto');
const { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = resolve(__dirname, '..');
const RELEASE_ROOT = join(ROOT, 'release');
const APP_NAME = 'agent-harness';
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

main();

function main() {
  ensureBuilt();

  const targetName = process.env.RELEASE_TARGET ?? defaultTargetName();
  const targetDir = join(RELEASE_ROOT, targetName);

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });

  copyReleasePayload(targetDir);
  writeLaunchers(targetDir);
  writeMetadata(targetDir, targetName);
}

function ensureBuilt() {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyReleasePayload(targetDir) {
  const payload = [
    'dist',
    'bin',
    'node_modules',
    'package.json',
    'package-lock.json',
    'README.md',
  ];

  for (const entry of payload) {
    const source = join(ROOT, entry);
    const destination = join(targetDir, entry);

    if (!exists(source)) {
      continue;
    }

    cpSync(source, destination, {
      recursive: true,
      preserveTimestamps: true,
    });
  }
}

function writeLaunchers(targetDir) {
  const unixLauncher = join(targetDir, APP_NAME);
  const windowsLauncher = join(targetDir, `${APP_NAME}.cmd`);
  const unixScript = `#!/usr/bin/env sh
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec node "$DIR/dist/src/cli/index.js" "$@"
`;
  const windowsScript = `@echo off
setlocal
set "DIR=%~dp0"
node "%DIR%dist\\src\\cli\\index.js" %*
`;

  writeFileSync(unixLauncher, unixScript, { mode: 0o755 });
  writeFileSync(windowsLauncher, windowsScript, 'utf8');
}

function writeMetadata(targetDir, targetName) {
  const metadata = {
    name: PACKAGE_JSON.name,
    version: PACKAGE_JSON.version,
    target: targetName,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    entrypoint: 'dist/src/cli/index.js',
    launcher: APP_NAME,
    builtAt: new Date().toISOString(),
    sourceCommit: currentCommit(),
    checksum: checksumDirectory(targetDir),
  };

  writeFileSync(join(targetDir, 'release-info.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function currentCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });

  if (result.status !== 0) {
    return undefined;
  }

  return typeof result.stdout === 'string' ? result.stdout.trim() : undefined;
}

function checksumDirectory(rootDir) {
  const hash = createHash('sha256');
  for (const filePath of listFiles(rootDir)) {
    hash.update(filePath.slice(rootDir.length + 1));
    hash.update('\0');
    hash.update(readFileSync(filePath));
    hash.update('\0');
  }

  return hash.digest('hex');
}

function listFiles(rootDir) {
  const files = [];

  for (const entry of readdirSync(rootDir)) {
    const fullPath = join(rootDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...listFiles(fullPath));
      continue;
    }

    if (stat.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function defaultTargetName() {
  const platform = process.platform === 'win32'
    ? 'win'
    : process.platform === 'darwin'
      ? 'macos'
      : 'linux';

  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

  return `${platform}-${arch}`;
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
