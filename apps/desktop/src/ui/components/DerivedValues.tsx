import { Fragment, useId } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import './Approved.css';
import './DerivedValues.css';

export interface DerivedOutput {
  name: string;
  /** Unit in words or symbols; "no unit" for ratios. */
  unit: string;
  /** One plain-language equation, without the leading "=". */
  equation: string;
  /** Parameter values the equation uses, as [name, value with unit]. */
  where?: readonly (readonly [string, string])[];
  /** Source signals the equation reads, such as "Mass 44". */
  signals?: readonly string[];
  /** Other outputs, by name, that this output is calculated from. */
  uses?: readonly string[];
}

/** One sentence explaining why an output can't be calculated, or null when it can. */
export function derivedProblem(output: DerivedOutput, outputs: readonly DerivedOutput[], missingSignals: readonly string[], seen = new Set<string>()): string | null {
  const missing = (output.signals ?? []).filter(signal => missingSignals.includes(signal));
  if (missing.length) return `Can’t be calculated: this source has no ${missing.join(' or ')}.`;
  seen.add(output.name);
  const blocked = (output.uses ?? []).find(name => {
    const dependency = outputs.find(other => other.name === name);
    return dependency && !seen.has(name) && derivedProblem(dependency, outputs, missingSignals, seen) !== null;
  });
  return blocked ? `Can’t be calculated: it needs ${blocked}.` : null;
}

/** Read-only list of what a preset calculates from the signals, written as plain equations. */
export function DerivedValues({ outputs, missingSignals = [], title = 'Derived values', description = 'DVDash calculates these for every sample.' }: {
  outputs: readonly DerivedOutput[];
  /** Signals the chosen source doesn't have. Affected outputs, and outputs that depend on them, explain why. */
  missingSignals?: readonly string[];
  title?: string;
  description?: string;
}) {
  const titleId = useId();
  return <section className="dv-derived" aria-labelledby={titleId}>
    <div className="dv-derived-head"><h2 id={titleId}>{title}</h2><span>{outputs.length} {outputs.length === 1 ? 'output' : 'outputs'}</span></div>
    {description && <p className="dv-derived-lede">{description}</p>}
    <ul className="dv-derived-list">
      {outputs.map(output => {
        const problem = derivedProblem(output, outputs, missingSignals);
        return <li key={output.name} className="dv-derived-row" data-unavailable={problem ? 'true' : undefined}>
          <h3>{output.name}<span className="dv-derived-unit">{output.unit}</span></h3>
          <div>
            <p className="dv-derived-equation"><span className="dv-derived-eq" aria-hidden="true">=</span><span className="dv-derived-sr">equals </span>{output.equation}</p>
            {!!output.where?.length && <p className="dv-derived-where">where {output.where.map(([name, value], index) => <Fragment key={name}>{index > 0 && ' and '}{name} = <b>{value}</b></Fragment>)}</p>}
            {problem && <p className="dv-derived-problem"><IconAlertTriangle aria-hidden stroke={1.6} /><span>{problem}</span></p>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
