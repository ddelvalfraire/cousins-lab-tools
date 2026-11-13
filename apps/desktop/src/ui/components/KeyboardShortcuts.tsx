import { Modal } from '@mantine/core';
import { KeyCaps } from './CommandCenter';
import './Approved.css';
import './KeyboardShortcuts.css';

export interface ShortcutRow { label: string; keys: readonly string[]; sequence?: boolean }
export interface ShortcutSection { title: string; rows: readonly ShortcutRow[] }

/** The approved reference list (command-center-review.html, "Keyboard reference"). `Mod` is ⌘ or Ctrl. */
export const shortcutSections: readonly ShortcutSection[] = [
  { title: 'Search and settings', rows: [
    { label: 'Open command center', keys: ['Mod', 'K'] },
    { label: 'Filter this page', keys: ['/'] },
    { label: 'Go to Settings', keys: ['Mod', ','] },
    { label: 'Show keyboard shortcuts', keys: ['?'] },
  ] },
  { title: 'Common actions', rows: [
    { label: 'New experiment…', keys: ['N'] },
    { label: 'Import recordings…', keys: ['I'] },
  ] },
  { title: 'Go to a page', rows: [
    { label: 'Go to Experiments', keys: ['G', 'E'], sequence: true },
    { label: 'Go to Presets', keys: ['G', 'P'], sequence: true },
    { label: 'Go to Routines', keys: ['G', 'R'], sequence: true },
    { label: 'Go to Instruments', keys: ['G', 'I'], sequence: true },
  ] },
];

export interface KeyboardShortcutsProps {
  opened: boolean;
  onClose: () => void;
  /** Show ⌘ (macOS) rather than Ctrl. */
  mac: boolean;
  sections?: readonly ShortcutSection[];
}

/** Keyboard shortcuts reference, opened from the window bar's keyboard button or with "?". */
export function KeyboardShortcuts({ opened, onClose, mac, sections = shortcutSections }: KeyboardShortcutsProps) {
  // Compound parts so the header is not a second page banner beside the window bar's <header>.
  return <Modal.Root
    opened={opened} onClose={onClose} centered size={450} padding={0} xOffset={16}
    classNames={{ root: 'dvdash', inner: 'dv-shortcuts-inner', content: 'dv-shortcuts', header: 'dv-shortcuts-header', title: 'dv-shortcuts-title', body: 'dv-shortcuts-body', close: 'dv-shortcuts-close' }}
  >
    <Modal.Overlay />
    <Modal.Content>
      <Modal.Header role="none"><Modal.Title>Keyboard shortcuts</Modal.Title><Modal.CloseButton aria-label="Close dialog" /></Modal.Header>
      <Modal.Body>
        <p className="dv-shortcuts-intro">Shortcuts for {mac ? 'macOS' : 'Windows and Linux'}.</p>
        {sections.map(section => <section key={section.title} className="dv-shortcuts-section">
          <h3>{section.title}</h3>
          <dl>{section.rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd><KeyCaps keys={row.keys} sequence={row.sequence} mac={mac} /></dd></div>)}</dl>
        </section>)}
        <p className="dv-shortcuts-note">Single-key and “G then…” shortcuts run outside text fields.</p>
      </Modal.Body>
    </Modal.Content>
  </Modal.Root>;
}
