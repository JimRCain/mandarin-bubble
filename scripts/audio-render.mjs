#!/usr/bin/env node
/**
 * Offline TTS batch renderer for Mandarin Bubble.
 *
 * Reads unique word ids from content/words/*.json and renders one mono mp3
 * per id into public/audio/<id>.mp3, speaking that entry's hanzi via DashScope.
 * Rewrites public/audio/manifest.json once at the end of a run with the sorted
 * list of ids actually present on disk.
 *
 * Resumable: any clip already on disk is skipped, so a later run continues
 * where the previous one stopped. Nothing here touches src/ or tests, and it
 * never commits or publishes.
 *
 * Usage:
 *   node scripts/audio-render.mjs [--limit N] [--dry-run] [--probe]
 *                                 [--model M] [--voice V] [--max-minutes M]
 *                                 [--concurrency C] [--bitrate 40k]
 *
 *   --limit N        max clips to render this run (default 300)
 *   --dry-run        list what would be rendered, synthesize nothing
 *   --probe          render + mechanically verify exactly one clip, then exit
 *   --model M        DashScope TTS model (default $MRB_TTS_MODEL or cosyvoice-v2)
 *   --voice V        voice name       (default $MRB_TTS_VOICE or longxiaochun_v2)
 *   --max-minutes M  wall-clock cap   (default 45)
 *   --concurrency C  parallel requests (default 4)
 *   --bitrate B      mp3 bitrate      (default 40k)
 */
