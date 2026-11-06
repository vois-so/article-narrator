import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, plan } from '../src/build.mjs';
import { loadConfig } from '../src/posts.mjs';
import { encodeMp3, wavSeconds } from '../src/render.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const node = process.execPath;
const cli = { cmd: node, args: [join(here, 'fixtures', 'fake-vois-cli.mjs')] };
const ffmpeg = { cmd: node, args: [join(here, 'fixtures', 'fake-ffmpeg.mjs')] };
const quiet = () => {};
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function site(posts, config = {}) {
  const root = mkdtempSync(join(tmpdir(), 'article-narrator-test-'));
  dirs.push(root);
  mkdirSync(join(root, 'posts'), { recursive: true });
  for (const [name, text] of Object.entries(posts)) {
    mkdirSync(join(root, 'posts', name, '..'), { recursive: true });
    writeFileSync(join(root, 'posts', name), text);
  }
  writeFileSync(join(root, 'article-narrator.json'), JSON.stringify({ content: 'posts', out: 'public/narration', manifest: 'data/narration.json', ...config }));
  const log = join(root, 'calls.log');
  return { root, log, config: () => loadConfig(join(root, 'article-narrator.json')) };
}

function calls(log) {
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
}

function env(vars) {
  for (const k of Object.keys(process.env)) if (k.startsWith('FAKE_')) delete process.env[k];
  Object.assign(process.env, vars);
}

const POST_A = '---\ntitle: First post\n---\n\nThe first post has some text.\n\n```sh\necho code\n```\n';
const POST_B = '---\ntitle: Second post\n---\n\nThe second post has other text.\n';

test('first build renders all posts; second build renders nothing and writes nothing', async () => {
  const s = site({ 'a.md': POST_A, 'b.md': POST_B, 'nested/c/index.md': '# Bundle\n\nA bundle post.' });
  env({ FAKE_LOG: s.log });
  const first = await build(s.config(), { cli, ffmpeg, log: quiet });
  assert.deepEqual(first.rendered.map((r) => r.id), ['a', 'b', 'nested/c']);
  const manifestPath = join(s.root, 'data', 'narration.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.posts.a.src, `/narration/a.mp3?v=${manifest.posts.a.hash.slice(0, 8)}`);
  assert.equal(manifest.posts['nested/c'].src.split('?')[0], '/narration/nested/c.mp3');
  assert.equal(manifest.posts.a.title, 'First post');
  assert.ok(manifest.posts.a.duration > 0);
  assert.ok(existsSync(join(s.root, 'public', 'narration', 'nested', 'c.mp3')));
  assert.equal(calls(s.log).filter((c) => c.startsWith('generate')).length, 3);

  const before = readFileSync(manifestPath, 'utf8');
  const mtime = statSync(manifestPath).mtimeMs;
  const second = await build(s.config(), { cli, ffmpeg, log: quiet });
  assert.equal(second.rendered.length, 0);
  assert.deepEqual(second.unchanged, ['a', 'b', 'nested/c']);
  assert.equal(second.manifestWritten, false);
  assert.equal(readFileSync(manifestPath, 'utf8'), before);
  assert.equal(statSync(manifestPath).mtimeMs, mtime);
  assert.equal(calls(s.log).length, 4, 'the second build does not call vois-cli');
});

test('a change to code only does not render again; a change to the prose does', async () => {
  const s = site({ 'a.md': POST_A, 'b.md': POST_B });
  env({ FAKE_LOG: s.log });
  await build(s.config(), { cli, ffmpeg, log: quiet });
  writeFileSync(join(s.root, 'posts', 'a.md'), POST_A.replace('echo code', 'echo other code'));
  assert.equal((await build(s.config(), { cli, ffmpeg, log: quiet })).rendered.length, 0);
  writeFileSync(join(s.root, 'posts', 'b.md'), POST_B.replace('other text', 'new text'));
  const r = await build(s.config(), { cli, ffmpeg, log: quiet });
  assert.deepEqual(r.rendered.map((x) => x.id), ['b']);
  assert.deepEqual(r.unchanged, ['a']);
});

test('a change to the voice renders all posts again; --force and --only', async () => {
  const s = site({ 'a.md': POST_A, 'b.md': POST_B });
  env({ FAKE_LOG: s.log });
  await build(s.config(), { cli, ffmpeg, log: quiet });
  const c = s.config();
  c.voice = 'sonic_ember';
  assert.equal((await build(c, { cli, ffmpeg, log: quiet })).rendered.length, 2);
  const forced = await build(s.config(), { cli, ffmpeg, log: quiet, force: true, only: ['a'] });
  assert.deepEqual(forced.rendered.map((x) => x.id), ['a']);
  assert.deepEqual(forced.skipped, [{ id: 'b', reason: 'held' }]);
});

test('drafts, narrate: false and posts that were deleted', async () => {
  const s = site({ 'a.md': POST_A, 'b.md': POST_B, 'draft.md': '---\ntitle: D\ndraft: true\n---\nText.', 'off.md': '---\ntitle: O\nnarrate: false\n---\nText.', '_hidden.md': 'Text.' });
  env({ FAKE_LOG: s.log });
  const r = await build(s.config(), { cli, ffmpeg, log: quiet });
  assert.deepEqual(r.rendered.map((x) => x.id), ['a', 'b']);
  assert.deepEqual(r.skipped, [{ id: 'draft', reason: 'draft' }, { id: 'off', reason: 'off' }]);
  rmSync(join(s.root, 'posts', 'b.md'));
  const kept = await build(s.config(), { cli, ffmpeg, log: quiet });
  assert.deepEqual(kept.orphans, ['b']);
  assert.ok(existsSync(join(s.root, 'public', 'narration', 'b.mp3')), 'without --prune the file stays');
  const pruned = await build(s.config(), { cli, ffmpeg, log: quiet, prune: true });
  assert.deepEqual(pruned.pruned, ['b']);
  assert.ok(!existsSync(join(s.root, 'public', 'narration', 'b.mp3')));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(s.root, 'data', 'narration.json'), 'utf8')).posts), ['a']);
});

