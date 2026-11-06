// render.mjs: speaks text with Vois Studio through vois-cli, then joins the
// parts and writes one MP3 file with ffmpeg.
//
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vois Studio

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readSync, closeSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { NarratorError } from './posts.mjs';

/** What to do for each vois-cli exit code. */
export const ADVICE = {
  2: 'Vois Studio is not open. Open Vois Studio, or start its service with: vois-cli service start',
  3: 'vois-cli did not accept a setting. Check "engine", "voice", "language" and "speed".',
  4: 'The voice is not in Vois Studio. To see the voices, type: vois-cli voice list --engine <engine>',
  5: 'The generation did not complete. Make the post shorter, or select a different voice.',
  6: 'Vois Studio could not write the audio file. Check that the folder exists and that you can write to it.',
  7: 'Your plan cannot make audio files from vois-cli. You must have a paid plan or export credits. Omni and Craft need Pro.',
  8: 'The quota or the export credits are empty.',
  9: 'Vois Studio did not answer in time. Make sure that it operates correctly, then try again.',
  10: 'The Sonic queue is full. Wait some seconds, then try again.',
  11: 'The computer does not have sufficient free memory for this engine. Close other apps, or use Sonic or Fast.',
  12: 'The engine did not download. Download it with: vois-cli model download --model <engine>',
  13: 'The engine is not available at this time. Select a different engine.',
  64: 'vois-cli did not accept the text or the language. Set "language", for example "English".',
  130: 'Stopped.',
};

