// html.mjs: reads the HTML of a post (a static page, or WordPress content) and
// gives the same blocks as markdown.mjs. It reads only the text that a
// listener can follow. Code, tables, figures, forms and scripts are skipped.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio

import { decodeEntities } from './spoken.mjs';

// Elements that the narration does not read, with all their content.
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'iframe', 'object', 'embed',
  'video', 'audio', 'canvas', 'form', 'button', 'select', 'textarea', 'input', 'nav', 'figure', 'picture',
  'img', 'aside', 'footer', 'article-narrator', 'sup', 'head', 'title', 'dialog']);
const NOTICE = { pre: 'code', table: 'table' };
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'blockquote', 'dd', 'dt', 'dl', 'details', 'summary',
  'body', 'html', 'center', 'address', 'hgroup', 'figcaption', 'caption', 'td', 'th', 'tr']);

function attrs(raw) {
  const out = {};
  for (const m of raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/** Splits HTML into tags and text. */
function* tokens(html) {
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  for (const m of html.matchAll(re)) {
    if (m.index > last) yield { text: html.slice(last, m.index) };
    last = m.index + m[0].length;
    if (m[0].startsWith('<!--')) {
      const c = m[0].slice(4, -3).trim().toLowerCase().replace(/\s+/g, '');
      if (c === 'narrator:off' || c === 'narrator:on') yield { comment: c };
      continue;
    }
    if (!m[2]) continue;
    yield { tag: m[2].toLowerCase(), close: m[1] === '/', self: /\/\s*$/.test(m[3]), attrs: attrs(m[3] || '') };
  }
  if (last < html.length) yield { text: html.slice(last) };
}

/** Selects the main content: <article>, then <main>, then <body>. */
export function mainContent(html) {
  for (const tag of ['article', 'main', 'body']) {
    const open = html.search(new RegExp(`<${tag}\\b`, 'i'));
    if (open < 0) continue;
    const start = html.indexOf('>', open) + 1;
    const end = html.search(new RegExp(`</${tag}\\s*>`, 'i'));
    return end > start ? html.slice(start, end) : html.slice(start);
  }
  return html;
}

/**
 * Parses HTML into blocks. Inline <code> stays as `code` so that the spoken
 * rules can decide how to read it. An element with data-narrator="off", or
 * the text between <!-- narrator:off --> and <!-- narrator:on -->, is skipped.
 */
export function parseHtml(html) {
  const blocks = [];
  const lists = []; // open <ul> and <ol>: {ordered, items, openItem}
  let text = '';
  let skipDepth = 0;
  let skipTag = null;
  let off = false;
  let inCode = 0;
  let item = null; // the open <li>: {text, level, added}
  let heading = null;

  const flushText = () => {
    const t = text.replace(/\s+/g, ' ').trim();
    text = '';
    if (!t) return;
    if (item) item.text += (item.text ? ' ' : '') + t;
    else blocks.push({ type: 'paragraph', text: t });
  };
  const closeItem = () => {
    flushText();
    if (item && !item.added && item.text.trim() && lists.length) {
      lists[lists.length - 1].items.push(item);
      item.added = true;
    }
    item = null;
  };
  const toBlock = (it) => ({ text: it.text, level: it.level });

  for (const tok of tokens(html)) {
    if (tok.comment) {
      flushText();
      off = tok.comment === 'narrator:off';
      continue;
    }
    if (off) continue;
    if (skipDepth) {
      if (tok.tag === skipTag && !VOID.has(tok.tag) && !tok.self) skipDepth += tok.close ? -1 : 1;
      if (!skipDepth) skipTag = null;
      continue;
    }
    if (tok.text !== undefined) {
      const t = decodeEntities(tok.text.replace(/`/g, "'"));
      text += inCode ? t.replace(/\s+/g, ' ') : t;
      continue;
    }
    const { tag, close } = tok;
    const narratorOff = tok.attrs && (tok.attrs['data-narrator'] === 'off' || 'hidden' in tok.attrs || tok.attrs['aria-hidden'] === 'true');
    if (!close && (SKIP.has(tag) || NOTICE[tag] || narratorOff)) {
      if (NOTICE[tag]) {
        if (item) closeItem();
        flushText();
        blocks.push({ type: 'skip', what: NOTICE[tag] });
      }
      if (!VOID.has(tag) && !tok.self) {
        skipDepth = 1;
        skipTag = tag;
      }
      continue;
    }
    if (tag === 'code') {
      text += '`';
      inCode += close ? -1 : 1;
      continue;
    }
    if (tag === 'br') {
      text += ' ';
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      if (!close) {
        flushText();
        heading = Number(tag[1]);
      } else if (heading) {
        const t = text.replace(/\s+/g, ' ').trim();
        text = '';
        if (t) blocks.push({ type: 'heading', level: heading, text: t });
        heading = null;
      }
      continue;
    }
    if (tag === 'hr' && !close) {
      flushText();
      blocks.push({ type: 'break' });
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (!close) {
        if (item) {
          // A list inside an item: add the item first, then the inner items.
          flushText();
          if (!item.added && item.text.trim()) {
            lists[lists.length - 1].items.push(item);
            item.added = true;
          }
        } else {
          flushText();
        }
        lists.push({ ordered: tag === 'ol', items: [], openItem: item });
        item = null;
      } else if (lists.length) {
        closeItem();
        const done = lists.pop();
        if (lists.length) {
          lists[lists.length - 1].items.push(...done.items);
          item = done.openItem;
        } else if (done.items.length) {
          blocks.push({ type: 'list', ordered: done.ordered, items: done.items.map(toBlock) });
        }
      }
      continue;
    }
    if (tag === 'li') {
      if (!lists.length) {
        flushText();
        continue;
      }
      closeItem();
      if (!close) item = { text: '', level: lists.length - 1, added: false };
      continue;
    }
    if (BLOCK.has(tag)) flushText();
  }
  closeItem();
  while (lists.length) {
    const done = lists.pop();
    if (lists.length) lists[lists.length - 1].items.push(...done.items);
    else if (done.items.length) blocks.push({ type: 'list', ordered: done.ordered, items: done.items.map(toBlock) });
  }
  return blocks;
}

/** Reads an HTML page or fragment. Returns {data, title, blocks}. */
export function readHtml(html, { fragment = false } = {}) {
  const src = String(html);
  const data = {};
  const titleTag = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) data.title = decodeEntities(titleTag[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const lang = src.match(/<html[^>]*\blang=["']?([\w-]+)/i);
  if (lang) data.lang = lang[1];
  const blocks = parseHtml(fragment ? src : mainContent(src));
  let title = '';
  const h1 = blocks.findIndex((b) => b.type === 'heading' && b.level === 1);
  if (h1 >= 0 && blocks.slice(0, h1).every((b) => b.type !== 'paragraph' && b.type !== 'list')) {
    title = blocks[h1].text;
    blocks.splice(h1, 1);
  } else if (data.title) {
    title = data.title;
  }
  return { data, title, blocks };
}
