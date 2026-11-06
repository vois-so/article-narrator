import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const path = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const player = readFileSync(path('player/article-narrator.js'), 'utf8');

test('player: no tracking, no storage and no requests of its own', () => {
  const code = player.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const api of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'document.cookie', 'localStorage',
    'sessionStorage', 'indexedDB', 'import(', 'new Image', 'navigator.userAgent', 'gtag', 'analytics']) {
    assert.ok(!code.includes(api), `the player must not use ${api}`);
  }
  assert.ok(!/https?:\/\//.test(code), 'the player loads nothing from a different site');
  assert.match(code, /preload = 'none'/);
});

test('player: labelled controls and keyboard support', () => {
  for (const label of ['Listen to this article', 'Play', 'Pause', 'Back 15 seconds', 'Forward 15 seconds', 'Position', 'Playback speed']) {
    assert.ok(player.includes(`'${label}'`), `label ${label}`);
  }
  for (const key of ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']) assert.ok(player.includes(key), key);
  assert.match(player, /aria-valuetext/);
  assert.match(player, /role="status"/);
  assert.match(player, /role="group"/);
});

test('player: valid JavaScript that also loads as a classic script', () => {
  const r = spawnSync(process.execPath, ['--check', path('player/article-narrator.js')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!/^\s*(import|export)\s/m.test(player));
});

test('player: the copy in the WordPress plugin is the same file', () => {
  assert.equal(readFileSync(path('recipes/wordpress/article-narrator-player/article-narrator.js'), 'utf8'), player);
});

const php = spawnSync('php', ['--version']).status === 0;

test('WordPress plugin: the shortcode', { skip: !php && 'php is not installed' }, () => {
  const lint = spawnSync('php', ['-l', path('recipes/wordpress/article-narrator-player/article-narrator-player.php')], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  const r = spawnSync('php', [path('test/fixtures/wp-harness.php')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.registered, true);
  assert.equal(out.slug_match, '<article-narrator src="https://example.com/uploads/hello-world.mp3" duration="183"><audio controls preload="none" src="https://example.com/uploads/hello-world.mp3"></audio></article-narrator>');
  assert.match(out.newest, /uploads\/new\.mp3" duration="60"/);
  assert.match(out.by_id, /interview\.mp3" duration="600" label="Listen &quot;now&quot;"/);
  assert.match(out.by_src, /^<article-narrator src="https:\/\/cdn\.example\.com\/a\.mp3">/);
  assert.equal(out.bad_src, '');
  assert.equal(out.no_audio, '');
  assert.deepEqual(out.enqueued, ['https://example.com/plugins/article-narrator-player/article-narrator.js']);
});