/** Finds vois-cli: --cli, then VOIS_CLI, then the usual install folders. */
export function findCli(explicit) {
  const tried = [];
  if (explicit) tried.push(explicit);
  if (process.env.VOIS_CLI) tried.push(process.env.VOIS_CLI);
  if (process.platform === 'darwin') {
    tried.push('/Applications/Vois.app/Contents/MacOS/vois-cli');
    tried.push(join(homedir(), 'Applications/Vois.app/Contents/MacOS/vois-cli'));
  } else if (process.platform === 'win32') {
    tried.push(join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Vois', 'vois-cli.exe'));
  }
  return tried.find((p) => existsSync(p)) || null;
}

// vois-cli reads these as defaults. The settings file is the only source of
// the engine, the voice and the language, so remove them from the child.
const CLI_ENV = ['VOIS_VOICE', 'VOIS_ENGINE', 'VOIS_QUALITY', 'VOIS_LANGUAGE', 'VOIS_FORMAT'];

let interrupted = false;
const children = new Set();
export function onInterrupt() {
  interrupted = true;
  for (const child of children) child.kill('SIGINT');
}

/**
 * Runs a command. cmd is a path, or {cmd, args} to put arguments first (the
 * tests use this). Returns {code, stdout, stderr}. code is 'ENOENT' if the
 * command is missing.
 */
export function run(tool, extra, { input, env, timeoutMs = 30 * 60 * 1000 } = {}) {
  const cmd = typeof tool === 'string' ? tool : tool.cmd;
  const args = typeof tool === 'string' ? extra : [...(tool.args || []), ...extra];
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
    } catch (err) {
      resolvePromise({ code: err.code === 'ENOENT' ? 'ENOENT' : 1, stdout: '', stderr: err.message });
      return;
    }
    children.add(child);
    const out = [];
    const err = [];
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => {
      clearTimeout(timer);
      children.delete(child);
      resolvePromise({ code: e.code === 'ENOENT' ? 'ENOENT' : 1, stdout: '', stderr: e.message });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      resolvePromise({
        code: code ?? (signal === 'SIGINT' ? 130 : 1),
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Runs vois-cli with --format json. cli is a path, or {cmd, args} for tests. */
export async function voisCli(cli, args, input) {
  const env = { ...process.env };
  for (const k of CLI_ENV) delete env[k];
  env.NO_COLOR = '1';
  const r = await run(cli, [...args, '--format', 'json'], { input, env });
  if (r.code === 'ENOENT') throw new NarratorError(`vois-cli was not found at ${typeof cli === 'string' ? cli : cli.cmd}.`, 2);
  const json = parseJson(r.stdout);
  const errDoc = r.code === 0 ? null : parseJson(r.stderr) || parseJson(r.stdout);
  const error = errDoc?.error || null;
  const message = error?.message || (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ');
  return { code: r.code, json, error, message };
}

/**
 * Checks that Vois Studio answers and that the plan can write audio files
 * from vois-cli. Returns the status with "metered" (true on export credits).
 */
export async function preflight(cli) {
  const r = await voisCli(cli, ['status']);
  if (r.code !== 0) throw new NarratorError(`vois-cli status failed (exit ${r.code}). ${ADVICE[r.code] || r.message}`, r.code);
  const s = r.json || {};
  if (!s.cli_access_enabled || s.license_valid === false) {
    throw new NarratorError('Your Vois Studio plan cannot make audio files from vois-cli. You must have a paid plan or export credits. '
      + `See ${s.purchase_url || 'https://vois.so/pricing'}`, 7);
  }
  s.metered = s.access_mode !== 'subscription';
  return s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The text is too long for the engine. limit is the maximum from the message. */
export class LimitError extends NarratorError {
  constructor(message, limit) {
    super(message, 64);
    this.limit = limit;
  }
}

/** Speaks one part into a WAV file. Tries again only for errors that a new try can correct. */
export async function renderPart(cli, text, out, s) {
  const args = ['tts', 'generate', '--text', '-', '--output', out, '--engine', s.engine, '--voice', s.voice, '--language', s.language];
  if (s.speed && Number(s.speed) !== 1) args.push('--speed', String(s.speed));
  if (s.instruct) args.push('--instruct', s.instruct);
  for (let attempt = 1; ; attempt++) {
    if (interrupted) throw new NarratorError('Stopped.', 130);
    const r = await voisCli(cli, args, text);
    if (r.code === 0) return r.json || {};
    const limit = r.message.match(/accepts at most (\d+)/i);
    if (limit) throw new LimitError(r.message, Number(limit[1]));
    const again = (r.code === 10 && attempt <= 5) || (r.code === 9 && attempt <= 2);
    if (!again || interrupted) {
      const reason = r.error?.data?.reason ? ` (${r.error.data.reason})` : '';
      throw new NarratorError(`vois-cli tts generate failed with exit ${r.code}${reason}: ${r.message}\n${ADVICE[r.code] || ''}`.trim(), typeof r.code === 'number' ? r.code : 1);
    }
    await sleep(r.code === 10 ? 3000 : 1500);
  }
}

/** Reads the length in seconds of a PCM WAV file from its header. */
export function wavSeconds(file) {
  const fd = openSync(file, 'r');
  try {
    const head = Buffer.alloc(4096);
    const n = readSync(fd, head, 0, head.length, 0);
    if (n < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return 0;
    let pos = 12;
    let rate = 0;
    let channels = 0;
    let bits = 0;
    while (pos + 8 <= n) {
      const id = head.toString('ascii', pos, pos + 4);
      let size = head.readUInt32LE(pos + 4);
      if (id === 'fmt ') {
        channels = head.readUInt16LE(pos + 10);
        rate = head.readUInt32LE(pos + 12);
        bits = head.readUInt16LE(pos + 22);
      } else if (id === 'data') {
        const total = statSync(file).size;
        if (!size || size === 0xffffffff || pos + 8 + size > total) size = total - pos - 8;
        const frame = channels * (bits / 8);
        return rate && frame ? size / frame / rate : 0;
      }
      pos += 8 + size + (size % 2);
    }
    return 0;
  } finally {
    closeSync(fd);
  }
}

/** Measures the loudness of the joined parts (first loudnorm pass). */
async function measure(ffmpeg, inputs, graph, target) {
  const r = await run(ffmpeg, ['-hide_banner', '-nostdin', ...inputs, '-filter_complex',
    `${graph},loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json[a]`, '-map', '[a]', '-f', 'null', '-'], { timeoutMs: 10 * 60 * 1000 });
  if (r.code === 'ENOENT') return null;
  const json = r.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (r.code !== 0 || !json) return null;
  try {
    const m = JSON.parse(json[0]);
    const ok = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'].every((k) => Number.isFinite(Number(m[k])));
    return ok ? m : null;
  } catch {
    return null;
  }
}

/** Joins the WAV parts, sets the loudness (two passes) and writes an MP3 file. */
export async function encodeMp3(ffmpeg, wavs, out, { bitrate = '64k', loudness = -16, title = '' } = {}) {
  const inputs = wavs.flatMap((w) => ['-i', w]);
  const graph = wavs.length > 1 ? `${wavs.map((_, i) => `[${i}:a]`).join('')}concat=n=${wavs.length}:v=0:a=1` : '[0:a]anull';
  let level = '';
  if (loudness !== false) {
    const target = Number(loudness);
    const m = await measure(ffmpeg, inputs, graph, target);
    level = m
      ? `,loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
      : `,loudnorm=I=${target}:TP=-1.5:LRA=11`;
  }
  const tmp = `${out}.tmp.mp3`;
  mkdirSync(dirname(out), { recursive: true });
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...inputs,
    '-filter_complex', `${graph}${level}[a]`, '-map', '[a]', '-ac', '1', '-ar', '24000',
    '-c:a', 'libmp3lame', '-b:a', String(bitrate), '-id3v2_version', '3'];
  if (title) args.push('-metadata', `title=${title}`);
  args.push(tmp);
  const r = await run(ffmpeg, args, { timeoutMs: 10 * 60 * 1000 });
  if (r.code === 'ENOENT') {
    throw new NarratorError('ffmpeg was not found. Install ffmpeg (https://ffmpeg.org), or set FFMPEG to its path.', 6);
  }
  if (r.code !== 0 || !existsSync(tmp)) {
    rmSync(tmp, { force: true });
    throw new NarratorError(`ffmpeg could not make the MP3 file: ${(r.stderr || '').trim().split('\n').slice(-3).join(' ')}`, 6);
  }
  renameSync(tmp, out);
  return statSync(out).size;
}
