import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { call, showInFolder } from "../util.js";

const engine = respond => {
  const sent = [];
  globalThis.window = { __TAURI__: { core: { invoke: async (command, args) => (sent.push([command, args]), respond(command, args)) } } };
  return sent;
};

afterEach(() => delete globalThis.window);

test("call sends the command and its arguments through the api command and resolves with the result", async () => {
  const sent = engine(() => ({ id: "s1", status: "running" }));
  const result = await call("session_live", { session_id: "s1", cursors: { ms: 3, "ms:events": 0 } });
  assert.deepEqual(result, { id: "s1", status: "running" });
  assert.deepEqual(sent, [["api", { command: "session_live", args: { session_id: "s1", cursors: { ms: 3, "ms:events": 0 } } }]]);
});

test("call without arguments sends an empty object", async () => {
  const sent = engine(() => []);
  await call("list_templates");
  assert.deepEqual(sent, [["api", { command: "list_templates", args: {} }]]);
});

test("an engine error becomes an Error carrying only its message", async () => {
  engine(() => Promise.reject({ kind: "conflict", message: "The run is not in this process" }));
  await assert.rejects(call("stop_session", { session_id: "s1", cancel: false }), e => {
    assert.ok(e instanceof Error);
    assert.equal(e.message, "The run is not in this process");
    return true;
  });
});

test("a plain string rejection from the webview bridge keeps its text", async () => {
  engine(() => Promise.reject("command api not found"));
  await assert.rejects(call("list_sessions"), { message: "command api not found" });
});

test("without the app bridge, call says the engine is not connected", async () => {
  await assert.rejects(call("list_sessions"), { message: /engine is not connected/ });
});

test("showInFolder asks the app to reveal the path", async () => {
  const sent = engine(() => null);
  await showInFolder("/data/sessions/s1/exports/a1.csv");
  assert.deepEqual(sent, [["show_in_folder", { path: "/data/sessions/s1/exports/a1.csv" }]]);
});
