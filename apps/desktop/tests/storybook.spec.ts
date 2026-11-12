import { chromium, expect, test, type Page } from '@playwright/test';
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

test('every dialog and drawer, plain Mantine ones included, blurs the page behind it with the approved dim', async ({ page }) => {
  const approvedDim = 'rgba(14, 26, 20, 0.4)';
  const cases: { id: string; dark?: boolean; open?: () => Promise<void> }[] = [
    { id: 'screens-experiment--stop-confirmation' },
    { id: 'screens-experiment--stop-confirmation', dark: true },
    { id: 'screens-experiment--live', open: () => page.getByRole('button', { name: 'Stop acquisition', exact: true }).click() },
    { id: 'components-unsavedchangesdialog--several-changes', dark: true },
    { id: 'components-presetimport--review' },
    { id: 'components-recordingimport--review', dark: true },
    { id: 'components-recordingexport--selected-interval' },
    { id: 'components-keyboardshortcuts--mac-os', dark: true },
    { id: 'components-navigationdrawer--open' },
    { id: 'components-instrumentcontrols--running', open: () => page.getByRole('button', { name: 'Stop acquisition', exact: true }).click() },
    { id: 'components-overlays--menu-dialog-and-drawer', open: () => page.getByRole('button', { name: 'Review revision', exact: true }).click() },
    { id: 'components-overlays--menu-dialog-and-drawer', dark: true, open: () => page.getByRole('button', { name: 'Open settings', exact: true }).click() },
  ];
  for (const { id, dark, open } of cases) {
    const name = `${id}${dark ? ' (dark)' : ''}`;
    // Not story(): dialog-only stories render into a portal and leave the story root empty.
    await page.goto(`/iframe.html?id=${id}&viewMode=story${dark ? '&globals=appearance:dark' : ''}`);
    await page.waitForFunction(() => (window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }).__STORYBOOK_PREVIEW__?.currentRender?.phase === 'finished', undefined, { timeout: 30_000 });
    await open?.();
    const overlay = page.locator('.mantine-Modal-overlay, .mantine-Drawer-overlay');
    await expect(overlay, name).toHaveCount(1);
    await expect(overlay, name).toBeVisible();
    await expect(overlay, name).toHaveCSS('background-color', approvedDim);
    await expect(overlay, name).toHaveCSS('backdrop-filter', 'blur(4px)');
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

test('preset editor panel titles use the whole head while the panel tools are hidden', async ({ page }) => {
  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:preset-edit');
    await expect(page.locator('.pe-panel h3').first()).toBeVisible();
    await page.mouse.move(0, height - 1);
    const titles = await page.locator('.pe-panel:not(.pe-ghost):not([data-selected=true]) .pe-panel-head h3 >> visible=true').evaluateAll(els => els.map(h => ({ name: h.textContent, shown: h.clientWidth, full: h.scrollWidth, title: h.getAttribute('title') })));
    expect(titles.length, `${width}`).toBeGreaterThan(4);
    for (const t of titles) {
      expect(t.shown, `${width} ${t.name} shown in full`).toBeGreaterThanOrEqual(t.full);
      expect(t.title, `${width} ${t.name} tooltip`).toBe(t.name);
    }
    const panel = page.locator('.pe-panel:not(.pe-ghost)').first();
    await panel.hover();
    const [tools, head] = await panel.evaluate(p => [p.querySelector('.pe-tools')!.getBoundingClientRect(), p.querySelector('.pe-panel-head')!.getBoundingClientRect()].map(r => ({ top: r.top, bottom: r.bottom, right: r.right })));
    expect(Math.abs(tools.right - head.right), `${width} tools at the head's right edge`).toBeLessThanOrEqual(1);
    expect(tools.top >= head.top - 1 && tools.bottom <= head.bottom + 1, `${width} tools inside the head`).toBe(true);
  }
});

test('table sort headers are 24 px targets in an unchanged header row', async ({ page }) => {
  for (const route of ['experiments', 'presets', 'instruments']) {
    await page.goto(`/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:${route}`);
    await expect(page.locator('thead th button').first()).toBeVisible();
    const heads = await page.locator('thead th >> visible=true').evaluateAll(ths => ths.map(th => {
      const button = th.querySelector('button');
      return { name: th.textContent!.trim(), row: th.getBoundingClientRect().height, target: button ? button.getBoundingClientRect().height : null };
    }));
    for (const head of heads) {
      expect(head.row, `${route} ${head.name} row height`).toBeCloseTo(34.5, 1);
      if (head.target !== null) expect(head.target, `${route} ${head.name} target height`).toBeGreaterThanOrEqual(24);
    }
  }
});

test('calibration interval fields keep their approved width on a wide page', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.goto('/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:experiment');
  await expect(page.locator('.dv-cal-field').first()).toBeVisible();
  const widths = await page.locator('.dv-cal-form >> visible=true').evaluate(form => ({ form: form.getBoundingClientRect().width, fields: [...form.querySelectorAll('.dv-cal-field')].map(f => f.getBoundingClientRect().width) }));
  expect(widths.form, 'the form is the card content width at its 850 px cap').toBeLessThanOrEqual(802);
  for (const width of widths.fields) expect(Math.abs(width - 362), 'field width near the 362 px in the calibration mockup').toBeLessThanOrEqual(4);
});

