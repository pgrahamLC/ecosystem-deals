import assert from 'node:assert/strict';
import {copyFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

// The function file is plain JavaScript with a .ts name for Supabase. Copy it to .mjs so Node can load it.
const copy = join(mkdtempSync(join(tmpdir(), 'ask-deals-')), 'index.mjs');
copyFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), copy);
const {handle} = await import(pathToFileURL(copy).href);

const env = {ANTHROPIC_API_KEY: 'test-key', ASK_PASSCODE: 'open-sesame'};
const post = (body, origin) => new Request('https://example.test/ask-deals', {method: 'POST', headers: {'content-type': 'application/json', origin: origin || 'https://pgrahamlc.github.io'}, body: JSON.stringify(body)});
const never = async () => { throw new Error('the AI must not be called'); };

test('refuses a wrong or missing passcode before any AI call', async () => {
  assert.equal((await handle(post({question: 'hi', passcode: 'nope'}), env, never)).status, 401);
  assert.equal((await handle(post({question: 'hi'}), env, never)).status, 401);
});

test('says not configured when a secret is missing', async () => {
  assert.equal((await handle(post({question: 'hi', passcode: 'open-sesame'}), {ASK_PASSCODE: 'open-sesame'}, never)).status, 503);
});

test('answers the browser preflight and only echoes an allowed origin', async () => {
  const pre = await handle(new Request('https://example.test/ask-deals', {method: 'OPTIONS', headers: {origin: 'https://evil.example'}}), env, never);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://pgrahamlc.github.io');
});

test('sends the key only to the AI, caps the question and returns text with sources', async () => {
  let seen;
  const fake = async (url, init) => {
    seen = {url, init, body: JSON.parse(init.body)};
    return new Response(JSON.stringify({content: [
      {type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {query: 'x'}},
      {type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: []},
      {type: 'text', text: 'The rate is 4% — as of May.', citations: [{url: 'https://www.gov.uk/a', title: 'GOV.UK page'}, {url: 'javascript:alert(1)', title: 'bad'}]}
    ]}), {status: 200});
  };
  const out = await handle(post({question: 'q'.repeat(900), passcode: 'open-sesame'}), env, fake);
  const data = await out.json();
  assert.equal(out.status, 200);
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.init.headers['x-api-key'], 'test-key');
  assert.equal(seen.body.messages[0].content.length, 600);
  assert.equal(seen.body.tools[0].type, 'web_search_20250305');
  assert.equal(data.text, 'The rate is 4%, as of May.');
  assert.deepEqual(data.sources, [{title: 'GOV.UK page', url: 'https://www.gov.uk/a'}]);
  assert.doesNotMatch(JSON.stringify(data), /test-key|open-sesame/);
});

test('reports an AI failure without leaking detail', async () => {
  const out = await handle(post({question: 'hi', passcode: 'open-sesame'}), env, async () => new Response('{"error":"secret detail"}', {status: 500}));
  assert.equal(out.status, 502);
  assert.doesNotMatch(await out.text(), /secret detail/);
});
