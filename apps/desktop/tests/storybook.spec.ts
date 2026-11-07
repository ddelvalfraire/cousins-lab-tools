import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function story(page: Page, id: string, dark = false) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story${dark ? '&globals=appearance:dark' : ''}`);
  await expect(page.locator('#storybook-root .dvdash')).toBeVisible({ timeout: id.startsWith('gallery-') ? 30_000 : 10_000 });
  await expect(page.locator('#storybook-root')).not.toBeEmpty();
  // The a11y addon runs axe in afterEach; a second axe run started before it ends throws "Axe is already running".
  await page.waitForFunction(() => (window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }).__STORYBOOK_PREVIEW__?.currentRender?.phase === 'finished', undefined, { timeout: 30_000 });
}

test('examples use component-sized frames on wide and narrow canvases; screens fill the canvas', async ({ page }) => {
  for (const viewport of [2560, 390]) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    for (const [id, size] of [
      ['components-parameterfield--quantity', 360], ['components-readout--recorded', 360],
      ['components-templatecard--gas-exchange', 360], ['components-definitioneditor--editing', 480],
      ['components-signalchart--recorded', 960], ['screens-experiment--recorded', 'viewport'],
    ] as const) {
      const width = size === 'viewport' ? viewport : size;
      await story(page, id);
      const frame = await page.locator('[data-story-frame]').first().boundingBox();
      expect(frame, id).not.toBeNull();
      expect(frame!.width, id).toBeLessThanOrEqual(width);
      expect(frame!.width, id).toBeLessThanOrEqual(viewport);
      if (viewport === 2560) expect(frame!.width, id).toBeCloseTo(width, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), id).toBe(true);
    }
  }
});

test('every component has typed CSF metadata and no review onboarding', async ({ request }) => {
  test.setTimeout(360_000);
  const files = (await Promise.all(['components', 'screens'].map(async folder => (await readdir(resolve(`src/ui/${folder}`))).filter(file => file.endsWith('.stories.tsx')).map(file => resolve(`src/ui/${folder}/${file}`))))).flat();
  let expected = 1; // Gallery composes the component/screen stories.
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    expect(source, file).toContain('component:');
    expect(source, file).toContain('satisfies Meta<typeof');
    expected += [...source.matchAll(/export const \w+/g)].length;
  }
  const index = await (await request.get('/index.json')).json();
  const stories = Object.values(index.entries).filter((item: unknown) => (item as { type: string }).type === 'story') as { id: string }[];
  expect(stories.length).toBe(expected);
  expect(Object.values(index.entries).some((item: unknown) => /Start here|Review guide/.test((item as { title: string }).title))).toBe(false);
});

test('chart-table framing and fixed-limit validation preserve the approved card', async ({ page }) => {
  await story(page, 'components-signalchart--recorded');
  await expect(page.locator('.uplot canvas').first()).toBeVisible();
  const drawnSeriesPixels = await page.locator('.uplot canvas').first().evaluate(canvas => {
    const image = (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data;
    let count = 0;
    for (let i = 0; i < image.length; i += 4) if (Math.abs(image[i] - 50) < 4 && Math.abs(image[i + 1] - 107) < 4 && Math.abs(image[i + 2] - 168) < 4 && image[i + 3] > 200) count++;
    return count;
  });
  expect(drawnSeriesPixels, 'Mass 44 must actually be drawn, not just an empty canvas').toBeGreaterThan(50);
  const controls = page.locator('.dv-controls');
  const before = await controls.boundingBox();
  await page.getByRole('combobox', { name: 'Y-axis limits', exact: true }).click();
  await page.getByRole('option', { name: 'Fixed limits', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Y-axis limits', exact: true })).toHaveValue('Fixed limits');
  await expect(page.getByLabel('Minimum Y (mV)', { exact: true })).toBeEnabled();
  const after = await controls.boundingBox(); expect(after?.height).toBe(before?.height);
  await page.getByLabel('Minimum Y (mV)', { exact: true }).fill('30');
  await expect(page.getByText('Maximum Y must be greater than minimum Y.')).toBeVisible();
  await page.getByLabel('Minimum Y (mV)', { exact: true }).fill('0');
  await expect(page.getByText('Maximum Y must be greater than minimum Y.')).toHaveCount(0);
  const chartSurface = await page.locator('.dv-plot-surface').boundingBox();
  await page.locator('.mantine-SegmentedControl-label').filter({ hasText: 'Table' }).click();
  expect((await page.locator('.dv-plot-surface').boundingBox())?.height).toBe(chartSurface?.height);
  const table = page.getByRole('region', { name: 'Signal sample table' });
  await expect(table).toBeVisible(); expect((await table.boundingBox())?.height).toBe(280);
  await expect(table.getByRole('row')).toHaveCount(122);
  await expect(page.getByLabel('Selection start (s)', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Vertical axis', { exact: true })).toBeVisible();
});

test('calibration readings keep the captured interval and can be undone', async ({ page }) => {
  await story(page, 'components-calibrationreadings--in-progress');
  await expect(page.getByText('1 of 4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Capture standard 100', exact: true }).click();
  await expect(page.locator('.dv-cal-notice').getByText('Standard 100 captured.', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 4', { exact: true })).toBeVisible();
  await expect(page.locator('[data-row=std100]')).toContainText('120–140 s');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('1 of 4', { exact: true })).toBeVisible();
});

test('experiment display settings change the live view, not the recorded samples', async ({ page }) => {
  await story(page, 'screens-experiment--live');
  await page.getByRole('tab', { name: 'Display', exact: true }).click();
  await page.getByLabel('Decimal places', { exact: true }).selectOption('3');
  await expect(page.locator('[data-live-value=mass44]')).toHaveText(/^\d+\.\d{3}$/);
  await page.getByLabel('Scale', { exact: true }).selectOption('fixed');
  await expect(page.getByLabel('Minimum Y', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop acquisition', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Stop acquisition', exact: true }).click();
  const table = page.getByRole('region', { name: 'Recorded samples table' });
  await expect(table.getByRole('row').nth(1)).toHaveText(/0\.0\s*2\.310\s*1\.110/);
});

test('scientific quantity conversion keeps the stored value and rejects values it cannot store', async ({ page }) => {
  await story(page, 'components-scientificquantityinput--empty');
  const field = page.getByRole('textbox', { name: 'Offset', exact: true });
  const unit = page.getByRole('combobox', { name: 'Offset unit', exact: true });
  // The story opens empty and its play test only checks that state.
  await expect(page.getByRole('alert')).toContainText('Enter an offset');
  await expect(field).toHaveValue('');
  await field.fill('-0.25');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await unit.selectOption('µV');
  await expect(field).toHaveValue('-250');
  await unit.selectOption('V');
  await field.fill('1e308');
  await expect(page.getByRole('alert')).toContainText('too large to store');
  await expect(page.getByRole('alert')).toContainText('Still using -0.25 mV.');
});

test('screen navigation preserves preparation settings and stopping opens recorded mode', async ({ page }) => {
  await story(page, 'screens-experiments--home');
  await page.getByRole('button',{ name:'New experiment',exact:true }).click();
  await page.getByLabel('Experiment name',{exact:true}).fill('Prepared specimen');
  await page.locator('label').filter({hasText:'Instrument stream'}).click();
  await expect(page.getByRole('radio',{name:'Instrument stream'})).toBeChecked();
  await page.getByLabel('Start delay',{exact:true}).fill('5');
  await page.getByLabel('Sample interval',{exact:true}).fill('0.75');
  await page.getByRole('button',{name:'Open experiment',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Prepared specimen'})).toBeVisible();
  await page.getByRole('button',{name:'Stop acquisition',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Stop acquisition',exact:true}).click();
  await expect(page.getByRole('group',{name:'Recording playback'})).toBeVisible();
  await page.getByRole('button',{name:'Review & export',exact:true}).click();
  await expect(page.getByText('0.75 s',{exact:true})).toBeVisible();
  await expect(page.getByText('5 s',{exact:true})).toBeVisible();
});

test('recording playback changes displayed samples and keyboard scrubbing works', async ({ page }) => {
  await story(page,'screens-experiment--recorded');
  const transport=page.getByRole('group',{name:'Recording playback'});
  const slider=transport.getByRole('slider',{name:'Playback position'});
  await slider.focus(); await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext','00:00.0 of 05:00.0');
  await slider.press('ArrowRight'); await slider.press('ArrowRight'); await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext','00:01.5 of 05:00.0');
  await expect(transport).toContainText('Sample 4 / 601');
  await expect(page.locator('tr[data-current=true]')).toContainText('1.5');
  await expect(page.locator('[data-pb-value=mass44]')).toHaveText('2.373');
});

test('the recorded playback bar keeps the page spacing at rest and sticks 8 px under the header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await story(page, 'screens-experiment--recorded');
  const gaps = () => page.evaluate(() => {
    const main = document.querySelector('.dv-workspace-main')!;
    const bar = document.querySelector('.dv-xw-transport')!.getBoundingClientRect();
    const next = document.querySelector('.dv-xw-transport')!.nextElementSibling!.getBoundingClientRect();
    return { top: Math.round(bar.top - main.getBoundingClientRect().top), below: Math.round(next.top - bar.bottom) };
  });
  expect(await gaps(), 'at rest: --dv-page-top above, --dv-gap below').toEqual({ top: 16, below: 16 });
  await page.locator('.dv-workspace-main').evaluate(el => { el.scrollTop = 400; });
  expect((await gaps()).top, 'scrolled: stuck 8 px under the header').toBe(8);
});

test('the narrow page header wraps its status chips instead of cutting them', async ({ page }) => {
  for (const id of ['screens-experiment--problems-present-narrow', 'screens-experiment--live-narrow', 'screens-review--playback-paused-narrow', 'screens-review--recorded-problems-narrow']) {
    await story(page, id);
    const fit = await page.evaluate(() => {
      const trigger = [...document.querySelectorAll('.dv-prob-trigger')].find(e => e.checkVisibility())!;
      const meta = trigger.closest('.dv-page-meta')!;
      return { overflow: meta.scrollWidth - meta.clientWidth, past: Math.round(trigger.getBoundingClientRect().right - meta.getBoundingClientRect().right) };
    });
    expect(fit.overflow, `${id} meta overflow`).toBeLessThanOrEqual(0);
    expect(fit.past, `${id} chip past the meta edge`).toBeLessThanOrEqual(0);
  }
});

test('charts fill narrow cards instead of scrolling past them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['components-signalchart--recorded', 'components-scientificplot--time-series', 'components-gassignals--selected-interval']) {
    await story(page, id);
    await expect(page.locator('.uplot').first()).toBeVisible();
    const [plot, card] = await page.locator('.uplot').first().evaluate(u => [u.getBoundingClientRect().width, u.parentElement!.clientWidth]);
    expect(card, id).toBeLessThan(390);
    expect(plot, `${id} plot width within its card`).toBeLessThanOrEqual(card);
  }
});

test('confirmation dialogs add no second page banner', async ({ page }) => {
  for (const id of ['screens-experiment--stop-confirmation', 'components-unsavedchangesdialog--one-change']) {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('banner'), id).toHaveCount(0);
    const result = await new AxeBuilder({ page }).withRules(['landmark-no-duplicate-banner', 'landmark-unique']).analyze();
    expect(result.violations.map(v => v.id), id).toEqual([]);
  }
});

test('a scrolling import dialog body can take keyboard focus to scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto('/iframe.html?id=components-presetimport--importing&viewMode=story');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const title = (await dialog.getByRole('heading').first().textContent())!;
  const body = dialog.getByRole('region', { name: title });
  await expect(body).toHaveAttribute('tabindex', '0');
  expect(await body.evaluate(el => el.scrollHeight > el.clientHeight), 'the body scrolls').toBe(true);
  const result = await new AxeBuilder({ page }).withRules(['scrollable-region-focusable']).analyze();
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
});

test('the skip link is inside the window bar landmark and still comes first', async ({ page }) => {
  await story(page, 'screens-experiments--home');
  const result = await new AxeBuilder({ page }).withRules(['region']).analyze();
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
});

test('live stream cards in one row share a height and a capture line', async ({ page }) => {
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: 900 });
    await story(page, 'screens-experiment--live');
    const cards = await page.locator('.dv-xw-stream >> visible=true').evaluateAll(els => els.map(e => ({
      height: Math.round(e.getBoundingClientRect().height), capture: Math.round(e.querySelector('.dv-xw-stream-capture')!.getBoundingClientRect().top),
    })));
    expect(cards.length, `${width}`).toBe(3);
    expect(new Set(cards.map(c => c.height)).size, `${width} heights ${JSON.stringify(cards)}`).toBe(1);
    expect(new Set(cards.map(c => c.capture)).size, `${width} capture lines ${JSON.stringify(cards)}`).toBe(1);
  }
});

test('routine steps in a narrow editor keep their titles, chips and tools inside the card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:routine-edit', '/iframe.html?id=components-routineeditor--saved&viewMode=story']) {
    await page.goto(url);
    await expect(page.locator('.dv-re-step').first()).toBeVisible();
    const steps = await page.locator('.dv-re-step >> visible=true').evaluateAll(els => els.map(step => {
      const box = step.getBoundingClientRect(), title = step.querySelector('.dv-re-step-title')!, t = title.getBoundingClientRect();
      const chipEl = step.querySelector(':scope > .dv-chip'), chip = chipEl?.getBoundingClientRect(), tools = step.querySelector('.dv-re-tools')!.getBoundingClientRect();
      const chipText = chipEl?.querySelector(':scope > span');
      return { name: title.textContent, width: Math.round(t.width), full: title.scrollWidth, chipCut: !!chipText && chipText.scrollWidth > chipText.clientWidth + 1, chipOverTitle: !!chip && chip.top < t.bottom && chip.left < t.right, toolsPast: Math.round(tools.right - box.right), titled: title.getAttribute('title') === title.textContent };
    }));
    for (const step of steps) {
      expect(step.width, `${url} ${step.name} title width`).toBeGreaterThanOrEqual(Math.min(step.full, 60));
      expect(step.chipOverTitle, `${url} ${step.name} chip over title`).toBe(false);
      expect(step.chipCut, `${url} ${step.name} chip text cut`).toBe(false);
      expect(step.toolsPast, `${url} ${step.name} tools past the card`).toBeLessThanOrEqual(0);
      expect(step.titled, `${url} ${step.name} full title on hover`).toBe(true);
    }
    const cut = await page.locator('.dv-re-seg > span').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth).map(e => getComputedStyle(e).textOverflow));
    expect(cut.every(v => v === 'ellipsis'), `${url} cut segment labels end in an ellipsis`).toBe(true);
    expect(await page.locator('.dv-re-seg').evaluateAll(els => els.filter(e => e.textContent && !e.querySelector('span')).length), `${url} segment labels`).toBe(0);
  }
});

test('alignment event edits update the chart data rather than original samples', async ({ page }) => {
  await story(page,'screens-review--recording-overview');
  await page.getByRole('tab',{name:'Align & compare',exact:true}).click();
  await page.getByLabel('Align recordings by',{exact:true}).selectOption('event');
  await page.getByLabel('Time since recording start',{exact:true}).first().fill('30');
  await expect(page.getByText('−30 s',{exact:true})).toBeVisible();
  // Tick labels: the unit, three signal ticks, then the first time tick, which moves with the event.
  await expect(page.locator('.dv-plot-ticks text').nth(4)).toHaveText('-180');
  await page.getByRole('tab',{name:'Sources',exact:true}).click();
  await expect(page.getByRole('region',{name:'Recording sources'})).toContainText('300 s');
});

test('screens follow the Storybook appearance global',async({page})=>{
  await story(page,'screens-experiments--home',true);
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme','dark');
  await expect(page.getByRole('heading',{name:'Experiments',level:1})).toBeVisible();
  await story(page,'screens-experiments--home');
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme','light');
});

test('routine steps reorder without dragging and unsaveable steps block saving', async ({ page }) => {
  // The story's play test edits the routine on load, so only check what follows from these actions.
  await story(page, 'components-routineeditor--saved');
  await page.getByRole('button', { name: 'Move step 4 up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move step 3 up', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Add capture', exact: true }).click();
  await expect(page.getByText('Step 6: Name what this step captures.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Save as R4/ })).toBeDisabled();
});

test('dialog traps focus, dismisses with Escape and returns focus', async ({ page }) => {
  await story(page, 'components-overlays--menu-dialog-and-drawer');
  const button = page.getByRole('button', { name: 'Review revision', exact: true });
  await button.click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('pages use the standard content width, centred, except the dense pages that use the wide width', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  for (const [route, width] of [
    ['settings', 772], ['prepare', 772], ['experiments', 772], ['presets', 772], ['routine-edit', 772],
    ['preset-edit', 1760], ['experiment', 1760], ['review', 1760],
  ] as const) {
    await page.goto(`/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:${route}`);
    await expect(page.locator('.dvdash h1 >> visible=true')).toBeVisible();
    const m = await page.evaluate(() => {
      const shown = (e: Element) => (e as HTMLElement).offsetParent !== null && !e.closest('[hidden]');
      const card = document.querySelector('.dv-shell-page')!.getBoundingClientRect();
      const bar = [...document.querySelectorAll('.dv-page-actionbar-inner')].find(shown)!.getBoundingClientRect();
      const side = [...document.querySelectorAll('.dv-right-sidebar')].find(shown)?.getBoundingClientRect();
      return { width: bar.width, left: bar.left - card.left, right: (side ? side.left : card.right) - bar.right };
    });
    expect(Math.round(m.width), `${route} width`).toBe(width);
    expect(Math.abs(m.left - m.right), `${route} centred`).toBeLessThanOrEqual(1);
  }
});

test('import and export dialogs keep their actions in view in a short window and scroll the body', async ({ page }) => {
  for (const [width, height] of [[1280, 640], [390, 600]]) {
    await page.setViewportSize({ width, height });
    for (const [id, action] of [
      ['components-recordingexport--selected-interval', 'Export CSV'],
      ['components-presetimport--review', 'Import preset'],
      ['components-recordingimport--review', 'Import'],
    ] as const) {
      // The dialog renders in a portal, so the story root stays empty.
      await page.goto(`/iframe.html?id=${id}&viewMode=story`);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const button = dialog.locator('.dv-import-footer').getByRole('button', { name: action });
      const box = await button.boundingBox();
      expect(box, `${id} ${width}`).not.toBeNull();
      expect(box!.y + box!.height, `${id} ${width} action in view`).toBeLessThanOrEqual(height);
      const body = dialog.locator('.dv-import-body');
      await body.evaluate(el => { el.scrollTop = 0; });
      await body.hover(); await page.mouse.wheel(0, 3000);
      await expect.poll(() => body.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop), { message: `${id} ${width} wheel scrolls the body` }).toBeLessThanOrEqual(1);
      expect(await body.evaluate(el => el.scrollHeight > el.clientHeight), `${id} ${width} body scrolls`).toBe(true);
    }
  }
});

test('the command center tabs scroll sideways under a mouse wheel in a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, 'screens-experiments--home');
  await page.keyboard.press('Control+k');
  const tabs = page.getByRole('group', { name: 'Search result type' });
  const last = tabs.getByRole('button', { name: 'Instruments', exact: true });
  const lastShown = async () => {
    const [row, tab] = [await tabs.boundingBox(), await last.boundingBox()];
    return tab!.x >= row!.x - 0.5 && tab!.x + tab!.width <= row!.x + row!.width + 0.5;
  };
  expect(await lastShown(), 'the last tab starts past the edge').toBe(false);
  await tabs.hover(); await page.mouse.wheel(0, 300);
  await expect.poll(lastShown, { message: 'a vertical wheel brings the last tab into view' }).toBe(true);
  await expect(page.getByRole('combobox', { name: 'Search all DVDash' })).toHaveAttribute('aria-expanded', 'true');
});

test('gallery filters the complete registry', async ({ page }) => {
  await story(page, 'gallery-all-components--all-components');
  const total = await page.locator('.dv-review-item').count(); expect(total).toBeGreaterThan(52);
  await page.getByLabel('Search components', { exact: true }).fill('concentration');
  await expect(page.locator('.dv-review-item')).toHaveCount(1);
  const frame = await page.locator('.dv-review-item [data-story-frame]').first().boundingBox();
  expect(frame?.width).toBe(360);
});

test('complete gallery has no detected WCAG-tagged violations in either appearance', async ({ page }) => {
  // The gallery renders every component story; one axe pass over it takes about 50 s.
  test.setTimeout(240_000);
  for (const dark of [false, true]) {
    await story(page, 'gallery-all-components--all-components', dark);
    await expect(page.locator('.dv-review-item').last()).toBeVisible();
    const result = await new AxeBuilder({ page }).include('#storybook-root').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), dark ? 'dark gallery' : 'light gallery').toEqual([]);
  }
});

for (const width of [390, 1280]) for (const dark of [false, true]) {
  test(`representative components: accessibility and overflow at ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(120_000); await page.setViewportSize({ width, height: 1000 });
    for (const id of ['components-signalchart--recorded', 'components-readout--concentration', 'components-parameterfield--invalid', 'components-routineeditor--saved', 'screens-experiment--recorded']) {
      await story(page, id, dark);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), id).toBe(true);
      const result = await new AxeBuilder({ page }).include('#storybook-root').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), id).toEqual([]);
      if (id === 'screens-experiment--recorded') await page.screenshot({ path: `test-results/dashboard-${width}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    }
  });
}
