import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { IconActivity, IconAdjustmentsHorizontal, IconAlertTriangle, IconChartDots, IconChartLine, IconCheck, IconCircleX, IconDeviceFloppy, IconHistory, IconNumbers, IconPlayerRecord, IconPlus, IconTable } from '@tabler/icons-react';
import { Chip, StatusWord } from './Chip';
import { Select } from '@mantine/core';
import { chosen, selectAria } from './select';
import { HeaderButton, PageHeader, type PageBreadcrumb } from './PageHeader';
import { RightSidebar, SidebarIcon, WorkspaceBody } from './RightSidebar';
import { Presence } from './Motion';
import { StatusMessages } from './Primitives';
import { DEFAULT_SIGNALS, MIN_SPAN, MIN_WORD, PANEL_KINDS, PanelCard, RECORDING_CONTROLS, SETTING_FIELDS, SNAPS, WIDTH_NAMES, panelName, panelProblems, seriesColor, showsSignals, signalProblem, snapSpan } from './PresetEditorPanels';
import type { PanelSpan, PresetPanel, PresetPanelKind } from './PresetEditorPanels';
import './PresetEditor.css';

export type { PanelSpan, PresetPanel, PresetPanelKind } from './PresetEditorPanels';

export interface EditablePreset {
  name: string;
  /** Last saved revision; 0 when the preset has never been saved. */
  revision: number;
  panels: PresetPanel[];
}

export type PresetEditorTab = 'panel' | 'signals';

export interface PresetEditorProps {
  /** The saved preset. Unsaved changes are measured against it. */
  preset: EditablePreset;
  /** Working copy to open with, when it already differs from the saved preset. */
  draft?: PresetPanel[];
  /** Signals a panel can show. */
  signals?: string[];
  onSave?: (preset: EditablePreset) => void;
  onDiscard?: () => void;
  onChange?: (preset: EditablePreset) => void;
  initialSelected?: string | null;
  initialTab?: PresetEditorTab;
  /** Freeze the pointer-over state of a grip or resize handle (review stories). */
  initialHover?: { target: 'grip' | 'resize'; id: string };
  /** Freeze a pointer drag of panel `id` over panel `overId`, or outside the builder when `overId` is null. */
  initialDrag?: { id: string; overId: string | null };
  /** Freeze a keyboard move: panel `id` is picked up and already moved to index `to`. */
  initialKeyboardMove?: { id: string; to: number };
  /** Freeze a resize of panel `id` at `span`; `limited` shows the minimum-width warning. */
  initialResize?: { id: string; span: PanelSpan; limited?: boolean };
  /** Leave out the shared page header (title, revision, save actions), e.g. when the host renders its own. */
  hideHeader?: boolean;
  /** Trail above the title. Defaults to Workspace › Presets › preset name. */
  breadcrumbs?: readonly PageBreadcrumb[];
}

interface DragState { id: string; origin: number; over: number; valid: boolean; moved: boolean; x: number; y: number; ox: number; oy: number; w: number; h: number; frozen: boolean }
interface ResizeState { id: string; startX: number; start: PanelSpan; span: PanelSpan; limited: boolean; col: number; frozen: boolean }
interface KeyboardMove { id: string; start: PresetPanel[] }

