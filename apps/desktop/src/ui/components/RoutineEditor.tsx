import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  IconActivity, IconAdjustmentsHorizontal, IconAlertTriangle, IconArrowsMove, IconCheck, IconChevronDown,
  IconChevronUp, IconCircleX, IconClock, IconDeviceFloppy, IconGripVertical, IconHistory, IconInfoCircle, IconNote,
  IconPlus, IconTrash, IconX,
} from '@tabler/icons-react';
import { Chip, StatusWord } from './Chip';
import { HeaderButton, PageHeader, type PageBreadcrumb } from './PageHeader';
import { RightSidebar, SidebarIcon, WorkspaceBody } from './RightSidebar';
import { Banner } from './Banner';
import './RoutineEditor.css';

export type RoutineStepKind = 'capture' | 'wait' | 'annotate';
/** A step's duration is a fixed number of seconds, or a routine parameter referenced by id. */
export type RoutineDuration = { fixed: number } | { param: string };
export interface RoutineStep {
  id: string;
  kind: RoutineStepKind;
  /** What a capture records, or a note's text. Wait steps have no name. */
  name: string;
  /** Notes take no time and have no duration. */
  duration: RoutineDuration | null;
}
export interface RoutineParameter { id: string; name: string; seconds: number }
export interface RoutineDefinition { parameters: RoutineParameter[]; steps: RoutineStep[] }
export interface RoutineNotice { stepId: string; text: string }
export interface RoutineSaveRequest { name: string; revision: number; routine: RoutineDefinition }
/** Frozen moving states for review. Real pointer and keyboard moves reach the same states. */
export type RoutineInteraction =
  | { type: 'grip-hover'; stepId: string }
  | { type: 'dragging'; stepId: string; afterStepId: string }
  | { type: 'outside'; stepId: string }
  | { type: 'keyboard'; stepId: string; toIndex: number };

export interface RoutineEditorProps {
  name?: string;
  /** Last saved revision. 0 means the routine has never been saved. */
  revision?: number;
  /** The saved routine. Unsaved changes are measured against it. */
  routine?: RoutineDefinition;
  /** Starting edits, when the editor opens with unsaved changes. Defaults to `routine`. */
  draft?: RoutineDefinition;
  /** Parent pages as plain labels, before the routine name. Use `breadcrumbs` for links. */
  breadcrumb?: readonly string[];
  /** Full trail above the title, ending with the routine. Overrides `breadcrumb`. */
  breadcrumbs?: readonly PageBreadcrumb[];
  /** Leave out the shared page header (title, revision, save actions), e.g. when the host renders its own. */
  hideHeader?: boolean;
  selectedStepId?: string | null;
  tab?: 'step' | 'parameters';
  notice?: RoutineNotice | null;
  /** Parameter whose removal was just refused because steps still use it. */
  blockedParameterId?: string | null;
  interaction?: RoutineInteraction | null;
  onSave?: (request: RoutineSaveRequest) => void;
  onDiscard?: () => void;
}

const KIND: Record<RoutineStepKind, string> = { capture: 'Capture', wait: 'Wait', annotate: 'Note' };
const KIND_ICON = { capture: IconActivity, wait: IconClock, annotate: IconNote };
const ICON = { stroke: 1.6, 'aria-hidden': true } as const;
const EMPTY: RoutineDefinition = { parameters: [], steps: [] };
const NOTE_DURATION = 'Notes don’t take time, so this step’s duration was removed.';

