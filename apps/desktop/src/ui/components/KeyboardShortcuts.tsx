import { Modal } from '@mantine/core';
import { KeyCaps } from './CommandCenter';
import { commands, shortcutSectionsFor, type ShortcutSection } from '../search-registry';
import './Approved.css';
import './KeyboardShortcuts.css';

export type { ShortcutRow, ShortcutSection } from '../search-registry';

/** Every shortcut (command-center-review.html, "Keyboard reference"), from the search registry. `Mod` is ⌘ or Ctrl. */
export const shortcutSections: readonly ShortcutSection[] = shortcutSectionsFor(commands);

export interface KeyboardShortcutsProps {
  opened: boolean;
  onClose: () => void;
  /** Show ⌘ (macOS) rather than Ctrl. */
  mac: boolean;
  /** Defaults to every shortcut. The window shows only the commands it can run. */
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
