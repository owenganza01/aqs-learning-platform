#!/usr/bin/env node
// =============================================================================
// AQS local backend status (read-only).
//
// Reports four separate things. Each one proves only what it says:
//   1. Docker engine and local Supabase containers: names, states and health only.
//      Proves the local containers are up or down. Nothing about data or schema.
//   2. Local database readiness: `pg_isready` inside the local database container.
//      Proves the server accepts connections. No SQL is run and no credentials are used.
//   3. Local migration history, as listed by the Supabase CLI: versions only.
//      Proves what the LOCAL database's migration table records. It says nothing about
//      hosted Supabase, production, or whether the schema matches the migration files.
//   4. SHA-256 hashes of migration and draft SQL files. File contents are never printed.
//      Proves a file's bytes match a hash. It does not prove the file was applied.
//
// The script never starts or stops Docker or Supabase, never applies or reverts
// migrations, never resets data, never edits files, and never runs SQL beyond
// `pg_isready`. Missing Docker, stopped containers or a missing CLI are reported,
// not treated as errors that stop the script.
// =============================================================================

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_CLI =
  'C:\\Users\\HP\\AppData\\Local\\AQS-tools\\supabase-cli-2.121.0\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe';
const TIMEOUT_MS = 20000;
const MAX_BUFFER_BYTES = 1024 * 1024;
const DB_CONTAINER_PREFIX = 'supabase_db_';
const CONTAINER_NAME_FILTER = 'supabase_';
const HASHED_DIRECTORIES = ['supabase/migrations', 'docs/review-artifacts'];

// Output must never carry secrets. Redact anything that looks like a key, token or
// connection string, collapse whitespace, and keep the length short.
function redact(text) {
  return String(text ?? '')
    .replace(/eyJ[A-Za-z0-9._-]{10,}/g, '[redacted-jwt]')
    .replace(/sb_[A-Za-z0-9_-]{10,}/g, '[redacted-key]')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// Runs one command with a fixed argument list (no shell), a timeout and a size limit.
// Never rejects: every outcome is returned as data.
function run(file, args) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd: ROOT, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES, windowsHide: true, shell: false },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true, missing: false, timedOut: false, stdout: String(stdout), stderr: String(stderr) });
          return;
        }
        resolve({
          ok: false,
          missing: error.code === 'ENOENT',
          timedOut: error.killed === true && error.signal === 'SIGTERM',
          code: error.code ?? null,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        });
      },
    );
  });
}

// 1. Docker engine and local Supabase containers ------------------------------------
async function sectionDocker() {
  console.log('1. Docker and local Supabase containers');
  console.log('   Proves: whether the local containers are up, and their health states.');
  console.log('   Does not prove: anything about data, schema or hosted services.');

  const engine = await run('docker', ['version', '--format', '{{.Server.Version}}']);
  if (engine.missing) {
    console.log('   Docker: not found on PATH.');
    return { running: false, dbContainer: null };
  }
  if (engine.timedOut) {
    console.log('   Docker: did not answer within the time limit.');
    return { running: false, dbContainer: null };
  }
  if (!engine.ok) {
    console.log(`   Docker: engine not reachable (${redact(engine.stderr) || 'no detail'}).`);
    return { running: false, dbContainer: null };
  }
  console.log(`   Docker engine: reachable (server ${redact(engine.stdout)}).`);

  const listing = await run('docker', [
    'ps',
    '-a',
    '--filter',
    `name=${CONTAINER_NAME_FILTER}`,
    '--format',
    '{{.Names}}|{{.State}}|{{.Status}}',
  ]);
  if (!listing.ok) {
    console.log(`   Containers: could not be listed (${redact(listing.stderr) || 'no detail'}).`);
    return { running: true, dbContainer: null };
  }

  const containers = listing.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, state, status] = line.split('|');
      return { name, state, status };
    });

  if (containers.length === 0) {
    console.log('   Containers: none found with the Supabase name prefix.');
  } else {
    console.log(`   Containers found: ${containers.length}`);
    for (const c of containers) {
      console.log(`     - ${c.name}: state=${c.state}, status=${redact(c.status)}`);
    }
  }

  const db = containers.find((c) => c.name.startsWith(DB_CONTAINER_PREFIX) && c.state === 'running');
  return { running: true, dbContainer: db ? db.name : null };
}