test('experiment cards share one title size, and the calibration card keeps its own', async ({ page }) => {
  for (const id of ['screens-experiment--recorded', 'screens-experiment--live']) {
    await story(page, id);
    const titles = await page.locator('main h2 >> visible=true').evaluateAll(els => els
      .filter(h => h.closest('.dv-xw-chart, .dv-xw-samples, .dv-xw-stream, .dv-cal'))
      .map(h => ({ name: h.textContent!.trim(), calibration: !!h.closest('.dv-cal'), size: getComputedStyle(h).fontSize, weight: getComputedStyle(h).fontWeight })));
    expect(titles.length, id).toBeGreaterThanOrEqual(3);
    for (const t of titles) expect(`${t.size} ${t.weight}`, `${id} ${t.name}`).toBe(t.calibration ? '19px 650' : '13px 600');
  }
});

test('the routine step connector runs through the step number centres, or the mark centres when narrow', async ({ page }) => {
  for (const [width, height, target] of [[1440, 900, '.dv-re-step-number'], [390, 844, '.dv-re-step-mark']] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:routine-edit');
    await expect(page.locator(target).first()).toBeVisible();
    const offsets = await page.locator('.dv-re-step + .dv-re-step').evaluateAll((steps, target) => steps.map(step => {
      const box = step.getBoundingClientRect(), line = getComputedStyle(step, '::before'), badge = step.querySelector(target)!.getBoundingClientRect();
      const x = box.left + parseFloat(getComputedStyle(step).borderLeftWidth) + parseFloat(line.left) + parseFloat(line.borderLeftWidth) / 2;
      return x - (badge.left + badge.width / 2);
    }), target);
    expect(offsets.length).toBeGreaterThan(0);
    for (const offset of offsets) expect(Math.abs(offset), `${width} connector to ${target} centre`).toBeLessThanOrEqual(0.5);
  }
});

test('the experiments table keeps chips on one line at 772 px and names on one line at 390 px', async ({ page }) => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:experiments');
    await expect(page.locator('.dv-exp-table tbody tr').first()).toBeVisible();
    const rows = await page.locator('.dv-exp-table tbody tr').evaluateAll(trs => trs.map(tr => {
      const name = tr.querySelector('.dv-exp-name')!;
      return {
        name: name.textContent, nameLines: Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight)),
        chipLines: new Set([...tr.querySelectorAll('.dv-exp-chips > *')].map(chip => Math.round(chip.getBoundingClientRect().top))).size,
      };
    }));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.nameLines, `${width} ${row.name} name lines`).toBe(1);
      if (width === 1440) expect(row.chipLines, `${width} ${row.name} chip lines`).toBe(1);
    }
  }
});

