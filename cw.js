// CW decoder for one signal in the 12 kS/s receive audio (CW mode: the station at about 600 Hz).
// Own algorithm:
//   1. pitch: the strongest tone in 300 ... 900 Hz from a 4096-point spectrum every 0.34 s, followed slowly
//   2. envelope: the audio mixed down at the pitch, averaged over half a dot, one value per 2 ms
//   3. levels: signal and noise from percentiles of the last 3 s; key down when the envelope is above the
//      middle (dB) between them, with hysteresis and a minimum hold of a fifth of a dot; no decoding below
//      a minimum SNR between the two levels (pure noise gives about 8 dB)
//   4. timing: the dot length from the recent marks (short / long split), marks -> dot / dash, spaces ->
//      element / character / word gaps; a character is emitted as soon as its gap is long enough
// Output through onText(text, info): characters and spaces; info = { wpm, snrDb, pitch, uncertain }.
(function (root) {
'use strict';
const FT8 = typeof module !== 'undefined' && module.exports ? require('./ft8.js') : root.FT8;   // FFT

const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-', '+': '.-.-.', '-': '-....-',
};
const DECODE = Object.fromEntries(Object.entries(MORSE).map(([c, m]) => [m, c]));
DECODE['...-.-'] = '<SK>'; DECODE['-.--.'] = '<KN>'; DECODE['.-...'] = '<AS>'; DECODE['........'] = '<HH>';

const FS = 12000, HOP = 24;              // envelope every 2 ms
const NFFT = 4096;

class CwDecoder {
  constructor(onText, opt = {}) {
    this.onText = onText;
    this.pitch = opt.pitch || 600;        // Hz, followed
    this.toneOpen = opt.toneOpen || 5;    // squelch: tone-to-noise ratio of the spectrum to open, and to stay open
    this.toneHold = opt.toneHold || 2.5;
    this.open = false; this.below = 0; this.closedFor = 0; this.tone = 0;
    this.peak = 1e-9;
    this.ph = 0; this.accN = 0; this.ar = 0; this.ai = 0; this.hr = []; this.hi = []; this.lvlN = 0; this.pend = 0;
    this.fbuf = new Float32Array(NFFT); this.fn = 0; this.sinceFft = 0;
    this.env = [];                        // recent envelope values (for the noise floor)
    this.sig = 1e-9; this.noise = 1e-9;
    this.key = false; this.run = 0;       // current state and its length in envelope steps
    this.wpm0 = opt.wpm || 20;
    this.dot = 600 / this.wpm0;           // dot length in envelope steps (2 ms)
    this.t = 0;                           // envelope steps so far; evT: the time of the event being judged
    this.fit = 0.5; this.bad = 0.5;       // timing misfit and share of unknown characters (lower: better)
    this.delta = 0;                       // marks measure this much longer, spaces shorter (steps)
    this.marks = [];                      // recent mark lengths
    this.code = ''; this.charDone = true; this.wordDone = true; this.unc = false;
    this.win = new Float32Array(NFFT);
    for (let i = 0; i < NFFT; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / NFFT);
  }
  info() {
    return { wpm: Math.round(1200 / (this.dot * HOP / FS * 1000)), snrDb: Math.round(20 * Math.log10(this.sig / this.noise)), open: this.open,
             pitch: Math.round(this.pitch), uncertain: this.unc };
  }
  push(x) {                               // Float32Array of 12 kS/s audio
    const w = 2 * Math.PI * this.pitch / FS;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      this.ar += v * Math.cos(this.ph); this.ai -= v * Math.sin(this.ph);
      this.ph += w; if (this.ph > 2 * Math.PI) this.ph -= 2 * Math.PI;
      this.fbuf[this.fn++ % NFFT] = v;
      if (++this.accN === HOP) {
        this.hr.push(this.ar); this.hi.push(this.ai);
        if (this.hr.length > 64) { this.hr.shift(); this.hi.shift(); }
        this.ar = this.ai = 0; this.accN = 0;
        // matched to the keying: the mixed-down audio averaged over about half a dot (>= 4 ms)
        const L = Math.min(this.hr.length, Math.max(2, Math.round(this.dot / 2)));
        let sr = 0, si = 0;
        for (let k = this.hr.length - L; k < this.hr.length; k++) { sr += this.hr[k]; si += this.hi[k]; }
        this.step(Math.hypot(sr, si) / (L * HOP));
      }
    }
    this.sinceFft += x.length;
    if (this.sinceFft >= NFFT / 2 && this.fn >= NFFT) { this.sinceFft = 0; this.trackPitch(); }
  }
  // every 171 ms (4096-point spectrum, 341 ms): pitch, and the squelch from a narrow tone in 300 ... 900 Hz:
  // power within +-17 Hz of the strongest bin against the median bin. Noise alone gives about 2, a keyed
  // carrier 10 dB below the noise in 500 Hz still about 8. Open at toneOpen in two analyses in a row, closed
  // after 0.5 s below toneHold (a word gap may close it: reopening replays the last second); 3 s closed: the
  // timing starts afresh.
  trackPitch() {
    const re = new Float64Array(NFFT), im = new Float64Array(NFFT), o = this.fn % NFFT;
    for (let i = 0; i < NFFT; i++) re[i] = this.fbuf[(o + i) % NFFT] * this.win[i];
    FT8.fft(re, im);
    const df = FS / NFFT, k0 = Math.round(300 / df), k1 = Math.round(900 / df), P = new Float64Array(k1 + 8);
    let best = k0;
    for (let k = k0 - 7; k <= k1 + 7; k++) P[k] = re[k] * re[k] + im[k] * im[k];
    for (let k = k0; k <= k1; k++) if (P[k] > P[best]) best = k;
    const med = Array.from(P.subarray(k0, k1 + 1)).sort((a, b) => a - b)[(k1 - k0) >> 1] + 1e-30;
    let sum = 0; for (let k = best - 6; k <= best + 6; k++) sum += P[k];
    const tone = sum / (13 * med / Math.LN2);           // the median of exponential powers is mean x ln 2
    this.tone = tone;
    const a = P[best - 1], b = P[best], c = P[best + 1], f = (best + 0.5 * (a - c) / (a - 2 * b + c || 1)) * df;
    const was = this.open;
    if (!this.open) {
      this.pre = tone >= this.toneOpen ? (this.pre || 0) + 1 : 0;
      if (this.pre >= 2) { this.open = true; this.below = 0; this.pitch = f; }
    } else {
      this.below = tone < this.toneHold ? this.below + 1 : 0;
      if (this.below >= 3) this.open = false;
      else if (tone >= this.toneHold && Math.abs(f - this.pitch) <= 40) this.pitch += 0.3 * (f - this.pitch);
    }
    if (this.open && !was) this.replay();
    if (!this.open) {
      this.closedFor += NFFT / 2;
      if (this.closedFor >= 3 * FS && this.marks.length) this.restart();
    } else this.closedFor = 0;
  }
  // a new station: speed and statistics from the start values
  restart() {
    this.dot = 600 / this.wpm0; this.delta = 0; this.marks = []; this.fit = 0.5; this.bad = 0.5; this.nfit = this.nbad = 0;
  }
  // just opened: the last 0.55 s again (the squelch opens at most ~0.5 s after the start), with levels from
  // that stretch (after a pause the AGC has the noise as loud as the signal will be)
  replay() {
    this.key = false; this.run = 0; this.pend = 0; this.code = ''; this.charDone = this.wordDone = true;
    const old = this.env.slice(-275), srt = old.slice().sort((a, b) => a - b);   // 0.55 s, levels from it
    this.noise = Math.max(1e-9, srt[Math.floor(srt.length * 0.15)]);
    this.sig = Math.max(this.noise, srt[Math.floor(srt.length * 0.92)]);
    this.peak = this.sig;
    old.forEach((v, i) => { this.evT = this.t - old.length + 1 + i; this.detect(v); });
  }
  step(m) {
    // levels from the last 3 s: noise = 15th, signal = 92nd percentile (key down is 30 - 60 % of the time);
    // for the threshold also a peak that follows a new signal at once and decays in about 1.5 s
    this.env.push(m);
    if (this.env.length > 1500) this.env.shift();
    this.peak = Math.max(m, this.peak * 0.9985);
    if (++this.lvlN >= 25 && this.env.length >= 250) {
      this.lvlN = 0;
      const s = this.env.slice().sort((a, b) => a - b);
      this.noise = Math.max(1e-9, s[Math.floor(s.length * 0.15)]);
      this.sig = Math.max(this.noise, s[Math.floor(s.length * 0.92)]);
    }
    this.evT = this.t; this.detect(m);
    this.t++;
  }
  detect(m) {
    const top = Math.max(this.sig, 0.6 * this.peak), mid = Math.sqrt(top * this.noise);
    const want = this.open && (this.key ? m > mid / 1.2 : m > mid * 1.2);
    // a change counts once it has held (key down 0.35, key up 0.2 dot, 2 steps at least): noise spikes in
    // the gaps and short dropouts in the marks are merged
    if (want !== this.key) {
      if (++this.pend >= Math.max(2, Math.round(this.dot * (want ? 0.35 : 0.2)))) {
        const held = this.pend;
        if (this.key) this.mark(this.run); else this.space(this.run);
        this.key = want; this.run = held; this.pend = 0;
      }
    } else { this.run += 1 + this.pend; this.pend = 0; }
    this.idle();
  }
  mark(n) {
    // into the statistics unless far longer than the recent marks (a tune-up carrier)
    const med = this.marks.length >= 6 ? this.marks.slice().sort((a, b) => a - b)[this.marks.length >> 1] : 1e9;
    if (n < 5 * med) { this.marks.push(n); if (this.marks.length > 24) this.marks.shift(); }
    this.updateDot();
    const r = (n - this.delta) / this.dot;
    this.code += r < 2 ? '.' : '-';
    this.nfit = (this.nfit || 0) + 1;      // a plain mean over the first ten marks, then a slow average
    this.fit += Math.max(0.1, 1 / this.nfit) * (Math.min(Math.abs(r - 1), Math.abs(r - 3) / 3) - this.fit);
    if (this.fit > 0.45 && this.marks.length >= 12) this.restart();   // lost the speed: start again
    if (r > 1.6 && r < 2.4) this.unc = true;
    this.charDone = this.wordDone = false;
  }
  space(n) {}                               // gaps are judged while they run (idle)
  idle() {
    if (this.key) return;
    const r = (this.run + this.delta) / this.dot;   // a space is measured short by what the marks gain
    if (!this.charDone && r >= 2) { this.emitChar(); this.charDone = true; }
    if (!this.wordDone && r >= 5) { this.emit(' '); this.wordDone = true; }
  }
  // dot length and the lengthening of marks by the averaging (delta): marks measure u + delta (dots) and
  // 3u + delta (dashes), so u = (dash - dot) / 2. The recent marks are split at the largest ratio step.
  updateDot() {
    const s = this.marks.slice().sort((a, b) => a - b);
    if (s.length < 4) return;
    // the split whose two means come closest to dash = 3 dots (ratio 1.8 ... 5, after removing delta)
    const pre = [0]; for (const v of s) pre.push(pre[pre.length - 1] + v);
    let ms = 0, ml = 0, best = 1e9;
    for (let i = 1; i < s.length; i++) {
      if (s[i] / s[i - 1] < 1.3) continue;            // splits only where the lengths step up
      const a = pre[i] / i, b = (pre[s.length] - pre[i]) / (s.length - i), r = (b - this.delta) / Math.max(1, a - this.delta);
      if (r < 1.8 || r > 5) continue;
      const e = Math.abs(Math.log(r / 3));
      if (e < best) { best = e; ms = a; ml = b; }
    }
    if (best === 1e9) return;                          // one kind only: keep the estimate
    const u = (ml - ms) / 2;
    if (!(u > 3)) return;
    this.dot += 0.3 * (u - this.dot);
    this.delta += 0.3 * (Math.max(0, ms - u) - this.delta);
    this.dot = Math.max(6, Math.min(60, this.dot));    // 10 ... 100 wpm in 2 ms steps
  }
  emitChar() {
    const c = DECODE[this.code];
    this.nbad = (this.nbad || 0) + 1;
    this.bad += Math.max(0.1, 1 / this.nbad) * ((c ? 0 : 1) - this.bad);
    this.emit(c || '_', !c || this.unc);
    this.code = ''; this.unc = false;
  }
  emit(t, uncertain = false) { const i = this.info(); i.uncertain = uncertain; i.t = this.evT; this.onText(t, i); }
  score() { return this.fit + this.bad; }
}

