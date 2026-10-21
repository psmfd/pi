import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

// psmfd/pi#83 / CodeQL 88: isolate the real parser behind an external timeout.
test("catalog user-agent parsing remains bounded for ambiguous whitespace", () => {
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { parseModelCatalogRequest } from "./scripts/model-catalog-protocol.ts";
    for (const ua of ["pi/! (x;" + " ".repeat(100_000), "pi/! (x;;" + " ".repeat(100_000)])
      assert.equal(parseModelCatalogRequest("https://example.invalid/models", ua).kind, "catalog");
    for (const ua of ["pi/1.3.0", "pi/1.3.0 (linux)", "pi/1.3.0 (linux; node/22; arm64)"])
      assert.equal(parseModelCatalogRequest("https://example.invalid/models", ua).kind, "redirect");
  `], { cwd: new URL("../../", import.meta.url), timeout: 1000, encoding: "utf8" });
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.status, 0, run.stderr);
});

// psmfd/pi#83 / CodeQL 92: drive the actual HTTP catch callback from the source.
test("triage HTTP failures return a generic response", async () => {
  const source = readFileSync(new URL("../../scripts/issues/main.ts", import.meta.url), "utf8");
  const callback = source.slice(source.indexOf("const server = createServer"), source.indexOf("const socket ="))
    .replace("(error: unknown)", "(error)");
  const privateError = new Error("synthetic-internal-path /private/operator");
  const diagnostics = [];
  const server = runInNewContext(callback + "server", {
    createServer,
    handle: async () => { throw privateError; },
    console: { error: value => diagnostics.push(value) },
    JSON,
    send: (res, status, body) => { res.writeHead(status); res.end(body); },
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {error: "Internal server error"});
    assert.equal(diagnostics[0], privateError);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

// psmfd/pi#83 / CodeQL 95: run in a child so the old pollution cannot affect other tests.
for (const kind of ["plain", "chord"]) test(`JSON streaming preserves reserved keys in ${kind} containers`, () => {
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--conditions=source", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { assignJson } from "./packages/durable/src/harness/json.ts";
    import { track, apply } from "./packages/chord/src/delta/index.ts";
    const payload = JSON.parse('{"__proto__":{"ftCodeqlPollution":true},"constructor":{"prototype":{"ftCodeqlPollution":true}},"text":"next"}');
    const kind = ${JSON.stringify(kind)};
    const plain = {message: {text:"old"}};
    if (kind === "plain") {
    assignJson(plain, "message", payload);
    assert.equal(Object.hasOwn(Object.prototype, "ftCodeqlPollution"), false);
    assert.deepEqual(plain.message, payload);
    }
    const tracker = track({message: {text:"old"}});
    const change = tracker.beginChange();
    assignJson(change.state, "message", payload);
    const prepared = change.prepare();
    assert.equal(Object.hasOwn(Object.prototype, "ftCodeqlPollution"), false);
    assert.deepEqual(prepared.value.message, payload);
    assert.deepEqual(apply({message:{text:"old"}}, prepared.ops), {message:payload});
    tracker.adopt(prepared);
    const next = tracker.beginChange();
    assignJson(next.state, "message", {text:"next plus", nested:[1,{text:"stream"}]});
    assert.deepEqual(next.prepare().value.message, {text:"next plus", nested:[1,{text:"stream"}]});
  `], { cwd: new URL("../../", import.meta.url), timeout: 1000, encoding: "utf8" });
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.status, 0, run.stderr);
});
