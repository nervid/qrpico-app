// WSPR for the qrpico app: message packing, convolutional code (K = 32, rate 1/2), interleaving, sync,
// 4-FSK waveform. Own code after the protocol definition in docs/wspr-protocol.md (G4JNT, "The WSPR
// Coding Process", 2009). Plain script: a global WSPR in the page or a worker, module.exports in Node.
(function (root) {
'use strict';

// sync vector, 162 values (docs/wspr-protocol.md)
const SYNC = Uint8Array.from('110000001000111000100101111000000010010100000010110011010001101000011010101010010010' +
                             '110001101010001000001001001110110011010001110000010100110000000110101100011000', c => +c);
const POLY = [0xF2D05351, 0xE4613C47];
const NSYM = 162, FS = 12000, NSPS = 8192;     // 0.6827 s symbols at 12 kS/s
const TONE_HZ = FS / NSPS;                      // 1.4648 Hz

// the call in 6 characters with its digit 3rd (G4JNT: ' G4JNT', 'GD4JNT'), or null
function call6(call) {
  call = call.toUpperCase().trim();
  if (!/^[A-Z0-9]{3,6}$/.test(call)) return null;
  const c = (/[0-9]/.test(call[2]) ? call : /[0-9]/.test(call[1]) ? ' ' + call : null);
  if (!c || c.length > 6) return null;
  const p = c.padEnd(6, ' ');
  if (!/^[ A-Z0-9][A-Z0-9][0-9][ A-Z]{3}$/.test(p) || / [A-Z]/.test(p.slice(3))) return null;
  return p;
}
const chv = ch => ch === ' ' ? 36 : /[0-9]/.test(ch) ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 55;   // 0-9, A-Z 10-35

// 50 message bits + 31 zeros (81), or null
function pack(call, grid, dbm) {
  const c = call6(call);
  grid = (grid || '').toUpperCase().slice(0, 4);
  if (!c || !/^[A-R]{2}[0-9]{2}$/.test(grid) || !(dbm >= 0 && dbm <= 60) || dbm !== Math.round(dbm)) return null;
  let n = chv(c[0]);
  n = n * 36 + chv(c[1]);
  n = n * 10 + chv(c[2]);
  for (let i = 3; i < 6; i++) n = n * 27 + chv(c[i]) - 10;
  const l = [grid.charCodeAt(0) - 65, grid.charCodeAt(1) - 65, +grid[2], +grid[3]];
  const m1 = (179 - 10 * l[0] - l[2]) * 180 + 10 * l[1] + l[3];
  const m = m1 * 128 + dbm + 64;
  const bits = new Uint8Array(81);
  for (let i = 0; i < 28; i++) bits[i] = (n >>> (27 - i)) & 1;
  for (let i = 0; i < 22; i++) bits[28 + i] = (m >>> (21 - i)) & 1;
  return bits;
}
const parity = x => { x ^= x >>> 16; x ^= x >>> 8; x ^= x >>> 4; x ^= x >>> 2; x ^= x >>> 1; return x & 1; };
function convolve(bits81) {
  const out = new Uint8Array(2 * bits81.length);
  let reg = 0;
  bits81.forEach((b, i) => {
    reg = ((reg << 1) | b) >>> 0;
    out[2 * i] = parity((reg & POLY[0]) >>> 0);
    out[2 * i + 1] = parity((reg & POLY[1]) >>> 0);
  });
  return out;
}
// interleaving: bit-reversed 8-bit addresses below 162, in order
const ORDER = (() => {
  const o = [];
  for (let i = 0; i < 256 && o.length < NSYM; i++) {
    let j = 0;
    for (let b = 0; b < 8; b++) j |= ((i >> b) & 1) << (7 - b);
    if (j < NSYM) o.push(j);
  }
  return o;
})();
function interleave(s) { const d = new Uint8Array(NSYM); ORDER.forEach((j, p) => { d[j] = s[p]; }); return d; }
function deinterleave(d) { const s = new Float64Array(NSYM); ORDER.forEach((j, p) => { s[p] = d[j]; }); return s; }

// call / grid / dBm -> { symbols: Uint8Array(162) values 0-3 } or null
function encode(call, grid, dbm) {
  const b = pack(call, grid, dbm);
  if (!b) return null;
  const d = interleave(convolve(b));
  const symbols = new Uint8Array(NSYM);
  for (let i = 0; i < NSYM; i++) symbols[i] = SYNC[i] + 2 * d[i];
  return { symbols, bits: b };
}
// 4-FSK, continuous phase, tone 0 at f0 Hz, 162 x 8192 samples at 12 kS/s (110.6 s)
function synth(symbols, f0, amp = 1) {
  const out = new Float32Array(symbols.length * NSPS);
  let ph = 0;
  for (let k = 0; k < symbols.length; k++) {
    const w = 2 * Math.PI * (f0 + symbols[k] * TONE_HZ) / FS;
    for (let i = 0; i < NSPS; i++) { ph += w; out[k * NSPS + i] = amp * Math.sin(ph); }
    ph %= 2 * Math.PI;
  }
  return out;
}

// 50 bits -> { call, grid, dbm } (type 1 only), or null
function unpack(bits50) {
  let n = 0, m = 0;
  for (let i = 0; i < 28; i++) n = n * 2 + bits50[i];
  for (let i = 0; i < 22; i++) m = m * 2 + bits50[28 + i];
  const ALL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
  const c = [];
  for (let i = 5; i >= 3; i--) { c[i] = ALL[n % 27 + 10]; n = Math.floor(n / 27); }
  c[2] = ALL[n % 10]; n = Math.floor(n / 10);
  c[1] = ALL[n % 36]; n = Math.floor(n / 36);
  if (n > 36) return null;
  c[0] = ALL[n];
  const dbm = m % 128 - 64, m1 = Math.floor(m / 128);
  if (dbm < 0 || dbm > 60 || m1 > 32220) return null;
  const l2l4 = m1 % 180, x = 179 - Math.floor(m1 / 180);          // x = 10 L1 + L3
  const l1 = Math.floor(x / 10), l3 = x % 10, l2 = Math.floor(l2l4 / 10), l4 = l2l4 % 10;
  if (l1 > 17 || l2 > 17) return null;
  return { call: c.join('').trim(), grid: String.fromCharCode(65 + l1, 65 + l2) + l3 + l4, dbm };
}


// =====================================================================================================
// Decoder: one 2-minute period of 12 kS/s audio (sample 0 = the even minute) -> list of spots.
//   1. the band 1500 +- 187 Hz from one FFT of the whole period, back to complex baseband at 375 S/s
//      (256 samples per symbol); a spectrogram with half-symbol steps and half-tone bins
//   2. candidates: correlation with the sync vector (the low bit of each symbol decides between the
//      tone pairs {0, 2} and {1, 3}) over frequency (+-110 Hz) and start (-1 ... +3 s)
//   3. per candidate: time and frequency refined on the sync; soft data bits (tone s + 2 against tone s,
//      s = the known sync bit); de-interleaving
//   4. sequential decoding of the K = 32 rate 1/2 code (Fano algorithm), tail of 31 zero bits enforced;
//      checks: a valid message and its re-encoded symbols agreeing with the received ones
// =====================================================================================================
const FFT = typeof FT8 !== 'undefined' ? FT8.fft : (typeof require === 'function' ? require('./ft8.js').fft : null);
const NBIG = 1 << 21, NSMALL = NBIG / 32, FS2 = FS / 32, SPS2 = NSPS / 32;   // 375 S/s, 256 per symbol
const FC = 1500;                                        // centre of the WSPR band in the audio

function baseband(audio) {
  const re = new Float64Array(NBIG), im = new Float64Array(NBIG);
  re.set(audio.subarray(0, Math.min(audio.length, NBIG)));
  FFT(re, im);
  const df = FS / NBIG, kc = Math.round(FC / df), half = NSMALL / 2 - 1;
  const br = new Float64Array(NSMALL), bi = new Float64Array(NSMALL);
  for (let i = -half; i <= half; i++) { const j = (i + NSMALL) % NSMALL; br[j] = re[kc + i]; bi[j] = im[kc + i]; }
  FFT(br, bi, true);
  return { re: br, im: bi, fc: kc * df };
}

// complex amplitude of a tone (Hz from the centre) over one symbol starting at sample i0
function toneAt(bb, i0, f) {
  const w = 2 * Math.PI * f / FS2, dc = Math.cos(w), ds = Math.sin(w);   // a rotating phasor: no cos / sin per sample
  let xr = 0, xi = 0;
  const n0 = Math.max(0, -i0), n1 = Math.min(SPS2, NSMALL - i0);
  let c = Math.cos(w * n0), s = Math.sin(w * n0);
  for (let n = n0; n < n1; n++) {
    const r = bb.re[i0 + n], q = bb.im[i0 + n];
    xr += r * c + q * s; xi += q * c - r * s;
    const c2 = c * dc - s * ds; s = s * dc + c * ds; c = c2;
  }
  return xr * xr + xi * xi;
}
// powers of the 4 tones of every symbol: tone 0 at f0 (Hz from the centre), start sample i0, drift dr (Hz over the period)
function symbolPowers(bb, i0, f0, dr) {
  const p = new Float64Array(NSYM * 4);
  for (let s = 0; s < NSYM; s++) {
    const fd = f0 + dr * (s - NSYM / 2) / NSYM;
    for (let k = 0; k < 4; k++) p[4 * s + k] = toneAt(bb, i0 + s * SPS2, fd + k * TONE_HZ);
  }
  return p;
}
function syncMetric(p) {
  let m = 0, all = 0;
  for (let s = 0; s < NSYM; s++) {
    const a = p[4 * s] + p[4 * s + 2], b = p[4 * s + 1] + p[4 * s + 3];
    m += SYNC[s] ? b - a : a - b; all += a + b;
  }
  return m / (all + 1e-30);
}

// coarse search on a spectrogram: 512-point FFTs of 256-sample symbols, half-symbol hop: bins of 0.732 Hz
function coarse(bb, maxCand) {
  const N = 512, hop = SPS2 / 2, nfr = Math.floor((NSMALL - SPS2) / hop), P = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < nfr; f++) {
    re.fill(0); im.fill(0);
    for (let n = 0; n < SPS2; n++) { re[n] = bb.re[f * hop + n]; im[n] = bb.im[f * hop + n]; }
    FFT(re, im);
    const row = new Float32Array(N);
    for (let k = 0; k < N; k++) { const j = (k + N / 2) % N; row[k] = re[j] * re[j] + im[j] * im[j]; }   // centred: bin N/2 = 0 Hz
    P.push(row);
  }
  const dfb = FS2 / N, cands = [], DRIFTS = [-8, -4, 0, 4, 8];   // Hz over the transmission
  const kmin = Math.round(N / 2 - 110 / dfb), kmax = Math.round(N / 2 + 110 / dfb) - 6;
  // bin offset of symbol s for each drift
  const doff = DRIFTS.map(dr => Int8Array.from({ length: NSYM }, (_, s) => Math.round(dr * (s - NSYM / 2) / NSYM / dfb)));
  for (let k = kmin; k <= kmax; k++) {
    let best = -1, bt = 0, bd = 0;
    for (let t = -3; t <= 24; t++) {            // start -1 ... +4 s after the minute in half symbols (0.34 s)
      for (let di = 0; di < DRIFTS.length; di++) {
        const o = doff[di];
        let m = 0, all = 0;
        for (let s = 0; s < NSYM; s++) {
          const row = P[t + 2 * s]; if (!row) continue;
          const kk = k + o[s];
          if (kk < 0 || kk + 6 >= N) continue;
          const a = row[kk] + row[kk + 4], b = row[kk + 2] + row[kk + 6];
          m += SYNC[s] ? b - a : a - b; all += a + b;
        }
        const v = m / (all + 1e-30);
        if (v > best) { best = v; bt = t; bd = DRIFTS[di]; }
      }
    }
    cands.push({ f0: (k - N / 2) * dfb, i0: bt * hop, dr: bd, score: best });
  }
  const out = cands.filter((c, i) => c.score > 0.12 && (i === 0 || c.score >= cands[i - 1].score) && (i === cands.length - 1 || c.score >= cands[i + 1].score));
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxCand);
}

