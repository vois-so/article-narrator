#!/usr/bin/env node
// article-narrator: "listen to this article" for blogs and documentation sites.
// A build step on your computer speaks new and changed posts with Vois Studio
// through vois-cli and writes MP3 files and a manifest for the player.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio. https://github.com/vois-so/article-narrator

import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, plan, spokenFor } from './src/build.mjs';
import { readHtml } from './src/html.mjs';
import { readMarkdown } from './src/markdown.mjs';
import { CONFIG_FILE, DEFAULTS, NarratorError, loadConfig } from './src/posts.mjs';
import { onInterrupt } from './src/render.mjs';
import { toSpoken } from './src/spoken.mjs';

const VERSION = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')).version;

const HELP = `article-narrator ${VERSION}: "listen to this article" with Vois Studio

Usage:
  article-narrator build [options]     Speak the new and changed posts. Write MP3 files and the manifest.
  article-narrator status [options]    Show the state of each post. Vois Studio is not necessary.
  article-narrator text <file|id>      Show the spoken text of one post. Vois Studio is not necessary.

Options:
  --config <file>     The settings file (default: ${CONFIG_FILE}).
  --only <id,...>     Render only these posts.
  --force             Render the posts again, also if they did not change.
  --dry-run           Show what the build will do. Do not render.
  --prune             Delete the MP3 files of posts that do not exist now.
  --use-credits       Permit the build to use export credits (Free plan).
  --if-available      Stop without an error if vois-cli is not found or Vois Studio is not open.
  --json              Write the result as JSON.
  -h, --help          Show this help.
  -v, --version       Show the version.

Audio files from vois-cli need a paid Vois Studio plan or export credits.
A commercial site needs Pro. See https://vois.so/pricing`;

function parseArgs(argv) {
  const out = { _: [] };
  const flags = new Set(['force', 'dry-run', 'prune', 'use-credits', 'if-available', 'json', 'help', 'version']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') out.help = true;
    else if (a === '-v') out.version = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = a.slice(2, eq < 0 ? undefined : eq);
      if (flags.has(key)) out[key] = true;
      else if (['config', 'only', 'language'].includes(key)) {
        const v = eq >= 0 ? a.slice(eq + 1) : argv[++i];
        if (v === undefined) throw new NarratorError(`--${key} needs a value.`, 3);
        out[key] = v;
      } else throw new NarratorError(`Unknown option ${a}. Type article-narrator --help.`, 3);
    } else out._.push(a);
  }
  return out;
}

const log = (s) => process.stderr.write(`${s}\n`);

function report(summary, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (summary.stopped) log(summary.stopped);
  for (const s of summary.skipped) {
    const why = { off: 'narrate is false', draft: 'draft', empty: 'no text to speak', held: 'not in --only' }[s.reason];
    log(`Skipped: ${s.id} (${why})`);
  }
  if (summary.orphans.length && !summary.pruned.length) {
    log(`${summary.orphans.length} MP3 file(s) have no post now: ${summary.orphans.join(', ')}. To delete them, add --prune.`);
  }
  for (const id of summary.pruned) log(`Deleted: ${id}`);
  if (summary.dryRun) {
    process.stdout.write(`article-narrator: ${summary.posts} post(s), ${summary.todo.length} to render, ${summary.unchanged.length} unchanged. Dry run: nothing was rendered.\n`);
    return;
  }
  const parts = [`${summary.posts} post(s)`, `${summary.rendered.length} rendered`, `${summary.unchanged.length} unchanged`];
  if (summary.skipped.length) parts.push(`${summary.skipped.length} skipped`);
  process.stdout.write(`article-narrator: ${parts.join(', ')}.${summary.manifestWritten ? '' : ' The manifest did not change.'}\n`);
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const cmd = args._[0];
  if (args.help || !cmd) {
    process.stdout.write(`${HELP}\n`);
    return cmd || args.help ? 0 : 3;
  }

  if (cmd === 'text') {
    const target = args._[1];
    if (!target) throw new NarratorError('Give a file or a post ID: article-narrator text <file|id>', 3);
    const haveConfig = args.config || existsSync(resolve(CONFIG_FILE));
    const settings = haveConfig ? loadConfig(args.config) : { ...DEFAULTS };
    if (args.language) settings.language = args.language;
    if (existsSync(target)) {
      const ext = extname(target).toLowerCase();
      const src = readFileSync(target, 'utf8');
      const doc = ext === '.html' || ext === '.htm' ? readHtml(src) : readMarkdown(src, { mdx: ext === '.mdx' });
      process.stdout.write(`${toSpoken(doc, { ...settings, mdx: ext === '.mdx' }).text}\n`);
      return 0;
    }
    if (!haveConfig) throw new NarratorError(`${target} is not a file, and there is no ${CONFIG_FILE} to find a post ID.`, 3);
    const { items } = await plan(settings);
    const item = items.find((i) => i.id === target);
    if (!item) throw new NarratorError(`No post has the ID "${target}".`, 4);
    process.stdout.write(`${spokenFor(item.post, settings).text}\n`);
    return 0;
  }

  if (cmd === 'status') {
    const c = loadConfig(args.config);
    const { items, orphans } = await plan(c, { force: args.force });
    if (args.json) {
      const rows = items.map(({ id, state, source, characters, parts }) => ({ id, state, source, characters, parts }));
      process.stdout.write(`${JSON.stringify({ posts: rows, orphans }, null, 2)}\n`);
      return 0;
    }
    for (const i of items) {
      const size = i.characters ? `  ${i.characters} characters, ${i.parts} part(s)` : '';
      process.stdout.write(`${i.state.padEnd(10)} ${i.id}${size}\n`);
    }
    for (const id of orphans) process.stdout.write(`${'no post'.padEnd(10)} ${id}\n`);
    return 0;
  }

  if (cmd === 'build') {
    const c = loadConfig(args.config);
    const only = args.only ? args.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
    process.on('SIGINT', onInterrupt);
    const summary = await build(c, {
      only, force: args.force, dryRun: args['dry-run'], prune: args.prune,
      useCredits: args['use-credits'], ifAvailable: args['if-available'], log,
    });
    if (args['dry-run'] && !args.json) {
      for (const t of summary.todo) log(`Will render: ${t.id} (${t.state}, ${t.characters} characters, ${t.parts} part(s))`);
    }
    report(summary, args.json);
    return 0;
  }

  throw new NarratorError(`Unknown command "${cmd}". Type article-narrator --help.`, 3);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    if (err instanceof NarratorError) {
      log(`article-narrator: ${err.message}`);
      process.exitCode = err.code;
    } else {
      log(`article-narrator: ${err.stack || err}`);
      process.exitCode = 1;
    }
  },
);