const clone = (routine: RoutineDefinition): RoutineDefinition => structuredClone(routine);
const fmt = (value: number) => Number.isFinite(value) ? `${Math.round(value * 10) / 10} s` : '—';
const parseSeconds = (text: string) => text.trim() === '' ? NaN : Number(text.replace(',', '.'));
const parameterOf = (routine: RoutineDefinition, id: string) => routine.parameters.find(p => p.id === id);
function secondsOf(routine: RoutineDefinition, step: RoutineStep) {
  if (!step.duration) return 0;
  return 'param' in step.duration ? parameterOf(routine, step.duration.param)?.seconds ?? NaN : step.duration.fixed;
}
function stepTitle(step: RoutineStep) {
  const name = step.name.trim();
  if (step.kind === 'capture') return name ? `Capture ${name.toLowerCase()}` : 'Capture';
  return step.kind === 'wait' ? 'Wait' : name || 'Note';
}
function problems(routine: RoutineDefinition, step: RoutineStep) {
  const out: string[] = [];
  if (step.kind !== 'wait' && !step.name.trim()) out.push(step.kind === 'capture' ? 'Name what this step captures.' : 'Write the note.');
  if (step.duration) {
    const value = secondsOf(routine, step);
    if ('param' in step.duration && !parameterOf(routine, step.duration.param)) out.push('Choose a parameter.');
    else if (!Number.isFinite(value) || value <= 0) out.push('Enter a duration longer than 0 s.');
  }
  return out;
}
const usedBy = (routine: RoutineDefinition, id: string) => routine.steps.flatMap((s, i) => s.duration && 'param' in s.duration && s.duration.param === id ? [i + 1] : []);
const nextId = (prefix: string, ids: string[]) => `${prefix}${Math.max(0, ...ids.map(id => Number(id.slice(prefix.length)) || 0)) + 1}`;
const steps = (n: number) => `${n} step${n === 1 ? '' : 's'}`;

interface DragState { id: string; origin: number; over: number; valid: boolean; x: number; y: number; ox: number; oy: number; w: number; h: number; moved: boolean }
interface KeyboardMove { id: string; start: RoutineDefinition }

/**
 * Routine editor: generic Capture, Wait and Note steps that run top to bottom, a timeline of their
 * durations, and parameters that several steps can share. Saving is an intent callback only.
 */
export function RoutineEditor(props: RoutineEditorProps) {
  // Story controls and new routines replace the editor's local draft.
  const key = JSON.stringify([props.name, props.revision, props.routine, props.draft, props.selectedStepId, props.tab, props.notice, props.blockedParameterId, props.interaction]);
  return <RoutineEditorDraft key={key} {...props} />;
}