// ---- Fano sequential decoder for the K = 32, rate 1/2 code; soft[] = 162 values, > 0 favours bit 1.
// Branch metric per code bit: log2(2 P(r | c) / (P(r | 0) + P(r | 1))) - 1/2 (the rate bias), with the
// soft value as a log-likelihood ratio.
function fano(soft, maxCycles = 20000, delta = 2) {
  const N = 81, NI = 50;                        // 50 information bits, then 31 zero tail bits
  // per code bit: metric for c = 0 and c = 1
  const m0 = new Float64Array(162), m1 = new Float64Array(162);
  for (let i = 0; i < 162; i++) {
    const L = Math.max(-30, Math.min(30, soft[i]));
    const p1 = 1 / (1 + Math.exp(-L));         // P(c = 1 | r)
    m1[i] = Math.log2(2 * p1 + 1e-12) - 0.5; m0[i] = Math.log2(2 * (1 - p1) + 1e-12) - 0.5;
  }
  const branch = (state, bit, i) => {           // metric of extending `state` by `bit` at depth i
    const reg = ((state << 1) | bit) >>> 0;
    const c0 = parity((reg & POLY[0]) >>> 0), c1 = parity((reg & POLY[1]) >>> 0);
    return { reg, m: (c0 ? m1 : m0)[2 * i] + (c1 ? m1 : m0)[2 * i + 1] };
  };
  // node arrays: metric to the node, register state, which branch (0 = better, 1 = worse) was taken
  const M = new Float64Array(N + 1), R = new Uint32Array(N + 1), tried = new Uint8Array(N + 1), bits = new Uint8Array(N);
  const bm = [new Float64Array(N), new Float64Array(N)], bb = [new Uint8Array(N), new Uint8Array(N)], br = [new Uint32Array(N), new Uint32Array(N)];
  const expand = i => {                         // the two branches of node i, better first
    if (i >= NI) { const z = branch(R[i], 0, i); bm[0][i] = z.m; bb[0][i] = 0; br[0][i] = z.reg; bm[1][i] = -Infinity; return; }
    const a = branch(R[i], 0, i), b = branch(R[i], 1, i);
    const first = a.m >= b.m ? [a, 0, b, 1] : [b, 1, a, 0];
    bm[0][i] = first[0].m; bb[0][i] = first[1]; br[0][i] = first[0].reg;
    bm[1][i] = first[2].m; bb[1][i] = first[3]; br[1][i] = first[2].reg;
  };
  let i = 0, T = 0, cycles = 0;
  M[0] = 0; R[0] = 0; tried[0] = 0; expand(0);
  while (cycles++ < maxCycles * N) {
    const k = tried[i], mnext = M[i] + bm[k][i];
    if (mnext >= T) {                           // forward
      bits[i] = bb[k][i]; R[i + 1] = br[k][i]; M[i + 1] = mnext;
      if (M[i] < T + delta) while (M[i + 1] >= T + delta) T += delta;   // first visit: tighten
      i++;
      if (i === N) return { bits: bits.slice(0, NI), metric: M[N], cycles };
      tried[i] = 0; expand(i);
      continue;
    }
    // look back
    for (;;) {
      if (i === 0 || M[i - 1] < T) { T -= delta; tried[i] = tried[i]; break; }
      i--;
      if (tried[i] === 0 && bm[1][i] > -Infinity) { tried[i] = 1; break; }
      // both branches of node i tried: keep backing up
    }
  }
  return null;
}

