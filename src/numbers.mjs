// numbers.mjs: English words for numbers, years, times, money and units.
// The rules come from the write-for-voice skill (vois-so/skills): write each
// number as the speaker says it, so that the script controls the read.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
const ORDINAL_WORDS = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

function under100(n) {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function under1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return under100(r);
  return r ? `${ONES[h]} hundred ${under100(r)}` : `${ONES[h]} hundred`;
}

/** Cardinal words for a whole number, for example 1250 -> "one thousand two hundred fifty". */
export function cardinal(n) {
  n = Math.trunc(Number(n));
  if (!Number.isFinite(n)) return String(n);
  if (n < 0) return `minus ${cardinal(-n)}`;
  if (n < 1000) return under1000(n);
  if (n >= 1e15) return digits(String(n));
  const parts = [];
  let rest = n;
  for (const [size, name] of SCALES) {
    if (rest >= size) {
      parts.push(`${under1000(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest) parts.push(under1000(rest));
  return parts.join(' ');
}

/** Each digit as a word: "007" -> "zero zero seven". */
export function digits(s) {
  return String(s).split('').filter((c) => /\d/.test(c)).map((d) => ONES[Number(d)]).join(' ');
}

/** Ordinal words: 1 -> "first", 21 -> "twenty-first". */
export function ordinal(n) {
  const words = cardinal(n);
  return words.replace(/([a-z]+)$/, (last) => {
    if (ORDINAL_WORDS[last]) return ORDINAL_WORDS[last];
    if (last.endsWith('y')) return `${last.slice(0, -1)}ieth`;
    return `${last}th`;
  });
}

/** A number as text: "1,250" -> cardinal, "3.14" -> "three point one four". */
export function numberWords(text) {
  const s = String(text).replace(/,/g, '');
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [whole, frac] = body.split('.');
  let out;
  if (whole.length > 1 && whole.startsWith('0')) out = digits(whole);
  else if (whole.length >= 10 && !String(text).includes(',')) out = digits(whole);
  else out = cardinal(Number(whole || '0'));
  if (frac !== undefined && frac !== '') out += ` point ${digits(frac)}`;
  return neg ? `minus ${out}` : out;
}

/** A year: 2026 -> "twenty twenty-six", 2005 -> "two thousand five", 1905 -> "nineteen oh five". */
export function yearWords(y) {
  y = Number(y);
  if (y >= 2000 && y <= 2009) return cardinal(y);
  if (y % 1000 === 0) return cardinal(y);
  const hi = Math.floor(y / 100);
  const lo = y % 100;
  if (lo === 0) return `${under100(hi)} hundred`;
  if (lo < 10) return `${under100(hi)} oh ${ONES[lo]}`;
  return `${under100(hi)} ${under100(lo)}`;
}

/** The plural of a year or a number word: "nineteen ninety" -> "nineteen nineties". */
export function pluralWords(words) {
  if (words.endsWith('y')) return `${words.slice(0, -1)}ies`;
  if (words.endsWith('x')) return `${words}es`;
  return `${words}s`;
}

/** A time of day. h and m are numbers. ampm is "am", "pm" or "". */
export function timeWords(h, m, ampm) {
  h = Number(h);
  m = Number(m);
  let part = '';
  if (ampm) {
    const pm = ampm === 'pm';
    if (h === 12 && m === 0) return pm ? 'noon' : 'midnight';
    part = pm ? (h === 12 || h < 6 ? ' in the afternoon' : ' in the evening') : ' in the morning';
  } else if (h > 12 || h === 0) {
    if (h === 0 && m === 0) return 'midnight';
    part = h === 0 ? ' at night' : h < 18 ? ' in the afternoon' : ' in the evening';
    h = h === 0 ? 12 : h - 12;
  } else if (h === 12 && m === 0) {
    return 'noon';
  }
  let words = under100(h);
  if (m === 0) words += ampm || part ? '' : " o'clock";
  else if (m < 10) words += ` oh ${ONES[m]}`;
  else words += ` ${under100(m)}`;
  return words + part;
}

/** An ISO date: 2026-11-06 -> "November sixth, twenty twenty-six". */
export function dateWords(y, mo, d) {
  const month = MONTHS[Number(mo) - 1];
  if (!month || Number(d) < 1 || Number(d) > 31) return null;
  return `${month} ${ordinal(Number(d))}, ${yearWords(y)}`;
}

const FRACTIONS = {
  '1/2': 'one half', '1/3': 'one third', '2/3': 'two thirds', '1/4': 'one quarter', '3/4': 'three quarters',
  '1/5': 'one fifth', '1/8': 'one eighth', '24/7': 'twenty-four seven',
};

/** Simple fractions: "1/3" -> "one third". Other a/b -> "a out of b". */
export function fractionWords(a, b) {
  const known = FRACTIONS[`${a}/${b}`];
  if (known) return known;
  return `${numberWords(a)} out of ${numberWords(b)}`;
}

// Units after a number. The key is the unit as written; the value is [one, many].
export const UNITS = {
  KB: ['kilobyte', 'kilobytes'], kB: ['kilobyte', 'kilobytes'], MB: ['megabyte', 'megabytes'],
  GB: ['gigabyte', 'gigabytes'], TB: ['terabyte', 'terabytes'], PB: ['petabyte', 'petabytes'],
  Kb: ['kilobit', 'kilobits'], Mb: ['megabit', 'megabits'], Gb: ['gigabit', 'gigabits'],
  KiB: ['kibibyte', 'kibibytes'], MiB: ['mebibyte', 'mebibytes'], GiB: ['gibibyte', 'gibibytes'],
  kbps: ['kilobit a second', 'kilobits a second'], Mbps: ['megabit a second', 'megabits a second'],
  Gbps: ['gigabit a second', 'gigabits a second'],
  ms: ['millisecond', 'milliseconds'], μs: ['microsecond', 'microseconds'], ns: ['nanosecond', 'nanoseconds'],
  sec: ['second', 'seconds'], secs: ['second', 'seconds'], min: ['minute', 'minutes'], mins: ['minute', 'minutes'],
  hr: ['hour', 'hours'], hrs: ['hour', 'hours'], h: ['hour', 'hours'],
  Hz: ['hertz', 'hertz'], kHz: ['kilohertz', 'kilohertz'], MHz: ['megahertz', 'megahertz'], GHz: ['gigahertz', 'gigahertz'],
  fps: ['frame a second', 'frames a second'], px: ['pixel', 'pixels'], dB: ['decibel', 'decibels'],
  LUFS: ['LUFS', 'LUFS'],
  mm: ['millimeter', 'millimeters'], cm: ['centimeter', 'centimeters'], km: ['kilometer', 'kilometers'],
  kg: ['kilogram', 'kilograms'], mg: ['milligram', 'milligrams'], lb: ['pound', 'pounds'], lbs: ['pound', 'pounds'],
  'km/h': ['kilometer an hour', 'kilometers an hour'], mph: ['mile an hour', 'miles an hour'],
  '°C': ['degree Celsius', 'degrees Celsius'], '°F': ['degree Fahrenheit', 'degrees Fahrenheit'],
  '°': ['degree', 'degrees'],
};

/** "5 GB" -> "five gigabytes". value is the number as text. */
export function unitWords(value, unit) {
  const names = UNITS[unit];
  if (!names) return null;
  const one = String(value).replace(/,/g, '') === '1';
  return `${numberWords(value)} ${one ? names[0] : names[1]}`;
}

const CURRENCY = {
  $: ['dollar', 'dollars', 'cent', 'cents'], '€': ['euro', 'euros', 'cent', 'cents'],
  '£': ['pound', 'pounds', 'penny', 'pence'], '¥': ['yen', 'yen', '', ''], '₹': ['rupee', 'rupees', 'paisa', 'paise'],
};
const MAGNITUDE = { K: 'thousand', k: 'thousand', M: 'million', m: 'million', B: 'billion', bn: 'billion', T: 'trillion' };

/** "$19.99" -> "nineteen dollars ninety-nine". "$1.2B" -> "one point two billion dollars". */
export function moneyWords(symbol, amount, magnitude) {
  const c = CURRENCY[symbol];
  const clean = String(amount).replace(/,/g, '');
  if (magnitude) return `${numberWords(clean)} ${MAGNITUDE[magnitude]} ${c[1]}`;
  const [whole, frac] = clean.split('.');
  const w = Number(whole || '0');
  const cents = frac ? Number(frac.padEnd(2, '0').slice(0, 2)) : 0;
  if (w === 0 && cents && c[2]) return `${cardinal(cents)} ${cents === 1 ? c[2] : c[3]}`;
  let out = `${cardinal(w)} ${w === 1 ? c[0] : c[1]}`;
  if (cents) out += ` ${cardinal(cents)}`;
  return out;
}

export const CURRENCY_SYMBOLS = Object.keys(CURRENCY);
export const MAGNITUDES = Object.keys(MAGNITUDE);