test('the engine limit makes smaller parts', async () => {
  const long = `---\ntitle: Long\n---\n\n${Array.from({ length: 12 }, (_, i) => `Paragraph ${i} has a number of short sentences. It goes on for a while. Then it stops.`).join('\n\n')}`;
  const s = site({ 'long.md': long });
  env({ FAKE_LOG: s.log, FAKE_LIMIT: '400' });
  const r = await build(s.config(), { cli, ffmpeg, log: quiet });
  assert.equal(r.rendered.length, 1);
  assert.ok(r.rendered[0].parts > 1);
  const sizes = calls(s.log).filter((c) => c.startsWith('generate')).map((c) => JSON.parse(c.slice(9)).chars);
  assert.ok(sizes.slice(1).every((n) => n <= 400), `parts after the first error: ${sizes}`);
});

test('export credits: stop without --use-credits, then use them', async () => {
  const s = site({ 'a.md': POST_A });
  env({ FAKE_LOG: s.log, FAKE_ACCESS: 'metered', FAKE_CREDITS: '5' });
  await assert.rejects(build(s.config(), { cli, ffmpeg, log: quiet }), (e) => e.code === 7 && /--use-credits/.test(e.message));
  assert.equal(calls(s.log).filter((c) => c.startsWith('generate')).length, 0);
  env({ FAKE_LOG: s.log, FAKE_ACCESS: 'metered', FAKE_CREDITS: '0' });
  await assert.rejects(build(s.config(), { cli, ffmpeg, log: quiet, useCredits: true }), (e) => e.code === 8);
  env({ FAKE_LOG: s.log, FAKE_ACCESS: 'metered', FAKE_CREDITS: '5' });
  const notes = [];
  const r = await build(s.config(), { cli, ffmpeg, log: (m) => notes.push(m), useCredits: true });
  assert.equal(r.rendered.length, 1);
  assert.ok(notes.some((n) => /commercial site must have the Vois Studio Pro plan/.test(n)));
});

test('--if-available stops without an error when Vois Studio is not open', async () => {
  const s = site({ 'a.md': POST_A });
  env({ FAKE_LOG: s.log, FAKE_STATUS_EXIT: '2' });
  await assert.rejects(build(s.config(), { cli, ffmpeg, log: quiet }), (e) => e.code === 2);
  const r = await build(s.config(), { cli, ffmpeg, log: quiet, ifAvailable: true });
  assert.match(r.stopped, /not open/);
  assert.equal(r.rendered.length, 0);
});

test('a failed generation gives the vois-cli exit code and keeps the posts before it', async () => {
  const s = site({ 'a.md': POST_A });
  env({ FAKE_LOG: s.log, FAKE_FAIL: '4' });
  await assert.rejects(build(s.config(), { cli, ffmpeg, log: quiet }), (e) => e.code === 4 && /voice/.test(e.message));
});