test('revision labels use a capital R on every page that shows one', async ({ page }) => {
  for (const id of [
    'screens-experiments--home&args=initialPage:prepare', 'components-experimentsetupform--recorded-data', 'components-experimentsetupform--prepare-recorded-data',
    'components-unsavedchangesdialog--one-change', 'components-unsavedchangesdialog--save-fails', 'components-unsavedchangesdialog--save-outcome-unknown',
    'components-pageheader--detail', 'components-pageheader--unsaved-changes', 'components-commandcenter--results', 'screens-presets--use-preset',
    'components-workspaceheader--recorded', 'components-savedresultinspector--open-another-result',
  ]) {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    await page.waitForFunction(() => (window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }).__STORYBOOK_PREVIEW__?.currentRender?.phase === 'finished', undefined, { timeout: 30_000 });
    const lowercase = await page.evaluate(() => {
      // React renders "r{revision}" as two text nodes, so join each element's own text before matching.
      const texts = [...document.body.querySelectorAll(':not(script, style)')].map(el => [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(''));
      return texts.filter(text => /(^|[^\w-])r\d+\b/.test(text)).map(text => text.trim());
    });
    expect(lowercase, id).toEqual([]);
  }
});

test('the narrow transport stories put the scrubber on its own row, clear of the time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['components-experimentworkspace--transport-paused', 'components-experimentworkspace--transport-playing', 'components-experimentworkspace--transport-ended']) {
    await story(page, id);
    const [time, seek] = await Promise.all(['.dv-xw-transport-time', '.dv-xw-seek'].map(selector => page.locator(selector).first().boundingBox()));
    expect(seek!.y, `${id} scrubber below the time`).toBeGreaterThanOrEqual(time!.y + time!.height);
  }
});

test('the narrow preset editor shows the requires note on its own line, without a leading dot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:preset-edit', '/iframe.html?id=components-preseteditor--narrow-window&viewMode=story']) {
    await page.goto(url);
    await expect(page.locator('.pe-requires .dv-chip').first()).toBeVisible();
    const note = await page.locator('.pe-requires').first().evaluate(requires => {
      const span = requires.querySelector(':scope > span:last-child') as HTMLElement, box = span.getBoundingClientRect(), text = document.createRange();
      text.selectNodeContents(span);
      const chipsBottom = Math.max(...[...requires.querySelectorAll('.dv-chip')].map(chip => chip.getBoundingClientRect().bottom));
      return { text: span.innerText.trim(), below: box.top >= chipsBottom, left: Math.round(box.left - requires.getBoundingClientRect().left), lines: new Set([...text.getClientRects()].map(rect => Math.round(rect.top))).size };
    });
    expect(note.text, `${url} note text`).toBe('worked out from the panels');
    expect(note.below, `${url} note under the chips`).toBe(true);
    expect(note.left, `${url} note starts the line`).toBe(0);
    expect(note.lines, `${url} note lines`).toBe(1);
  }
});

test('the routine editor rail says Params at 600 px or less and keeps Parameters as the tab name', async ({ page }) => {
  for (const [width, label] of [[1440, 'Parameters'], [600, 'Params'], [390, 'Params']] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:routine-edit');
    const tab = page.getByRole('tab', { name: 'Parameters', exact: true });
    await expect(tab).toBeVisible();
    const { shown, room } = await tab.evaluate(button => {
      const span = [...button.querySelectorAll('span')].find(s => s.getBoundingClientRect().width > 1)!;
      const rail = button.parentElement!.getBoundingClientRect(), box = span.getBoundingClientRect();
      return { shown: span.textContent, room: Math.min(box.left - rail.left, rail.right - box.right) };
    });
    expect(shown, `${width} rail label`).toBe(label);
    if (label === 'Params') expect(room, `${width} space beside the label in the rail`).toBeGreaterThanOrEqual(6);
  }
});