const clone = (panels: readonly PresetPanel[]) => panels.map(panel => ({
  ...panel, signals: [...panel.signals], ...(panel.fields && { fields: [...panel.fields] }), ...(panel.controls && { controls: [...panel.controls] }),
}));
/** What the Add panel menu creates for each kind. */
const NEW_PANEL: Record<PresetPanelKind, { title: string; span: PanelSpan; icon: typeof IconPlus }> = {
  line: { title: 'New chart', span: 6, icon: IconChartLine }, scatter: { title: 'New XY scatter', span: 6, icon: IconChartDots },
  readout: { title: 'New readout', span: 4, icon: IconNumbers }, table: { title: 'New table', span: 6, icon: IconTable },
  inputs: { title: 'New settings', span: 4, icon: IconAdjustmentsHorizontal }, controls: { title: 'Recording controls', span: 12, icon: IconPlayerRecord },
};
const FIELD = { kind: 'Shows', width: 'Width', x: 'X axis', y: 'Y axis' };
const same = (a: readonly PresetPanel[], b: readonly PresetPanel[]) => JSON.stringify(a) === JSON.stringify(b);
function moved(panels: readonly PresetPanel[], id: string, to: number) {
  const from = panels.findIndex(panel => panel.id === id);
  if (from < 0 || to < 0 || to >= panels.length || to === from) return null;
  const next = [...panels], [panel] = next.splice(from, 1);
  next.splice(to, 0, panel);
  return next;
}

