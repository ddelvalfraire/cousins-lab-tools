import { useId, useState } from 'react';
import { Banner } from './Banner';
import { Select } from '@mantine/core';
import { chosen } from './select';
import './Approved.css';
import './ScientificQuantityInput.css';

/** Millivolts per unit. The stored quantity is always in mV because the instrument reports mV. */
const units = { V: 1000, mV: 1, 'µV': 0.001 } as const;
export type VoltageUnit = keyof typeof units;
type QuantityError = 'empty' | 'text' | 'large' | 'small';

const superscript: Record<string, string> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** Plain readable number: ordinary magnitudes as decimals, others as "2.5 × 10⁻⁴". */
export function formatQuantity(value: number, locale = 'en-US'): string {
  if (value === 0) return '0';
  const plain = (v: number, digits: number) => new Intl.NumberFormat(locale, { maximumSignificantDigits: digits, useGrouping: false }).format(v);
  const magnitude = Math.abs(value);
  if (magnitude >= 1e-3 && magnitude < 1e6) return plain(value, 6);
  const [mantissa, exponent] = value.toExponential(3).split('e');
  return `${plain(Number(mantissa), 4)} × 10${String(Number(exponent)).replace(/[-0-9]/g, c => superscript[c])}`;
}

/** Accepts a decimal point or comma and e-notation, such as 0.25, 0,25 or 2.5e-4. */
function parse(text: string): { value: number } | { error: QuantityError } {
  const compact = text.trim().replace(/\s/g, '').replace('−', '-');
  if (!compact) return { error: 'empty' };
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)(e[+-]?\d+)?$/i.test(compact)) return { error: 'text' };
  return { value: Number(compact.replace(',', '.')) };
}

/** Rejects values that overflow, or that underflow to 0 once converted to mV. */
function evaluate(text: string, unit: VoltageUnit): { mv: number } | { error: QuantityError } {
  const parsed = parse(text);
  if ('error' in parsed) return parsed;
  const mv = parsed.value * units[unit];
  if (!Number.isFinite(parsed.value) || !Number.isFinite(mv)) return { error: 'large' };
  if (parsed.value !== 0 && mv === 0) return { error: 'small' };
  return { mv };
}

function initialDraft(millivolts: number, unit: VoltageUnit) {
  const shown = millivolts / units[unit];
  return shown !== 0 && Math.abs(shown) < 1e-3 ? shown.toExponential() : String(shown);
}

export interface ScientificQuantityInputProps {
  /** Field label. */
  label?: string;
  /** Optional heading and one-line description shown above the field. */
  title?: string;
  description?: string;
  /** Stored quantity in mV. Kept until a valid value replaces it. */
  initialValue?: number;
  /** Unit the value is shown in. */
  initialUnit?: VoltageUnit;
  /** Text shown in the field. Defaults to the stored value in the initial unit. */
  initialText?: string;
  /** Format hint under the field. */
  hint?: string;
  /** Sentence shown when the field is empty. */
  emptyMessage?: string;
  disabled?: boolean;
  /** Forces the field to show as invalid, for example after a failed save. */
  invalid?: boolean;
  /** Shows that the setting differs from the saved experiment. */
  warning?: boolean;
  /** Locale used to show the stored value. */
  locale?: string;
  /** Called with the new stored quantity in mV whenever the typed value is valid. */
  onValueChange?: (millivolts: number) => void;
}

export function ScientificQuantityInput({
  label = 'Raw signal', title, description, initialValue = 3.2e-6, initialUnit = 'mV', initialText, hint = 'Accepts 0.25, 0,25 or 2.5e-4.',
  emptyMessage = 'Enter a value. Use 0 for none.', disabled = false, invalid = false, warning = false, locale = 'en-US', onValueChange,
}: ScientificQuantityInputProps) {
  const [text, setText] = useState(() => initialText ?? initialDraft(initialValue, initialUnit));
  const [unit, setUnit] = useState<VoltageUnit>(initialUnit);
  const [stored, setStored] = useState(() => {
    const first = evaluate(initialText ?? initialDraft(initialValue, initialUnit), initialUnit);
    return 'mv' in first ? first.mv : initialValue;
  });
  const [announcement, setAnnouncement] = useState('');
  const inputId = useId(), hintId = useId(), messagesId = useId();

  const result = evaluate(text, unit);
  const error: QuantityError | null = 'error' in result ? result.error : invalid ? 'text' : null;
  const sentences: Record<QuantityError, string> = {
    empty: emptyMessage,
    text: 'Enter a number, such as 0.25, 0,25 or 2.5e-4.',
    large: `This value is too large to store. Enter less than ${formatQuantity(Number.MAX_VALUE / units[unit], locale)} ${unit}.`,
    small: 'This value is too small to store and would become 0. Enter 0 or a larger value.',
  };
  const stillUsing = `Still using ${formatQuantity(stored, locale)} mV.`;

  const accept = (nextText: string, nextUnit: VoltageUnit) => {
    const next = evaluate(nextText, nextUnit);
    if ('mv' in next) { setStored(next.mv); onValueChange?.(next.mv); }
  };
  const changeUnit = (nextUnit: VoltageUnit) => {
    setUnit(nextUnit);
    if ('mv' in evaluate(text, unit)) {
      // Valid text: convert the shown number so the stored quantity stays the same.
      const converted = String(Number((stored / units[nextUnit]).toPrecision(12)));
      setText(converted);
      setAnnouncement(`Converted to ${converted} ${nextUnit}.`);
    } else {
      // Invalid text: reinterpret what was typed in the new unit.
      accept(text, nextUnit);
    }
  };

  const messages = [error && `${sentences[error]} ${stillUsing}`, warning && 'This setting differs from the saved experiment.'].filter((text): text is string => !!text);

  return <div className="dv-qty-root">
    {title && <h2 className="dv-qty-title">{title}</h2>}
    {description && <p className="dv-qty-lede">{description}</p>}
    <div className="dv-qty-field" data-spaced={title || description ? '' : undefined}>
      <label htmlFor={inputId}>{label}</label>
      <div className="dv-qty">
        <input id={inputId} value={text} disabled={disabled} aria-invalid={!!error} aria-describedby={`${hintId} ${messagesId}`}
          inputMode="decimal" autoComplete="off" spellCheck={false}
          onChange={event => { const next = event.currentTarget.value; setText(next); accept(next, unit); }} />
        <Select aria-label={`${label} unit`} value={unit} disabled={disabled} data={Object.keys(units)}
          onChange={chosen(value => changeUnit(value as VoltageUnit))} />
      </div>
      <span className="dv-qty-hint" id={hintId}>{hint}</span>
    </div>
    <div id={messagesId} className="dv-qty-messages" hidden={!error && !warning}>
      {error && !warning
        ? <Banner severity="error"><p>{sentences[error]}</p><p>{stillUsing}</p></Banner>
        : messages.length > 0 && <Banner severity={error ? 'error' : 'warning'} messages={messages} />}
    </div>
    <dl className="dv-qty-stored">
      <dt>Stored value</dt><dd data-quantity="stored">{formatQuantity(stored, locale)} mV</dd>
      <dt>Shown as</dt><dd data-quantity="shown">{formatQuantity(stored / units[unit], locale)} {unit}</dd>
    </dl>
    <span className="dv-qty-sr" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </div>;
}