test('settings and new experiment forms keep their approved widths, left-aligned under the title', async ({ page }) => {
  for (const [width, height] of [[2560, 1200], [1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const [route, selector, max] of [['settings', '.dv-settings', 712], ['prepare', '.dv-setup', 772]] as const) {
      await page.goto(`/iframe.html?id=screens-experiments--home&viewMode=story&args=initialPage:${route}`);
      await expect(page.locator(selector).first()).toBeVisible();
      const box = await page.locator(selector).first().evaluate(form => {
        const title = document.querySelector('.dv-shell-page h1')!.getBoundingClientRect(), own = form.getBoundingClientRect(), label = form.querySelector('.dv-settings-section h3');
        return { width: own.width, left: own.left - title.left, label: label ? label.getBoundingClientRect().width : null };
      });
      expect(box.width, `${route} at ${width}: form width`).toBeLessThanOrEqual(max);
      if (width >= 1440) expect(box.width, `${route} at ${width}: form width`).toBe(max);
      expect(Math.abs(box.left), `${route} at ${width}: form left edge to title`).toBeLessThanOrEqual(0.5);
      if (box.label !== null && width >= 1440) expect(box.label, `${route} at ${width}: section label column`).toBe(200);
    }
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

/** Every visible destination, recent, card and button in the main sidebar, relative to the sidebar's corner. */
const sidebarLayout = (page: Page) => page.locator('.dv-side-navigation').evaluate(nav => {
  const origin = nav.getBoundingClientRect();
  return [...nav.querySelectorAll('.dv-navigation-item, .dv-navigation-recent, .dv-navigation-acquisition')].filter(el => el.getClientRects().length).map(el => {
    const box = el.getBoundingClientRect();
    return `${el.textContent?.trim() || el.getAttribute('aria-label')}: ${Math.round(box.x - origin.x)},${Math.round(box.y - origin.y)} ${Math.round(box.width)}x${Math.round(box.height)}`;
  });
});
/** Forces the style change that starts the transitions, then holds them at their first frame. */
const holdTransitionsAtStart = (page: Page) => page.evaluate(() => {
  document.querySelector('.dv-side-navigation')!.getBoundingClientRect();
  const running = document.getAnimations();
  running.forEach(animation => { animation.pause(); animation.currentTime = 0; });
  return running.length;
});

test('the main sidebar keeps its content laid out while it collapses and expands', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 720 });
  await story(page, 'screens-experiments--home');
  const expanded = await sidebarLayout(page);
  await page.getByRole('button', { name: 'Collapse', exact: true }).click();
  expect(await holdTransitionsAtStart(page), 'the collapse animates').toBeGreaterThan(0);
  const collapsing = await sidebarLayout(page);
  await page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
  expect.soft(collapsing, 'first frame of the collapse').toEqual(await sidebarLayout(page));
  await page.getByRole('button', { name: 'Expand', exact: true }).click();
  expect(await holdTransitionsAtStart(page), 'the expand animates').toBeGreaterThan(0);
  expect(await sidebarLayout(page), 'first frame of the expand').toEqual(expanded);
});

/** The sidebar's pinned bottom group and the scroll container (if any) that holds the destinations. */
const sidebarScroll = (page: Page) => page.locator('.dv-side-navigation').evaluate(nav => {
  const bottom = nav.querySelector('.dv-navigation-bottom')!, destinations = nav.querySelector('nav')!;
  let scroller: HTMLElement | null = destinations.parentElement;
  while (scroller && scroller !== nav.parentElement && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  const box = (el: Element) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  return {
    nav: box(nav), bottom: box(bottom), collapse: box([...bottom.querySelectorAll('button')].pop()!),
    scrolls: scroller ? scroller.scrollHeight > scroller.clientHeight : false, scrollerHoldsBottom: scroller ? scroller.contains(bottom) : false,
  };
});

test('the sidebar pins the acquisition card, Settings and Collapse and scrolls only the destinations and recents above them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await story(page, 'screens-experiments--home');
  const short = await sidebarScroll(page);
  expect(short.scrolls, 'the destinations and recents scroll in a short window').toBe(true);
  expect(short.scrollerHoldsBottom, 'the bottom group is outside the scrolling region').toBe(false);
  expect(short.collapse.bottom, 'Collapse is fully inside the sidebar').toBeLessThanOrEqual(short.nav.bottom);
  const lastRecent = page.locator('.dv-navigation-recents .dv-navigation-recent').last();
  await lastRecent.scrollIntoViewIfNeeded();
  await expect(lastRecent).toBeInViewport({ ratio: 1 });
  expect((await sidebarScroll(page)).bottom, 'scrolling leaves the bottom group where it was').toEqual(short.bottom);

  await page.setViewportSize({ width: 1440, height: 900 });
  await story(page, 'screens-experiments--home');
  const tall = await sidebarScroll(page);
  expect(tall.scrolls, 'nothing scrolls when everything fits').toBe(false);
  expect(tall.nav.bottom - tall.bottom.bottom, 'the bottom group sits on the sidebar padding').toBe(10);
});

/** Number of distinct colours in a strip of the page, read back through a canvas. */
const distinctColours = async (page: Page, clip: { x: number; y: number; width: number; height: number }) => {
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async png => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data, seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  }, png);
};

