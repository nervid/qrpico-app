// FT8 for the qrpico app: message packing, CRC, LDPC encoding, channel symbols and the GFSK waveform.
// Own code after the protocol definition in docs/ft8-protocol.md (QEX July/August 2020 and the
// authors' public-domain reference files in docs/ft8/qex-public, from which the two tables below are
// generated). Plain script: a global FT8 in the page or a worker (importScripts), module.exports in Node.
(function (root) {
'use strict';

// generator.dat: 83 rows x 91 bits, as 23 hex digits (the 92nd bit is 0)
const GEN = ['8329ce11bf31eaf509f27fc','761c264e25c259335493132','dc265902fb277c6410a1bdc','1b3f417858cd2dd33ec7f62','09fda4fee04195fd034783a','077cccc11b8873ed5c3d48a','29b62afe3ca036f4fe1a9da','6054faf5f35d96d3b0c8c3e','e20798e4310eed27884ae90','775c9c08e80e26ddae56318','b0b811028c2bf997213487c','18a0c9231fc60adf5c5ea32','76471e8302a0721e01b12b8','ffbccb80ca8341fafb47b2e','66a72a158f9325a2bf67170','c4243689fe85b1c51363a18','0dff739414d1a1b34b1c270','15b48830636c8b99894972e','29a89c0d3de81d665489b0e','4f126f37fa51cbe61bd6b94','99c47239d0d97d3c84e0940','1919b75119765621bb4f1e8','09db12d731faee0b86df6b8','488fc33df43fbdeea4eafb4','827423ee40b675f756eb5fe','abe197c484cb74757144a9a','2b500e4bc0ec5a6d2bdbdd0','c474aa53d70218761669360','8eba1a13db3390bd6718cec','753844673a27782cc42012e','06ff83a145c37035a5c1268','3b37417858cc2dd33ec3f62','9a4a5a28ee17ca9c324842c','bc29f465309c977e89610a4','2663ae6ddf8b5ce2bb29488','46f231efe457034c1814418','3fb2ce85abe9b0c72e06fbe','de87481f282c153971a0a2e','fcd7ccf23c69fa99bba1412','f0261447e9490ca8e474cec','4410115818196f95cdd7012','088fc31df4bfbde2a4eafb4','b8fef1b6307729fb0a078c0','5afea7acccb77bbc9d99a90','49a7016ac653f65ecdc9076','1944d085be4e7da8d6cc7d0','251f62adc4032f0ee714002','56471f8702a0721e00b12b8','2b8e4923f2dd51e2d537fa0','6b550a40a66f4755de95c26','a18ad28d4e27fe92a4f6c84','10c2e586388cb82a3d80758','ef34a41817ee02133db2eb0','7e9c0c54325a9c15836e000','3693e572d1fde4cdf079e86','bfb2cec5abe1b0c72e07fbe','7ee18230c583cccc57d4b08','a066cb2fedafc9f52664126','bb23725abc47cc5f4cc4cd2','ded9dba3bee40c59b5609b4','d9a7016ac653e6decdc9036','9ad46aed5f707f280ab5fc4','e5921c77822587316d7d3c2','4f14da8242a8b86dca73352','8b8b507ad467d4441df770e','22831c9cf1169467ad04b68','213b838fe2ae54c38ee7180','5d926b6dd71f085181a4e12','66ab79d4b29ee6e69509e56','958148682d748a38dd68baa','b8ce020cf069c32a723ab14','f4331d6d461607e95752746','6da23ba424b9596133cf9c8','a636bcbc7b30c5fbeae67fe','5cb0d86a07df654a9089a20','f11f106848780fc9ecdd80a','1fbb5364fb8d2c9d730d5ba','fcb86bc70a50c9d02a5d034','a534433029eac15f322e34c','c989d9c7c3d3b8c55d75130','7bb38b2f0186d46643ae962','2644ebadeb44b9467d1f42c','608cc857594bfbb55d69600'];
// parity.dat: for each of the 174 codeword bits the three parity checks (0-based rows)
const COLS = [15,44,72,24,50,61,32,57,77,0,43,44,1,6,60,2,5,53,3,34,47,4,12,20,7,55,78,8,63,68,9,18,65,10,35,59,11,36,57,13,31,42,14,62,79,16,27,76,17,73,82,21,52,80,22,29,33,23,30,39,25,40,75,26,56,69,28,48,64,2,37,77,4,38,81,45,49,72,50,51,73,54,70,71,43,66,71,42,67,77,0,31,58,1,5,70,3,15,53,6,64,66,7,29,41,8,21,30,9,17,75,10,22,81,11,27,60,12,51,78,13,49,50,14,80,82,16,28,59,18,32,63,19,25,72,20,33,39,23,26,76,24,54,57,34,52,65,35,47,67,36,45,74,37,44,46,38,56,68,40,55,61,19,48,52,45,51,62,44,69,74,26,34,79,0,14,29,1,67,79,2,35,50,3,27,50,4,30,55,5,19,36,6,39,81,7,59,68,8,9,48,10,43,56,11,38,58,12,23,54,13,20,64,15,70,77,16,29,75,17,24,79,18,60,82,21,37,76,22,40,49,6,25,57,28,31,80,32,39,72,17,33,47,12,41,63,4,25,42,46,68,71,53,54,69,44,61,67,9,62,66,13,65,71,21,59,73,34,38,78,0,45,63,0,23,65,1,4,69,2,30,64,3,48,57,0,3,4,5,59,66,6,31,74,7,47,81,8,34,40,9,38,61,10,13,60,11,70,73,12,22,77,10,34,54,14,15,78,6,8,15,16,53,62,17,49,56,18,29,46,19,63,79,20,27,68,21,24,42,12,21,36,1,46,50,22,53,73,25,33,71,26,35,36,20,35,62,28,39,43,18,25,56,2,45,81,13,14,57,32,51,52,29,42,51,5,8,51,26,32,64,24,68,72,37,54,82,19,38,76,17,28,55,31,47,70,41,50,58,27,43,78,33,59,61,30,44,60,45,67,76,5,23,75,7,9,77,39,40,69,16,49,52,41,65,67,3,21,71,35,63,80,12,28,46,1,7,80,55,66,72,4,37,49,11,37,63,58,71,79,2,25,78,44,75,80,0,64,73,6,17,76,10,55,58,13,38,53,15,36,65,9,27,54,14,59,69,16,24,81,19,29,30,11,66,67,22,74,79,26,31,61,23,68,74,18,20,70,33,52,60,34,45,46,32,58,75,39,42,82,40,41,62,48,74,82,19,43,47,41,48,56];

const COSTAS = [3, 1, 4, 0, 6, 5, 2];
const GRAY = [0, 1, 3, 2, 5, 6, 4, 7];          // three code bits (MSB first) -> tone
const NSYM = 79, FS = 12000, NSPS = 1920;       // 0.16 s symbols at 12 kS/s
const TONE_HZ = FS / NSPS;                      // 6.25

const genBits = GEN.map(h => {
  const r = new Uint8Array(91);
  for (let j = 0; j < 91; j++) r[j] = (parseInt(h[j >> 2], 16) >> (3 - (j & 3))) & 1;
  return r;
});

// ---- bit fields
function putBits(bits, pos, value, n) {          // value: BigInt or number, MSB first
  let v = BigInt(value);
  for (let i = n - 1; i >= 0; i--) { bits[pos + i] = Number(v & 1n); v >>= 1n; }
  return pos + n;
}
function getBits(bits, pos, n) {
  let v = 0n;
  for (let i = 0; i < n; i++) v = (v << 1n) | BigInt(bits[pos + i]);
  return v;
}

// ---- c28: standard call signs and special words (QEX Table 7, std_call_to_c28.f90)
const NTOKENS = 2063592, MAX22 = 4194304, C28_STD = NTOKENS + MAX22;
const A1 = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', A2 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      A3 = '0123456789', A4 = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const isDigit = c => c >= '0' && c <= '9';

// the call in 6 characters with its digit 3rd, or null if it is not a standard call
function stdCall6(call) {
  if (!/^[A-Z0-9]{3,6}$/.test(call)) return null;
  let c = isDigit(call[2]) ? call : isDigit(call[1]) ? ' ' + call : null;
  if (!c || c.length > 6) return null;
  c = c.padEnd(6, ' ');
  if (A1.indexOf(c[0]) < 0 || A2.indexOf(c[1]) < 0 || !isDigit(c[2])) return null;
  if (!/^[A-Z ]{3}$/.test(c.slice(3)) || /^ /.test(c.slice(3)) || / [A-Z]/.test(c.slice(3))) return null;
  if (!/[A-Z]/.test(c.slice(0, 2))) return null;        // the prefix needs a letter
  return c;
}
function packCall(call) {
  const c = stdCall6(call);
  if (!c) return null;
  return C28_STD + 36 * 10 * 27 * 27 * 27 * A1.indexOf(c[0]) + 10 * 27 * 27 * 27 * A2.indexOf(c[1]) +
         27 * 27 * 27 * A3.indexOf(c[2]) + 27 * 27 * A4.indexOf(c[3]) + 27 * A4.indexOf(c[4]) + A4.indexOf(c[5]);
}
function unpackC28(n, hashes) {
  if (n === 0) return 'DE';
  if (n === 1) return 'QRZ';
  if (n === 2) return 'CQ';
  if (n <= 1002) return 'CQ ' + String(n - 3).padStart(3, '0');
  if (n <= 532443) {
    let v = n - 1003, s = '';
    for (let i = 0; i < 4; i++) { s = A4[v % 27] + s; v = Math.floor(v / 27); }
    return 'CQ ' + s.trim();
  }
  if (n < NTOKENS) return null;                  // unused tokens
  if (n < C28_STD) { const h = n - NTOKENS; return '<' + (hashes && hashes.get(22, h) || '...') + '>'; }
  let v = n - C28_STD;
  const i6 = v % 27; v = Math.floor(v / 27);
  const i5 = v % 27; v = Math.floor(v / 27);
  const i4 = v % 27; v = Math.floor(v / 27);
  const i3 = v % 10; v = Math.floor(v / 10);
  const i2 = v % 36; v = Math.floor(v / 36);
  if (v >= 37) return null;
  return (A1[v] + A2[i2] + A3[i3] + A4[i4] + A4[i5] + A4[i6]).trim();
}

// ---- hash codes (hashcodes.f90): call as a base-38 number, times 47055833459 mod 2^64, top bits
const H38 = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/';
function hashCall(call, bits) {
  const c = call.padEnd(11, ' ').slice(0, 11);
  let n = 0n;
  for (const ch of c) n = 38n * n + BigInt(Math.max(0, H38.indexOf(ch)));
  return Number(((47055833459n * n) & 0xFFFFFFFFFFFFFFFFn) >> BigInt(64 - bits));
}
// calls heard in full, to show hashed calls by name
class HashBook {
  constructor() { this.m = { 10: new Map(), 12: new Map(), 22: new Map() }; }
  add(call) { if (/^[A-Z0-9/]{3,11}$/.test(call)) for (const b of [10, 12, 22]) this.m[b].set(hashCall(call, b), call); }
  get(bits, h) { return this.m[bits].get(h); }
}

// ---- g15: grid, report, RRR / RR73 / 73 (grid4_to_g15.f90)
const MAXGRID4 = 32400;
const isGrid4 = w => /^[A-R][A-R][0-9][0-9]$/.test(w) && w !== 'RR73';
function packG15(w) {
  if (isGrid4(w)) return (w.charCodeAt(0) - 65) * 1800 + (w.charCodeAt(1) - 65) * 100 + (+w[2]) * 10 + (+w[3]);
  if (w === '') return MAXGRID4 + 1;
  if (w === 'RRR') return MAXGRID4 + 2;
  if (w === 'RR73') return MAXGRID4 + 3;
  if (w === '73') return MAXGRID4 + 4;
  if (/^[+-][0-9]{2}$/.test(w)) { const r = +w; if (r >= -30 && r <= 99) return MAXGRID4 + r + 35; }
  return null;
}
function unpackG15(g, ack) {
  const R = ack ? 'R' : '';
  if (g < MAXGRID4) {
    const s = String.fromCharCode(65 + Math.floor(g / 1800), 65 + Math.floor(g / 100) % 18) + String(g % 100).padStart(2, '0');
    return ack ? 'R ' + s : s;
  }
  const irpt = g - MAXGRID4;
  if (irpt === 1) return ack ? 'R' : '';
  if (irpt === 2) return 'RRR';
  if (irpt === 3) return 'RR73';
  if (irpt === 4) return '73';
  const r = irpt - 35;
  return R + (r >= 0 ? '+' : '-') + String(Math.abs(r)).padStart(2, '0');
}

// ---- f71 free text (free_text_to_f71.f90): 13 characters as a base-42 number, right-adjusted
const F42 = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-./?';
function packText(t) {
  if (t.length > 13 || [...t].some(c => F42.indexOf(c) < 0)) return null;
  let n = 0n;
  for (const c of t.padStart(13, ' ')) n = 42n * n + BigInt(F42.indexOf(c));
  return n;
}
function unpackText(n) {
  let s = '';
  for (let i = 0; i < 13; i++) { s = F42[Number(n % 42n)] + s; n /= 42n; }
  return s.trim();
}

// ---- message text <-> 77 bits
function cqToken(tokens) {            // "CQ", "CQ DX", "CQ 123": [c28, tokens used]
  if (tokens[0] !== 'CQ') return null;
  const m = tokens[1];
  if (tokens.length >= 4 && /^[0-9]{3}$/.test(m)) return [3 + +m, 2];
  if (tokens.length >= 4 && /^[A-Z]{1,4}$/.test(m) && !stdCall6(m)) {
    let v = 0;
    for (const ch of m.padStart(4, ' ')) v = 27 * v + A4.indexOf(ch);
    return [1003 + v, 2];
  }
  return [2, 1];
}
function packCallR(tok) {             // call with an optional /R: [c28, r1]
  const r = tok.endsWith('/R'), c = packCall(r ? tok.slice(0, -2) : tok);
  return c === null ? null : [c, r ? 1 : 0];
}
// returns { bits: Uint8Array(77), type } or null if the text cannot be sent
function pack77(text) {
  const msg = text.toUpperCase().trim().replace(/\s+/g, ' ');
  const t = msg.split(' ');
  // type 1: c28 r1 c28 r1 R1 g15
  let a = null, used = 0;
  const cq = cqToken(t);
  if (cq) { a = [cq[0], 0]; used = cq[1]; }
  else if (t[0] === 'DE' || t[0] === 'QRZ') { a = [t[0] === 'DE' ? 0 : 1, 0]; used = 1; }
  else { a = packCallR(t[0]); used = 1; }
  const b = a && t[used] ? packCallR(t[used]) : null;
  if (a && b) {
    let rest = t.slice(used + 1), ack = 0;
    if (rest[0] === 'R' && rest.length === 2 && isGrid4(rest[1])) { ack = 1; rest = [rest[1]]; }
    else if (rest.length === 1 && /^R[+-][0-9]{2}$/.test(rest[0])) { ack = 1; rest = [rest[0].slice(1)]; }
    const g = rest.length <= 1 ? packG15(rest[0] || '') : null;
    if (g !== null) {
      const bits = new Uint8Array(77);
      let p = putBits(bits, 0, a[0], 28); p = putBits(bits, p, a[1], 1);
      p = putBits(bits, p, b[0], 28); p = putBits(bits, p, b[1], 1);
      p = putBits(bits, p, ack, 1); p = putBits(bits, p, g, 15); putBits(bits, p, 1, 3);
      return { bits, type: '1' };
    }
  }
  // type 0.0: free text
  const f = packText(msg);
  if (f !== null) {
    const bits = new Uint8Array(77);
    let p = putBits(bits, 0, f, 71); p = putBits(bits, p, 0, 3); putBits(bits, p, 0, 3);
    return { bits, type: '0.0' };
  }
  return null;
}
// 77 bits -> text (null for types we do not show); hashes: HashBook of calls heard in full
function unpack77(bits, hashes) {
  const i3 = Number(getBits(bits, 74, 3));
  if (i3 === 1 || i3 === 2) {
    const a = Number(getBits(bits, 0, 28)), ra = bits[28], b = Number(getBits(bits, 29, 28)), rb = bits[57];
    const ack = bits[58], g = Number(getBits(bits, 59, 15));
    let ca = unpackC28(a, hashes), cb = unpackC28(b, hashes);
    if (ca === null || cb === null) return null;
    const sfx = i3 === 1 ? '/R' : '/P';
    if (ra && !ca.startsWith('CQ') && !ca.startsWith('<')) ca += sfx;
    if (rb && !cb.startsWith('<')) cb += sfx;
    if (hashes) { if (a >= C28_STD) hashes.add(ca.replace(/\/[RP]$/, '')); if (b >= C28_STD) hashes.add(cb.replace(/\/[RP]$/, '')); }
    if (g < MAXGRID4 || g - MAXGRID4 !== 1 || ack) return `${ca} ${cb} ${unpackG15(g, ack)}`.trim();
    return `${ca} ${cb}`;
  }
  if (i3 === 0) {
    const n3 = Number(getBits(bits, 71, 3));
    if (n3 === 0) return unpackText(getBits(bits, 0, 71));
    return null;                       // DXpedition, Field Day, telemetry: not shown
  }
  if (i3 === 4) {                      // h12 c58 h1 r2 c1
    const h12 = Number(getBits(bits, 0, 12));
    let n = getBits(bits, 12, 58), c = '';
    for (let i = 0; i < 11; i++) { c = H38[Number(n % 38n)] + c; n /= 38n; }
    c = c.trim();
    const h1 = bits[70], r2 = Number(getBits(bits, 71, 2)), c1 = bits[73];
    if (hashes) hashes.add(c);
    const other = '<' + (hashes && hashes.get(12, h12) || '...') + '>';
    if (c1) return 'CQ ' + c;
    const words = ['', 'RRR', 'RR73', '73'];
    return `${h1 ? c : other} ${h1 ? other : c} ${words[r2]}`.trim();
  }
  return null;
}

// ---- CRC-14 (gen_crc14.f90): polynomial 0x6757, the 77 bits zero-extended to 82
const POLY = [1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1];
function crc14(bits77) {
  const mc = new Uint8Array(96); mc.set(bits77.subarray(0, 77));
  const r = Array.from(mc.subarray(0, 15));
  for (let i = 0; i <= 81; i++) {
    r[14] = mc[i + 14];
    const top = r[0];
    for (let k = 0; k < 15; k++) r[k] ^= top & POLY[k];
    r.push(r.shift());
  }
  return r.slice(0, 14);
}

// ---- LDPC (174, 91) encoding: message + CRC, then 83 parity bits
function encode174(bits77) {
  const c = new Uint8Array(174);
  c.set(bits77.subarray(0, 77));
  c.set(crc14(bits77), 77);
  for (let i = 0; i < 83; i++) {
    let s = 0;
    const g = genBits[i];
    for (let j = 0; j < 91; j++) s ^= g[j] & c[j];
    c[91 + i] = s;
  }
  return c;
}
// 79 tones: Costas, 29 data symbols, Costas, 29 data symbols, Costas
function symbols(cw) {
  const s = new Uint8Array(NSYM);
  s.set(COSTAS, 0); s.set(COSTAS, 36); s.set(COSTAS, 72);
  for (let k = 0; k < 58; k++) s[k < 29 ? 7 + k : 14 + k] = GRAY[cw[3 * k] << 2 | cw[3 * k + 1] << 1 | cw[3 * k + 2]];
  return s;
}

// ---- GFSK waveform (QEX Eq. 3, BT = 2): tone 0 at f0 Hz, 12 kS/s, 79 x 1920 samples, 20 ms ramps
function erf(x) {                       // Abramowitz-Stegun 7.1.26, |error| < 1.5e-7
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
let pulse = null;                       // 3 symbols long, centred on the middle one
function gfskPulse() {
  if (pulse) return pulse;
  const k = Math.PI * Math.sqrt(2 / Math.LN2), bt = 2;
  pulse = new Float64Array(3 * NSPS);
  for (let i = 0; i < 3 * NSPS; i++) {
    const t = (i - 1.5 * NSPS) / NSPS;  // in symbols
    pulse[i] = 0.5 * (erf(k * bt * (t + 0.5)) - erf(k * bt * (t - 0.5)));
  }
  return pulse;
}
function synth(tones, f0, amp = 1) {
  const p = gfskPulse(), n = tones.length * NSPS;
  const dev = new Float64Array(n + 2 * NSPS);   // frequency deviation in tone steps, one symbol margin each side
  const ext = [tones[0], ...tones, tones[tones.length - 1]];   // the end tones held, no sweep from 0
  for (let j = 0; j < ext.length; j++)
    for (let i = 0; i < 3 * NSPS; i++) {
      const at = (j - 1) * NSPS + i;    // pulse j starts 1.5 symbols before its centre
      if (at >= 0 && at < dev.length) dev[at] += ext[j] * p[i];
    }
  const out = new Float32Array(n), ramp = NSPS / 8;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += 2 * Math.PI * (f0 + dev[i + NSPS] * TONE_HZ) / FS;   // dev[] starts one symbol early
    let a = amp;
    if (i < ramp) a *= 0.5 * (1 - Math.cos(Math.PI * i / ramp));
    else if (i >= n - ramp) a *= 0.5 * (1 - Math.cos(Math.PI * (n - 1 - i) / ramp));
    out[i] = a * Math.sin(ph);
  }
  return out;
}
// text -> { tones, bits77, codeword } or null
function encode(text) {
  const p = pack77(text);
  if (!p) return null;
  const cw = encode174(p.bits);
  return { bits77: p.bits, codeword: cw, tones: symbols(cw), type: p.type };
}


// =====================================================================================================
// Decoder: one 15 s slot of 12 kS/s audio (sample 0 = slot start) -> list of messages.
//   1. coarse search: spectrogram (1920-sample frames every half symbol, 4096-point FFT), Costas
//      correlation over base frequency and start frame
//   2. per candidate: the narrow band around it from one FFT of the whole slot, back to complex
//      baseband at 187.5 S/s (30 samples per symbol); time and frequency refined on the Costas arrays
//   3. 8-tone DFT per symbol -> bit log-likelihoods through the Gray map
//   4. LDPC sum-product decoding on the parity checks of parity.dat, CRC-14, unpack
// =====================================================================================================

// ---- radix-2 complex FFT, in place (re, im: Float64Array of length 2^k), sign -1 forward
const fftCache = new Map();
function fft(re, im, inverse = false) {
  const n = re.length;
  let t = fftCache.get(n);
  if (!t) {
    const rev = new Uint32Array(n), bits = Math.log2(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
    t = { rev, cs, sn }; fftCache.set(n, t);
  }
  for (let i = 0; i < n; i++) { const j = t.rev[i]; if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
  const sg = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const c = t.cs[w], s = sg * t.sn[w], a = i + k, b = a + half;
        const xr = re[b] * c - im[b] * s, xi = re[b] * s + im[b] * c;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
  }
}

const INV_GRAY = new Uint8Array(8);
GRAY.forEach((tone, v) => { INV_GRAY[tone] = v; });

// parity-check structure: for each check the variable nodes, built from COLS
const CHECKS = (() => {
  const rows = Array.from({ length: 83 }, () => []);
  for (let n = 0; n < 174; n++) for (let k = 0; k < 3; k++) rows[COLS[3 * n + k]].push(n);
  return rows;
})();

// sum-product decoding; llr > 0 means bit 0. Returns { bits (174 hard decisions), iters } or null.
// Edge 3n + k: variable n and its k-th check (COLS); EDGES[m]: the edges of check m.
const EDGES = CHECKS.map((row, m) => row.map(n => { for (let k = 0; k < 3; k++) if (COLS[3 * n + k] === m) return 3 * n + k; return -1; }));
function ldpcDecodeFast(llr, iters = 40) {
  const q = new Float64Array(522), r = new Float64Array(522), th = new Float64Array(7), hard = new Uint8Array(174);
  for (let n = 0; n < 174; n++) q[3 * n] = q[3 * n + 1] = q[3 * n + 2] = llr[n];
  for (let it = 0; it < iters; it++) {
    for (let m = 0; m < 83; m++) {
      const e = EDGES[m], L = e.length;
      for (let i = 0; i < L; i++) th[i] = Math.tanh(0.5 * q[e[i]]);
      for (let i = 0; i < L; i++) {
        let p = 1;
        for (let j = 0; j < L; j++) if (j !== i) p *= th[j];
        r[e[i]] = 2 * Math.atanh(p > 0.999999 ? 0.999999 : p < -0.999999 ? -0.999999 : p);
      }
    }
    for (let n = 0; n < 174; n++) {
      const a = r[3 * n], b = r[3 * n + 1], c = r[3 * n + 2], post = llr[n] + a + b + c;
      q[3 * n] = post - a; q[3 * n + 1] = post - b; q[3 * n + 2] = post - c;
      hard[n] = post < 0 ? 1 : 0;
    }
    let ok = true;
    for (let m = 0; m < 83 && ok; m++) { let s = 0; for (const n of CHECKS[m]) s ^= hard[n]; if (s) ok = false; }
    if (ok) return { bits: hard, iters: it + 1 };
  }
  return null;
}

const FS2 = 187.5, SPS2 = 30;           // baseband rate after the narrow-band step, samples per symbol
const NBIG = 262144, NSMALL = 4096;     // whole-slot FFT (21.8 s), baseband IFFT (= NBIG x 187.5 / 12000)

// 1. coarse candidates: [{ f0, frame, score }] (f0 = tone 0 in Hz, frame = start in half symbols)
function coarse(audio, fmin, fmax, maxCand) {
  const N = 4096, hop = NSPS / 2, nfr = Math.floor((audio.length - NSPS) / hop) + 1;
  const df = FS / N, bmax = Math.ceil((fmax + 8 * TONE_HZ) / df) + 2, P = [];
  const win = new Float64Array(NSPS);
  for (let i = 0; i < NSPS; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / NSPS);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < nfr; f++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < NSPS; i++) re[i] = audio[f * hop + i] * win[i];
    fft(re, im);
    const p = new Float32Array(bmax);
    for (let b = 0; b < bmax; b++) p[b] = re[b] * re[b] + im[b] * im[b];
    P.push(p);
  }
  const off = Array.from({ length: 8 }, (_, k) => Math.round(k * TONE_HZ / df));
  const cands = [];
  const b0min = Math.max(1, Math.floor(fmin / df)), b0max = Math.min(bmax - off[7] - 1, Math.ceil(fmax / df));
  for (let b0 = b0min; b0 <= b0max; b0++) {
    let best = 0, bestT = 0;
    for (let t0 = -10; t0 + 2 * 72 + 2 * 6 < nfr; t0++) {
      let sig = 0, all = 0;
      for (const so of [0, 36, 72])
        for (let k = 0; k < 7; k++) {
          const fr = t0 + 2 * (so + k);
          if (fr < 0 || fr >= nfr) continue;
          const row = P[fr];
          sig += row[b0 + off[COSTAS[k]]];
          for (let j = 0; j < 8; j++) all += row[b0 + off[j]];
        }
      const noise = (all - sig) / 7;
      const sc = noise > 0 ? sig / noise : 0;
      if (sc > best) { best = sc; bestT = t0; }
    }
    cands.push({ f0: b0 * df, frame: bestT, score: best });
  }
  // local maxima in frequency, strongest first
  const out = cands.filter((c, i) => c.score > 1.6 && (i === 0 || c.score >= cands[i - 1].score) && (i === cands.length - 1 || c.score >= cands[i + 1].score));
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxCand);
}

