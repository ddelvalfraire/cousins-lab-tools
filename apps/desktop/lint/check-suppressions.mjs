// A biome-ignore comment silences the effect ban and the import boundaries as easily as any other rule: the plugins
// report under lint/plugin, and the effect ban's import half is lint/style/noRestrictedImports. This fails on any such
// suppression in the app. Each file in lint/suppressions/fixtures must be caught, except *.allowed.ts files, which
// suppress unrelated rules and must not be.
//
// Configuration can do the same without a comment, so this also fails on:
// - any biome.json or biome.jsonc other than the app's own, since a nested one can switch the linter off for its folder;
// - biome.json, at the top level or in an override, switching the linter off, setting javascript.linter,
//   linter.includes, files.maxSize or noRestrictedImports (which only lint/effects.json sets), changing files.includes
//   from the list below, setting `root: false`, or extending anything but lint/effects.json;
// - lint/effects.json setting anything but noRestrictedImports, since biome.json extends it.
// Each file in lint/suppressions/configs is merged over the real biome.json, or over lint/effects.json for effects-*
// files, and must be caught, except *.allowed.json files. Dropping the ban's plugin is caught by lint:fixtures.
import {
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
const fixtures = join(app, 'lint/suppressions/fixtures');
const configs = join(app, 'lint/suppressions/configs');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const biomeConfig = readJson(join(app, 'biome.json'));
const effectsConfig = readJson(join(app, 'lint/effects.json'));

const includes = [
  '**',
  '!!src-tauri',
  '!!dist',
  '!!storybook-static',
  '!!test-results',
  '!!playwright-report',
  '!lint/fixtures',
  '!lint/boundaries/fixtures',
  '!lint/suppressions/fixtures',
  '!bun.lock',
];
const extendsList = ['./lint/effects.json'];

// The same top-level folders biome.json skips with `!!`, so a folder of the same name deeper down is still read.
const skipped = new Set(
  [
    'node_modules',
    ...includes
      .filter((glob) => glob.startsWith('!!'))
      .map((glob) => glob.slice(2)),
  ].map((folder) => join(app, folder)),
);
// A suppression lists one or more categories before its colon, and any one of them takes effect, so each is tested.
const suppression = /biome-ignore(?:-all|-start|-end)?\s([^:\n]*)/g;
const banned =
  /^lint(?:\/plugin(?:\/[\w-]+)?|\/style(?:\/noRestrictedImports)?)?(?:\(.*\))?$/;

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return skipped.has(path) || path === fixtures ? [] : sources(path);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

const caught = (path) =>
  [...readFileSync(path, 'utf8').matchAll(suppression)].some(([, categories]) =>
    categories.split(/\s+/).some((category) => banned.test(category)),
  );

// Every Biome config below the app except its own, skipping only installed packages. Folders biome.json skips are
// searched too, so a config there is caught before an edit to files.includes brings it into play.
function nestedConfigs(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : nestedConfigs(root, path);
    const config = relative(root, path);
    return /^biome\.jsonc?$/.test(entry.name) && config !== 'biome.json'
      ? [config]
      : [];
  });
}
const nestedFixtures = {
  'biome.json': false,
  'biome.jsonc': true,
  'src/features/presets/biome.json': true,
  'src/biome.jsonc': true,
  '.storybook/biome.json': true,
  'src-tauri/biome.json': true,
  'node_modules/pkg/biome.json': false,
  'src/features/presets/biome.json.md': false,
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const configProblems = (config) => [
  ...(config.root === false ? ['root: false'] : []),
  ...(same(config.extends, extendsList) ? [] : ['extends']),
  ...(same(config.files?.includes, includes) ? [] : ['files.includes']),
  ...[config, ...(config.overrides ?? [])].flatMap((section, index) => {
    const where = index ? `overrides[${index - 1}].` : '';
    return [
      section.linter?.enabled === false && 'linter.enabled',
      section.linter?.includes !== undefined && 'linter.includes',
      section.linter?.rules?.style?.noRestrictedImports !== undefined &&
        'noRestrictedImports',
      section.javascript?.linter !== undefined && 'javascript.linter',
      section.files?.maxSize !== undefined && 'files.maxSize',
      index > 0 && section.extends !== undefined && 'extends',
      index > 0 && section.files?.includes !== undefined && 'files.includes',
    ]
      .filter(Boolean)
      .map((problem) => where + problem);
  }),
];
const keysBeyond = (value, allowed, path) =>
  Object.keys(value ?? {})
    .filter((key) => !allowed.includes(key))
    .map((key) => path + key);
const effectsProblems = (config) => [
  ...keysBeyond(config, ['$schema', 'linter'], ''),
  ...keysBeyond(config.linter, ['rules'], 'linter.'),
  ...keysBeyond(config.linter?.rules, ['style'], 'linter.rules.'),
  ...keysBeyond(
    config.linter?.rules?.style,
    ['noRestrictedImports'],
    'linter.rules.style.',
  ),
];

// A config fixture changes only what it is about, so it is merged over the real file: objects merge, arrays and
// values replace, and overrides are appended.
const merge = (base, patch) =>
  Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(patch)])].map((key) => {
      const [a, b] = [base[key], patch[key]];
      if (b === undefined) return [key, a];
      if (key === 'overrides') return [key, [...(a ?? []), ...b]];
      const objects = [a, b].every(
        (value) => value && typeof value === 'object' && !Array.isArray(value),
      );
      return [key, objects ? merge(a, b) : b];
    }),
  );