import { readFile, writeFile, readdir, mkdir, stat, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WORDS_DIR = path.join(ROOT, 'content', 'words');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const MANIFEST = path.join(AUDIO_DIR, 'manifest.json');

const API_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

// ---------- args ----------
function parseArgs(argv) {
  const out = {
    limit: 300,
    dryRun: false,
    probe: false,
    model: process.env.MRB_TTS_MODEL || 'cosyvoice-v2',
    voice: process.env.MRB_TTS_VOICE || 'longxiaochun_v2',
    maxMinutes: 45,
    concurrency: 4,
    bitrate: '40k',
    minInterval: 400,
    maxRetries: 6,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--limit') out.limit = Number(next());
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--probe') out.probe = true;
    else if (a === '--model') out.model = next();
    else if (a === '--voice') out.voice = next();
    else if (a === '--max-minutes') out.maxMinutes = Number(next());
    else if (a === '--concurrency') out.concurrency = Number(next());
    else if (a === '--bitrate') out.bitrate = next();
    else if (a === '--min-interval-ms') out.minInterval = Number(next());
    else if (a === '--max-retries') out.maxRetries = Number(next());
    else if (a === '-h' || a === '--help') {
      console.log('see header of scripts/audio-render.mjs');
      process.exit(0);
    } else throw new Error(`unknown arg: ${a}`);
  }
  return out;
}

// ---------- key ----------
async function loadKey() {
  const env = (process.env.DASHSCOPE_API_KEY || '').trim();
  if (env && env !== 'None') return env;
  for (const p of ['~/.hermes/.env', '~/.hermes/credentials/accounts.txt']) {
    const file = path.join(os.homedir(), p.slice(2));
    try {
      const text = await readFile(file, 'utf8');
      const m = text.match(/DASHSCOPE_API_KEY\s*=\s*["']?([^"'\s]+)/);
      if (m) return m[1];
    } catch { /* try next */ }
  }
  throw new Error('DASHSCOPE_API_KEY not found (env, ~/.hermes/.env, accounts.txt)');
}

// ---------- word list ----------
async function loadWorklist() {
  const files = (await readdir(WORDS_DIR)).filter((f) => f.endsWith('.json'));
  const byId = new Map();
  for (const f of files) {
    const entries = JSON.parse(await readFile(path.join(WORDS_DIR, f), 'utf8'));
    for (const e of entries) {
      if (e && typeof e.id === 'string' && !byId.has(e.id)) byId.set(e.id, e);
    }
  }
  return byId;
}

function cleanHanzi(hanzi) {
  // Speak the Hanzi only; strip whitespace and stray non-CJK separators.
  return String(hanzi ?? '').replace(/\s+/g, '').trim();
}

async function existingClips() {
  if (!existsSync(AUDIO_DIR)) return new Set();
  const files = await readdir(AUDIO_DIR);
  const set = new Set();
  for (const f of files) {
    if (!f.endsWith('.mp3')) continue;
    const st = await stat(path.join(AUDIO_DIR, f));
    if (st.size > 0) set.add(f.slice(0, -4));
  }
  return set;
}

// ---------- DashScope ----------
// DashScope enforces a per-model QPS cap (observed: HTTP 429 under 4-way
// concurrency), so we gate request starts to a minimum interval and retry
// transient failures with exponential backoff instead of counting them dead.
let gate = Promise.resolve();
let lastStart = 0;
function throttle(minInterval) {
  gate = gate.then(async () => {
    const wait = lastStart + minInterval - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
  });
  return gate;
}

function isTransient(msg) {
  return /HTTP (429|5\d\d)/.test(msg) ||
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|audio fetch|network/i.test(msg);
}

async function withRetry(fn, maxRetries, label) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === maxRetries || !isTransient(e.message)) throw e;
      const backoff = Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500;
      console.log(`${label} retry ${attempt}/${maxRetries - 1} in ${(backoff / 1000).toFixed(1)}s (${e.message.slice(0, 60)})`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function synthesizeWav(text, key, model, voice, minInterval) {
  await throttle(minInterval);
  const body = {
    model,
    input: { text, voice, language_type: 'auto' },
    parameters: { speech_rate: 1.0 },
  };
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let resp;
  try { resp = JSON.parse(raw); } catch { throw new Error(`non-JSON ${res.status}: ${raw.slice(0, 300)}`); }
  if (!res.ok) {
    const msg = resp?.message || resp?.error?.message || raw.slice(0, 300);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  const audio = resp?.output?.audio || {};
  const chars = resp?.usage?.characters ?? text.length;
  if (audio.data) return { buf: Buffer.from(audio.data, 'base64'), chars };
  let url = audio.url || '';
  if (!url) throw new Error(`no audio in response: ${raw.slice(0, 300)}`);
  if (url.startsWith('http://')) url = 'https://' + url.slice(7);
  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error(`audio fetch HTTP ${audioRes.status}`);
  return { buf: Buffer.from(await audioRes.arrayBuffer()), chars };
}

async function toMonoMp3(wavPath, outPath, bitrate) {
  await execFileP('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', wavPath,
    '-ac', '1', '-ar', '24000',
    '-codec:a', 'libmp3lame', '-b:a', bitrate,
    outPath,
  ], { timeout: 120 });
}

async function probeDuration(file) {
  const { stdout } = await execFileP('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file,
  ], { timeout: 30 });
  return Number(String(stdout).trim());
}

async function meanVolumeDb(file) {
  // ffmpeg writes volumedetect to stderr and exits 0.
  const { stderr } = await execFileP('ffmpeg', [
    '-hide_banner', '-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-',
  ], { timeout: 60 }).catch((e) => ({ stderr: (e.stderr || '') + (e.stdout || '') }));
  const m = String(stderr).match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  return m ? Number(m[1]) : NaN;
}

// ---------- render one ----------
async function renderOne(entry, key, opts, tmpDir) {
  const hanzi = cleanHanzi(entry.hanzi);
  const dest = path.join(AUDIO_DIR, `${entry.id}.mp3`);
  const { buf, chars } = await synthesizeWav(hanzi, key, opts.model, opts.voice, opts.minInterval);
  const wavTmp = path.join(tmpDir, `${entry.id}.wav`);
  const mp3Tmp = path.join(tmpDir, `${entry.id}.mp3`);
  await writeFile(wavTmp, buf);
  try {
    await toMonoMp3(wavTmp, mp3Tmp, opts.bitrate);
    await rename(mp3Tmp, dest);
  } finally {
    await unlink(wavTmp).catch(() => {});
    await unlink(mp3Tmp).catch(() => {});
  }
  const st = await stat(dest);
  return { bytes: st.size, chars };
}

// ---------- verify ----------
async function verifyClip(file) {
  const dur = await probeDuration(file).catch(() => NaN);
  const mean = await meanVolumeDb(file).catch(() => NaN);
  const ok = dur >= 0.2 && dur <= 4 && Number.isFinite(mean) && mean > -50;
  return { ok, dur, mean };
}

// ---------- main ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const deadline = started + opts.maxMinutes * 60_000;

  await mkdir(AUDIO_DIR, { recursive: true });
  const tmpDir = path.join(AUDIO_DIR, '.tmp');
  await mkdir(tmpDir, { recursive: true });

  const byId = await loadWorklist();
  const all = [...byId.values()];

  // Hanzi anomalies: entries whose hanzi has no CJK character (content bug).
  const anomalies = all.filter((e) => !CJK.test(String(e.hanzi ?? '')));

  const onDisk = await existingClips();
  const eligible = all.filter((e) => CJK.test(String(e.hanzi ?? '')));
  const todo = eligible.filter((e) => !onDisk.has(e.id));
  const batch = todo.slice(0, opts.limit);

  console.log(`word ids: ${all.length} unique | eligible: ${eligible.length} | already on disk: ${onDisk.size} | remaining: ${todo.length} | this batch: ${batch.length}`);
  if (anomalies.length) {
    for (const e of anomalies) console.log(`SKIP no-cjk id=${e.id} hanzi=${JSON.stringify(e.hanzi)}`);
  }

  if (opts.dryRun) {
    console.log('dry-run: nothing synthesized');
    return;
  }

  const key = await loadKey();

  // --- PROBE ---
  if (opts.probe) {
    const target = batch[0] || eligible[0];
    console.log(`probe target id=${target.id} hanzi=${JSON.stringify(target.hanzi)} model=${opts.model} voice=${opts.voice}`);
    let lastErr = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await renderOne(target, key, opts, tmpDir);
        const v = await verifyClip(path.join(AUDIO_DIR, `${target.id}.mp3`));
        console.log(`probe attempt ${attempt}: bytes=${r.bytes} dur=${v.dur.toFixed(3)}s mean=${v.mean.toFixed(2)}dB ok=${v.ok}`);
        if (v.ok) { console.log('PROBE OK'); return; }
        lastErr = `verification failed: dur=${v.dur} mean=${v.mean}`;
      } catch (e) {
        lastErr = e.message;
        console.log(`probe attempt ${attempt}: error ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log('PROBE FAILED');
    console.log(lastErr);
    process.exit(1);
  }

  // --- BATCH ---
  let done = 0, failed = 0, bytes = 0, chars = 0;
  const failures = [];
  const queue = [...batch];
  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
    while (queue.length) {
      if (Date.now() > deadline) return;
      const e = queue.shift();
      const label = `[${done + failed + 1}/${batch.length}] ${e.id}`;
      try {
        const r = await withRetry(() => renderOne(e, key, opts, tmpDir), opts.maxRetries, label);
        const v = await verifyClip(path.join(AUDIO_DIR, `${e.id}.mp3`));
        done++; bytes += r.bytes; chars += r.chars;
        console.log(`${label} ok ${r.bytes}B ${v.dur.toFixed(2)}s ${v.mean.toFixed(1)}dB`);
      } catch (err) {
        failed++; failures.push(`${e.id}: ${err.message}`);
        console.log(`${label} FAIL ${err.message}`);
      }
    }
  });
  await Promise.all(workers);

  const timedOut = Date.now() >= deadline && queue.length > 0;

  // --- MANIFEST (once) ---
  const finalIds = [...(await existingClips())].sort();
  await writeFile(MANIFEST, JSON.stringify({ clips: finalIds }, null, 2) + '\n');
  await unlink(tmpDir).catch(() => {});
  // remove tmp dir if empty
  try { const rest = await readdir(tmpDir); if (!rest.length) await unlink(tmpDir); } catch {
    /* already gone: nothing to clean up */
  }

  const totalBytes = (await Promise.all(finalIds.map(async (id) =>
    (await stat(path.join(AUDIO_DIR, `${id}.mp3`)).catch(() => ({ size: 0 }))).size))).reduce((a, b) => a + b, 0);

  const remaining = all.filter((e) => CJK.test(String(e.hanzi ?? '')) && !finalIds.includes(e.id)).length;
  const projectedBytes = finalIds.length ? Math.round((totalBytes / finalIds.length) * eligible.length) : 0;

  console.log('--- SUMMARY ---');
  console.log(`rendered this run: ${done}`);
  console.log(`failed this run: ${failed}`);
  console.log(`total on disk: ${finalIds.length} / ${all.length} unique (eligible ${eligible.length})`);
  console.log(`remaining: ${remaining}`);
  console.log(`added: ${(bytes / 1048576).toFixed(3)} MB | total: ${(totalBytes / 1048576).toFixed(3)} MB | mean: ${finalIds.length ? Math.round(totalBytes / finalIds.length) : 0} B`);
  console.log(`projected total if all ${eligible.length} rendered: ${(projectedBytes / 1048576).toFixed(2)} MB`);
  console.log(`tts characters billed this run: ${chars}`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(0)}s${timedOut ? ' (STOPPED at time cap)' : ''}`);
  if (failures.length) console.log(`failures:\n  ${failures.slice(0, 20).join('\n  ')}`);
  console.log(`manifest ids: ${finalIds.length}`);
}

main().catch((e) => { console.error('FATAL', e.stack || e.message); process.exit(1); });