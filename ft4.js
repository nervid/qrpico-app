// FT4 (docs/ft8-protocol.md, section FT4): the 77-bit messages, CRC-14 and LDPC (174, 91) of FT8
// (ft8.js); before the CRC the 77 bits are XORed with a fixed sequence. 87 data symbols of 2 bits
// (Gray), four 4-symbol sync arrays and a ramp symbol (tone 0) at each end: 105 symbols of 576
// samples at 12 kS/s (48 ms), 4-GFSK with BT = 1, tone spacing 20.833 Hz. 7.5 s slots, the signal
// starts 0.5 s into the slot and lasts 5.04 s.
(function (root) {
'use strict';
const FT8 = typeof module !== 'undefined' && module.exports ? require('./ft8.js') : root.FT8;

const RVEC = (() => {                   // the XOR sequence, 77 bits MSB first
  const b = [0x4a, 0x5e, 0x89, 0xb4, 0xb0, 0x8a, 0x79, 0x55, 0xbe, 0x28], v = new Uint8Array(77);
  for (let i = 0; i < 77; i++) v[i] = (b[i >> 3] >> (7 - (i & 7))) & 1;
  return v;
})();
const SYNC = [[0, 1, 3, 2], [1, 0, 2, 3], [2, 3, 1, 0], [3, 2, 0, 1]];
const SYNC_AT = [1, 34, 67, 100];       // first symbol of each sync array
const GRAY = [0, 1, 3, 2];              // two code bits (MSB first) -> tone
const NSYM = 105, FS = 12000, NSPS = 576, TONE_HZ = FS / NSPS, SLOT = 7.5, T0 = 0.5;
const DATA_SYMS = Array.from({ length: 87 }, (_, k) => 5 + k + 4 * Math.floor(k / 29));
const SYNC_SYMS = [], SYNC_TONE = [];
SYNC_AT.forEach((s, j) => SYNC[j].forEach((t, k) => { SYNC_SYMS.push(s + k); SYNC_TONE.push(t); }));

const scramble = bits77 => { const o = new Uint8Array(77); for (let i = 0; i < 77; i++) o[i] = bits77[i] ^ RVEC[i]; return o; };

function symbols(cw) {
  const s = new Uint8Array(NSYM);       // symbols 0 and 104: the ramps, tone 0
  SYNC_SYMS.forEach((sym, i) => { s[sym] = SYNC_TONE[i]; });
  for (let k = 0; k < 87; k++) s[DATA_SYMS[k]] = GRAY[cw[2 * k] << 1 | cw[2 * k + 1]];
  return s;
}
// text -> { tones, bits77, codeword } or null
function encode(text) {
  const p = FT8.pack77(text);
  if (!p) return null;
  const cw = FT8.encode174(scramble(p.bits));
  return { bits77: p.bits, codeword: cw, tones: symbols(cw), type: p.type };
}

// ---- GFSK waveform (QEX Eq. 3 with BT = 1)
function erf(x) {                       // Abramowitz-Stegun 7.1.26, |error| < 1.5e-7
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
let pulse = null;                       // 3 symbols long, centred on the middle one
function gfskPulse() {
  if (pulse) return pulse;
  const k = Math.PI * Math.sqrt(2 / Math.LN2), bt = 1;
  pulse = new Float64Array(3 * NSPS);
  for (let i = 0; i < 3 * NSPS; i++) {
    const t = (i - 1.5 * NSPS) / NSPS;
    pulse[i] = 0.5 * (erf(k * bt * (t + 0.5)) - erf(k * bt * (t - 0.5)));
  }
  return pulse;
}
function gfskPhase(tones, f0) {
  const p = gfskPulse(), n = tones.length * NSPS;
  const dev = new Float64Array(n + 2 * NSPS);
  const ext = [tones[0], ...tones, tones[tones.length - 1]];
  for (let j = 0; j < ext.length; j++)
    for (let i = 0; i < 3 * NSPS; i++) {
      const at = (j - 1) * NSPS + i;
      if (at >= 0 && at < dev.length) dev[at] += ext[j] * p[i];
    }
  const phase = new Float64Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += 2 * Math.PI * (f0 + dev[i + NSPS] * TONE_HZ) / FS;
    phase[i] = ph;
  }
  return phase;
}
// envelope: raised-cosine ramp over the whole first and last symbol
const envelope = (i, n) => i < NSPS ? 0.5 * (1 - Math.cos(Math.PI * i / NSPS)) : i >= n - NSPS ? 0.5 * (1 - Math.cos(Math.PI * (n - 1 - i) / NSPS)) : 1;
function synth(tones, f0, amp = 1) {
  const phase = gfskPhase(tones, f0), n = phase.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * envelope(i, n) * Math.sin(phase[i]);
  return out;
}

// =====================================================================================================
// Decoder: one 7.5 s slot of 12 kS/s audio (sample 0 = slot start) -> list of messages; the steps of
// the FT8 decoder (ft8.js) with FT4's numbers:
//   1. spectrogram (576-sample frames every half symbol, 2048-point FFT), correlation with the 16
//      sync symbols over base frequency and start frame
//   2. the band around each candidate from one FFT of the slot, complex baseband at 375 S/s (18 samples
//      per symbol); time and frequency refined on the sync symbols
//   3. 4-tone DFT per symbol -> bit log-likelihoods through the Gray map
//   4. LDPC, CRC-14 on the received (scrambled) bits, XOR, unpack
// =====================================================================================================
const INV_GRAY = new Uint8Array(4);
GRAY.forEach((tone, v) => { INV_GRAY[tone] = v; });
const NBIG = 131072, NSMALL = 4096, FS2 = FS * NSMALL / NBIG, SPS2 = NSPS * FS2 / FS;   // 375 S/s, 18
// E|tone DFT|^2 of noise / mean |baseband sample|^2: SPS2 x FS2 / (noise bandwidth of the band filter,
// 120 Hz flat + 2 x 30 Hz raised-cosine taper x 3/8)
const BB_NOISE = SPS2 * FS2 / (120 + 2 * 30 * 3 / 8);

function coarse(audio, fmin, fmax, maxCand) {
  const N = 2048, hop = NSPS / 2, nfr = Math.floor((audio.length - NSPS) / hop) + 1;
  const df = FS / N, bmax = Math.ceil((fmax + 4 * TONE_HZ) / df) + 2, P = [];
  const win = new Float64Array(NSPS);
  for (let i = 0; i < NSPS; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / NSPS);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < nfr; f++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < NSPS; i++) re[i] = audio[f * hop + i] * win[i];
    FT8.fft(re, im);
    const p = new Float32Array(bmax);
    for (let b = 0; b < bmax; b++) p[b] = re[b] * re[b] + im[b] * im[b];
    P.push(p);
  }
  const off = [0, 1, 2, 3].map(k => Math.round(k * TONE_HZ / df));
  const raw = [];
  const b0min = Math.max(1, Math.floor(fmin / df)), b0max = Math.min(bmax - off[3] - 1, Math.ceil(fmax / df));
  const t0min = -10, t0max = nfr - 2 * (NSYM - 2) - 1 + 10;
  const sc = new Float64Array(t0max - t0min + 1);
  for (let b0 = b0min; b0 <= b0max; b0++) {
    for (let t0 = t0min; t0 <= t0max; t0++) {
      let sig = 0, all = 0;
      for (let i = 0; i < 16; i++) {
        const fr = t0 + 2 * SYNC_SYMS[i];
        if (fr < 0 || fr >= nfr) continue;
        const row = P[fr];
        sig += row[b0 + off[SYNC_TONE[i]]];
        for (let j = 0; j < 4; j++) all += row[b0 + off[j]];
      }
      const noise = (all - sig) / 3;
      sc[t0 - t0min] = noise > 0 ? sig / noise : 0;
    }
    const peaks = [];
    for (let i = 0; i < sc.length; i++)
      if (sc[i] > 1.5 && (i === 0 || sc[i] >= sc[i - 1]) && (i === sc.length - 1 || sc[i] >= sc[i + 1])) peaks.push(i);
    peaks.sort((a, b) => sc[b] - sc[a]);
    for (const i of peaks.slice(0, 2)) raw.push({ f0: b0 * df, b0, frame: i + t0min, score: sc[i] });
  }
  raw.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of raw) {
    if (out.some(o => Math.abs(o.b0 - c.b0) <= 2 && Math.abs(o.frame - c.frame) <= 2)) continue;
    out.push(c);
    if (out.length >= maxCand) break;
  }
  return out;
}

