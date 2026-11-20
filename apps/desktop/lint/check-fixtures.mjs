// Each file in lint/fixtures reaches an effect hook in a different way. Every fixture is copied into each folder the
// app lints and run under the real biome.json, so removing the ban's plugin or its `extends`, or dropping one of those
// folders from `files.includes`, fails here. Biome must reject every copy with the ban plugin itself: a plugin that
// fails to load, or a pattern Biome can't run, only yields info diagnostics and passes. A fixture that imports or
// re-exports a banned name by name must also hit noRestrictedImports, the half of the ban that `extends` brings in.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
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
const dir = join(app, 'lint/fixtures');
const config = JSON.parse(readFileSync(join(app, 'biome.json'), 'utf8'));
const roots = [
  '.',
  'src',
  'src/app/probe',
  'src/features/probe',
  'src/shared/probe',
  'tests',
  '.storybook',
];
const fixtures = readdirSync(dir)
  .filter((file) => /\.tsx?$/.test(file))
  .sort();
const ban = /message="([^"]+)"/.exec(
  readFileSync(join(app, 'lint/no-effect-hooks.grit'), 'utf8'),
)?.[1];
if (!ban) throw new Error('No diagnostic message in lint/no-effect-hooks.grit');
const namesBannedImport = (file) =>
  /^(?:import|export) \{[^}]*\} from '(?:react|@mantine\/hooks)'/m.test(
    readFileSync(join(dir, file), 'utf8'),
  );

// Biome resolves plugin and extends paths from the folder it runs in, so the copy gets absolute ones. The copy is not
// a git checkout, so the VCS settings are dropped.
const absolute = (paths) =>
  paths?.map((path) => (path.startsWith('.') ? join(app, path) : path));
const { vcs: _vcs, ...rest } = config;
const generated = {
  ...rest,
  extends: absolute(config.extends),
  plugins: absolute(config.plugins),
  overrides: config.overrides?.map((override) => ({
    ...override,
    ...(override.plugins && { plugins: absolute(override.plugins) }),
  })),
};

const work = mkdtempSync(join(tmpdir(), 'effect-fixtures-'));
let biome;
try {
  for (const root of roots) {
    mkdirSync(join(work, root), { recursive: true });
    for (const file of fixtures)
      cpSync(join(dir, file), join(work, root, file));
  }
  writeFileSync(join(work, 'biome.json'), JSON.stringify(generated));
  biome = spawnSync(
    join(app, 'node_modules/.bin/biome'),
    ['lint', '--reporter=github', '--max-diagnostics=none', '.'],
    { cwd: work, encoding: 'utf8' },
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (biome.error) throw biome.error;

const fired = new Map();
for (const line of biome.stdout.split('\n')) {
  const match = /^::error title=([^,]+),file=([^,]+),[^:]*::(.*)$/.exec(line);
  if (!match) continue;
  const [, title, path, message] = match;
  const rule =
    title === 'plugin' && decodeURIComponent(message) === ban
      ? 'plugin'
      : title;
  const file = relative(work, path);
  fired.set(file, new Set([...(fired.get(file) ?? []), rule]));
}

let missed = 0;
for (const file of fixtures) {
  const expected = namesBannedImport(file)
    ? ['plugin', 'lint/style/noRestrictedImports']
    : ['plugin'];
  const gaps = roots.flatMap((root) => {
    const rules = fired.get(join(root, file)) ?? new Set();
    const lacking = expected.filter((rule) => !rules.has(rule));
    return lacking.length ? [`${root}: ${lacking.join(', ')}`] : [];
  });
  missed += gaps.length;
  console.log(
    gaps.length ? `MISSED   ${file} (${gaps.join('; ')})` : `rejected ${file}`,
  );
}

if (!fixtures.length || missed) {
  console.error(biome.stderr);
  console.error(
    fixtures.length
      ? `The effect ban missed ${missed} of ${fixtures.length * roots.length} fixture copies.`
      : 'No fixtures found.',
  );
  process.exit(1);
}
console.log(
  `The effect ban rejected all ${fixtures.length} fixtures in each of ${roots.length} folders.`,
);
