import { esc } from "./util.js";
import { parseEntry } from "./analysis.js";

export function parameterField(name, parameter) {
  const label = `${parameter.label || name}${parameter.unit ? ` (${parameter.unit})` : ""}`;
  const note = `<span class="small muted">${esc(parameter.note || "")}</span>`;
  if (parameter.expr) return `<div class="calculated-parameter"><div class="section-head"><span>${esc(label)}</span><span class="badge">Calculated</span></div>
    <code>${esc(parameter.expr)}</code>${note}</div>`;
  return `<label class="field">${esc(label)}<input type="number" step="any" data-param="${esc(name)}" value="${esc(parameter.value ?? "")}" placeholder="No default">${note}</label>`;
}

export function parameterWithDefault(parameter, text) {
  const parsed = parseEntry(text);
  if (parsed.error) throw new Error(parsed.error);
  const { value, ...rest } = parameter;
  return parsed.value === null ? rest : { ...rest, value: parsed.value };
}
