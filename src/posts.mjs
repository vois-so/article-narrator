// posts.mjs: reads the settings file and finds the posts to narrate, from
// Markdown, MDX or HTML files, or from the public REST API of a WordPress site.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { readHtml } from './html.mjs';
import { readMarkdown } from './markdown.mjs';
import { decodeEntities } from './spoken.mjs';

export class NarratorError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

export const CONFIG_FILE = 'article-narrator.json';

export const DEFAULTS = {
  content: null,
  include: ['**/*.md', '**/*.mdx', '**/*.markdown', '**/*.html'],
  exclude: ['**/_*', '**/node_modules/**'],
  wordpress: null,
  out: 'narration',
  url: '/narration',
  manifest: null,
  engine: 'sonic',
  voice: null,
  language: 'English',
  speed: 1,
  instruct: '',
  bitrate: '64k',
  loudness: -16,
  maxChars: 1900,
  readTitle: true,
  headings: false,
  intro: '',
  outro: '',
  replace: {},
  drafts: false,
};

const ENGINES = ['fast', 'expressive', 'multilingual', 'omni', 'sonic', 'craft'];

/** Reads the settings file. Paths in it are relative to the folder of the file. */
export function loadConfig(file, overrides = {}) {
  const path = resolve(file || CONFIG_FILE);
  let raw = {};
  if (existsSync(path)) {
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      throw new NarratorError(`${path} is not valid JSON: ${err.message}`, 3);
    }
  } else if (file) {
    throw new NarratorError(`The settings file ${path} does not exist.`, 3);
  }
  const known = new Set([...Object.keys(DEFAULTS), 'notices', 'linkText', 'codeText', 'pathText', '$schema']);
  const unknown = Object.keys(raw).filter((k) => !known.has(k));
  if (unknown.length) throw new NarratorError(`Unknown setting in ${basename(path)}: ${unknown.join(', ')}.`, 3);
  const c = { ...DEFAULTS, ...raw, ...overrides };
  c.root = dirname(path);
  c.configPath = path;
  if (typeof c.wordpress === 'string') c.wordpress = { site: c.wordpress };
  if (!c.content && !c.wordpress) {
    throw new NarratorError(`Set "content" (the folder with your posts) or "wordpress" (your site address) in ${basename(path)}.`, 3);
  }
  c.engine = String(c.engine).toLowerCase();
  if (!ENGINES.includes(c.engine)) throw new NarratorError(`"engine" must be one of: ${ENGINES.join(', ')}.`, 3);
  if (!c.voice) {
    if (c.engine !== 'sonic') throw new NarratorError(`Set "voice" for the ${c.engine} engine. To see the voices, type: vois-cli voice list --engine ${c.engine}`, 3);
    c.voice = 'sonic_cedar';
  }
  c.speed = Number(c.speed);
  if (!(c.speed >= 0.5 && c.speed <= 2)) throw new NarratorError('"speed" must be from 0.5 to 2.', 3);
  c.maxChars = Number(c.maxChars);
  if (!(c.maxChars >= 200)) throw new NarratorError('"maxChars" must be 200 or more.', 3);
  if (!/^\d{2,3}k$/.test(String(c.bitrate))) throw new NarratorError('"bitrate" must be like "64k".', 3);
  if (c.loudness !== false && !(Number(c.loudness) >= -40 && Number(c.loudness) <= -5)) {
    throw new NarratorError('"loudness" must be from -40 to -5 (LUFS), or false.', 3);
  }
  c.contentDir = c.content ? resolve(c.root, c.content) : null;
  c.outDir = resolve(c.root, c.out);
  c.manifestPath = resolve(c.root, c.manifest || join(c.out, 'narration.json'));
  c.url = String(c.url || '').replace(/\/+$/, '');
  return c;
}

/** Changes a glob pattern into a regular expression. Supports **, *, ? and {a,b}. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slash = glob[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) {
        re += '\\{';
        continue;
      }
      re += `(?:${glob.slice(i + 1, end).split(',').map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.isFile()) out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

/** The post ID: the path in the content folder, without the extension and "/index". */
export function postId(rel) {
  let id = rel.slice(0, rel.length - extname(rel).length);
  if (/(^|\/)index$/.test(id) && id !== 'index') id = id.replace(/\/index$/, '');
  return id;
}

