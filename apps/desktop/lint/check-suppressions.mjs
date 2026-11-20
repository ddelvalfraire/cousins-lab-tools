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
// - lint/effects.json setting anything but noRestrictedImports, since biome.json extends it;
// - an override that runs a boundary plugin on other globs than its own, since that leaves a folder unchecked;
// - a symlink, a nested .storybook folder, an .ignore file, a tsconfig `paths` other than `@/*` (or a baseUrl or
//   rootDirs), a `resolve.alias` in the Vite, Vitest or Storybook config, package.json `imports`, or a tracked file
//   a .gitignore lists, since each sends an import past the boundary rules or hides a file from Biome.
// Each file in lint/suppressions/configs is merged over the real biome.json, or over lint/effects.json for effects-*
// files, and must be caught, except *.allowed.json files. Dropping the ban's plugin is caught by lint:fixtures.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

// Biome accepts a value in parentheses after a category, and it may hold spaces (`lint(any words)`), so it is removed
// before the list is split.
const caught = (path) =>
  [...readFileSync(path, 'utf8').matchAll(suppression)].some(([, categories]) =>
    categories
      .replace(/\([^)]*\)?/g, '')
      .split(/\s+/)
      .some((category) => banned.test(category)),
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

// Files and settings that can send an import somewhere the boundary rules do not look, or hide a file from Biome,
// without a comment or a rule: a symlink (the rules read paths as written), a second .storybook folder (stories may
// import the setup by relative path), an .ignore file (Biome skips what it lists), a tsconfig `paths` other than
// `@/*`, a `baseUrl` or `rootDirs`, a `resolve.alias` in a Vite or Storybook config, and package.json `imports`.
const pinnedPaths = { '@/*': ['./src/*'] };
const aliasFiles = ['vite.config.ts', 'vitest.config.ts', '.storybook/main.ts'];
// tsconfig is JSON with comments and trailing commas; a string such as "@/*" must survive the comment stripping.
const jsonc = (text) =>
  text
    .replace(
      /("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      (_, string) => string ?? '',
    )
    .replace(
      /("(?:[^"\\]|\\.)*")|,(\s*[}\]])/g,
      (_, string, close) => string ?? close,
    );
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function fileProblems(name, path) {
  const base = name.split('/').pop();
  if (base === '.ignore') return ['an .ignore file'];
  if (aliasFiles.includes(name))
    return /\balias\b/.test(readFileSync(path, 'utf8')) ? ['an alias'] : [];
  const isTsconfig = /^tsconfig.*\.json$/.test(base);
  if (!isTsconfig && base !== 'package.json') return [];
  let json;
  try {
    json = JSON.parse(jsonc(readFileSync(path, 'utf8')));
  } catch {
    return ['unreadable JSON'];
  }
  if (base === 'package.json')
    return json.imports === undefined ? [] : ['package.json imports'];
  const options = json.compilerOptions ?? {};
  return [
    ...(options.paths === undefined || same(options.paths, pinnedPaths)
      ? []
      : ['tsconfig paths']),
    ...(options.baseUrl === undefined ? [] : ['tsconfig baseUrl']),
    ...(options.rootDirs === undefined ? [] : ['tsconfig rootDirs']),
  ];
}

