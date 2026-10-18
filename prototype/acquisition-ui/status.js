// The capture page's status button: what one glance at the header should say about the session's captures.

const BAD = new Set(["failed", "not_ready", "interrupted", "cancelled", "completed_with_failures"]);
const ACTIVE = new Set(["running", "starting", "stopping"]);
const PENDING = new Set(["waiting", "preparing"]);

/** {label, tone} for the header button: the capture count and the most urgent state among them. */
export function sessionSummary(captures, status) {
  const list = Object.values(captures || {});
  const states = [status, ...list.map(c => c.status)];
  const failed = list.some(c => c.error || (c.readiness && !c.readiness.ok)) || states.some(s => BAD.has(s));
  const tone = failed ? "bad" : states.some(s => ACTIVE.has(s)) ? "active" : states.some(s => PENDING.has(s)) ? "pending" : "good";
  return { label: `${list.length} ${list.length === 1 ? "capture" : "captures"}`, tone };
}