test('the sidebar scroll bar stays hidden until the pointer is over the sidebar, and showing it moves nothing', async ({ baseURL }) => {
  // Headless Chromium hides scroll bars unless told otherwise; this test needs them drawn.
  const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    for (const dark of [false, true]) {
      const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 600 }, reducedMotion: 'reduce' });
      await story(page, 'screens-experiments--home', dark);
      const region = page.locator('.dv-navigation-scroll');
      const { gutter, box } = await region.evaluate((el: HTMLElement) => { const r = el.getBoundingClientRect(); return { gutter: el.offsetWidth - el.clientWidth, box: { x: r.x, y: r.y, width: r.width, height: r.height } }; });
      expect(gutter, 'the region has a scroll bar').toBeGreaterThan(0);
      const strip = { x: box.x + box.width - gutter, y: box.y, width: gutter, height: box.height };
      await page.mouse.move(800, 300);
      const idle = await sidebarLayout(page);
      expect(idle.filter(item => /^(Experiments|Presets|Routines|Instruments):/.test(item)).every(item => item.endsWith(' 160x40')), 'destinations keep their 160 px').toBe(true);
      expect(await distinctColours(page, strip), `idle scroll bar ${dark ? 'dark' : 'light'}`).toBe(1);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await expect.poll(() => distinctColours(page, strip), { message: `scroll bar under the pointer ${dark ? 'dark' : 'light'}` }).toBeGreaterThan(1);
      expect(await sidebarLayout(page), 'showing the scroll bar moves nothing').toEqual(idle);
      expect((await page.locator('.dv-side-navigation').boundingBox())!.width).toBe(184);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('opening a page from the command menu focuses the page without outlining it, and keyboard focus keeps its ring', async ({ page }) => {
  const targets = [['settings', /^Open settings/, 'Settings'], ['go to presets', /^Go to presets/, 'Presets'], ['sample 024', /Sample 024/, 'Leaf respiration · Sample 024']] as const;
  for (const [width, height, dark] of [[1440, 900, false], [390, 844, true]] as const) for (const [query, option, heading] of targets) {
    const name = `${heading} at ${width}px ${dark ? 'dark' : 'light'}`;
    await page.setViewportSize({ width, height });
    await story(page, 'screens-experiments--home', dark);
    await page.keyboard.press('Control+k');
    await page.keyboard.type(query);
    await page.getByRole('option', { name: option }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: heading }), name).toBeVisible();
    const main = page.locator('#dvdash-screen-main');
    await expect(main, name).toBeFocused();
    await expect(main, name).toHaveCSS('outline-style', 'none');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => { const el = document.activeElement!; return el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'; }), `${name}: the next Tab shows a ring`).toBe(true);
  }
});