// 2. Local database readiness (pg_isready only) -------------------------------------
async function sectionDatabaseReadiness(dbContainer) {
  console.log('\n2. Local database readiness');
  console.log('   Proves: whether the local Postgres server accepts connections.');
  console.log('   Does not prove: that any schema, data or migration state is correct.');

  if (!dbContainer) {
    console.log('   Skipped: no running local database container was found.');
    return;
  }
  const ready = await run('docker', ['exec', dbContainer, 'pg_isready', '-U', 'postgres']);
  if (ready.timedOut) {
    console.log('   Result: readiness check did not answer within the time limit.');
    return;
  }
  if (ready.ok) {
    console.log(`   Result: ${redact(ready.stdout)}`);
    return;
  }
  // pg_isready exit codes: 1 = rejecting connections, 2 = no response, 3 = invalid arguments.
  console.log(`   Result: not ready (pg_isready exit code ${ready.code ?? 'unknown'}).`);
}

// 3. Local migration history, as listed by the Supabase CLI -------------------------
async function sectionMigrationHistory() {
  console.log('\n3. Local migration history (Supabase CLI, local only)');
  console.log('   Proves: which migration versions the LOCAL database records as applied.');
  console.log('   Does not prove: anything about hosted Supabase or production, or that the');
  console.log('   schema matches the migration files.');
  console.log('   Note: the CLI may write its own cache under supabase/.temp (gitignored).');

  if (!existsSync(SUPABASE_CLI)) {
    console.log('   Skipped: the Supabase CLI executable was not found at the configured path.');
    return;
  }
  const listing = await run(SUPABASE_CLI, ['migration', 'list', '--local']);
  if (listing.timedOut) {
    console.log('   Result: the CLI did not answer within the time limit.');
    return;
  }
  if (!listing.ok) {
    console.log(`   Result: the CLI reported an error (${redact(listing.stderr) || 'no detail'}).`);
    return;
  }

  // The CLI prints a JSON line with a "migrations" array. Only versions are read from it.
  const jsonLine = listing.stdout.split(/\r?\n/).find((line) => line.trim().startsWith('{'));
  let parsed = null;
  try {
    parsed = jsonLine ? JSON.parse(jsonLine) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || !Array.isArray(parsed.migrations)) {
    console.log('   Result: the CLI output could not be read as a migration list.');
    return;
  }

  console.log(`   Migrations recorded locally: ${parsed.migrations.length}`);
  for (const m of parsed.migrations) {
    const local = m.local ?? '(none)';
    const remote = m.remote ?? '(none)';
    const match = local === remote ? 'local = remote' : 'MISMATCH between local and remote';
    console.log(`     - local ${local} | remote ${remote} | ${match}`);
  }
}

// 4. SHA-256 hashes of migration and draft SQL files (contents never printed) -------
async function sectionFileHashes() {
  console.log('\n4. File hashes (SQL only; contents are not printed)');
  console.log('   Proves: that each file has the bytes shown below.');
  console.log('   Does not prove: that a file was applied, or that a database matches it.');

  for (const directory of HASHED_DIRECTORIES) {
    const absolute = join(ROOT, directory);
    console.log(`   ${directory}/`);
    if (!existsSync(absolute)) {
      console.log('     (directory not found)');
      continue;
    }
    const names = (await readdir(absolute)).filter((name) => name.endsWith('.sql')).sort();
    if (names.length === 0) {
      console.log('     (no .sql files)');
      continue;
    }
    for (const name of names) {
      const bytes = await readFile(join(absolute, name));
      const digest = createHash('sha256').update(bytes).digest('hex');
      const shown = relative(ROOT, join(absolute, name)).split('\\').join('/');
      console.log(`     ${digest}  ${shown}`);
    }
  }
}

async function main() {
  console.log('AQS local backend status (read-only)');
  console.log('Scope: the local Supabase stack on this machine only. Nothing here describes hosted');
  console.log('Supabase or production. Each section below states what it does and does not prove.\n');

  const docker = await sectionDocker();
  await sectionDatabaseReadiness(docker.dbContainer);
  await sectionMigrationHistory();
  await sectionFileHashes();

  console.log('\nEnd of read-only status. No files, containers, databases or migrations were changed.');
}

main().catch((error) => {
  console.error(`Unexpected error: ${redact(error?.message ?? error)}`);
  process.exitCode = 1;
});
