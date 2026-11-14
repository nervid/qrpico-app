// FT8 / FT4 decoding off the page's main thread: one slot (12 kS/s) per message, results back.
// The hash book (calls heard in full, to name <...> calls) lives as long as the worker.
'use strict';
importScripts('ft8.js?v=3ad3bb1', 'ft4.js?v=3ad3bb1');
const hashes = new FT8.HashBook();
onmessage = e => {
  const { slot, mode, audio, opt } = e.data;
  const res = (mode === 'FT4' ? FT4 : FT8).decode(audio, Object.assign({}, opt, { hashes }));
  postMessage({ slot, mode, ms: res.ms, candidates: res.candidates,
                decodes: res.map(r => ({ text: r.text, freq: r.freq, dt: r.dt, snr: r.snr })) });
};