test('every command center control works by mouse where clicked buttons take no focus, as in Safari and Firefox on macOS', async ({ page }) => {
  // Linux Chromium focuses a clicked button. macOS browsers leave focus nowhere, so the search input blurs with no relatedTarget.
  await page.addInitScript(() => window.addEventListener('mousedown', event => {
    if (event.defaultPrevented || !(event.target instanceof Element) || !event.target.closest('button')) return;
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await story(page, 'screens-experiments--home');
  const input = page.getByRole('combobox', { name: 'Search all DVDash' }), tabs = page.getByRole('group', { name: 'Search result type' });
  await page.keyboard.press('Control+k');
  for (const name of ['Actions', 'Settings', 'Experiments', 'Presets', 'Routines', 'Instruments', 'All']) {
    await tabs.getByRole('button', { name, exact: true }).click();
    await expect(tabs.getByRole('button', { name, exact: true }), `${name} tab applies`).toHaveAttribute('aria-pressed', 'true');
    await expect(input, `${name} tab keeps the popup open`).toHaveAttribute('aria-expanded', 'true');
    await expect(input, `${name} tab keeps focus in the search`).toBeFocused();
  }
  await input.fill('argon');
  await page.locator('.dv-cmd-empty').getByRole('button', { name: 'Clear search' }).click();
  await expect(input, 'Clear search in the popup empties the query').toHaveValue('');
  await expect(input, 'Clear search in the popup keeps it open').toHaveAttribute('aria-expanded', 'true');
  await input.fill('leaf');
  await page.getByRole('search').getByRole('button', { name: 'Clear search' }).click();
  await expect(input, 'the search box clear button empties the query').toHaveValue('');
  await expect(input, 'the search box clear button keeps the popup open').toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('search').getByRole('button', { name: /Open command center/ }).click();
  await expect(input, 'the keycaps button keeps the popup open').toHaveAttribute('aria-expanded', 'true');
  await expect(input).toBeFocused();
  await page.locator('.dv-cmd-footer').getByRole('button', { name: /Shortcuts/ }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' }), 'Shortcuts in the footer opens the panel').toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await input.fill('go to presets');
  await page.getByRole('option', { name: /Go to presets/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Presets' }), 'clicking a row runs it').toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Search results' }), 'running a row closes the popup').toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(1400, 880);
  await expect(page.getByRole('listbox', { name: 'Search results' }), 'clicking outside closes the popup').toHaveCount(0);
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Search results' }), 'Escape closes the popup').toHaveCount(0);
});

test('the open search popup dims and blurs the page behind it like the dialogs, under the search box and popup', async ({ page }) => {
  for (const [width, height] of [[1440, 900], [390, 844]]) for (const dark of [false, true]) {
    const at = `${width}x${height} ${dark ? 'dark' : 'light'}`;
    await page.setViewportSize({ width, height });
    await story(page, 'screens-experiments--home', dark);
    await page.locator('main').focus();
    await page.keyboard.press('?');
    const dialogOverlay = await page.locator('.mantine-Modal-overlay').evaluate(el => { const s = getComputedStyle(el); return { background: s.backgroundColor, blur: s.backdropFilter }; });
    expect(dialogOverlay, at).toEqual({ background: 'rgba(14, 26, 20, 0.4)', blur: 'blur(4px)' });
    await page.keyboard.press('Escape');
    await expect(page.locator('.mantine-Modal-overlay')).toHaveCount(0);

    const backdrop = page.locator('.dv-shell-search-backdrop');
    await expect(backdrop, `${at} no backdrop while closed`).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await expect(backdrop, `${at} backdrop while open`).toHaveCount(1);
    expect(await backdrop.evaluate(el => { const s = getComputedStyle(el); return { background: s.backgroundColor, blur: s.backdropFilter }; }), at).toEqual(dialogOverlay);
    expect(await backdrop.boundingBox(), `${at} covers the window`).toEqual({ x: 0, y: 0, width, height });
    await expect(backdrop, `${at} hidden from screen readers`).toHaveAttribute('aria-hidden', 'true');
    const topmost = (x: number, y: number) => page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('.dv-shell-search-backdrop') ? 'backdrop' : el?.closest('.dv-cmd') ? 'popup' : el?.closest('.dv-shell-searchbox') ? 'searchbox' : el?.tagName;
    }, [x, y] as const);
    const box = (await page.locator('.dv-shell-searchbox').boundingBox())!, popup = (await page.locator('.dv-cmd').boundingBox())!;
    expect(await topmost(box.x + box.width / 2, box.y + box.height / 2), `${at} search box above`).toBe('searchbox');
    expect(await topmost(popup.x + popup.width / 2, popup.y + popup.height / 2), `${at} popup above`).toBe('popup');
    expect(await topmost(width - 4, height - 4), `${at} page below`).toBe('backdrop');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('combobox', { name: 'Search all DVDash' }), `${at} keyboard still drives the list`).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(backdrop, `${at} Escape removes it`).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await page.mouse.click(width - 4, height - 4);
    await expect(page.getByRole('listbox', { name: 'Search results' }), `${at} clicking the backdrop closes the popup`).toHaveCount(0);
    await expect(backdrop).toHaveCount(0);
  }
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
