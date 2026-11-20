// A biome-ignore comment silences the effect ban and the import boundaries as easily as any other rule: the plugins
// report under lint/plugin, and the effect ban's import half is lint/style/noRestrictedImports. This fails on any such
// suppression in the app. Each file in lint/suppressions/fixtures must be caught, except *.allowed.ts files, which
// suppress unrelated rules and must not be.
//
// biome.json can do the same without a comment: an override that switches the linter off, or one that sets
// noRestrictedImports, which only lint/effects.json should. Each file in lint/suppressions/configs is a config that must
// be caught, except *.allowed.json files. Dropping the ban's plugin, its extends or a folder from files.includes is
// caught by lint:fixtures, which runs under the real config.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(app, 'lint/suppressions/fixtures');
const configs = join(app, 'lint/suppressions/configs');
// The same top-level folders biome.json skips with `!!`, so a folder of the same name deeper down is still read.
const skipped = new Set(
  [
    'node_modules',
    ...JSON.parse(readFileSync(join(app, 'biome.json'), 'utf8'))
      .files.includes.filter((glob) => glob.startsWith('!!'))
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

const configSuppresses = (path) => {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  return [config, ...(config.overrides ?? [])].some(
    ({ linter }) =>
      linter?.enabled === false ||
      linter?.rules?.style?.noRestrictedImports !== undefined,
  );
};

const wrong = [];
const fixtureFiles = [
  ...readdirSync(fixtures).map((name) => [fixtures, name, caught]),
  ...readdirSync(configs).map((name) => [configs, name, configSuppresses]),
].sort(([, a], [, b]) => a.localeCompare(b));
for (const [dir, name, check] of fixtureFiles) {
  const allowed = /\.allowed\.(?:ts|json)$/.test(name);
  const ok = check(join(dir, name)) !== allowed;
  if (!ok) wrong.push(name);
  console.log(
    `${ok ? (allowed ? 'allowed ' : 'caught  ') : allowed ? 'FLAGGED ' : 'MISSED  '} ${relative(join(app, 'lint/suppressions'), join(dir, name))}`,
  );
}
const found = sources(app)
  .filter(caught)
  .map((path) => relative(app, path));
if (configSuppresses(join(app, 'biome.json'))) found.push('biome.json');

if (!fixtureFiles.length || wrong.length) {
  console.error(
    fixtureFiles.length
      ? `The suppression check got ${wrong.length} of ${fixtureFiles.length} fixtures wrong.`
      : 'No fixtures found.',
  );
  process.exit(1);
}
if (found.length) {
  for (const file of found) console.error(`suppressed ${file}`);
  console.error(
    `${found.length} file(s) suppress the effect ban or the import boundaries. Remove the suppression and fix the code instead.`,
  );
  process.exit(1);
}
console.log(
  `No suppressions of the effect ban or import boundaries; all ${fixtureFiles.length} fixtures behave.`,
);