// 2. the band around f0 as complex baseband at 187.5 S/s; tone k at (k - 3.5) x 6.25 Hz
function baseband(spec, f0) {
  const dfb = FS / NBIG, fc = f0 + 3.5 * TONE_HZ, kc = Math.round(fc / dfb);
  const re = new Float64Array(NSMALL), im = new Float64Array(NSMALL);
  const flat = Math.round(30 / dfb), edge = Math.round(25 / dfb);   // +-30 Hz flat, 25 Hz cosine taper
  for (let i = -flat - edge; i <= flat + edge; i++) {
    const k = kc + i;
    if (k < 1 || k >= NBIG / 2) continue;
    const a = Math.abs(i) <= flat ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (Math.abs(i) - flat) / edge);
    const j = (i + NSMALL) % NSMALL;
    re[j] = spec.re[k] * a; im[j] = spec.im[k] * a;
  }
  fft(re, im, true);
  return { re, im, fc: kc * dfb };
}
// complex amplitudes of the 8 tones of every symbol for start sample i0 and frequency offset dfo (Hz);
// the tone tables (cos, sin over one symbol) are cached per offset (0.01 Hz grid)
const toneTabCache = new Map();
function toneTab(dfo) {
  const key = Math.round(dfo * 100);
  let t = toneTabCache.get(key);
  if (!t) {
    t = new Float64Array(8 * SPS2 * 2);
    for (let k = 0; k < 8; k++) {
      const w = 2 * Math.PI * ((k - 3.5) * TONE_HZ + key / 100) / FS2;
      for (let n = 0; n < SPS2; n++) { t[(k * SPS2 + n) * 2] = Math.cos(w * n); t[(k * SPS2 + n) * 2 + 1] = Math.sin(w * n); }
    }
    if (toneTabCache.size > 4000) toneTabCache.clear();
    toneTabCache.set(key, t);
  }
  return t;
}
function toneAmps(bb, i0, dfo, syms) {
  const out = new Float64Array(syms.length * 16), t = toneTab(dfo), bre = bb.re, bim = bb.im;
  for (let si = 0; si < syms.length; si++) {
    const base = i0 + SPS2 * syms[si];
    const n0 = Math.max(0, -base), n1 = Math.min(SPS2, NSMALL - base);
    for (let k = 0; k < 8; k++) {
      let xr = 0, xi = 0;
      for (let n = n0; n < n1; n++) {
        const c = t[(k * SPS2 + n) * 2], sn = t[(k * SPS2 + n) * 2 + 1], r = bre[base + n], i = bim[base + n];
        xr += r * c + i * sn; xi += i * c - r * sn;
      }
      out[si * 16 + 2 * k] = xr; out[si * 16 + 2 * k + 1] = xi;
    }
  }
  return out;
}
const SYNC_SYMS = [0, 1, 2, 3, 4, 5, 6, 36, 37, 38, 39, 40, 41, 42, 72, 73, 74, 75, 76, 77, 78];
function syncScore(bb, i0, dfo) {
  const a = toneAmps(bb, i0, dfo, SYNC_SYMS);
  let s = 0, all = 0;
  SYNC_SYMS.forEach((sym, si) => {
    const tk = COSTAS[sym < 36 ? sym : sym < 72 ? sym - 36 : sym - 72];
    for (let k = 0; k < 8; k++) { const p = a[si * 16 + 2 * k] ** 2 + a[si * 16 + 2 * k + 1] ** 2; all += p; if (k === tk) s += p; }
  });
  return s / Math.max(1e-30, (all - s) / 7);
}
const DATA_SYMS = Array.from({ length: 58 }, (_, k) => k < 29 ? 7 + k : 14 + k);