// Folders Biome skips and installed packages are not walked: nothing there is linted. Only the app's top-level
// folders are skipped by name, so a `dist` folder deeper down is walked.
function structureProblems(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    const name = relative(root, path);
    if (entry.name === 'node_modules' || skippedNames.has(name)) return [];
    if (entry.isSymbolicLink()) return [`${name} (a symlink)`];
    if (entry.isDirectory()) {
      const nested = entry.name === '.storybook' && name !== '.storybook';
      return [
        ...(nested ? [`${name} (a nested .storybook folder)`] : []),
        ...structureProblems(root, path),
      ];
    }
    return fileProblems(name, path).map((problem) => `${name} (${problem})`);
  });
}
// The folders Biome skips: `!!` for any depth below the app root, `!` for the lint fixtures, which are probes.
const skippedNames = new Set(
  includes
    .filter((glob) => glob.startsWith('!') && glob !== '!bun.lock')
    .map((glob) => glob.replace(/^!!?/, '')),
);
const treeFixtures = [
  { path: 'src/features/presets/acq', link: '../acquisition', bad: true },
  { path: 'src/shared/ui/Link.tsx', link: '../../app/Link.tsx', bad: true },
  {
    path: 'src/.storybook/bridge.ts',
    flag: 'src/.storybook',
    file: '',
    bad: true,
  },
  { path: '.storybook/preview.ts', file: '', bad: false },
  { path: 'src/features/presets/.ignore', file: 'probe.tsx\n', bad: true },
  { path: 'src/features/presets/ignore.md', file: 'probe.tsx\n', bad: false },
  {
    path: 'tsconfig.json',
    file: `{ /* kept */ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }`,
    bad: false,
  },
  {
    path: 'tsconfig.node.json',
    file: '{ "compilerOptions": { "composite": true } }',
    bad: false,
  },
  {
    path: 'tsconfig.storybook.json',
    file: '{ "compilerOptions": { "paths": { "@/*": ["./src/*"], "~/*": ["./src/features/*"] } } }',
    bad: true,
  },
  {
    path: 'src/features/presets/tsconfig.json',
    file: '{ "compilerOptions": { "baseUrl": "../.." } }',
    bad: true,
  },
  {
    path: 'src/shared/tsconfig.app.json',
    file: '{ "compilerOptions": { "rootDirs": ["a", "b"] } }',
    bad: true,
  },
  {
    path: 'src/app/tsconfig.json',
    file: '{ "compilerOptions": ',
    bad: true,
  },
  { path: 'package.json', file: '{ "name": "app" }', bad: false },
  {
    path: 'src/features/presets/package.json',
    file: '{ "imports": { "#f/*": "./*" } }',
    bad: true,
  },
  {
    path: 'vite.config.ts',
    file: 'export default { resolve: { tsconfigPaths: true } };',
    bad: false,
  },
  {
    path: 'vitest.config.ts',
    file: "export default { resolve: { alias: { '~': './src' } } };",
    bad: true,
  },
  {
    path: '.storybook/main.ts',
    file: "export default { viteFinal: (c) => ({ ...c, resolve: { alias: { '~': './src' } } }) };",
    bad: true,
  },
  { path: 'dist/link', link: '../src', bad: false },
  { path: 'lint/boundaries/fixtures/.storybook/x.ts', file: '', bad: false },
  { path: 'src/features/presets/dist/link', link: '../..', bad: true },
  { path: 'src-tauri/.ignore', file: '', bad: false },
];
// A fixture is a symlink or a file. `flag` names the path that must be reported when it is not the fixture itself.
const treeFound = (() => {
  const work = mkdtempSync(join(tmpdir(), 'tree-problems-'));
  try {
    for (const { path, link, file } of treeFixtures) {
      const target = join(work, path);
      mkdirSync(dirname(target), { recursive: true });
      if (link === undefined) writeFileSync(target, file);
      else symlinkSync(link, target);
    }
    return structureProblems(work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
})();

// Biome skips a file a .gitignore lists even when git tracks it.
const trackedAndIgnored = (() => {
  const git = spawnSync('git', ['ls-files', '-ci', '--exclude-standard'], {
    cwd: app,
    encoding: 'utf8',
  });
  return git.status === 0 ? git.stdout.split('\n').filter(Boolean) : [];
})();

// The boundary plugins run from overrides whose globs say where they apply. Narrowing one, or pointing a plugin at
// another glob, would leave a folder unchecked.
const boundaryIncludes = new Map([
  ['./lint/boundaries/relative.grit', ['src/**']],
  ['./lint/boundaries/feature.grit', ['src/features/**']],
  ['./lint/boundaries/shared.grit', ['src/shared/**']],
  ['./lint/boundaries/storybook.grit', ['.storybook/**']],
]);
const configProblems = (config) => [
  ...(config.root === false ? ['root: false'] : []),
  ...(same(config.extends, extendsList) ? [] : ['extends']),
  ...(same(config.files?.includes, includes) ? [] : ['files.includes']),
  ...[config, ...(config.overrides ?? [])].flatMap((section, index) => {
    const where = index ? `overrides[${index - 1}].` : '';
    return [
      index > 0 &&
        (section.plugins ?? []).some(
          (plugin) =>
            plugin.startsWith('./lint/boundaries/') &&
            !same(section.includes, boundaryIncludes.get(plugin)),
        ) &&
        'boundary plugin includes',
      section.linter?.enabled === false && 'linter.enabled',
      section.linter?.includes !== undefined && 'linter.includes',
      (section.linter?.rules?.style?.noRestrictedImports !== undefined ||
        typeof section.linter?.rules?.style === 'string' ||
        (index > 0 && section.linter?.rules?.style !== undefined)) &&
        'linter.rules.style',
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
  [
    'tree problems',
    treeFixtures.map(({ path }) => path),
    (name) => {
      const { path, flag } = treeFixtures.find((entry) => entry.path === name);
      return treeFound.filter((problem) =>
        problem.startsWith(`${flag ?? path} (`),
      );
    },
  ],
];
const isAllowed = (list, name) =>
  list === 'nested configs'
    ? !nestedFixtures[name]
    : list === 'tree problems'
      ? !treeFixtures.find((entry) => entry.path === name).bad
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
for (const problem of structureProblems(app)) found.push(problem);
for (const path of trackedAndIgnored)
  found.push(`${path} (tracked, but a .gitignore hides it from Biome)`);
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
