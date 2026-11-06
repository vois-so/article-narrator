// markdown.mjs: reads a Markdown or MDX post and gives its front matter and
// its blocks. A block is a heading, a paragraph, a list, a section break, or a
// "skip" for code and tables, which a listener cannot follow.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio

/** Splits YAML (---), TOML (+++) or JSON ({) front matter from the body. */
export function splitFrontMatter(text) {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const yaml = src.match(/^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/);
  if (yaml) return { data: parseYaml(yaml[1]), body: src.slice(yaml[0].length) };
  const toml = src.match(/^\+\+\+[ \t]*\n([\s\S]*?)\n\+\+\+[ \t]*(?:\n|$)/);
  if (toml) return { data: parseToml(toml[1]), body: src.slice(toml[0].length) };
  if (src.startsWith('{')) {
    const end = jsonEnd(src);
    if (end > 0) {
      try {
        return { data: JSON.parse(src.slice(0, end)), body: src.slice(end).replace(/^[ \t]*\n/, '') };
      } catch { /* not front matter */ }
    }
  }
  return { data: {}, body: src };
}

function jsonEnd(src) {
  let depth = 0;
  let str = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (str) {
      if (c === '\\') i++;
      else if (c === '"') str = false;
    } else if (c === '"') str = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

function scalar(raw) {
  let v = raw.trim();
  if (!v) return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    const q = v[0];
    v = v.slice(1, -1);
    return q === '"' ? v.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\') : v.replace(/''/g, "'");
  }
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== '');
  }
  return v.replace(/\s+#.*$/, '');
}

/** Top-level keys of simple YAML. Nested maps are not read. */
export function parseYaml(text) {
  const out = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/);
    if (!m) continue;
    const [, key, rest = ''] = m;
    if (/^[|>][+-]?\s*$/.test(rest)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) block.push(lines[++i].trim());
      out[key] = block.join(rest.startsWith('|') ? '\n' : ' ').trim();
    } else if (rest.trim() === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(scalar(lines[++i].replace(/^\s*-\s+/, '')));
      out[key] = items.length ? items : '';
    } else {
      out[key] = scalar(rest);
    }
  }
  return out;
}