// one candidate -> spot or null
function decodeCandidate(bb, c, P = {}) {
  let best = { m: -1 };
  for (let di = -64; di <= 64; di += 16)       // +-0.17 s, then finer
    for (let df = -0.6; df <= 0.61; df += 0.3) {
      const m = syncMetric(symbolPowers(bb, c.i0 + di, c.f0 + df, c.dr || 0));
      if (m > best.m) best = { m, i0: c.i0 + di, f0: c.f0 + df, dr: c.dr || 0 };
    }
  for (const [step, fs] of [[8, 0.15], [4, 0.08], [2, 0.04]]) {
    const b0 = best;
    for (let di = -step; di <= step; di += step) for (let k = -1; k <= 1; k++) {
      const m = syncMetric(symbolPowers(bb, b0.i0 + di, b0.f0 + k * fs, b0.dr));
      if (m > best.m) best = { m, i0: b0.i0 + di, f0: b0.f0 + k * fs, dr: b0.dr };
    }
  }
  for (const step of [2, 1, 0.5]) {             // linear drift over the transmission, Hz
    const b0 = best;
    for (const dr of [b0.dr - step, b0.dr + step]) {
      const m = syncMetric(symbolPowers(bb, best.i0, best.f0, dr));
      if (m > best.m) best = { ...best, m, dr };
    }
  }
  if (best.m < 0.2) return null;
  // the sync metric is flat over about a quarter symbol: if the decoder fails at the best sync, try
  // nearby time / frequency offsets (a failing Fano run costs some 10 ms, a succeeding one much less)
  const tries = [[0, 0], [-16, 0], [16, 0], [-32, 0], [32, 0], [0, -0.3], [0, 0.3], [-48, 0], [48, 0], [-16, -0.3], [16, 0.3]];
  let f = null, p = null, noise = 0;
  for (const [di, dfo] of tries.slice(0, P.tries || tries.length)) {
    p = symbolPowers(bb, best.i0 + di, best.f0 + dfo, best.dr);
    // soft data bits: noncoherent FSK, LLR ~ (P(tone sync + 2) - P(tone sync)) / noise power per tone; the
    // two tones of the other sync parity carry only noise and give that power
    noise = 0;
    for (let s = 0; s < NSYM; s++) noise += p[4 * s + 1 - SYNC[s]] + p[4 * s + 3 - SYNC[s]];
    noise /= 2 * NSYM;
    const d = new Float64Array(NSYM), k = P.scale || 0.5;   // 0.5: best on the synthetic test (5 / 5 to -26 dB with delta 4)
    for (let s = 0; s < NSYM; s++) d[s] = k * (p[4 * s + SYNC[s] + 2] - p[4 * s + SYNC[s]]) / (noise + 1e-30);
    f = fano(deinterleave(d), di || dfo ? (P.cycles2 || 3000) : (P.cycles || 20000), P.delta || 4);   // retries: a smaller budget
    if (f) { best = { ...best, i0: best.i0 + di, f0: best.f0 + dfo }; break; }
  }
  if (!f) return null;
  const bits81 = new Uint8Array(81); bits81.set(f.bits);
  const u = unpack(f.bits);
  if (!u) return null;
  // the re-encoded symbols must agree with the strongest tone of most received symbols
  const sym = encode(u.call, u.grid, u.dbm);
  if (!sym) return null;
  let agree = 0;
  for (let s = 0; s < NSYM; s++) { let mk = 0; for (let k = 1; k < 4; k++) if (p[4 * s + k] > p[4 * s + mk]) mk = k; if (mk === sym.symbols[s]) agree++; }
  if (agree < 0.45 * NSYM) return null;
  // SNR in 2500 Hz: signal power per symbol (the transmitted tone) over the band noise per tone bin
  let ps = 0;
  for (let s = 0; s < NSYM; s++) ps += p[4 * s + sym.symbols[s]];
  ps /= NSYM;
  const pn = P.noise || noise;
  const snr = Math.round(10 * Math.log10(Math.max(1e-9, ps - pn) / (pn * 2500 / TONE_HZ)));
  return { ...u, snr: Math.max(-33, snr), dt: best.i0 / FS2 - 1, freq: FC + best.f0 + 1.5 * TONE_HZ, drift: best.dr, agree };
}