// one candidate -> decode or null
function decodeCandidate(spec, c, hashes) {
  const bb = baseband(spec, c.f0);
  const fOff = c.f0 + 3.5 * TONE_HZ - bb.fc;             // rounding of the band centre
  let best = { s: -1 }, i00 = Math.round(c.frame * NSPS / 2 / (FS / FS2));
  for (let di = -18; di <= 18; di += 2)
    for (let dfo = -3.2; dfo <= 3.21; dfo += 0.8) {
      const s = syncScore(bb, i00 + di, fOff + dfo);
      if (s > best.s) best = { s, i0: i00 + di, dfo: fOff + dfo };
    }
  for (let di = -2; di <= 2; di++)                          // fine: 1 sample, 0.2 Hz
    for (let dfo = -0.6; dfo <= 0.61; dfo += 0.2) {
      const s = syncScore(bb, best.i0 + di, best.dfo + dfo);
      if (s > best.s) best = { s, i0: best.i0 + di, dfo: best.dfo + dfo };
    }
  if (best.s < 2) return null;
  const a = toneAmps(bb, best.i0, best.dfo, DATA_SYMS);
  // bit metrics: max |X| over the tones with the bit = 0 minus with the bit = 1 (log-amplitude domain)
  const llr = new Float64Array(174);
  for (let si = 0; si < 58; si++) {
    const m = new Float64Array(8);
    for (let k = 0; k < 8; k++) m[k] = Math.hypot(a[si * 16 + 2 * k], a[si * 16 + 2 * k + 1]);
    for (let b = 0; b < 3; b++) {
      let m0 = 0, m1 = 0;
      for (let k = 0; k < 8; k++) { const bit = (INV_GRAY[k] >> (2 - b)) & 1; if (bit) m1 = Math.max(m1, m[k]); else m0 = Math.max(m0, m[k]); }
      llr[3 * si + b] = m0 - m1;
    }
  }
  let ss = 0; for (const x of llr) ss += x * x;
  const scale = 2.83 / Math.sqrt(ss / 174 + 1e-30);
  for (let i = 0; i < 174; i++) llr[i] *= scale;
  const d = ldpcDecodeFast(llr);
  if (!d) return null;
  const bits77 = d.bits.subarray(0, 77), crc = crc14(bits77);
  for (let i = 0; i < 14; i++) if (crc[i] !== d.bits[77 + i]) return null;
  if (d.bits.every(x => x === 0)) return null;
  const text = unpack77(bits77, hashes);
  if (text === null) return null;
  // SNR in 2500 Hz: decoded tone power against the other tones (noise per 6.25 Hz bin)
  const tones = symbols(d.bits);
  let ps = 0, pn = 0;
  DATA_SYMS.forEach((sym, si) => { for (let k = 0; k < 8; k++) { const p = a[si * 16 + 2 * k] ** 2 + a[si * 16 + 2 * k + 1] ** 2; if (k === tones[sym]) ps += p; else pn += p; } });
  ps /= 58; pn /= 58 * 7;
  const snr = Math.max(-28, Math.round(10 * Math.log10(Math.max(1e-6, ps - pn) / (pn * 2500 / TONE_HZ))));
  return { text, freq: c.f0 + (best.dfo - fOff), dt: best.i0 / FS2 - 0.5, snr, iters: d.iters, sync: best.s, tones, bits77: Uint8Array.from(bits77) };
}

