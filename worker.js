/* Worker do Majorama.sonho: roda o motor fora da thread da interface (a página não trava). */
'use strict';
importScripts('engine.js');

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    const r = Sonho.renderizar(m.img, m.regioes, m.opts);
    self.postMessage({ id: m.id, ok: true, r }, [r.car.buffer, r.cor.buffer, r.cel.buffer, r.borda.buffer]);
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, erro: String((err && err.message) || err) });
  }
};