// the band around f0 as complex baseband at 375 S/s; tone k at (k - 1.5) x 20.833 Hz
function baseband(spec, f0) {
  const dfb = FS / NBIG, fc = f0 + 1.5 * TONE_HZ, kc = Math.round(fc / dfb);
  const re = new Float64Array(NSMALL), im = new Float64Array(NSMALL);
  const flat = Math.round(60 / dfb), edge = Math.round(30 / dfb);
  for (let i = -flat - edge; i <= flat + edge; i++) {
    const k = kc + i;
    if (k < 1 || k >= NBIG / 2) continue;
    const a = Math.abs(i) <= flat ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (Math.abs(i) - flat) / edge);
    const j = (i + NSMALL) % NSMALL;
    re[j] = spec.re[k] * a; im[j] = spec.im[k] * a;
  }
  FT8.fft(re, im, true);
  return { re, im, fc: kc * dfb };
}
const toneTabCache = new Map();
function toneTab(dfo) {
  const key = Math.round(dfo * 100);
  let t = toneTabCache.get(key);
  if (!t) {
    t = new Float64Array(4 * SPS2 * 2);
    for (let k = 0; k < 4; k++) {
      const w = 2 * Math.PI * ((k - 1.5) * TONE_HZ + key / 100) / FS2;
      for (let n = 0; n < SPS2; n++) { t[(k * SPS2 + n) * 2] = Math.cos(w * n); t[(k * SPS2 + n) * 2 + 1] = Math.sin(w * n); }
    }
    if (toneTabCache.size > 4000) toneTabCache.clear();
    toneTabCache.set(key, t);
  }
  return t;
}
function toneAmps(bb, i0, dfo, syms) {
  const out = new Float64Array(syms.length * 8), t = toneTab(dfo), bre = bb.re, bim = bb.im;
  for (let si = 0; si < syms.length; si++) {
    const base = i0 + SPS2 * syms[si];
    const n0 = Math.max(0, -base), n1 = Math.min(SPS2, NSMALL - base);
    for (let k = 0; k < 4; k++) {
      let xr = 0, xi = 0;
      for (let n = n0; n < n1; n++) {
        const c = t[(k * SPS2 + n) * 2], sn = t[(k * SPS2 + n) * 2 + 1], r = bre[base + n], i = bim[base + n];
        xr += r * c + i * sn; xi += i * c - r * sn;
      }
      out[si * 8 + 2 * k] = xr; out[si * 8 + 2 * k + 1] = xi;
    }
  }
  return out;
}
function syncScore(bb, i0, dfo) {
  const a = toneAmps(bb, i0, dfo, SYNC_SYMS);
  let s = 0, all = 0;
  for (let si = 0; si < 16; si++)
    for (let k = 0; k < 4; k++) { const p = a[si * 8 + 2 * k] ** 2 + a[si * 8 + 2 * k + 1] ** 2; all += p; if (k === SYNC_TONE[si]) s += p; }
  return s / Math.max(1e-30, (all - s) / 3);
}