// audio: Float32Array of one slot at 12 kS/s (up to 15 s, sample 0 = slot start)
function decode(audio, opt = {}) {
  const fmin = opt.fmin || 150, fmax = opt.fmax || 2900, hashes = opt.hashes || null;
  const t0 = Date.now();
  const cands = coarse(audio, fmin, fmax, opt.maxCand || 120);
  const re = new Float64Array(NBIG), im = new Float64Array(NBIG);
  re.set(audio.subarray(0, Math.min(audio.length, NBIG)));
  fft(re, im);
  const spec = { re, im }, found = new Map();
  for (const c of cands) {
    const d = decodeCandidate(spec, c, hashes);
    if (d && !found.has(d.text)) found.set(d.text, d);
  }
  const out = [...found.values()].sort((a, b) => a.freq - b.freq);
  out.ms = Date.now() - t0; out.candidates = cands.length;
  return out;
}

const FT8 = { pack77, unpack77, crc14, encode174, symbols, synth, encode, hashCall, HashBook, stdCall6,
              decode, ldpcDecode: ldpcDecodeFast, fft,
              COSTAS, GRAY, COLS, GEN_BITS: genBits, NSYM, FS, NSPS, TONE_HZ };
if (typeof module !== 'undefined' && module.exports) module.exports = FT8; else root.FT8 = FT8;
})(typeof self !== 'undefined' ? self : this);