test('the settings file is the only source of the voice', async () => {
  const s = site({ 'a.md': POST_A });
  env({ FAKE_LOG: s.log });
  process.env.VOIS_VOICE = 'some_other_voice';
  try {
    await build(s.config(), { cli, ffmpeg, log: quiet });
  } finally {
    delete process.env.VOIS_VOICE;
  }
  const call = JSON.parse(calls(s.log).find((c) => c.startsWith('generate')).slice(9));
  assert.deepEqual(call, { engine: 'sonic', voice: 'sonic_cedar', language: 'English', chars: call.chars, voisVoice: null });
});

test('settings errors', () => {
  const s = site({ 'a.md': POST_A }, { engine: 'expressive' });
  assert.throws(() => s.config(), (e) => e.code === 3 && /voice/.test(e.message));
  const t = site({ 'a.md': POST_A }, { colour: 'red' });
  assert.throws(() => t.config(), (e) => e.code === 3 && /colour/.test(e.message));
  const u = site({ 'a.md': POST_A, 'a.mdx': POST_B });
  return assert.rejects(plan(u.config()), (e) => e.code === 3 && /Two posts/.test(e.message));
});

test('WordPress: reads published posts from the REST API', async () => {
  const pages = {
    1: [
      { id: 7, slug: 'hello-world', link: 'https://x/hello-world/', status: 'publish', title: { rendered: 'Hello &amp; welcome' }, content: { rendered: '<p>Some text.</p><pre><code>x</code></pre>', protected: false } },
      { id: 8, slug: 'secret', status: 'publish', title: { rendered: 'Secret' }, content: { rendered: '', protected: true } },
    ],
    2: [{ id: 9, slug: 'second', status: 'publish', title: { rendered: 'Second' }, content: { rendered: '<p>More text.</p>', protected: false } }],
  };
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.url);
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/wp-json/wp/v2/posts')) {
      res.writeHead(404).end();
      return;
    }
    const page = Number(url.searchParams.get('page'));
    res.writeHead(200, { 'content-type': 'application/json', 'x-wp-totalpages': '2' }).end(JSON.stringify(pages[page] || []));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const root = mkdtempSync(join(tmpdir(), 'article-narrator-wp-'));
    dirs.push(root);
    writeFileSync(join(root, 'article-narrator.json'), JSON.stringify({ wordpress: `http://127.0.0.1:${server.address().port}`, out: 'narration' }));
    env({ FAKE_LOG: join(root, 'calls.log') });
    const r = await build(loadConfig(join(root, 'article-narrator.json')), { cli, ffmpeg, log: quiet });
    assert.deepEqual(r.rendered.map((x) => x.id), ['hello-world', 'second']);
    const m = JSON.parse(readFileSync(join(root, 'narration', 'narration.json'), 'utf8'));
    assert.equal(m.posts['hello-world'].title, 'Hello & welcome');
    assert.ok(existsSync(join(root, 'narration', 'hello-world.mp3')));
    assert.equal(seen.length, 2);
    assert.ok(seen.every((u) => u.includes('per_page=100')));
  } finally {
    server.close();
  }
});

const ffmpegPath = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0 ? 'ffmpeg' : null;

test('real ffmpeg: joins WAV parts into one MP3 file', { skip: !ffmpegPath && 'ffmpeg is not installed' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'article-narrator-ff-'));
  dirs.push(root);
  const wavs = [];
  for (let i = 0; i < 2; i++) {
    const wav = join(root, `p${i}.wav`);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${300 + i * 100}:duration=1.5:sample_rate=24000`, '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    assert.equal(r.status, 0);
    wavs.push(wav);
  }
  assert.ok(Math.abs(wavSeconds(wavs[0]) - 1.5) < 0.01);
  const out = join(root, 'out', 'post.mp3');
  const bytes = await encodeMp3('ffmpeg', wavs, out, { title: 'A post' });
  assert.ok(bytes > 1000);
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', out], { encoding: 'utf8' }).stderr;
  assert.match(probe, /Audio: mp3\b.*24000 Hz, mono/);
  assert.match(probe, /title\s*: A post/);
  const dur = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  assert.ok(Math.abs(Number(dur[3]) - 3) < 0.2, `duration ${dur[0]}`);
});
