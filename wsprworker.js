// WSPR decoding off the page's main thread: one 2-minute period (12 kS/s) per message, spots back.
'use strict';
importScripts('ft8.js?v=d86532b', 'wspr.js?v=d86532b');          // ft8.js provides the FFT
onmessage = e => {
  const { period, audio } = e.data;
  const res = WSPR.decode(audio);
  postMessage({ period, ms: res.ms, candidates: res.candidates,
                spots: res.map(r => ({ call: r.call, grid: r.grid, dbm: r.dbm, snr: r.snr, dt: r.dt, freq: r.freq, drift: r.drift })) });
};
