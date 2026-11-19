// Each file in lint/boundaries/fixtures breaks one import boundary, except *.allowed.ts files, which show imports the
// rules must let through. The fixtures run under the boundary plugins and override globs read from biome.json, so a
// change there is tested here as well.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(app, 'lint/boundaries/fixtures');
const config = JSON.parse(readFileSync(join(app, 'biome.json'), 'utf8'));

const boundary = (plugin) => plugin.startsWith('./lint/boundaries/');
const absolute = (plugins) =>
  plugins.filter(boundary).map((plugin) => join(app, plugin));
const overrides = (config.overrides ?? [])
  .filter((override) => override.plugins?.some(boundary))
  .map((override) => ({
    includes: override.includes,
    plugins: absolute(override.plugins),
  }));

function filesIn(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

// Biome resolves plugin paths from the folder it runs in, so the fixtures run from a copy next to a generated config.
const work = mkdtempSync(join(tmpdir(), 'boundaries-'));
let biome;
try {
  cpSync(fixtures, work, { recursive: true });
  writeFileSync(
    join(work, 'biome.json'),
    JSON.stringify({
      files: { includes: ['**'] },
      formatter: { enabled: false },
      assist: { enabled: false },
      linter: { rules: { preset: 'none' } },
      plugins: absolute(config.plugins ?? []),
      overrides,
    }),
  );
  biome = spawnSync(
    join(app, 'node_modules/.bin/biome'),
    ['lint', '--reporter=github', '.'],
    {
      cwd: work,
      encoding: 'utf8',
    },
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (biome.error) throw biome.error;

const flagged = new Set();
for (const line of biome.stdout.split('\n')) {
  const match = /^::error title=plugin,file=([^,]+),/.exec(line);
  if (match) flagged.add(relative(work, match[1]));
}

const files = filesIn(fixtures);
const wrong = [];
for (const file of files) {
  const allowed = file.endsWith('.allowed.ts');
  const ok = allowed !== flagged.has(file);
  if (!ok) wrong.push(file);
  console.log(
    `${ok ? (allowed ? 'allowed ' : 'rejected') : allowed ? 'FLAGGED ' : 'MISSED  '} ${file}`,
  );
}

const rejected = files.filter((file) => !file.endsWith('.allowed.ts'));
if (!rejected.length || !overrides.length || wrong.length) {
  console.error(biome.stderr);
  console.error(
    rejected.length
      ? `The boundary rules got ${wrong.length} of ${files.length} fixtures wrong.`
      : 'No fixtures found.',
  );
  process.exit(1);
}
console.log(
  `The boundary rules rejected all ${rejected.length} fixtures and allowed the ${files.length - rejected.length} allowed ones.`,
);
