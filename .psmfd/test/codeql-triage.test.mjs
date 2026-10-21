import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// Pi #83 alerts 89/90: all interpolated page fields cross the real shared escaper.
test("OAuth pages and the callback route escape reflected HTML", () => {
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { oauthErrorHtml, oauthSuccessHtml } from "./packages/ai/src/utils/oauth-page.ts";
    import { startOAuthCallbackServer } from "./packages/ai/src/auth/oauth/callback-server.ts";
    const payload = '<img src=x onerror=alert(1)><SCRIPT>malicious</SCRIPT>&"';
    for (const body of [oauthSuccessHtml(payload), oauthErrorHtml(payload, payload)]) {
      assert.equal(body.includes(payload), false);
      assert.equal(body.includes('<img'), false);
      assert.equal(body.includes('<SCRIPT>'), false);
      assert.ok(body.includes('&lt;img'));
      assert.ok(body.includes('&amp;'));
      assert.ok(body.includes('&quot;'));
    }
    const server = await startOAuthCallbackServer({providerName: "Test", host:"127.0.0.1", port:0,
      path:"/callback", state:"expected", complete:async code=>code});
    try {
      const url = new URL(server.redirectUri);
      url.searchParams.set('state','expected');
      url.searchParams.set('error','denied');
      url.searchParams.set('error_description',payload);
      const response = await fetch(url);
      const body = await response.text();
      assert.equal(response.status,400);
      assert.equal(body.includes(payload),false);
      assert.ok(body.includes('&lt;SCRIPT&gt;'));
      await assert.rejects(server.wait(), /authorization failed/);
    } finally { server.close(); }
  `], {cwd: new URL("../../", import.meta.url), timeout:4000, encoding:"utf8"});
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.status,0,run.stderr);
});
