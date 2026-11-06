// build.mjs: finds the new and changed posts, speaks them with Vois Studio
// and keeps the manifest. A post whose spoken text and voice settings did not
// change keeps its MP3 file: the build does not render it again.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NarratorError, findPosts } from './posts.mjs';
import { LimitError, encodeMp3, findCli, preflight, renderPart, wavSeconds } from './render.mjs';
import { chunk, toSpoken } from './spoken.mjs';

/** Change this number when a change to the spoken rules must render all posts again. */
export const FORMAT = 1;

/** The settings that change the audio. A change to one of them renders the post again. */
const AUDIO_SETTINGS = ['engine', 'voice', 'language', 'speed', 'instruct', 'bitrate', 'loudness', 'maxChars'];

export function spokenFor(post, c) {
  return toSpoken({ title: post.title, blocks: post.blocks }, { ...c, mdx: post.mdx });
}

export function hashFor(text, c) {
  const data = { format: FORMAT, text };
  for (const k of AUDIO_SETTINGS) data[k] = c[k];
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export function mp3Path(c, id) {
  return `${join(c.outDir, ...id.split('/'))}.mp3`;
}

export function readManifest(path) {
  if (!existsSync(path)) return { generator: 'article-narrator', version: 1, posts: {} };
  try {
    const m = JSON.parse(readFileSync(path, 'utf8'));
    if (!m || typeof m.posts !== 'object') throw new Error('no "posts" object');
    return m;
  } catch (err) {
    throw new NarratorError(`The manifest ${path} is not valid: ${err.message}. Delete it to start again.`, 3);
  }
}

/** Writes the manifest only if its text changed. Returns true if it wrote the file. */
export function writeManifest(path, manifest) {
  const posts = {};
  for (const id of Object.keys(manifest.posts).sort()) posts[id] = manifest.posts[id];
  const text = `${JSON.stringify({ generator: 'article-narrator', version: 1, posts }, null, 2)}\n`;
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
  return true;
}

/** Finds the state of each post. Does not need Vois Studio. */
export async function plan(c, { only = null, force = false } = {}) {
  const posts = await findPosts(c);
  const manifest = readManifest(c.manifestPath);
  const items = [];
  for (const post of posts) {
    const item = { id: post.id, source: post.source, title: post.title, post };
    items.push(item);
    if (!post.narrate) {
      item.state = 'off';
      continue;
    }
    if (post.draft && !c.drafts) {
      item.state = 'draft';
      continue;
    }
    const spoken = spokenFor(post, c);
    item.spoken = spoken;
    item.characters = spoken.text.length;
    if (!spoken.text.trim()) {
      item.state = 'empty';
      continue;
    }
    item.hash = hashFor(spoken.text, c);
    item.parts = chunk(spoken.paragraphs, c.maxChars).length;
    const old = manifest.posts[post.id];
    const file = mp3Path(c, post.id);
    if (!force && old && old.hash === item.hash && existsSync(file)) item.state = 'unchanged';
    else item.state = old ? 'changed' : 'new';
    if (only && !only.includes(post.id) && item.state !== 'unchanged') item.state = 'held';
  }
  const live = new Set(items.filter((i) => i.hash).map((i) => i.id));
  const orphans = Object.keys(manifest.posts).filter((id) => !live.has(id));
  return { items, manifest, orphans };
}

async function renderPost(item, c, tools, log) {
  let max = c.maxChars;
  for (let attempt = 1; ; attempt++) {
    const parts = chunk(item.spoken.paragraphs, max);
    const tmp = mkdtempSync(join(tmpdir(), 'article-narrator-'));
    try {
      const wavs = [];
      for (let i = 0; i < parts.length; i++) {
        const wav = join(tmp, `part-${String(i + 1).padStart(3, '0')}.wav`);
        log(`  part ${i + 1} of ${parts.length} (${parts[i].length} characters)`);
        await renderPart(tools.cli, parts[i], wav, c);
        wavs.push(wav);
      }
      const duration = wavs.reduce((s, w) => s + wavSeconds(w), 0);
      const bytes = await encodeMp3(tools.ffmpeg, wavs, mp3Path(c, item.id), { bitrate: c.bitrate, loudness: c.loudness, title: item.title });
      return { parts: parts.length, duration, bytes };
    } catch (err) {
      if (err instanceof LimitError && attempt === 1 && err.limit < max) {
        max = Math.max(200, err.limit - 50);
        log(`  The ${c.engine} engine accepts ${err.limit} characters at a time. Trying again with smaller parts.`);
        continue;
      }
      throw err;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

function entryFor(item, c, result) {
  const path = item.id.split('/').map(encodeURIComponent).join('/');
  return {
    title: item.title,
    src: `${c.url}/${path}.mp3?v=${item.hash.slice(0, 8)}`,
    file: `${item.id}.mp3`,
    duration: Math.round(result.duration * 10) / 10,
    bytes: result.bytes,
    hash: item.hash,
    source: item.source,
    engine: c.engine,
    voice: c.voice,
    language: c.language,
    parts: result.parts,
    characters: item.characters,
  };
}

/**
 * Renders the new and changed posts. Returns a summary.
 * opts: only, force, dryRun, prune, useCredits, ifAvailable, cli, ffmpeg, log.
 */
export async function build(c, opts = {}) {
  const log = opts.log || ((s) => process.stderr.write(`${s}\n`));
  const { items, manifest, orphans } = await plan(c, opts);
  const todo = items.filter((i) => i.state === 'new' || i.state === 'changed');
  const summary = {
    posts: items.length,
    rendered: [],
    unchanged: items.filter((i) => i.state === 'unchanged').map((i) => i.id),
    skipped: items.filter((i) => ['off', 'draft', 'empty', 'held'].includes(i.state)).map((i) => ({ id: i.id, reason: i.state })),
    todo: todo.map((i) => ({ id: i.id, state: i.state, characters: i.characters, parts: i.parts })),
    orphans,
    pruned: [],
    manifestWritten: false,
    stopped: null,
  };

  if (opts.dryRun) return { ...summary, dryRun: true };

  if (todo.length) {
    const cliPath = opts.cli || findCli(opts.cliPath);
    if (!cliPath) {
      if (opts.ifAvailable) {
        summary.stopped = 'vois-cli was not found. No posts were rendered.';
        return summary;
      }
      throw new NarratorError('vois-cli was not found. Install Vois Studio from https://vois.so, or set VOIS_CLI to the path of vois-cli.', 2);
    }
    let status;
    try {
      status = await preflight(cliPath);
    } catch (err) {
      if (opts.ifAvailable && err.code === 2) {
        summary.stopped = 'Vois Studio is not open. No posts were rendered.';
        return summary;
      }
      throw err;
    }
    if (status.entitlement_tier && status.entitlement_tier !== 'pro') {
      log('Note: a commercial site must have the Vois Studio Pro plan.');
    }
    const parts = todo.reduce((s, i) => s + i.parts, 0);
    if (status.metered) {
      const msg = `This build makes ${parts} audio part(s). On export credits, each part uses one credit. Your balance is ${status.credit_balance ?? 0}.`;
      if (!opts.useCredits) throw new NarratorError(`${msg} To continue, type the command again with --use-credits.`, 7);
      if (Number(status.credit_balance ?? 0) < parts) throw new NarratorError(`${msg} Buy more credits at ${status.purchase_url || 'https://vois.so/pricing'}`, 8);
      log(msg);
    }
    const tools = { cli: cliPath, ffmpeg: opts.ffmpeg || process.env.FFMPEG || 'ffmpeg' };
    for (const item of todo) {
      log(`${item.state === 'new' ? 'New' : 'Changed'}: ${item.id} (${item.characters} characters)`);
      const result = await renderPost(item, c, tools, log);
      manifest.posts[item.id] = entryFor(item, c, result);
      summary.manifestWritten = writeManifest(c.manifestPath, manifest) || summary.manifestWritten;
      summary.rendered.push({ id: item.id, duration: manifest.posts[item.id].duration, bytes: result.bytes, parts: result.parts });
      log(`  ${manifest.posts[item.id].duration} seconds, ${Math.round(result.bytes / 1024)} KB`);
    }
  }

  if (opts.prune) {
    for (const id of orphans) {
      rmSync(mp3Path(c, id), { force: true });
      delete manifest.posts[id];
      summary.pruned.push(id);
    }
  }
  summary.manifestWritten = writeManifest(c.manifestPath, manifest) || summary.manifestWritten;
  return summary;
}