const ALL_SYMS = Array.from({ length: NSYM }, (_, i) => i);
const KNOWN = new Int8Array(NSYM).fill(-1);             // known tone of a sync / ramp symbol, -1: data
SYNC_SYMS.forEach((sym, i) => { KNOWN[sym] = SYNC_TONE[i]; });
KNOWN[0] = KNOWN[NSYM - 1] = 0;
const DATA_INDEX = new Int16Array(NSYM).fill(-1);       // symbol -> data symbol number
DATA_SYMS.forEach((sym, k) => { DATA_INDEX[sym] = k; });
// 174 LLRs (> 0: bit 0) from groups of L symbols over symbols 1 ... 103, normalised to rms 2.83
function bitMetrics(x, L) {
  const llr = new Float64Array(174);
  for (let s0 = 1; s0 < NSYM - 1; s0 += L) {
    const n = Math.min(L, NSYM - 1 - s0), opts = [];
    for (let j = 0; j < n; j++) opts.push(KNOWN[s0 + j] >= 0 ? [KNOWN[s0 + j]] : [0, 1, 2, 3]);
    const best0 = new Float64Array(2 * n), best1 = new Float64Array(2 * n), t = new Int8Array(n);
    const walk = (j, re, im) => {
      if (j === n) {
        const m = Math.hypot(re, im);
        for (let q = 0; q < n; q++) {
          const v = INV_GRAY[t[q]];
          for (let b = 0; b < 2; b++) if ((v >> (1 - b)) & 1) { if (m > best1[2 * q + b]) best1[2 * q + b] = m; } else if (m > best0[2 * q + b]) best0[2 * q + b] = m;
        }
        return;
      }
      for (const k of opts[j]) { t[j] = k; const o = (s0 + j) * 8 + 2 * k; walk(j + 1, re + x[o], im + x[o + 1]); }
    };
    walk(0, 0, 0);
    let mx = 0; for (let q = 0; q < 2 * n; q++) mx = Math.max(mx, best0[q], best1[q]);
    for (let q = 0; q < n; q++) {
      const k = DATA_INDEX[s0 + q];
      if (k >= 0) for (let b = 0; b < 2; b++) llr[2 * k + b] = (best0[2 * q + b] - best1[2 * q + b]) / (mx + 1e-30);
    }
  }
  let ss = 0; for (const v of llr) ss += v * v;
  const scale = 2.83 / Math.sqrt(ss / 174 + 1e-30);
  for (let i = 0; i < 174; i++) llr[i] *= scale;
  return llr;
}

