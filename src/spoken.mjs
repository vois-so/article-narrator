// spoken.mjs: changes the blocks of a post into text that a listener can follow.
// It applies the rules of the write-for-voice skill (vois-so/skills): it removes
// text that is only for the eye, writes numbers and symbols as words, expands
// written abbreviations and changes lists into spoken sentences.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio

import {
  CURRENCY_SYMBOLS, MAGNITUDES, UNITS, cardinal, dateWords, digits, fractionWords, moneyWords,
  numberWords, ordinal, pluralWords, timeWords, unitWords, yearWords,
} from './numbers.mjs';

export const ENGLISH_DEFAULTS = {
  linkText: 'the link on this page',
  codeText: 'the code on the page',
  pathText: 'the path on the page',
  notices: {
    code: 'There is a code example on the page.',
    table: 'There is a table on the page.',
  },
};

export function isEnglish(language) {
  return /^(en|eng|english)([-_ (].*)?$/i.test(String(language || '').trim());
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  times: '×', divide: '÷', plusmn: '±', deg: '°', middot: '·', bull: '•', euro: '€', pound: '£', yen: '¥',
  cent: '¢', rarr: '→', larr: '←', thinsp: ' ', ensp: ' ', emsp: ' ', shy: '', zwj: '', zwnj: '',
};

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return ''; }
    }
    const v = ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

const URL_RE = /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"'`)\]]+[^\s<>"'`)\].,;:!?]/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const PATH_RE = /(^|[\s(“"'])(?:~\/|\.{1,2}\/|\/)[\w.@-]+(?:\/[\w.@-]*)*(?=$|[\s),.;:!?”"'])/g;

/**
 * Removes inline Markdown and HTML marks. Inline code becomes a marker that
 * normalize() reads. mdx: also remove {expressions}.
 */
export function stripInline(text, { mdx = false } = {}) {
  let t = String(text);
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  // Inline code first, so that the marks inside it stay as they are.
  const codes = [];
  t = t.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, ticks, body) => {
    codes.push(body.trim());
    return `\u0000${codes.length - 1}\u0000`;
  });
  if (mdx) t = t.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\{[^{}]*\}/g, ' ');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ')
    .replace(/\[\^[^\]]+\]/g, '') // footnote marks
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, '$1') // links
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1') // reference links
    .replace(/<((?:https?|ftp|mailto):[^>\s]+)>/gi, '$1') // autolinks: the URL rule acts on them later
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:[a-z][\w:-]*)(?:\s[^<>]*)?\/?>/gi, ' ') // tags
    .replace(/\{\{[<%][\s\S]*?[%>]\}\}/g, ' ') // Hugo shortcodes
    .replace(/\{%[\s\S]*?%\}/g, ' '); // Liquid tags
  t = decodeEntities(t);
  // Emphasis and strike marks. Keep snake_case words.
  t = t.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/==(?=\S)([^=\n]*?\S)==/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1');
  t = t.replace(/\u0000(\d+)\u0000/g, (m, i) => `\u0001${codes[Number(i)].replace(/[\u0000-\u0002]/g, '')}\u0002`);
  return t;
}

// Inline code that a listener can follow as words: a short command or a name.
function spokenCode(code, english, opts) {
  const c = code.trim();
  if (!c) return '';
  const simple = c.length <= 40 && c.split(/\s+/).length <= 3 && /^[A-Za-z0-9._@:+=-]+(?:\s+[A-Za-z0-9._@:+=-]+)*$/.test(c)
    && /[A-Za-z]/.test(c);
  if (!simple) return english || opts.codeText ? ` ${opts.codeText || ''} ` : ' ';
  return ` ${c.split(/\s+/).map((w) => w
    .replace(/^-{1,2}(?=[A-Za-z])/, '')
    .replace(/([A-Za-z0-9])\.(?=[A-Za-z])/g, english ? '$1 dot ' : '$1 ')
    .replace(/_/g, ' ')
    .replace(/[=:]/g, ' ')).join(' ')} `;
}

const ABBREVIATIONS = [
  [/\be\.\s?g\.(?=\s|,|$)/gi, 'for example'],
  [/\bi\.\s?e\.(?=\s|,|$)/gi, 'that is'],
  [/\ba\.k\.a\.?(?=\s|,|$)/gi, 'also known as'],
  [/\betc\.(?=\s*$|\s+[A-Z])/g, 'and so on.'],
  [/\betc\.?(?=\W|$)/gi, 'and so on'],
  [/\bapprox\.(?=\s|$)/gi, 'about'],
  [/\bvs\.?(?=\s)/gi, 'versus'],
  [/\bcf\.(?=\s)/gi, 'compare'],
  [/\bincl\.(?=\s)/gi, 'including'],
  [/\bw\/o(?=\s|$)/gi, 'without'],
  [/\bw\/(?=\s)/gi, 'with'],
  [/\bNo\.\s?(?=\d)/g, 'number '],
];

