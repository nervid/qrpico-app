// FT8 decoding off the page's main thread: one 15 s slot (12 kS/s) per message, results back.
// The hash book (calls heard in full, to name <...> calls) lives as long as the worker.
'use strict';
importScripts('ft8.js');
const hashes = new FT8.HashBook();
onmessage = e => {
  const { slot, audio, opt } = e.data;
  const res = FT8.decode(audio, Object.assign({}, opt, { hashes }));
  postMessage({ slot, ms: res.ms, candidates: res.candidates,
                decodes: res.map(r => ({ text: r.text, freq: r.freq, dt: r.dt, snr: r.snr })) });
};