const configFixtureProblems = (path) => {
  const patch = readJson(path);
  return /(?:^|\/)effects-[^/]*$/.test(path)
    ? effectsProblems(merge(effectsConfig, patch))
    : configProblems(merge(biomeConfig, patch));
};

const nestedFound = (() => {
  const work = mkdtempSync(join(tmpdir(), 'nested-configs-'));
  try {
    for (const path of Object.keys(nestedFixtures)) {
      mkdirSync(dirname(join(work, path)), { recursive: true });
      writeFileSync(join(work, path), '{}');
    }
    return nestedConfigs(work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
})();

const lists = [
  [
    'lint/suppressions/fixtures',
    readdirSync(fixtures),
    (name) => caught(join(fixtures, name)),
  ],
  [
    'lint/suppressions/configs',
    readdirSync(configs),
    (name) => configFixtureProblems(join(configs, name)),
  ],
  [
    'nested configs',
    Object.keys(nestedFixtures),
    (name) => nestedFound.includes(name),
  ],
];
const isAllowed = (list, name) =>
  list === 'nested configs'
    ? !nestedFixtures[name]
    : /\.allowed\.(?:ts|json)$/.test(name);

const wrong = [];
const empty = [];
for (const [list, names, check] of lists) {
  if (!names.some((name) => !isAllowed(list, name))) empty.push(list);
  for (const name of [...names].sort()) {
    const allowed = isAllowed(list, name);
    const result = check(name);
    const hit = Array.isArray(result) ? result.length > 0 : result;
    const ok = hit !== allowed;
    if (!ok) wrong.push(`${list}/${name}`);
    const verdict = ok
      ? allowed
        ? 'allowed '
        : 'caught  '
      : allowed
        ? 'FLAGGED '
        : 'MISSED  ';
    const detail =
      Array.isArray(result) && hit ? ` (${result.join(', ')})` : '';
    console.log(`${verdict} ${list}/${name}${detail}`);
  }
}
const total = lists.reduce((sum, [, names]) => sum + names.length, 0);

const found = sources(app)
  .filter(caught)
  .map((path) => relative(app, path));
for (const path of nestedConfigs(app)) found.push(`${path} (a nested config)`);
for (const problem of configProblems(biomeConfig))
  found.push(`biome.json (${problem})`);
for (const problem of effectsProblems(effectsConfig))
  found.push(`lint/effects.json (${problem})`);

if (empty.length || wrong.length) {
  if (empty.length)
    console.error(`No fixture that must be caught in: ${empty.join(', ')}.`);
  if (wrong.length)
    console.error(
      `The suppression check got ${wrong.length} of ${total} fixtures wrong.`,
    );
  process.exit(1);
}
if (found.length) {
  for (const file of found) console.error(`suppressed ${file}`);
  console.error(
    `${found.length} file(s) or settings suppress the effect ban or the import boundaries. Remove the suppression and fix the code instead.`,
  );
  process.exit(1);
}
console.log(
  `No suppressions of the effect ban or import boundaries; all ${total} fixtures behave.`,
);