const YEAR_CONTEXT = '(?:in|since|by|from|until|till|during|year|circa|early|mid|late|'
  + 'January|February|March|April|May|June|July|August|September|October|November|December|'
  + 'Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const UNIT_ALT = Object.keys(UNITS).sort((a, b) => b.length - a.length).map(esc).join('|');
const NUM = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const UNIT_RE = new RegExp(`(?<![\\p{L}\\d.,])(${NUM})\\s?(${UNIT_ALT})(?![\\p{L}\\d])`, 'gu');
const RANGE_RE = new RegExp(`(^|[^\\w.-])(${NUM})\\s?[-–]\\s?(${NUM})(?:\\s?(${UNIT_ALT})(?![\\p{L}\\d]))?(?![\\w.]*\\d|\\s?[-–]\\s?\\d)`, 'gu');
const MONEY_RE = new RegExp(`([${CURRENCY_SYMBOLS.map(esc).join('')}])\\s?(${NUM})(?:\\s?(${MAGNITUDES.join('|')})\\b)?`, 'g');

function englishNumbers(t) {
  return t
    // "a.m." and "p.m.": keep a full stop only at the end of a sentence.
    .replace(/\b([ap])\.m\.(?=\s+[a-z0-9])/gi, '$1m')
    .replace(/\b([ap])\.m\./gi, '$1m.')
    .replace(/\b([ap])\.m\b/gi, '$1m')
    // Telephone numbers: each digit.
    .replace(/(?<![\w-])\(?(\d{3})\)?[-. ](\d{3})[-.](\d{4})(?![\w-])/g, (m, a, b, c) => `${digits(a)}, ${digits(b)}, ${digits(c)}`)
    // ISO dates and ranges of years.
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => dateWords(y, mo, d) || m)
    .replace(/\b(1[1-9]\d\d|20\d\d)\s?[-–]\s?(1[1-9]\d\d|20\d\d)\b/g, (m, a, b) => `${yearWords(a)} to ${yearWords(b)}`)
    // Times of day and ratios.
    .replace(/\b(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s?([ap])m\b/gi, (m, h, mi, ap) => timeWords(h, mi, `${ap.toLowerCase()}m`))
    .replace(/\b(\d{1,2})\s?([ap])m\b/gi, (m, h, ap) => (Number(h) >= 1 && Number(h) <= 12 ? timeWords(h, 0, `${ap.toLowerCase()}m`) : m))
    .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!:)/g, (m, h, mi) => timeWords(h, mi, ''))
    .replace(/\b(\d{1,2}):(\d)\b(?!:)/g, (m, a, b) => `${cardinal(a)} to ${cardinal(b)}`)
    // Money, percentages and versions.
    .replace(MONEY_RE, (m, sym, amount, mag) => moneyWords(sym, amount, mag))
    .replace(new RegExp(`(^|[^\\w])([+\\-−]?)(${NUM})\\s?%`, 'g'), (m, pre, sign, n) => `${pre}${sign === '+' ? 'plus ' : sign ? 'minus ' : ''}${numberWords(n)} percent`)
    .replace(/\bv(\d+(?:\.\d+)*)\b/g, (m, v) => `version ${v.split('.').map(numberWords).join(' point ')}`)
    .replace(/\b\d+\.\d+\.\d+(?:\.\d+)*\b/g, (m) => m.split('.').map(numberWords).join(' point '))
    // Decades and years.
    .replace(/\b(1[1-9]|20)(\d0)s\b/g, (m, a, b) => pluralWords(yearWords(`${a}${b}`)))
    .replace(/(^|\s)['’](\d0)s\b/g, (m, pre, d) => `${pre}${pluralWords(cardinal(d))}`)
    .replace(/\((1[5-9]\d\d|20\d\d)\)/g, (m, y) => `(${yearWords(y)})`)
    // Ranges and units before years, so that "in 1500 ms" stays a number.
    .replace(RANGE_RE, (m, pre, a, b, u) => `${pre}${numberWords(a)} to ${u ? unitWords(b, u) : numberWords(b)}`)
    .replace(UNIT_RE, (m, n, u) => unitWords(n, u) || m)
    .replace(new RegExp(`\\b(${YEAR_CONTEXT})\\s+(1[1-9]\\d\\d|20\\d\\d)\\b(?![.,]\\d)`, 'gi'), (m, ctx, y) => `${ctx} ${yearWords(y)}`)
    // Ordinals, fractions and multipliers.
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (m, n) => ordinal(Number(n)))
    .replace(/(^|[^\d/])(\d+)\/(\d+)(?![\d/])/g, (m, pre, a, b) => `${pre}${fractionWords(a, b)}`)
    .replace(/\b(\d+(?:\.\d+)?)x\b/g, (m, n) => `${numberWords(n)} times`)
    .replace(/\b(360|480|540|720|1080|1440|2160|4320)p\b/g, (m, n) => `${n.length === 4 ? yearWords(n) : `${cardinal(Math.floor(n / 100))} ${cardinal(n % 100)}`} p`)
    .replace(/\b(\d+)K\b/g, (m, n) => `${numberWords(n)} K`)
    // Signs before numbers.
    .replace(/#(\d+)/g, (m, n) => `number ${numberWords(n)}`)
    .replace(/(^|[\s(])~\s?(?=\d)/g, '$1about ')
    .replace(/(?:>=|≥)\s?(?=\d)/g, 'at least ')
    .replace(/(?:<=|≤)\s?(?=\d)/g, 'at most ')
    .replace(/(^|[\s(])>\s?(?=\d)/g, '$1more than ')
    .replace(/(^|[\s(])<\s?(?=\d)/g, '$1less than ')
    .replace(/(\d)\+(?=\s|$|[.,;:!?)])/g, '$1 plus')
    .replace(/(^|[\s(])[-−](?=\d)/g, '$1minus ')
    // All other numbers. A number inside a word ("MP3", "x86", "3D") stays as it is.
    .replace(/\b(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\b(?![.,]?\p{L})/gu, (m) => numberWords(m));
}

function englishSymbols(t) {
  return t
    .replace(/\bC\+\+/g, 'C plus plus')
    .replace(/\b([CF])#(?!\w)/g, '$1 sharp')
    .replace(/(^|\s)\.NET\b/g, '$1dot net')
    .replace(/\s*(?:->|=>|→|⇒|⟶)\s*/g, ', then ')
    .replace(/\s*(?:<-|←)\s*/g, ', ')
    .replace(/\s&\s|&/g, ' and ')
    .replace(/\s\+\s/g, ' plus ')
    .replace(/\s=\s/g, ' equals ')
    .replace(/\s?×\s?/g, ' times ')
    .replace(/±/g, ' plus or minus ')
    .replace(/(^|\s)@(?=\w)/g, '$1at ')
    .replace(/\s@\s/g, ' at ')
    .replace(/%/g, ' percent')
    .replace(/\band\/or\b/gi, 'and or')
    .replace(/\b([A-Za-z][a-z]+|[a-z])\/([a-z]+)\b/g, '$1 or $2');
}

function tidy(t) {
  return t
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, ' ')
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ')
    .replace(/…/g, '...')
    .replace(/\s*[—―]\s*/g, ', ')
    .replace(/\s+[–-]\s+/g, ', ')
    .replace(/\s*;\s*(\p{Ll})?/gu, (m, c) => `. ${c ? c.toUpperCase() : ''}`)
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s*\(\s*/g, ', ')
    .replace(/\s*\)\s*(?=[.,!?:])/g, '')
    .replace(/\s*\)\s*/g, ', ')
    .replace(/[[\]{}<>|*#^~\\_`]/g, ' ')
    .replace(/\s\/\s|\//g, ' ')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\s+([,.!?:])/g, '$1')
    .replace(/,(?=\p{L})/gu, ', ')
    .replace(/([,:])(?:\s*[,:])+/g, '$1')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/([.!?])\s*,/g, '$1')
    .replace(/:\s*([.!?])/g, '$1')
    .replace(/\.{4,}/g, '...')
    .replace(/^[\s,.;:]+/, '')
    .trim();
}

function applyReplacements(t, replace) {
  for (const [from, to] of Object.entries(replace || {})) {
    if (!from) continue;
    const word = /^\w/.test(from) && /\w$/.test(from);
    const re = new RegExp(word ? `(?<![\\w-])${esc(from)}(?![\\w-])` : esc(from), 'g');
    t = t.replace(re, to);
  }
  return t;
}

/**
 * Changes one text (a paragraph, a list item or a heading) into spoken words.
 * opts: language, replace, linkText, codeText, pathText, mdx.
 */
export function normalize(text, opts = {}) {
  const english = isEnglish(opts.language ?? 'English');
  const words = english ? { ...ENGLISH_DEFAULTS, ...opts } : opts;
  let t = stripInline(text, { mdx: opts.mdx });
  t = t.replace(/\s+/g, ' ');
  t = applyReplacements(t, opts.replace);
  // A URL or a path in parentheses is a reference for the eye. Remove it.
  t = t.replace(new RegExp(`\\(\\s*(?:${URL_RE.source}|${EMAIL_RE.source})\\s*\\)`, 'gi'), ' ');
  t = t.replace(URL_RE, () => ` ${words.linkText || ''} `)
    .replace(EMAIL_RE, (m) => (english ? ` ${m.replace('@', ' at ').replace(/\./g, ' dot ')} ` : ` ${m} `))
    .replace(PATH_RE, (m, pre) => `${pre}${words.pathText || ''}`);
  t = t.replace(/\u0001([^\u0002]*)\u0002/g, (m, code) => spokenCode(code, english, words));
  if (english) {
    for (const [re, to] of ABBREVIATIONS) t = t.replace(re, to);
    t = englishNumbers(t);
    t = englishSymbols(t);
  }
  t = tidy(t);
  return t;
}

const ORDINAL_START = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

function sentence(t) {
  const s = t.replace(/[,;:\s]+$/, '').trim();
  if (!s) return '';
  return /[.!?…"”’')]$/.test(s) ? s : `${s}.`;
}

/**
 * Changes the blocks of a post into spoken paragraphs.
 * blocks: [{type: 'heading'|'paragraph'|'list'|'skip'|'break', ...}]
 * Returns {paragraphs, text, skipped: {code, table}}.
 */
export function toSpoken({ title, blocks }, settings = {}) {
  const english = isEnglish(settings.language ?? 'English');
  const notices = settings.notices === false ? {}
    : { ...(english ? ENGLISH_DEFAULTS.notices : {}), ...(settings.notices || {}) };
  const opts = {
    language: settings.language, replace: settings.replace, mdx: settings.mdx,
    linkText: settings.linkText, codeText: settings.codeText, pathText: settings.pathText,
  };
  for (const k of ['linkText', 'codeText', 'pathText']) if (opts[k] === undefined) delete opts[k];
  const paragraphs = [];
  const skipped = { code: 0, table: 0 };
  let lastNotice = null;
  const push = (p) => {
    if (!p) return;
    paragraphs.push(p);
    lastNotice = null;
  };

  if (settings.intro) push(sentence(normalize(settings.intro, opts)));
  if (title && settings.readTitle !== false) push(sentence(normalize(title, opts)));

  for (const b of blocks) {
    if (b.type === 'skip') {
      skipped[b.what] = (skipped[b.what] || 0) + 1;
      const n = notices[b.what];
      if (n && lastNotice !== b.what) {
        paragraphs.push(n);
        lastNotice = b.what;
      }
      continue;
    }
    if (b.type === 'heading') {
      if (settings.headings) push(sentence(normalize(b.text, opts)));
      continue;
    }
    if (b.type === 'paragraph') {
      let p = normalize(b.text, opts);
      if (p.endsWith(':')) p = `${p.slice(0, -1)}.`;
      push(sentence(p));
      continue;
    }
    if (b.type === 'list') {
      const items = b.items.map((it) => ({ ...it, text: sentence(normalize(it.text, opts)) })).filter((it) => it.text);
      const top = items.filter((it) => !it.level);
      const useOrdinals = english && top.length >= 2 && top.length <= ORDINAL_START.length;
      let n = 0;
      const out = items.map((it) => (it.level || !useOrdinals ? it.text : `${ORDINAL_START[n++]}, ${it.text}`));
      push(out.join(' '));
    }
  }
  if (settings.outro) push(sentence(normalize(settings.outro, opts)));
  return { paragraphs, text: paragraphs.join('\n\n'), skipped };
}

/** Splits a long text at sentence ends, then at commas, then at spaces. */
function splitLong(text, max) {
  if (text.length <= max) return [text];
  const out = [];
  const pieces = text.match(/[^.!?…]+(?:[.!?…]+["”’')]*\s*|$)/g) || [text];
  let cur = '';
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  for (let piece of pieces) {
    if (piece.length > max) {
      flush();
      const parts = piece.split(/(?<=,)\s+|\s+/);
      for (const w of parts) {
        if (cur && cur.length + w.length + 1 > max) flush();
        cur += (cur ? ' ' : '') + w;
      }
      continue;
    }
    if (cur && cur.length + piece.length > max) flush();
    cur += piece;
  }
  flush();
  return out.flatMap((s) => (s.length > max ? s.match(new RegExp(`.{1,${max}}`, 'g')) : [s]));
}

/**
 * Packs paragraphs into parts of max characters or less. Each part is one
 * call to vois-cli. A paragraph stays in one part when it fits. The parts
 * have almost the same length, so that the last part is not very short.
 */
export function chunk(paragraphs, max = 1900) {
  const pieces = paragraphs.flatMap((x) => splitLong(x, max));
  const total = pieces.reduce((s, p) => s + p.length + 2, -2);
  const count = Math.max(1, Math.ceil(total / max));
  const target = Math.min(max, Math.ceil(total / count) + 200);
  const parts = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + 2 + p.length > target) {
      parts.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) parts.push(cur);
  return parts;
}

export { digits };