// audio: Float32Array of one period (up to 114 s at 12 kS/s, sample 0 = the even minute)
// noise power per tone bin: median of single-symbol tone powers across the band and the period
function bandNoise(bb) {
  const v = [];
  for (let f = -100; f <= 100; f += 3.7) for (let s = 0; s < NSYM; s += 7) v.push(toneAt(bb, 375 + s * SPS2, f));
  v.sort((a, b) => a - b);
  return v[v.length >> 1] / Math.LN2;           // median of an exponential = mean x ln 2
}

function decode(audio, opt = {}) {
  const t0 = Date.now(), bb = baseband(audio), noise = bandNoise(bb);
  const cands = coarse(bb, opt.maxCand || 60), found = new Map();
  for (const c of cands) {
    const d = decodeCandidate(bb, c, { noise });
    if (d) { const key = `${d.call} ${d.grid} ${d.dbm}`; if (!found.has(key)) found.set(key, d); }
  }
  const out = [...found.values()].sort((a, b) => a.freq - b.freq);
  out.ms = Date.now() - t0; out.candidates = cands.length;
  return out;
}

const WSPR = { pack, unpack, convolve, interleave, deinterleave, encode, synth, call6, decode, fano, SYNC, POLY, ORDER, NSYM, FS, NSPS, TONE_HZ };
if (typeof module !== 'undefined' && module.exports) module.exports = WSPR; else root.WSPR = WSPR;
})(typeof self !== 'undefined' ? self : this);