function RoutineEditorDraft({
  name = 'Untitled routine', revision: initialRevision = 0, routine = EMPTY, draft: initialDraft, breadcrumb = ['Workspace', 'Routines'],
  selectedStepId = null, tab: initialTab = 'step', notice: initialNotice = null, blockedParameterId = null, interaction = null, onSave, onDiscard,
  breadcrumbs, hideHeader = false,
}: RoutineEditorProps) {
  const uid = useId();
  const id = (part: string) => `${uid}-${part}`;
  const keyboardStart = interaction?.type === 'keyboard' ? clone(initialDraft ?? routine) : null;
  const [revision, setRevision] = useState(initialRevision);
  const [saved, setSaved] = useState(() => clone(routine));
  const [draft, setDraft] = useState(() => {
    const next = clone(initialDraft ?? routine);
    if (interaction?.type === 'keyboard') moveStep(next, interaction.stepId, interaction.toIndex);
    return next;
  });
  const [selected, setSelected] = useState<string | null>(interaction?.type === 'keyboard' ? interaction.stepId : selectedStepId);
  const [tab, setTab] = useState(initialTab);
  const [notice, setNotice] = useState(initialNotice);
  const [blocked, setBlocked] = useState(blockedParameterId);
  const [hoverGrip, setHoverGrip] = useState(interaction?.type === 'grip-hover' ? interaction.stepId : null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [freeze, setFreeze] = useState(interaction?.type === 'dragging' || interaction?.type === 'outside' ? interaction : null);
  const [kb, setKb] = useState<KeyboardMove | null>(interaction?.type === 'keyboard' && keyboardStart ? { id: interaction.stepId, start: keyboardStart } : null);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef<HTMLElement>(null), canvasRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<string | null>(interaction?.type === 'keyboard' ? `[data-grip="${interaction.stepId}"]` : null);
  const dragRef = useRef(drag), kbRef = useRef(kb), draftRef = useRef(draft);
  dragRef.current = drag; kbRef.current = kb; draftRef.current = draft;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const bad = draft.steps.flatMap((s, i) => { const p = problems(draft, s); return p.length ? [`Step ${i + 1}: ${p[0]}`] : []; });
  const canSave = dirty && !bad.length && draft.steps.length > 0;

  const focusLater = (selector: string) => { focusRef.current = selector; };
  const announce = (text: string) => { setAnnouncement(''); requestAnimationFrame(() => setAnnouncement(text)); };
  const update = (change: (next: RoutineDefinition) => void) => setDraft(current => { const next = clone(current); change(next); return next; });
  const select = (stepId: string) => { setSelected(stepId); setTab('step'); };

  useLayoutEffect(() => {
    const selector = focusRef.current;
    if (!selector) return;
    focusRef.current = null;
    rootRef.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  // Frozen drag states: measure the step, render the slot, then place the ghost beside it.
  useLayoutEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!freeze || !root || !canvas) return;
    if (!drag) {
      const rect = canvas.querySelector(`[data-step="${freeze.stepId}"]`)?.getBoundingClientRect();
      if (!rect) { setFreeze(null); return; }
      const origin = draft.steps.findIndex(s => s.id === freeze.stepId), rest = draft.steps.filter(s => s.id !== freeze.stepId);
      const valid = freeze.type === 'dragging', over = valid ? rest.findIndex(s => s.id === freeze.afterStepId) + 1 : origin;
      setDrag({ id: freeze.stepId, origin, over, valid, x: 0, y: 0, ox: 0, oy: 0, w: rect.width, h: rect.height, moved: true });
      return;
    }
    const slot = canvas.querySelector('[data-placeholder]')?.getBoundingClientRect(), box = canvas.getBoundingClientRect(), base = root.getBoundingClientRect();
    if (slot && drag.valid) setDrag({ ...drag, x: slot.left + slot.width * .38 - base.left, y: slot.bottom + 18 - base.top, ox: 12, oy: 10 });
    else setDrag({ ...drag, x: box.right - drag.w * .4 - base.left, y: box.top - 70 - base.top });
    setFreeze(null);
  }, [freeze, drag, draft]);

  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return;
    const overIndex = (x: number, y: number) => {
      const box = canvasRef.current?.getBoundingClientRect();
      if (!box || x < box.left || x > box.right || y < box.top - 12 || y > box.bottom + 12) return null;
      let index = 0;
      for (const el of canvasRef.current!.querySelectorAll(':scope > [data-step]')) { const r = el.getBoundingClientRect(); if (y > r.top + r.height / 2) index++; }
      return index;
    };
    const move = (e: PointerEvent) => {
      const current = dragRef.current, base = rootRef.current?.getBoundingClientRect();
      if (!current || !base) return;
      const over = overIndex(e.clientX, e.clientY), valid = over !== null;
      const changed = valid !== current.valid || (valid && over !== current.over);
      setDrag({ ...current, x: e.clientX - base.left, y: e.clientY - base.top, valid, over: valid ? over : current.over, moved: current.moved || changed });
    };
    const end = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      setDrag(null);
      focusLater(`[data-grip="${current.id}"]`);
      const cancelled = e.type === 'pointercancel' || !current.valid;
      if (!cancelled && current.moved) {
        const routineNow = draftRef.current, step = routineNow.steps.find(s => s.id === current.id)!;
        update(next => moveStep(next, current.id, current.over));
        announce(`${stepTitle(step)} moved to step ${current.over + 1} of ${routineNow.steps.length}.`);
      } else if (!current.valid) announce('Move cancelled.');
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); };
  }, [dragging]);

  function onCanvasPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const grip = (e.target as HTMLElement).closest<HTMLElement>('[data-grip]');
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    const stepEl = grip.closest('[data-step]')!, rect = stepEl.getBoundingClientRect(), base = rootRef.current!.getBoundingClientRect();
    const stepId = grip.dataset.grip!, origin = draft.steps.findIndex(s => s.id === stepId);
    setDrag({ id: stepId, origin, over: origin, valid: true, x: e.clientX - base.left, y: e.clientY - base.top, ox: e.clientX - rect.left, oy: e.clientY - rect.top, w: rect.width, h: rect.height, moved: false });
    select(stepId); setHoverGrip(null); setKb(null);
  }

  function onCanvasKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const grip = (e.target as HTMLElement).closest<HTMLElement>('[data-grip]');
    if (!grip) return;
    const stepId = grip.dataset.grip!, step = draft.steps.find(s => s.id === stepId)!, index = draft.steps.indexOf(step);
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      focusLater(`[data-grip="${stepId}"]`);
      if (kb?.id === stepId) { setKb(null); announce(`${stepTitle(step)} dropped at step ${index + 1}.`); }
      else { setKb({ id: stepId, start: clone(draft) }); select(stepId); announce(`${stepTitle(step)} picked up. Step ${index + 1} of ${draft.steps.length}. Use the arrow keys to move.`); }
      return;
    }
    if (kb?.id !== stepId) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const to = index + (e.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= draft.steps.length) return;
      update(next => moveStep(next, stepId, to));
      focusLater(`[data-grip="${stepId}"]`);
      announce(`Step ${to + 1} of ${draft.steps.length}.`);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(clone(kb.start)); setKb(null);
      focusLater(`[data-grip="${stepId}"]`);
      announce('Move cancelled.');
    }
  }

  function onCanvasBlur(_: FocusEvent<HTMLDivElement>) {
    if (!kbRef.current) return;
    setTimeout(() => {
      const current = kbRef.current;
      if (current && (document.activeElement as HTMLElement | null)?.dataset?.grip !== current.id) setKb(null);
    }, 0);
  }

  function shift(stepId: string, dir: -1 | 1) {
    const from = draft.steps.findIndex(s => s.id === stepId), to = from + dir;
    if (to < 0 || to >= draft.steps.length) return;
    update(next => moveStep(next, stepId, to));
    select(stepId);
    const edge = to === 0 || to === draft.steps.length - 1;
    focusLater(edge ? `.dv-re-canvas [data-shift="${stepId}"]:not(:disabled)` : `.dv-re-canvas [data-shift="${stepId}"][data-dir="${dir}"]`);
    announce(`${stepTitle(draft.steps[from])} moved to step ${to + 1} of ${draft.steps.length}.`);
  }

  function removeStep(stepId: string) {
    const index = draft.steps.findIndex(s => s.id === stepId), title = stepTitle(draft.steps[index]);
    const rest = draft.steps.filter(s => s.id !== stepId), next = rest[Math.min(index, rest.length - 1)];
    update(r => { r.steps = r.steps.filter(s => s.id !== stepId); });
    if (selected === stepId) setSelected(null);
    focusLater(next ? `.dv-re-canvas [data-grip="${next.id}"]` : '[data-add="capture"]');
    announce(`${title} removed. Discard changes to undo.`);
  }

  function addStep(kind: RoutineStepKind) {
    const stepId = nextId('s', [...draft.steps, ...saved.steps].map(s => s.id));
    update(r => { r.steps.push({ id: stepId, kind, name: '', duration: kind === 'annotate' ? null : { fixed: kind === 'wait' ? 5 : 10 } }); });
    select(stepId); setNotice(null);
    focusLater(kind === 'wait' ? '[data-field="fixed"]' : '[data-field="name"]');
    announce(`${KIND[kind]} step added at the end.`);
  }

  function save() {
    const next = revision + 1;
    onSave?.({ name, revision: next, routine: clone(draft) });
    setRevision(next); setSaved(clone(draft));
    focusLater(`[id="${id('title')}"]`);
    announce(`Saved as R${next}.`);
  }

  function discard() {
    const restored = clone(saved);
    setDraft(restored);
    if (!restored.steps.some(s => s.id === selected)) setSelected(null);
    setNotice(null); setBlocked(null);
    focusLater(`[id="${id('title')}"]`);
    announce('Changes discarded.');
    onDiscard?.();
  }

  function changeKind(step: RoutineStep, kind: RoutineStepKind) {
    // Settings that no longer apply are cleared, and the note says which one went.
    const dropDuration = kind === 'annotate' && !!step.duration, addDuration = kind !== 'annotate' && !step.duration;
    const dropName = kind === 'wait' && step.kind !== 'wait' && !!step.name;
    update(r => {
      const s = r.steps.find(x => x.id === step.id)!;
      s.kind = kind;
      if (dropDuration) s.duration = null;
      if (addDuration) s.duration = { fixed: kind === 'wait' ? 5 : 10 };
      if (dropName) s.name = '';
    });
    const message = dropName ? `Wait steps don’t have a name, so “${step.name}” was removed.`
      : dropDuration ? NOTE_DURATION : addDuration ? 'Set how long this step takes.' : null;
    setNotice(message ? { stepId: step.id, text: message } : null);
    if (message) announce(message);
  }

  function removeParameter(parameterId: string) {
    const used = usedBy(draft, parameterId);
    if (used.length) { setBlocked(parameterId); announce(`Still used by step ${used.join(' and ')}.`); return; }
    const rest = draft.parameters.filter(p => p.id !== parameterId);
    update(r => { r.parameters = r.parameters.filter(p => p.id !== parameterId); });
    setBlocked(null);
    focusLater(rest.length ? '[data-param-remove]' : '[data-add-param]');
    announce('Parameter removed.');
  }

  function addParameter() {
    const parameterId = nextId('q', [...draft.parameters, ...saved.parameters].map(p => p.id));
    update(r => { r.parameters.push({ id: parameterId, name: '', seconds: 10 }); });
    setBlocked(null);
    focusLater(`[data-param-name="${parameterId}"]`);
    announce('Parameter added.');
  }

  const rawValue = (field: string, value: number) => raw[field] ?? (Number.isFinite(value) ? String(value) : '');
  const setRawValue = (field: string, text: string) => setRaw(current => ({ ...current, [field]: text }));
  const clearRaw = (field: string) => setRaw(current => { const { [field]: _, ...rest } = current; return rest; });

  function onStepClick(e: MouseEvent<HTMLElement>, stepId: string) {
    if ((e.target as HTMLElement).closest('button')) return;
    select(stepId); setNotice(null);
  }

  function renderStep(step: RoutineStep, index: number, total: number, ghost?: { invalid: boolean; style: CSSProperties }) {
    const lifted = kb?.id === step.id, issues = problems(draft, step), Kind = KIND_ICON[step.kind], title = stepTitle(step), seconds = secondsOf(draft, step);
    const skip = ghost ? -1 : undefined;
    const bound = step.duration && 'param' in step.duration ? parameterOf(draft, step.duration.param) : undefined;
    return <article key={ghost ? 'ghost' : step.id} className={`dv-re-step${ghost ? ' dv-re-ghost' : ''}`} style={ghost?.style}
      data-step={ghost ? undefined : step.id} data-selected={!ghost && selected === step.id} data-lifted={lifted}
      data-invalid={issues.length > 0 || undefined} data-ghost-invalid={ghost?.invalid || undefined}
      aria-hidden={ghost ? true : undefined} inert={ghost ? true : undefined}
      aria-label={ghost ? undefined : `Step ${index + 1} of ${total}: ${title}`}
      onClick={ghost ? undefined : e => onStepClick(e, step.id)}>
      {ghost?.invalid && <span className="dv-re-ghost-badge"><IconX {...ICON} />Release to cancel</span>}
      {lifted && <span className="dv-re-move-badge"><IconArrowsMove {...ICON} />Step {index + 1} of {total}</span>}
      <button type="button" className="dv-re-tool dv-re-grip" data-grip={ghost ? undefined : step.id} tabIndex={skip}
        aria-label={`Move step ${index + 1}, ${title}`} aria-describedby={id('grip-help')} aria-pressed={lifted}
        data-hover={hoverGrip === step.id || undefined}><IconGripVertical {...ICON} /></button>
      <span className="dv-re-step-number" aria-hidden>{index + 1}</span>
      <span className="dv-re-step-mark" data-kind={step.kind}><Kind {...ICON} /></span>
      <div className="dv-re-step-copy">
        <button type="button" className="dv-re-step-title" tabIndex={skip} aria-label={`Edit step ${index + 1}, ${title}`}
          onClick={() => { select(step.id); setNotice(null); }}>{title}</button>
        <small data-state={issues.length ? 'invalid' : undefined}>
          {issues.length ? <><IconAlertTriangle {...ICON} />{issues[0]}</> : `${KIND[step.kind]}${step.duration ? '' : ' · no duration'}`}
        </small>
      </div>
      {step.duration && ('param' in step.duration
        ? <Chip tone="accent" icon={<IconAdjustmentsHorizontal {...ICON} />}>{fmt(seconds)} · {bound?.name || 'missing'}</Chip>
        : <Chip icon={<IconClock {...ICON} />}>{fmt(seconds)}</Chip>)}
      <div className="dv-re-tools">
        <button type="button" className="dv-re-tool" data-shift={ghost ? undefined : step.id} data-dir="-1" tabIndex={skip} aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => shift(step.id, -1)}><IconChevronUp {...ICON} /></button>
        <button type="button" className="dv-re-tool" data-shift={ghost ? undefined : step.id} data-dir="1" tabIndex={skip} aria-label={`Move step ${index + 1} down`} disabled={index === total - 1} onClick={() => shift(step.id, 1)}><IconChevronDown {...ICON} /></button>
        <button type="button" className="dv-re-tool" tabIndex={skip} aria-label={`Remove step ${index + 1}, ${title}`} onClick={() => removeStep(step.id)}><IconTrash {...ICON} /></button>
      </div>
    </article>;
  }

  function renderCanvas() {
    const list = draft.steps, total = list.length;
    if (!total) return <div className="dv-re-empty-steps">No steps yet. Add a step to start the routine.</div>;
    if (!drag) return list.map((s, i) => renderStep(s, i, total));
    const rest = list.filter(s => s.id !== drag.id), at = drag.valid ? drag.over : drag.origin;
    const slot = <div key="slot" className="dv-re-slot" data-placeholder data-return={!drag.valid || undefined} style={{ height: drag.h }}>{drag.valid ? 'Drop here' : 'Returns here'}</div>;
    const out = rest.flatMap((s, i) => i === at ? [slot, renderStep(s, i + 1, total)] : [renderStep(s, i >= at ? i + 1 : i, total)]);
    if (at >= rest.length) out.push(slot);
    return out;
  }

  function renderGhost() {
    if (!drag) return null;
    const step = draft.steps.find(s => s.id === drag.id);
    if (!step) return null;
    return renderStep(step, draft.steps.indexOf(step), draft.steps.length, { invalid: !drag.valid, style: { width: drag.w, left: drag.x - drag.ox, top: drag.y - drag.oy, visibility: freeze ? 'hidden' : undefined } });
  }

  const totalSeconds = draft.steps.reduce((sum, s) => { const v = secondsOf(draft, s); return sum + (Number.isFinite(v) ? v : 0); }, 0);
  const timelineLabel = draft.steps.map((s, i) => `Step ${i + 1} ${stepTitle(s)}${s.duration ? ` ${fmt(secondsOf(draft, s))}` : ''}`).join(', ');
  const current = draft.steps.find(s => s.id === selected);

  function renderStepSettings() {
    if (!current) return <p className="dv-re-side-empty">Select a step to change it.</p>;
    const issues = problems(draft, current), nameError = !current.name.trim();
    const duration = current.duration, source = duration && 'param' in duration ? 'param' : 'fixed';
    const durationError = issues.find(e => e.includes('duration') || e.includes('parameter'));
    return <>
      <div className="dv-re-field"><label htmlFor={id('kind')}>Type</label>
        <select id={id('kind')} data-field="kind" value={current.kind} onChange={e => changeKind(current, e.currentTarget.value as RoutineStepKind)}>
          {(Object.keys(KIND) as RoutineStepKind[]).map(k => <option key={k} value={k}>{KIND[k]}</option>)}
        </select>
      </div>
      {current.kind !== 'wait' && <div className="dv-re-field"><label htmlFor={id('name')}>{current.kind === 'capture' ? 'What it captures' : 'Note text'}</label>
        <input id={id('name')} data-field="name" value={current.name} autoComplete="off" aria-invalid={nameError} aria-describedby={nameError ? id('name-error') : undefined}
          onChange={e => { const value = e.currentTarget.value; update(r => { r.steps.find(s => s.id === current.id)!.name = value; }); }} />
        {nameError && <span className="dv-re-field-error" id={id('name-error')}><IconCircleX {...ICON} />{issues[0]}</span>}
      </div>}
      {duration && <>
        <fieldset className="dv-re-fieldset"><legend>Duration</legend>
          <div className="dv-re-segmented">
            {(['fixed', 'param'] as const).map(value => <label key={value}><input type="radio" name={id('source')} value={value} data-src={value} checked={source === value}
              onChange={() => update(r => {
                const s = r.steps.find(x => x.id === current.id)!, v = secondsOf(r, s);
                s.duration = value === 'fixed' ? { fixed: Number.isFinite(v) ? v : 10 } : { param: '' };
              })} />{value === 'fixed' ? 'Fixed' : 'Parameter'}</label>)}
          </div>
        </fieldset>
        {'fixed' in duration
          ? <div className="dv-re-field"><label htmlFor={id('fixed')}>Seconds</label>
            <div className="dv-re-unit"><input id={id('fixed')} data-field="fixed" inputMode="decimal" autoComplete="off" value={rawValue(`fixed:${current.id}`, duration.fixed)}
              aria-invalid={!!durationError} aria-describedby={durationError ? id('duration-error') : undefined} onBlur={() => clearRaw(`fixed:${current.id}`)}
              onChange={e => { const text = e.currentTarget.value; setRawValue(`fixed:${current.id}`, text); update(r => { r.steps.find(s => s.id === current.id)!.duration = { fixed: parseSeconds(text) }; }); }} /><span>s</span></div>
          </div>
          : <div className="dv-re-field"><label htmlFor={id('param')}>Parameter</label>
            <select id={id('param')} data-field="param" value={duration.param} aria-invalid={!!durationError}
              aria-describedby={`${id('param-hint')}${durationError ? ` ${id('duration-error')}` : ''}`}
              onChange={e => { const value = e.currentTarget.value; update(r => { r.steps.find(s => s.id === current.id)!.duration = { param: value }; }); }}>
              <option value="">Choose a parameter</option>
              {draft.parameters.map(p => <option key={p.id} value={p.id}>{p.name || 'Unnamed'} · {fmt(p.seconds)}</option>)}
            </select>
            <span className="dv-re-hint" id={id('param-hint')}>Change the value under Parameters. Every step using it updates.</span>
          </div>}
        {durationError && <p className="dv-re-field-error dv-re-duration-error" id={id('duration-error')}><IconCircleX {...ICON} />{durationError}</p>}
      </>}
      {notice?.stepId === current.id && <p className="dv-re-side-note" role="status"><IconInfoCircle {...ICON} />{notice.text}</p>}
    </>;
  }

  function renderParameters() {
    return <>
      <p className="dv-re-hint dv-re-params-hint">Values people can change before running the routine. Steps that use a parameter update with it.</p>
      {draft.parameters.map(p => {
        const used = usedBy(draft, p.id), error = !p.name.trim() ? 'Enter a name.' : !(p.seconds > 0) ? 'Enter a value longer than 0 s.' : null;
        const plural = used.length > 1;
        return <div key={p.id} className="dv-re-param">
          <div className="dv-re-param-row">
            <div className="dv-re-field"><label htmlFor={id(`pn-${p.id}`)}>Name</label>
              <input id={id(`pn-${p.id}`)} data-param-name={p.id} value={p.name} autoComplete="off" aria-invalid={!p.name.trim()}
                onChange={e => { const value = e.currentTarget.value; update(r => { parameterOf(r, p.id)!.name = value; }); }} />
            </div>
            <div className="dv-re-field"><label htmlFor={id(`pv-${p.id}`)}>Default</label>
              <div className="dv-re-unit"><input id={id(`pv-${p.id}`)} data-param-value={p.id} inputMode="decimal" autoComplete="off" value={rawValue(`pv:${p.id}`, p.seconds)}
                aria-invalid={!(p.seconds > 0)} onBlur={() => clearRaw(`pv:${p.id}`)}
                onChange={e => { const text = e.currentTarget.value; setRawValue(`pv:${p.id}`, text); update(r => { parameterOf(r, p.id)!.seconds = parseSeconds(text); }); }} /><span>s</span></div>
            </div>
            <button type="button" className="dv-re-tool" data-param-remove={p.id} aria-label={`Remove parameter ${p.name || 'without a name'}`}
              aria-describedby={blocked === p.id && used.length ? id(`blocked-${p.id}`) : undefined} onClick={() => removeParameter(p.id)}><IconTrash {...ICON} /></button>
          </div>
          {error && <p className="dv-re-field-error dv-re-param-error"><IconCircleX {...ICON} />{error}</p>}
          {blocked === p.id && used.length
            ? <p className="dv-re-param-blocked" id={id(`blocked-${p.id}`)}><IconAlertTriangle {...ICON} />Used by step{plural ? 's' : ''} {used.join(' and ')}. Change {plural ? 'those steps' : 'that step'} first.</p>
            : <p className="dv-re-param-used">{used.length ? `Used by step${plural ? 's' : ''} ${used.join(', ')}` : 'Not used yet'}</p>}
        </div>;
      })}
      <div className="dv-re-add-param"><button type="button" className="dv-re-hbtn" data-add-param onClick={addParameter}><IconPlus {...ICON} />Add parameter</button></div>
    </>;
  }

  const sidebarTabs = [{ id: 'step', label: 'Step', icon: <SidebarIcon name="details" /> }, { id: 'parameters', label: 'Parameters', icon: <SidebarIcon name="parameters" /> }];
  const switchTab = (next: 'step' | 'parameters') => { setTab(next); setBlocked(null); };

  return <section ref={rootRef} className="dv-re" aria-labelledby={hideHeader ? undefined : id('title')} aria-label={hideHeader ? name : undefined}>
    {!hideHeader && <PageHeader title={name} titleId={id('title')}
      breadcrumbs={breadcrumbs ?? [...breadcrumb.map(label => ({ label })), { label: name }]}
      meta={<>
        <Chip icon={<IconHistory {...ICON} />}>{revision ? `R${revision}` : 'Not saved yet'}</Chip>
        {dirty ? <StatusWord tone="warning" icon={<IconAlertTriangle {...ICON} />}>Unsaved changes</StatusWord> : <StatusWord icon={<IconCheck {...ICON} />}>No unsaved changes</StatusWord>}
      </>}
      actions={<>
        {dirty && <HeaderButton variant="quiet" onClick={discard}>Discard changes</HeaderButton>}
        <HeaderButton variant="primary" disabled={!canSave} aria-describedby={bad.length ? id('messages') : undefined} icon={<IconDeviceFloppy {...ICON} />} onClick={save}>Save as R{revision + 1}</HeaderButton>
      </>} />}
    <WorkspaceBody sidebar={<RightSidebar id={id('rs')} label="Routine settings" tabsLabel="Routine settings"
      title={tab === 'parameters' ? 'Parameters' : current ? `Step ${draft.steps.indexOf(current) + 1} · ${KIND[current.kind]}` : 'Step settings'}
      tabs={sidebarTabs} activeTab={tab} onTabChange={next => switchTab(next as 'step' | 'parameters')}>
      {tab === 'parameters' ? renderParameters() : renderStepSettings()}
    </RightSidebar>}>
        {bad.length > 0 && <div className="dv-re-messages" id={id('messages')}><Banner severity="warning" messages={bad} /></div>}
        {draft.steps.length > 0 && <div className="dv-re-timeline-card">
          <div className="dv-re-timeline-head">Timeline<span>{steps(draft.steps.length)} · {fmt(totalSeconds)} total</span></div>
          <div className="dv-re-timeline" role="img" aria-label={timelineLabel}>
            {totalSeconds > 0 && draft.steps.map(s => {
              if (!s.duration) return <span key={s.id} className="dv-re-seg-mark" data-kind="annotate" title={stepTitle(s)} />;
              const v = secondsOf(draft, s);
              if (!(v > 0)) return null;
              return <span key={s.id} className="dv-re-seg" data-kind={s.kind} data-selected={selected === s.id} style={{ flex: `${v} 1 0` }} title={`${stepTitle(s)} · ${fmt(v)}`}>{v / totalSeconds > .12 ? stepTitle(s) : ''}</span>;
            })}
          </div>
          <div className="dv-re-axis" aria-hidden><span>0 s</span><span>{fmt(totalSeconds)}</span></div>
        </div>}
        <div ref={canvasRef} className="dv-re-canvas" role="group" aria-label="Routine steps" data-mode={drag ? (drag.valid ? 'drag' : 'nodrop') : kb ? 'drag' : undefined}
          onPointerDown={onCanvasPointerDown} onKeyDown={onCanvasKeyDown} onBlur={onCanvasBlur}>{renderCanvas()}</div>
        <div className="dv-re-add-row">
          {(Object.keys(KIND) as RoutineStepKind[]).map(k => <button key={k} type="button" className="dv-re-hbtn" data-add={k} onClick={() => addStep(k)}><IconPlus {...ICON} />Add {KIND[k].toLowerCase()}</button>)}
        </div>
        <p className="dv-re-sr-only" id={id('grip-help')}>Press Space to pick up. Use the arrow keys to move, Space to drop, Escape to cancel.</p>
    </WorkspaceBody>
    {renderGhost()}
    <div className="dv-re-sr-only" role="status" aria-live="assertive" aria-atomic="true">{announcement}</div>
  </section>;
}

function moveStep(routine: RoutineDefinition, stepId: string, to: number) {
  const from = routine.steps.findIndex(s => s.id === stepId);
  if (from < 0 || to < 0 || to >= routine.steps.length || to === from) return;
  const [step] = routine.steps.splice(from, 1);
  routine.steps.splice(to, 0, step);
}