// Three decoders that start at 12, 20 and 30 wpm: a wrong start can lock one (too slow a start merges the
// gaps of fast CW, too fast a start lets noise chop slow CW); the text comes from the one whose marks fit
// the 1 : 3 timing best and that finds the fewest unknown characters, by time stamp (no repeats), 1.2 s
// late so that a new station's first characters come from the decoder that suits it.
class CwMulti {
  constructor(onText, opt = {}) {
    this.onText = onText; this.best = 1; this.lastT = -1;
    this.delay = opt.delay || 600;          // output 1.2 s late: time to pick the decoder of a new station
    this.q = [[], [], []];
    this.d = [12, 20, 30].map((wpm, k) => new CwDecoder((t, i) => this.q[k].push([t, i]), Object.assign({}, opt, { wpm })));
  }
  push(x) {
    for (const d of this.d) d.push(x);
    const sc = this.d.map(x => x.score()), lo = Math.min(...sc);
    if (sc[this.best] - lo > 0.05) this.best = sc.indexOf(lo);
    const now = this.d[0].t;
    for (let k = 0; k < 3; k++) {
      const q = this.q[k];
      while (q.length && q[0][1].t <= now - this.delay) {
        const [t, info] = q.shift();
        if (k === this.best && info.t > this.lastT) { this.lastT = info.t; this.onText(t, info); }
      }
    }
  }
  info() { return this.d[this.best].info(); }
}

const CW = { CwDecoder, CwMulti, MORSE, DECODE, FS };
if (typeof module !== 'undefined' && module.exports) module.exports = CW; else root.CW = CW;
})(typeof self !== 'undefined' ? self : this);