/** Top-level keys of simple TOML. Keys after a [table] line are not read. */
export function parseToml(text) {
  const out = {};
  for (const line of text.split('\n')) {
    if (/^\s*\[/.test(line)) break;
    const m = line.match(/^\s*([A-Za-z_][\w-]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = scalar(m[2].replace(/\s+#[^"']*$/, ''));
  }
  return out;
}

const SKIP_HTML = 'pre|script|style|svg|math|iframe|object|video|audio|canvas|form|template|noscript|nav|figure|picture';
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Parses the body of a Markdown or MDX post into blocks.
 * Authors can stop the narration for a part with <!-- narrator:off --> and
 * start it again with <!-- narrator:on -->.
 */
export function parseMarkdown(body, { mdx = false } = {}) {
  let src = String(body).replace(/\r\n?/g, '\n');
  src = src.replace(/<!--\s*narrator:\s*off\s*-->[\s\S]*?(?:<!--\s*narrator:\s*on\s*-->|$)/gi, '\n\n');
  if (mdx) src = src.replace(/\{\/\*\s*narrator:\s*off\s*\*\/\}[\s\S]*?(?:\{\/\*\s*narrator:\s*on\s*\*\/\}|$)/gi, '\n\n');
  src = src.replace(/<!--[\s\S]*?-->/g, '');
  const lines = src.split('\n');
  const blocks = [];
  let para = [];
  let list = null;
  let lastBlank = true;

  const flushPara = () => {
    const text = para.join(' ').trim();
    if (text) blocks.push({ type: 'paragraph', text });
    para = [];
  };
  const flushList = () => {
    if (list && list.items.length) blocks.push(list);
    list = null;
  };
  const flush = () => {
    flushPara();
    flushList();
  };
  const skip = (what) => {
    flush();
    blocks.push({ type: 'skip', what });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      lastBlank = true;
      continue;
    }

    // Fenced code (``` or ~~~) and math ($$).
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const mark = fence[1];
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^\\s{0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`).test(lines[j])) j++;
      i = j;
      skip('code');
      lastBlank = false;
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      let j = trimmed === '$$' || !/\$\$\s*$/.test(trimmed.slice(2)) ? i + 1 : i;
      if (j > i) while (j < lines.length && !/\$\$\s*$/.test(lines[j])) j++;
      i = j;
      flush();
      continue;
    }

    // Indented code: four spaces after a blank line, outside a list.
    if (/^( {4}|\t)/.test(line) && lastBlank && !list) {
      while (i + 1 < lines.length && (/^( {4}|\t)/.test(lines[i + 1]) || (lines[i + 1].trim() === '' && /^( {4}|\t)/.test(lines[i + 2] || '')))) i++;
      skip('code');
      continue;
    }

    // MDX import and export lines.
    if (mdx && /^(import|export)\s/.test(line)) {
      let depth = (line.match(/[{([]/g) || []).length - (line.match(/[})\]]/g) || []).length;
      while (depth > 0 && i + 1 < lines.length) {
        i++;
        depth += (lines[i].match(/[{([]/g) || []).length - (lines[i].match(/[})\]]/g) || []).length;
      }
      flush();
      continue;
    }

    // Hugo and Liquid code shortcodes.
    const sc = trimmed.match(/^\{\{[<%]\s*(highlight|code|codeblock)\b[\s\S]*?[%>]\}\}/i)
      || trimmed.match(/^\{%\s*(highlight|codeblock)\b[^%]*%\}/i);
    if (sc) {
      const name = sc[1];
      let j = i;
      const close = new RegExp(`\\{\\{[<%]\\s*/\\s*${name}\\s*[%>]\\}\\}|\\{%\\s*end${name}\\s*%\\}`, 'i');
      while (j < lines.length && !close.test(lines[j])) j++;
      i = j;
      skip('code');
      continue;
    }

    // HTML blocks that are not prose.
    const html = trimmed.match(new RegExp(`^<(${SKIP_HTML}|table|article-narrator)\\b`, 'i'));
    if (html) {
      const tag = html[1].toLowerCase();
      let j = i;
      const close = new RegExp(`</${tag}\\s*>|<${tag}\\b[^>]*/>`, 'i');
      while (j < lines.length && !close.test(lines[j])) j++;
      i = j;
      if (tag === 'table') skip('table');
      else if (tag === 'pre') skip('code');
      else flush();
      lastBlank = false;
      continue;
    }

    // Tables: a row of cells and a separator row.
    if (trimmed.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      let j = i + 2;
      while (j < lines.length && lines[j].trim() && lines[j].includes('|')) j++;
      i = j - 1;
      skip('table');
      continue;
    }

    // Lines that are only for the eye: admonition fences, footnote and link
    // definitions, horizontal rules, and lines with only a tag or a shortcode.
    if (/^:{3,}/.test(trimmed) || /^\[\^[^\]]+\]:/.test(trimmed) || /^\[[^\]]+\]:\s*\S+/.test(trimmed)) {
      flushPara();
      continue;
    }
    if (/^([-*_])(\s*\1){2,}\s*$/.test(trimmed) && !para.length) {
      flush();
      blocks.push({ type: 'break' });
      continue;
    }

    // Headings.
    const atx = line.match(/^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/);
    if (atx) {
      flush();
      blocks.push({ type: 'heading', level: atx[1].length, text: atx[2] });
      lastBlank = false;
      continue;
    }
    if (para.length && /^\s{0,3}(=+|-+)\s*$/.test(line)) {
      const text = para.join(' ');
      para = [];
      flushList();
      blocks.push({ type: 'heading', level: line.trim()[0] === '=' ? 1 : 2, text });
      continue;
    }

    // Block quotes: keep the text. Remove GitHub alert labels.
    if (/^\s*>/.test(line)) {
      const text = line.replace(/^\s*(>\s?)+/, '').replace(/^\[!\w+\]\s*$/i, '').trim();
      if (!text) {
        flushPara();
        continue;
      }
      if (/^#{1,6}\s/.test(text)) {
        flush();
        blocks.push({ type: 'heading', level: 3, text: text.replace(/^#+\s+/, '') });
        continue;
      }
      if (list) flushList();
      para.push(text);
      lastBlank = false;
      continue;
    }

    // Lists.
    const item = line.match(LIST_RE);
    if (item && (lastBlank || list || !para.length || !/^\d/.test(item[2]))) {
      flushPara();
      const indent = item[1].replace(/\t/g, '    ').length;
      const ordered = /\d/.test(item[2]);
      if (!list) list = { type: 'list', ordered, items: [], base: indent };
      const level = indent > list.base + 1 ? 1 : 0;
      const text = item[3].replace(/^\[[ xX]\]\s+/, '');
      list.items.push({ text, level });
      lastBlank = false;
      continue;
    }
    if (list && (/^\s{2,}\S/.test(line) || !lastBlank)) {
      // A continuation line of the last item.
      const last = list.items[list.items.length - 1];
      last.text += ` ${trimmed}`;
      lastBlank = false;
      continue;
    }
    if (list) flushList();

    // Lines with only an HTML or JSX tag, or a shortcode, add no words.
    if (/^(<\/?[A-Za-z][^>]*>\s*)+$/.test(trimmed) || /^(\{\{[<%][\s\S]*?[%>]\}\}\s*)+$/.test(trimmed)) {
      flushPara();
      lastBlank = false;
      continue;
    }

    para.push(trimmed);
    lastBlank = false;
  }
  flush();
  return blocks.map((b) => {
    if (b.type === 'list') delete b.base;
    return b;
  });
}

/** Reads a Markdown or MDX post. Returns {data, title, blocks}. */
export function readMarkdown(text, { mdx = false } = {}) {
  const { data, body } = splitFrontMatter(text);
  const blocks = parseMarkdown(body, { mdx });
  let title = typeof data.title === 'string' ? data.title.trim() : '';
  const firstH1 = blocks.findIndex((b) => b.type === 'heading' && b.level === 1);
  if (firstH1 >= 0 && blocks.slice(0, firstH1).every((b) => b.type !== 'paragraph' && b.type !== 'list')) {
    // The first heading is the title: do not read it two times.
    if (!title) title = blocks[firstH1].text;
    if (!title || blocks[firstH1].text.trim().toLowerCase() === title.toLowerCase() || !data.title) blocks.splice(firstH1, 1);
  }
  return { data, title, blocks };
}