function decodeCandidate(spec, c, hashes, stall) {
  const bb = baseband(spec, c.f0);
  const fOff = c.f0 + 1.5 * TONE_HZ - bb.fc;
  let best = { s: -1 }, i00 = Math.round(c.frame * (NSPS / 2) * FS2 / FS);
  for (let di = -10; di <= 10; di += 2)                     // coarse: 2 samples (5.3 ms), 1.5 Hz
    for (let dfo = -4.5; dfo <= 4.51; dfo += 1.5) {
      const s = syncScore(bb, i00 + di, fOff + dfo);
      if (s > best.s) best = { s, i0: i00 + di, dfo: fOff + dfo };
    }
  for (const [st, fs] of [[1, 0.75], [1, 0.375], [0, 0.19], [0, 0.1]]) {   // fine: the 4-symbol sums need the phase
    const c0 = best;
    for (let di = -st; di <= st; di++)
      for (let k = -1; k <= 1; k++) {
        if (!di && !k) continue;
        const s = syncScore(bb, c0.i0 + di, c0.dfo + k * fs);
        if (s > best.s) best = { s, i0: c0.i0 + di, dfo: c0.dfo + k * fs };
      }
  }
  if (best.s < 2) return null;
  // complex tone amplitudes of all symbols; bit metrics over 1, 2 and 4 symbols (multi-symbol: the tones
  // of a group summed coherently - with h = 1 the phase runs on across a symbol boundary - for every
  // tone combination, the sync symbols held at their known tone); LDPC on each until one decodes
  const all = toneAmps(bb, best.i0, best.dfo, ALL_SYMS);
  // each symbol's DFT starts its phase at the symbol start: turn them to one time axis (tone k advances
  // 2 pi ((k - 1.5) + dfo / 20.833) per symbol, the k x 2 pi drop out)
  const th = 2 * Math.PI * (-1.5 + best.dfo / TONE_HZ);
  for (let sym = 0; sym < NSYM; sym++) {
    const c = Math.cos(th * sym), sn = Math.sin(th * sym);
    for (let k = 0; k < 4; k++) {
      const o = sym * 8 + 2 * k, re = all[o], im = all[o + 1];
      all[o] = re * c + im * sn; all[o + 1] = im * c - re * sn;
    }
  }
  let d = null;
  let m4 = null;
  for (const L of [1, 2, 4]) {
    const m = bitMetrics(all, L);
    d = FT8.ldpcDecode(m, 40, stall);
    if (d) break;
    if (L === 2) m4 = m;
  }
  // belief propagation failed on all three: OSD on the 2-symbol metrics (CRC-14 below is its check)
  if (!d && best.s >= 2) { const o = FT8.osdDecode(m4, 32); if (o) d = { bits: o.bits, iters: 0 }; }
  if (!d) return null;
  const rx77 = d.bits.subarray(0, 77), crc = FT8.crc14(rx77);
  for (let i = 0; i < 14; i++) if (crc[i] !== d.bits[77 + i]) return null;
  const bits77 = scramble(rx77);
  if (bits77.every(x => x === 0)) return null;
  const text = FT8.unpack77(bits77, hashes);
  if (text === null) return null;
  const tones = symbols(d.bits);
  let ps = 0, pn = 0;
  DATA_SYMS.forEach(sym => { for (let k = 0; k < 4; k++) { const p = all[sym * 8 + 2 * k] ** 2 + all[sym * 8 + 2 * k + 1] ** 2; if (k === tones[sym]) ps += p; else pn += p; } });
  ps /= 87; pn /= 87 * 3;
  // noise: from the same baseband before and after the signal (FT4 stations share the slot timing, so
  // these parts are mostly free); the tones' leakage into each other would cap a strong signal near 0 dB
  const nAudio = Math.floor(spec.len * FS2 / FS) - 8, a0 = best.i0 - SPS2, a1 = best.i0 + (NSYM + 1) * SPS2;
  let qn = 0, cnt = 0;
  for (let i = 8; i < nAudio; i++) if (i < a0 || i >= a1) { qn += bb.re[i] ** 2 + bb.im[i] ** 2; cnt++; }
  if (cnt >= 200) pn = Math.min(pn, qn / cnt * BB_NOISE);
  const snr = Math.max(-24, Math.round(10 * Math.log10(Math.max(1e-6, ps - pn) / (pn * 2500 / TONE_HZ))));
  return { text, freq: c.f0 + (best.dfo - fOff), dt: best.i0 / FS2 - T0, snr, iters: d.iters, sync: best.s, tones, bits77 };
}