function readFilePost(c, rel) {
  const file = join(c.contentDir, rel);
  const text = readFileSync(file, 'utf8');
  const ext = extname(rel).toLowerCase();
  const doc = ext === '.html' || ext === '.htm' ? readHtml(text) : readMarkdown(text, { mdx: ext === '.mdx' });
  const id = postId(rel);
  return {
    id,
    path: rel,
    source: relative(c.root, file).split(sep).join('/'),
    title: doc.title || basename(id),
    blocks: doc.blocks,
    mdx: ext === '.mdx',
    draft: doc.data.draft === true || doc.data.published === false,
    narrate: doc.data.narrate !== false && doc.data.narration !== false,
  };
}

/** Finds the posts in the content folder. */
export function filePosts(c) {
  if (!existsSync(c.contentDir)) throw new NarratorError(`The content folder ${c.contentDir} does not exist.`, 3);
  const include = [].concat(c.include).map(globToRegExp);
  const exclude = [].concat(c.exclude || []).map(globToRegExp);
  const files = walk(c.contentDir)
    .filter((rel) => include.some((r) => r.test(rel)) && !exclude.some((r) => r.test(rel)))
    .sort();
  return files.map((rel) => readFilePost(c, rel));
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'article-narrator' } });
  } catch (err) {
    throw new NarratorError(`Cannot connect to ${new URL(url).origin}: ${err.cause?.message || err.message}`, 1);
  }
  return res;
}

/**
 * Gets the published posts from the WordPress REST API. It reads only public
 * data and sends nothing to the site.
 */
export async function wordpressPosts(c) {
  const site = String(c.wordpress.site || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(site)) throw new NarratorError('"wordpress.site" must start with https:// or http://.', 3);
  const type = c.wordpress.type || 'posts';
  if (!/^[a-z0-9_-]+$/i.test(type)) throw new NarratorError('"wordpress.type" must be a REST route name, for example "posts" or "pages".', 3);
  const fields = 'id,slug,link,title,content,status';
  const urls = [
    (page) => `${site}/wp-json/wp/v2/${type}?per_page=100&page=${page}&_fields=${fields}`,
    (page) => `${site}/?rest_route=/wp/v2/${type}&per_page=100&page=${page}&_fields=${fields}`,
  ];
  const posts = [];
  let make = urls[0];
  for (let page = 1; ; page++) {
    let res = await getJson(make(page));
    if (page === 1 && res.status === 404) {
      make = urls[1];
      res = await getJson(make(page));
    }
    if (res.status === 400 && page > 1) break;
    if (!res.ok) throw new NarratorError(`${site} gave HTTP ${res.status} for the ${type} list. Check "wordpress.site".`, 1);
    let items;
    try {
      items = await res.json();
    } catch {
      throw new NarratorError(`${site} did not give JSON. Check that the REST API is on.`, 1);
    }
    if (!Array.isArray(items)) throw new NarratorError(`${site} did not give a list of ${type}.`, 1);
    for (const it of items) {
      if (it.content?.protected || (it.status && it.status !== 'publish')) continue;
      const doc = readHtml(it.content?.rendered || '', { fragment: true });
      const title = decodeEntities(String(it.title?.rendered || '').replace(/<[^>]+>/g, '')).trim();
      posts.push({
        id: it.slug || String(it.id),
        path: it.link || `${site}/?p=${it.id}`,
        source: it.link || `${site}/?p=${it.id}`,
        wordpressId: it.id,
        title: title || doc.title || it.slug,
        blocks: doc.blocks,
        mdx: false,
        draft: false,
        narrate: true,
      });
    }
    const total = Number(res.headers.get('x-wp-totalpages') || 1);
    if (page >= total || items.length === 0) break;
  }
  return posts;
}

/** All posts from the source in the settings, sorted by ID. Two posts cannot have the same ID. */
export async function findPosts(c) {
  const posts = c.wordpress ? await wordpressPosts(c) : filePosts(c);
  const seen = new Map();
  for (const p of posts) {
    if (seen.has(p.id)) throw new NarratorError(`Two posts have the ID "${p.id}": ${seen.get(p.id)} and ${p.source}. Rename one.`, 3);
    seen.set(p.id, p.source);
  }
  return posts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