/** Drag-and-drop layout builder for a preset: move, resize and configure panels, then save a new revision. */
export function PresetEditor({ preset, draft, signals = DEFAULT_SIGNALS, onSave, onDiscard, onChange, initialSelected = null, initialTab = 'panel', initialHover, initialDrag, initialKeyboardMove, initialResize, hideHeader = false, breadcrumbs }: PresetEditorProps) {
  const uid = useId();
  const ids = { title: `${uid}title`, help: `${uid}help`, messages: `${uid}messages`, sidebar: `${uid}rs`, tab: (t: PresetEditorTab) => `${uid}rs-tab-${t}`, field: (f: string) => `${uid}field-${f}` };
  const [saved, setSaved] = useState(() => ({ revision: preset.revision, panels: clone(preset.panels) }));
  const [kb, setKb] = useState<KeyboardMove | null>(() => initialKeyboardMove ? { id: initialKeyboardMove.id, start: clone(draft ?? preset.panels) } : null);
  const [panels, setPanels] = useState<PresetPanel[]>(() => {
    const start = clone(draft ?? preset.panels);
    return initialKeyboardMove ? moved(start, initialKeyboardMove.id, initialKeyboardMove.to) ?? start : start;
  });
  const [selected, setSelected] = useState<string | null>(initialKeyboardMove?.id ?? initialResize?.id ?? initialSelected);
  const [tab, setTab] = useState<PresetEditorTab>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const addRowRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(initialHover ?? null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(() => {
    if (!initialResize) return null;
    const panel = (draft ?? preset.panels).find(p => p.id === initialResize.id);
    return panel ? { id: panel.id, startX: 0, start: panel.span, span: initialResize.span, limited: !!initialResize.limited, col: 1, frozen: true } : null;
  });
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const nextId = useRef(0);
  const rootRef = useRef<HTMLElement>(null), canvasRef = useRef<HTMLDivElement>(null), ghostRef = useRef<HTMLElement>(null), ghostLayerRef = useRef<HTMLDivElement>(null), announcerRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<string | null>(initialKeyboardMove ? `[data-grip="${initialKeyboardMove.id}"]` : null);

  const dirty = !same(panels, saved.panels);
  const bad = panels.filter(panel => panelProblems(panel).length);
  const canSave = dirty && !bad.length && panels.length > 0;
  const required = signals.filter(signal => panels.some(panel => showsSignals(panel.kind) && (panel.signals.includes(signal) || (panel.kind === 'scatter' && panel.x === signal))));
  const current = panels.find(panel => panel.id === selected) ?? null;
  // Settings and recording controls show no signals, so their sidebar opens on the Panel tab.
  const shownTab: PresetEditorTab = current && !showsSignals(current.kind) ? 'panel' : tab;

  const announce = (text: string) => {
    const el = announcerRef.current;
    if (!el) return;
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = text; });
  };
  const focus = (selector: string) => { focusAfter.current = selector; bump(); };
  const commit = (next: PresetPanel[]) => { setPanels(next); onChange?.({ name: preset.name, revision: saved.revision, panels: next }); };
  const update = (id: string, patch: Partial<PresetPanel>) => commit(panels.map(panel => panel.id === id ? { ...panel, ...patch } : panel));
  const select = (id: string) => { if (selected !== id) setSelected(id); };
  const grip = (id: string) => `.pe-canvas [data-grip="${id}"]`;

  // Restore focus after a re-render moves or replaces the focused control.
  useLayoutEffect(() => {
    if (!focusAfter.current) return;
    rootRef.current?.querySelector<HTMLElement>(focusAfter.current)?.focus();
    focusAfter.current = null;
  });

  // Review stories: freeze a drag in progress. Measure the panel first, then lift it.
  useLayoutEffect(() => {
    if (!initialDrag) return;
    const el = canvasRef.current?.querySelector<HTMLElement>(`:scope > [data-id="${initialDrag.id}"]`);
    const origin = panels.findIndex(panel => panel.id === initialDrag.id);
    if (!el || origin < 0) return;
    const rest = panels.filter(panel => panel.id !== initialDrag.id), valid = initialDrag.overId !== null;
    const over = valid ? Math.max(0, rest.findIndex(panel => panel.id === initialDrag.overId)) : origin;
    const r = el.getBoundingClientRect();
    setDrag({ id: initialDrag.id, origin, over, valid, moved: true, x: 0, y: 0, ox: 0, oy: 0, w: r.width, h: r.height, frozen: true });
    // Mount only: this sets up the frozen example once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!drag?.frozen) return;
    window.addEventListener('resize', bump);
    return () => window.removeEventListener('resize', bump);
  }, [drag?.frozen]);

  // Place the ghost. A frozen drag sits on its slot (or above the builder); a live drag follows the pointer.
  useLayoutEffect(() => {
    const ghost = ghostRef.current, layer = ghostLayerRef.current, canvas = canvasRef.current;
    if (!drag || !ghost || !layer || !canvas) return;
    const base = layer.getBoundingClientRect();
    let left = drag.x - drag.ox, top = drag.y - drag.oy, width = drag.w;
    if (drag.frozen) {
      const slot = canvas.querySelector('[data-placeholder]')?.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      if (!slot) return;
      width = slot.width;
      if (drag.valid) { left = slot.left + slot.width * .62 - 12; top = slot.top + slot.height * .3 - 10; }
      else { left = c.right - width * .35; top = c.top - 28; }
    }
    ghost.style.width = `${width}px`;
    ghost.style.left = `${left - base.left}px`;
    ghost.style.top = `${top - base.top}px`;
  });

  function overIndex(x: number, y: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const c = canvas.getBoundingClientRect();
    if (x < c.left || x > c.right || y < c.top || y > c.bottom) return null;
    const els = [...canvas.querySelectorAll<HTMLElement>(':scope > .pe-panel')];
    if (!els.length) return 0;
    let best = { i: 0, r: els[0].getBoundingClientRect() }, bestDistance = Infinity;
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const distance = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (distance < bestDistance) { bestDistance = distance; best = { i, r }; }
    });
    const full = best.r.width > c.width * .7;
    const after = full ? y > best.r.top + best.r.height / 2 : x > best.r.left + best.r.width / 2;
    return best.i + (after ? 1 : 0);
  }
  function columnWidth() {
    const canvas = canvasRef.current!, cs = getComputedStyle(canvas), gap = parseFloat(cs.columnGap) || 12;
    return (canvas.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 11 * gap) / 12 + gap;
  }

  // Pointer listeners read the latest render through this ref.
  const pointer = useRef({ move: (_: PointerEvent) => {}, up: () => {} });
  pointer.current = {
    move(event) {
      if (drag && !drag.frozen) {
        const o = overIndex(event.clientX, event.clientY), valid = o !== null, over = valid ? o : drag.over;
        const changed = valid !== drag.valid || over !== drag.over;
        setDrag({ ...drag, x: event.clientX, y: event.clientY, valid, over, moved: drag.moved || changed });
      } else if (resize && !resize.frozen) {
        const panel = panels.find(p => p.id === resize.id)!, min = MIN_SPAN[panel.kind];
        const raw = resize.start + (event.clientX - resize.startX) / resize.col, span = snapSpan(raw, min), limited = raw < min - .5;
        if (span !== resize.span || limited !== resize.limited) setResize({ ...resize, span, limited });
      }
    },
    up() {
      if (drag && !drag.frozen) {
        const { id, valid, over } = drag, panel = panels.find(p => p.id === id)!;
        setDrag(null);
        if (valid && drag.moved) {
          const next = panels.filter(p => p.id !== id);
          next.splice(over, 0, panel);
          if (!same(next, panels)) commit(next);
          announce(`${panelName(panel)} moved to position ${over + 1} of ${next.length}.`);
        } else if (!valid) announce('Move cancelled.');
        focus(grip(id));
      } else if (resize && !resize.frozen) {
        const { id, span } = resize, panel = panels.find(p => p.id === id)!;
        setResize(null);
        if (panel.span !== span) { update(id, { span }); announce(`${panelName(panel)} is now ${WIDTH_NAMES[span].toLowerCase()} width.`); }
        focus(`.pe-canvas [data-resize="${id}"]`);
      }
    },
  };
  const tracking = (!!drag && !drag.frozen) || (!!resize && !resize.frozen);
  useEffect(() => {
    if (!tracking) return;
    const move = (event: PointerEvent) => pointer.current.move(event), up = () => pointer.current.up();
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
  }, [tracking]);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    const r = event.currentTarget.closest('.pe-panel')!.getBoundingClientRect(), origin = panels.findIndex(p => p.id === id);
    setKb(null);
    setDrag({ id, origin, over: origin, valid: true, moved: false, x: event.clientX, y: event.clientY, ox: event.clientX - r.left, oy: event.clientY - r.top, w: r.width, h: r.height, frozen: false });
    setSelected(id);
    setHover(null);
  }
  function startResize(event: ReactPointerEvent<HTMLDivElement>, panel: PresetPanel) {
    if (event.button !== 0) return;
    event.preventDefault();
    setResize({ id: panel.id, startX: event.clientX, start: panel.span, span: panel.span, limited: false, col: columnWidth(), frozen: false });
    setSelected(panel.id);
    setHover(null);
  }
  function resizeKey(event: KeyboardEvent<HTMLDivElement>, panel: PresetPanel) {
    const step = ({ ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 } as Record<string, number>)[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const allowed = SNAPS.filter(span => span >= MIN_SPAN[panel.kind]), i = Math.max(0, allowed.indexOf(panel.span));
    const j = event.key === 'Home' ? 0 : event.key === 'End' ? allowed.length - 1 : Math.max(0, Math.min(allowed.length - 1, i + step));
    const span = allowed[j];
    setSelected(panel.id);
    if (span !== panel.span) update(panel.id, { span });
    announce(step < 0 && i === 0 ? `Minimum width for ${MIN_WORD[panel.kind]}.` : `${WIDTH_NAMES[span]} width.`);
  }
  function gripKey(event: KeyboardEvent<HTMLButtonElement>, panel: PresetPanel) {
    const { id } = panel, name = panelName(panel), position = panels.findIndex(p => p.id === id);
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (kb?.id === id) { setKb(null); announce(`${name} dropped at position ${position + 1} of ${panels.length}.`); }
      else { setKb({ id, start: panels }); setSelected(id); announce(`${name} picked up. Position ${position + 1} of ${panels.length}. Use the arrow keys to move.`); }
      focus(grip(id));
      return;
    }
    if (kb?.id !== id) return;
    if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const to = position + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1), next = moved(panels, id, to);
      if (next) { commit(next); focus(grip(id)); announce(`Position ${to + 1} of ${panels.length}.`); }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (!same(kb.start, panels)) commit(kb.start);
      setKb(null);
      focus(grip(id));
      announce('Move cancelled.');
    }
  }
  const kbRef = useRef(kb);
  kbRef.current = kb;
  function canvasBlur() {
    if (!kbRef.current) return;
    setTimeout(() => {
      const lifted = kbRef.current;
      if (lifted && (document.activeElement as HTMLElement | null)?.dataset?.grip !== lifted.id) setKb(null);
    }, 0);
  }
  function shift(id: string, direction: -1 | 1) {
    const at = panels.findIndex(p => p.id === id) + direction, next = moved(panels, id, at);
    if (!next) return;
    commit(next);
    setSelected(id);
    const edge = at === 0 || at === next.length - 1;
    focus(edge ? `.pe-canvas [data-shift="${id}"]:not(:disabled)` : `.pe-canvas [data-shift="${id}"][data-dir="${direction}"]`);
    announce(`${panelName(next[at])} moved to position ${at + 1} of ${next.length}.`);
  }
  function remove(id: string) {
    const i = panels.findIndex(p => p.id === id), name = panelName(panels[i]), next = panels.filter(p => p.id !== id);
    commit(next);
    if (selected === id) setSelected(null);
    const after = next[Math.min(i, next.length - 1)];
    focus(after ? grip(after.id) : '[data-add]');
    announce(`${name} removed. Discard changes to undo.`);
  }
  function add(kind: PresetPanelKind) {
    const taken = new Set([...panels, ...saved.panels].map(p => p.id));
    let n = Math.max(1, nextId.current);
    while (taken.has(`p${n}`)) n++;
    const id = `p${n}`;
    nextId.current = n + 1;
    const { title, span } = NEW_PANEL[kind];
    const extra = kind === 'inputs' ? { fields: [] } : kind === 'controls' ? { controls: Object.keys(RECORDING_CONTROLS) } : {};
    commit([...panels, { id, title, kind, span, signals: [], x: null, ...extra }]);
    setSelected(id);
    setMenuOpen(false);
    if (showsSignals(kind)) {
      setTab('signals');
      focus(kind === 'scatter' ? '[data-axis="x"]' : '[data-signal]');
      announce('Panel added at the end. Choose its signals.');
    } else {
      setTab('panel');
      focus(kind === 'inputs' ? '[data-field]' : '[data-control]');
      announce(kind === 'inputs' ? 'Panel added at the end. Choose its settings.' : 'Recording controls added at the end.');
    }
  }
  function openMenu() { setMenuOpen(true); focus('.pe-add-menu [role="menuitem"]'); }
  function closeMenu() { setMenuOpen(false); focus('[data-add]'); }
  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')], i = items.indexOf(document.activeElement as HTMLElement);
    const to = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 } as Record<string, number>)[event.key];
    if (to !== undefined) { event.preventDefault(); items[(to + items.length) % items.length]?.focus(); }
    else if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    else if (event.key === 'Tab') setMenuOpen(false);
  }
  // A press outside the Add panel button and its menu closes the menu.
  useEffect(() => {
    if (!menuOpen) return;
    const away = (event: PointerEvent) => { if (!addRowRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [menuOpen]);
  function save() {
    if (!canSave) return;
    const next = { name: preset.name, revision: saved.revision + 1, panels: clone(panels) };
    setSaved({ revision: next.revision, panels: next.panels });
    onSave?.(next);
    focus(`[id="${ids.title}"]`);
    announce(`Saved as R${next.revision}.`);
  }
  function discard() {
    const restored = clone(saved.panels);
    commit(restored);
    setKb(null);
    if (!restored.some(p => p.id === selected)) setSelected(null);
    onDiscard?.();
    focus(`[id="${ids.title}"]`);
    announce('Changes discarded.');
  }

  function changeKind(panel: PresetPanel, kind: PresetPanelKind) {
    const span = panel.span < MIN_SPAN[kind] ? MIN_SPAN[kind] : panel.span;
    const extra = kind === 'inputs' ? { fields: panel.fields ?? [] } : kind === 'controls' ? { controls: panel.controls ?? Object.keys(RECORDING_CONTROLS) } : {};
    update(panel.id, kind === 'scatter' ? { kind, span, x: panel.x, signals: panel.signals.slice(0, 1) } : { kind, span, x: null, ...extra });
  }
  function toggleSignal(panel: PresetPanel, signal: string, on: boolean) {
    update(panel.id, { signals: on ? signals.filter(s => panel.signals.includes(s) || s === signal) : panel.signals.filter(s => s !== signal) });
  }
  /** Turns a setting or control on or off, keeping the catalog order. */
  function toggleItem(panel: PresetPanel, list: 'fields' | 'controls', key: string, on: boolean) {
    const all = Object.keys(list === 'fields' ? SETTING_FIELDS : RECORDING_CONTROLS), now = panel[list] ?? [];
    update(panel.id, { [list]: on ? all.filter(k => now.includes(k) || k === key) : now.filter(k => k !== key) });
  }

  const card = (panel: PresetPanel, index: number) => {
    const rz = resize?.id === panel.id ? resize : null;
    return <PanelCard
      key={panel.id} panel={panel} index={index} total={panels.length} signals={signals} span={rz ? rz.span : panel.span}
      selected={selected === panel.id} lifted={kb?.id === panel.id} resizing={rz && { limited: rz.limited }}
      hover={hover?.id === panel.id ? hover.target : null} helpId={ids.help}
      onSelect={() => select(panel.id)}
      onGripPointerDown={event => startDrag(event, panel.id)} onGripKeyDown={event => gripKey(event, panel)}
      onShift={direction => shift(panel.id, direction)} onRemove={() => remove(panel.id)}
      onResizePointerDown={event => startResize(event, panel)} onResizeKeyDown={event => resizeKey(event, panel)}
    />;
  };
  function canvasContent() {
    if (!panels.length) return <div className="pe-drop-hint">No panels yet. Add a panel to start the layout.</div>;
    const guides = resize && <div className="pe-guides" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</div>;
    if (!drag) return <>{guides}{panels.map(card)}</>;
    const lifted = panels.find(p => p.id === drag.id)!, rest = panels.filter(p => p.id !== drag.id), at = drag.valid ? drag.over : drag.origin;
    const slot = <div key="placeholder" className="pe-placeholder" data-placeholder="" data-return={!drag.valid || undefined} style={{ gridColumn: `span ${lifted.span}`, height: drag.h }}>{drag.valid ? 'Drop here' : 'Returns here'}</div>;
    const out = [];
    rest.forEach((panel, i) => { if (i === at) out.push(slot); out.push(card(panel, i >= at ? i + 1 : i)); });
    if (at >= rest.length) out.push(slot);
    return <>{guides}{out}</>;
  }

  const messages = bad.map(panel => ({ severity: 'warning' as const, text: `${panelName(panel)}: ${panelProblems(panel)[0]}` }));
  const draggedPanel = drag && panels.find(p => p.id === drag.id);
  const sigError = current && signalProblem(current);

  return <section ref={rootRef} className="dv-preset-editor" aria-labelledby={hideHeader ? undefined : ids.title} aria-label={hideHeader ? preset.name : undefined}>
    {!hideHeader && <PageHeader title={preset.name} titleId={ids.title}
      breadcrumbs={breadcrumbs ?? [{ label: 'Workspace' }, { label: 'Presets' }, { label: preset.name }]}
      meta={<>
        <Chip icon={<IconHistory aria-hidden />}>{saved.revision ? `R${saved.revision}` : 'Not saved yet'}</Chip>
        {dirty ? <StatusWord tone="warning" icon={<IconAlertTriangle aria-hidden />}>Unsaved changes</StatusWord> : <StatusWord icon={<IconCheck aria-hidden />}>No unsaved changes</StatusWord>}
      </>}
      actions={<>
        {dirty && <HeaderButton variant="quiet" onClick={discard}>Discard changes</HeaderButton>}
        <HeaderButton variant="primary" data-save="" disabled={!canSave} aria-describedby={ids.messages} icon={<IconDeviceFloppy aria-hidden />} onClick={save}>Save as R{saved.revision + 1}</HeaderButton>
      </>} />}
    <WorkspaceBody sidebar={<RightSidebar id={ids.sidebar} label="Panel settings" tabsLabel="Panel settings"
      title={current ? panelName(current) : 'Panel settings'} activeTab={shownTab} onTabChange={next => setTab(next as PresetEditorTab)}
      tabs={[{ id: 'panel', label: 'Panel', icon: <SidebarIcon name="details" />, disabled: !current }, { id: 'signals', label: 'Signals', icon: <SidebarIcon name="signals" />, disabled: !current || !showsSignals(current.kind) }]}>
            {!current ? <p className="pe-side-empty">Select a panel to change what it shows.</p>
              : shownTab === 'panel' ? <>
                <div className="pe-side-field"><label htmlFor={ids.field('title')}>Panel name</label>
                  <input id={ids.field('title')} value={current.title} autoComplete="off" aria-invalid={!current.title.trim()} aria-describedby={!current.title.trim() ? ids.field('title-err') : undefined} onChange={event => update(current.id, { title: event.currentTarget.value })} />
                  <Presence show={!current.title.trim()}><span className="pe-field-error" id={ids.field('title-err')}><IconCircleX aria-hidden />Enter a panel name.</span></Presence>
                </div>
                <div className="pe-side-field"><label htmlFor={ids.field('kind')}>{FIELD.kind}</label>
                  <Select id={ids.field('kind')} aria-label={FIELD.kind} value={current.kind} data={Object.entries(PANEL_KINDS).map(([kind, label]) => ({ value: kind, label }))}
                    onChange={chosen(value => changeKind(current, value as PresetPanelKind))} />
                </div>
                <div className="pe-side-field"><label htmlFor={ids.field('width')}>{FIELD.width}</label>
                  <Select id={ids.field('width')} aria-label={FIELD.width} value={String(current.span)} {...selectAria({ describedBy: ids.field('width-hint') })}
                    data={SNAPS.filter(span => span >= MIN_SPAN[current.kind]).map(span => ({ value: String(span), label: WIDTH_NAMES[span] }))}
                    onChange={chosen(value => update(current.id, { span: Number(value) as PanelSpan }))} />
                  <span className="pe-side-hint" id={ids.field('width-hint')}>Or drag the panel’s right edge.</span>
                </div>
                {!showsSignals(current.kind) && <>
                  <fieldset className="pe-fieldset" aria-describedby={sigError ? ids.field('sig-err') : undefined}>
                    {current.kind === 'inputs' ? <>
                      <legend>Settings shown</legend>
                      {Object.entries(SETTING_FIELDS).map(([key, field]) => <label key={key} className="pe-signal-option"><input type="checkbox" data-field={key} checked={!!current.fields?.includes(key)} onChange={event => toggleItem(current, 'fields', key, event.currentTarget.checked)} />{field.label}<small>{field.unit}</small></label>)}
                    </> : <>
                      <legend>Controls shown</legend>
                      {Object.entries(RECORDING_CONTROLS).map(([key, label]) => <label key={key} className="pe-signal-option"><input type="checkbox" data-control={key} checked={!!current.controls?.includes(key)} onChange={event => toggleItem(current, 'controls', key, event.currentTarget.checked)} />{label}</label>)}
                    </>}
                  </fieldset>
                  <p className="pe-side-hint pe-side-note">{current.kind === 'inputs' ? 'Shown as fields during an experiment. The editor shows sample values.' : 'The status word is always shown. The editor shows a sample acquisition.'}</p>
                  <Presence show={!!sigError}><p className="pe-field-error pe-sig-error" id={ids.field('sig-err')}><IconCircleX aria-hidden />{sigError}</p></Presence>
                </>}
              </>
              : current.kind === 'scatter' ? <>
                {(['x', 'y'] as const).map(axis => <div key={axis} className="pe-side-field"><label htmlFor={ids.field(axis)}>{FIELD[axis]}</label>
                  <Select id={ids.field(axis)} aria-label={FIELD[axis]} data-axis={axis} value={(axis === 'x' ? current.x : current.signals[0]) ?? ''} {...selectAria({ invalid: !!sigError, describedBy: sigError ? ids.field('sig-err') : undefined })}
                    data={[{ value: '', label: 'Choose a signal' }, ...signals.map(signal => ({ value: signal, label: signal }))]}
                    onChange={chosen(value => update(current.id, axis === 'x' ? { x: value || null } : { signals: value ? [value] : [] }))} />
                </div>)}
                <Presence show={!!sigError}><p className="pe-field-error pe-sig-error" id={ids.field('sig-err')}><IconCircleX aria-hidden />{sigError}</p></Presence>
              </>
              : <>
                <fieldset className="pe-fieldset" aria-describedby={sigError ? ids.field('sig-err') : undefined}>
                  <legend>Signals shown</legend>
                  {signals.map(signal => <label key={signal} className="pe-signal-option"><input type="checkbox" data-signal={signal} checked={current.signals.includes(signal)} onChange={event => toggleSignal(current, signal, event.currentTarget.checked)} /><i style={{ borderColor: seriesColor(signals, signal) }} aria-hidden="true" />{signal}<small>mV</small></label>)}
                </fieldset>
                <Presence show={!!sigError}><p className="pe-field-error pe-sig-error" id={ids.field('sig-err')}><IconCircleX aria-hidden />{sigError}</p></Presence>
              </>}
    </RightSidebar>}>
        <div className="pe-messages" id={ids.messages}><Presence show={messages.length > 0}><div className="pe-messages-body"><StatusMessages messages={messages} /></div></Presence></div>
        <div className="pe-requires">{required.length > 0 && <>Requires {required.map(signal => <Chip key={signal} icon={<IconActivity aria-hidden />}>{signal}</Chip>)}<span className="pe-requires-note"><span className="pe-requires-dot" aria-hidden="true">· </span>worked out from the panels</span></>}</div>
        <h2 className="pe-sr-only">Panels</h2>
        <div ref={canvasRef} className="pe-canvas" aria-label="Preset layout" data-mode={drag ? (drag.valid ? 'drag' : 'nodrop') : kb ? 'drag' : undefined} onBlur={canvasBlur}>{canvasContent()}</div>
        <div className="pe-add-row" ref={addRowRef}>
          <button type="button" className="pe-button" data-add="" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? ids.field('add-menu') : undefined} onClick={() => menuOpen ? closeMenu() : openMenu()}><IconPlus aria-hidden />Add panel</button>
          <Presence show={menuOpen} variant="fade"><div className="pe-add-menu" id={ids.field('add-menu')} role="menu" aria-label="Add panel" onKeyDown={menuKey}>
            {(Object.keys(PANEL_KINDS) as PresetPanelKind[]).map(kind => { const Icon = NEW_PANEL[kind].icon; return <button key={kind} type="button" role="menuitem" tabIndex={-1} data-add-kind={kind} onClick={() => add(kind)}><Icon aria-hidden />{PANEL_KINDS[kind]}</button>; })}
          </div></Presence>
        </div>
        <p className="pe-sr-only" id={ids.help}>Press Space to pick up. Use the arrow keys to move, Space to drop, Escape to cancel.</p>
    </WorkspaceBody>
    <div ref={ghostLayerRef} className="pe-ghost-layer">
      {drag && draggedPanel && <PanelCard ref={ghostRef} panel={draggedPanel} index={0} total={1} signals={signals} span={draggedPanel.span} ghost cancelling={!drag.valid} />}
    </div>
    <div ref={announcerRef} className="pe-sr-only" role="status" aria-live="assertive" aria-atomic="true" />
  </section>;
}