// remove a decoded signal: complex envelope by mixing down with its known phase, averaged over a symbol
function subtract(audio, d) {
  const phase = gfskPhase(d.tones, d.freq), start = Math.round((d.dt + T0) * FS), n = phase.length;
  const zr = new Float64Array(n), zi = new Float64Array(n), cs = new Float64Array(n), sn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cs[i] = Math.cos(phase[i]); sn[i] = Math.sin(phase[i]);
    const k = start + i;
    if (k < 0 || k >= audio.length) continue;
    zr[i] = audio[k] * cs[i]; zi[i] = -audio[k] * sn[i];
  }
  const half = NSPS / 2, cr = new Float64Array(n + 1), ci = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { cr[i + 1] = cr[i] + zr[i]; ci[i + 1] = ci[i] + zi[i]; }
  for (let i = 0; i < n; i++) {
    const k = start + i;
    if (k < 0 || k >= audio.length) continue;
    const a = Math.max(0, i - half), b = Math.min(n, i + half), m = b - a;
    const ar = 2 * (cr[b] - cr[a]) / m, ai = 2 * (ci[b] - ci[a]) / m;
    audio[k] -= ar * cs[i] - ai * sn[i];
  }
}

// audio: Float32Array of one slot at 12 kS/s (up to 7.5 s, sample 0 = slot start); not modified
function decode(audio, opt = {}) {
  const fmin = opt.fmin || 150, fmax = opt.fmax || 3100, hashes = opt.hashes || null, passes = opt.passes || 2;
  const t0 = Date.now(), work = Float32Array.from(audio.subarray(0, Math.min(audio.length, NBIG))), found = new Map();
  let ncand = 0;
  for (let pass = 0; pass < passes; pass++) {
    const cands = coarse(work, fmin, fmax, opt.maxCand || 150);
    ncand += cands.length;
    const re = new Float64Array(NBIG), im = new Float64Array(NBIG);
    re.set(work);
    FT8.fft(re, im);
    const spec = { re, im, len: work.length }, fresh = [];
    for (const c of cands) {
      const d = decodeCandidate(spec, c, hashes, opt.stall || 99);
      if (d && !found.has(d.text)) { found.set(d.text, d); fresh.push(d); }
    }
    if (!fresh.length) break;
    for (const d of fresh) subtract(work, d);
  }
  const out = [...found.values()].sort((a, b) => a.freq - b.freq);
  out.ms = Date.now() - t0; out.candidates = ncand;
  return out;
}

const FT4 = { encode, symbols, synth, decode, RVEC, SYNC, GRAY, NSYM, FS, NSPS, TONE_HZ, SLOT };
if (typeof module !== 'undefined' && module.exports) module.exports = FT4; else root.FT4 = FT4;
})(typeof self !== 'undefined' ? self : this);
