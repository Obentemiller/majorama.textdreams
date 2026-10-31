/* Majorama.sonho — motor do filtro ASCII semântico (porta de ascii2d.py).
   Sem dependências, sem rede, sem eval. Roda em Web Worker, na página ou no Node (testes).

     Sonho.extrairJSON(texto)  -> objeto (aceita ```json, texto em volta, detecta JSON cortado)
     Sonho.validar(obj)        -> {regioes, avisos}  (limites e limpeza de tudo que vem do LLM)
     Sonho.renderizar(img, regioes, {cols, modo, seed}) -> resultado (grade de caracteres + cores)
     Sonho.desenhar(ctx, res, {escala, fundoCor, familia}) -> pinta num canvas 2D
     Sonho.paraTexto(res)      -> string (.txt)

   Pipeline: segmentar (caixa do VLM + cor real) -> grade de células (1:2) -> limpar manchas
   -> contornos / \ | - -> texto da descrição em cada área (direção pela forma, repetido)
   -> compressão (vogais somem primeiro, depois o resto) -> brilho clássico como reserva. */
(function (root) {
  'use strict';

  const RAMPA = '.,:;+=*#%@';           // brilho: escuro -> claro (sem - / \ | dos contornos)
  const SEP = [' ', '·', ' '];          // separador entre repetições da descrição
  const BORDA = ['-', '\\', '|', '/'];
  const LIM = { regioes: 64, desc: 300, cols: [40, 240], json: 200000 };

  /* ================================================================ JSON do LLM */
  function extrairJSON(texto) {
    if (typeof texto !== 'string' || !texto.trim()) throw new Error('Cole aqui o JSON que o LLM devolveu.');
    if (texto.length > LIM.json) throw new Error('Esse texto é grande demais para ser o JSON esperado.');
    let t = texto;
    const cerca = t.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (cerca && /[{[]/.test(cerca[1])) t = cerca[1];
    const ini = t.search(/[{[]/);
    if (ini < 0) throw new Error('Não encontrei um JSON nessa resposta (procurei por "{").');
    // acha o fechamento balanceado, respeitando strings
    let prof = 0, str = false, esc = false, fim = -1;
    for (let i = ini; i < t.length; i++) {
      const c = t[i];
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === '{' || c === '[') prof++;
      else if (c === '}' || c === ']') { prof--; if (prof === 0) { fim = i; break; } }
    }
    if (fim < 0) throw new Error('O JSON está incompleto (a resposta pode ter sido cortada). Peça ao LLM para continuar ou refazer.');
    try { return JSON.parse(t.slice(ini, fim + 1)); }
    catch (e) { throw new Error('O JSON tem erro de sintaxe: ' + e.message); }
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const RE_INVIS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿︎️]/g;
  const RE_EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;

  function limparTexto(s, max) {
    s = String(s == null ? '' : s).normalize('NFC').replace(RE_INVIS, ' ').replace(RE_EMOJI, '').replace(/\s+/g, ' ').trim();
    const cps = Array.from(s);
    return cps.length > max ? cps.slice(0, max).join('').trim() : s;
  }

  function validar(obj) {
    const lista = Array.isArray(obj) ? obj : obj && obj.regioes;
    if (!Array.isArray(lista) || !lista.length) throw new Error('O JSON precisa ter a lista "regioes" com pelo menos uma região.');
    if (lista.length > LIM.regioes) throw new Error('Regiões demais (' + lista.length + '). O limite é ' + LIM.regioes + '.');
    const avisos = [], regioes = [], usados = new Set();
    lista.forEach((r, k) => {
      const rot = 'Região ' + (k + 1);
      if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(rot + ': formato inválido.');
      const b = r.bbox;
      if (!Array.isArray(b) || b.length !== 4 || b.some(v => typeof v !== 'number' || !isFinite(v)))
        throw new Error(rot + ': "bbox" precisa ser [esquerda, topo, direita, base] em números (0 a 100).');
      let [x0, y0, x1, y1] = b.map(v => clamp(v, 0, 100));
      if (x1 < x0) [x0, x1] = [x1, x0];
      if (y1 < y0) [y0, y1] = [y1, y0];
      if (x1 - x0 < 0.5 || y1 - y0 < 0.5) { avisos.push(rot + ' ignorada: a caixa é pequena demais.'); return; }
      let z = 0;
      if (typeof r.z === 'number' && isFinite(r.z)) z = clamp(Math.round(r.z), -100, 100);
      else avisos.push(rot + ': sem "z"; usei 0.');
      let cor = String(r.cor == null ? '' : r.cor).trim();
      const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(cor);
      if (!m) throw new Error(rot + ': "cor" precisa ser hexadecimal, como #7fb8e6.');
      cor = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
      const desc = limparTexto(r.desc, LIM.desc);
      if (!desc) throw new Error(rot + ': a "desc" (descrição) está vazia.');
      let id = limparTexto(r.id, 40).replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'regiao_' + (k + 1);
      while (usados.has(id)) id += '_';
      usados.add(id);
      regioes.push({ id, bbox: [x0, y0, x1, y1], z, cor: '#' + cor.toLowerCase(), desc });
    });
    if (!regioes.length) throw new Error('Nenhuma região válida no JSON.');
    return { regioes, avisos };
  }

  /* ================================================================ cor */
  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const fLab = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  function rgb2lab(r, g, b, out, o) {
    const R = LUT[r], G = LUT[g], B = LUT[b];
    const fx = fLab((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
    const fy = fLab(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
    const fz = fLab((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
    out[o] = 116 * fy - 16; out[o + 1] = 500 * (fx - fy); out[o + 2] = 200 * (fy - fz);
  }
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  /* ================================================================ desfoque rápido (3 caixas ≈ gaussiana) */
  function passo(src, dst, W, H, r, horiz) {
    const n = horiz ? W : H, m = horiz ? H : W, st = horiz ? 1 : W, ls = horiz ? W : 1, inv = 1 / (2 * r + 1);
    for (let l = 0; l < m; l++) {
      const base = l * ls;
      let soma = 0;
      for (let k = -r; k <= r; k++) soma += src[base + (k < 0 ? 0 : k >= n ? n - 1 : k) * st];
      for (let i = 0; i < n; i++) {
        dst[base + i * st] = soma * inv;
        const ad = i + r + 1, re = i - r;
        soma += src[base + (ad >= n ? n - 1 : ad) * st] - src[base + (re < 0 ? 0 : re) * st];
      }
    }
  }
  function gauss(plano, tmp, W, H, sigma) {
    if (sigma < 0.4) return;
    const nb = 3, wi = Math.sqrt(12 * sigma * sigma / nb + 1);
    let wl = Math.floor(wi); if (wl % 2 === 0) wl--;
    if (wl < 1) wl = 1;
    const wu = wl + 2, mi = Math.round((12 * sigma * sigma - nb * wl * wl - 4 * nb * wl - 3 * nb) / (-4 * wl - 4));
    for (let b = 0; b < nb; b++) {
      const r = ((b < mi ? wl : wu) - 1) / 2;
      if (r < 1) continue;
      passo(plano, tmp, W, H, r, true); passo(tmp, plano, W, H, r, false);
    }
  }

  /* ================================================================ 1. segmentador */
  function segmentar(L, A, B, W, H, regioes, op) {
    const n = regioes.length, N = W * H, esc = 623 / W;           // pesos calibrados para ~623 px de largura
    const ref = new Float64Array(n * 3), tmpLab = new Float64Array(3);
    regioes.forEach((r, i) => { const c = hex2rgb(r.cor); rgb2lab(c[0], c[1], c[2], tmpLab, 0); ref.set(tmpLab, i * 3); });
    const lbl = new Uint8Array(N), melhor = new Float32Array(N), plano = new Float32Array(N), tmp = new Float32Array(N);
    const sigma = op.suave / esc;
    for (let it = 0; it < op.iteracoes; it++) {
      melhor.fill(Infinity);
      for (let i = 0; i < n; i++) {
        const r = regioes[i], rl = ref[i * 3], ra = ref[i * 3 + 1], rb = ref[i * 3 + 2];
        const bx0 = r.bbox[0] / 100 * W, by0 = r.bbox[1] / 100 * H, bx1 = r.bbox[2] / 100 * W, by1 = r.bbox[3] / 100 * H;
        const zb = op.pesoZ * r.z;
        for (let y = 0; y < H; y++) {
          const dy = Math.max(by0 - y, y - by1, 0), row = y * W;
          for (let x = 0; x < W; x++) {
            const p = row + x, dx = Math.max(bx0 - x, x - bx1, 0);
            const dl = L[p] - rl, da = A[p] - ra, db = B[p] - rb;
            let c = Math.sqrt(dl * dl + da * da + db * db) - zb;
            if (dx > 0 || dy > 0) c += op.pesoFora * Math.sqrt(dx * dx + dy * dy) * esc;
            plano[p] = c;
          }
        }
        gauss(plano, tmp, W, H, sigma);
        for (let p = 0; p < N; p++) if (plano[p] < melhor[p]) { melhor[p] = plano[p]; lbl[p] = i; }
      }
      const soma = new Float64Array(n * 3), cont = new Uint32Array(n);   // recalibra a cor de referência
      for (let p = 0; p < N; p++) { const i = lbl[p]; soma[i * 3] += L[p]; soma[i * 3 + 1] += A[p]; soma[i * 3 + 2] += B[p]; cont[i]++; }
      for (let i = 0; i < n; i++) if (cont[i] > 30) for (let k = 0; k < 3; k++) ref[i * 3 + k] = soma[i * 3 + k] / cont[i];
    }
    return lbl;
  }

  /* ================================================================ 2. grade de células */
  function grade(data, W, H, lbl, n, cols) {
    const cw = W / cols, rows = Math.max(1, Math.round(H / (2 * cw))), tot = rows * cols;
    const cx = new Int32Array(W), cy = new Int32Array(H);
    for (let x = 0; x < W; x++) cx[x] = Math.min(cols - 1, Math.floor(x * cols / W));
    for (let y = 0; y < H; y++) cy[y] = Math.min(rows - 1, Math.floor(y * rows / H));
    const cont = new Uint32Array(tot), sr = new Float64Array(tot), sg = new Float64Array(tot), sb = new Float64Array(tot);
    const votos = new Uint16Array(tot * n);
    for (let y = 0; y < H; y++) {
      const ry = cy[y] * cols;
      for (let x = 0; x < W; x++) {
        const p = y * W + x, c = ry + cx[x], q = p * 4;
        cont[c]++; sr[c] += data[q]; sg[c] += data[q + 1]; sb[c] += data[q + 2];
        votos[c * n + lbl[p]]++;
      }
    }
    const cor = new Uint8ClampedArray(tot * 3), cel = new Uint8Array(tot);
    for (let c = 0; c < tot; c++) {
      const k = cont[c] || 1;
      cor[c * 3] = sr[c] / k; cor[c * 3 + 1] = sg[c] / k; cor[c * 3 + 2] = sb[c] / k;
      let mel = 0, mv = -1;
      for (let i = 0; i < n; i++) if (votos[c * n + i] > mv) { mv = votos[c * n + i]; mel = i; }
      cel[c] = mel;
    }
    return { rows, cor, cel };
  }

  const VIZ = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // componentes 4-conexos de mesmo rótulo; devolve lista de arrays de índices
  function componentes(cel, R, C, mascara) {
    const vis = new Uint8Array(R * C), comps = [], pilha = [];
    for (let s = 0; s < R * C; s++) {
      if (vis[s] || (mascara && !mascara[s])) continue;
      const lab = cel[s], lista = [];
      vis[s] = 1; pilha.push(s);
      while (pilha.length) {
        const p = pilha.pop(); lista.push(p);
        const r = (p / C) | 0, c = p - r * C;
        for (let k = 0; k < 4; k++) {
          const rr = r + VIZ[k][0], cc = c + VIZ[k][1];
          if (rr < 0 || rr >= R || cc < 0 || cc >= C) continue;
          const q = rr * C + cc;
          if (!vis[q] && cel[q] === lab && (!mascara || mascara[q])) { vis[q] = 1; pilha.push(q); }
        }
      }
      comps.push(lista);
    }
    return comps;
  }

  function limpar(cel, R, C, n, minimo) {
    for (let rep = 0; rep < 2; rep++) {
      for (const comp of componentes(cel, R, C, null)) {
        if (comp.length >= minimo) continue;
        const dentro = new Set(comp), cont = new Uint32Array(n);
        let algum = false;
        for (const p of comp) {
          const r = (p / C) | 0, c = p - r * C;
          for (let k = 0; k < 4; k++) {
            const rr = r + VIZ[k][0], cc = c + VIZ[k][1];
            if (rr < 0 || rr >= R || cc < 0 || cc >= C) continue;
            const q = rr * C + cc;
            if (!dentro.has(q)) { cont[cel[q]]++; algum = true; }
          }
        }
        if (!algum) continue;
        let mel = 0, mv = -1;
        for (let i = 0; i < n; i++) if (cont[i] > mv) { mv = cont[i]; mel = i; }
        for (const p of comp) cel[p] = mel;
      }
    }
  }

  /* ================================================================ 3. contornos */
  function nucleo(sigma) {
    const r = Math.floor(4 * sigma + 0.5), k = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-0.5 * i * i / (sigma * sigma)); s += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    return k;
  }
  const refl = (i, n) => { while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1; return i; };
  function suavizar(M, R, C, sr, sc) {
    const kr = nucleo(sr), kc = nucleo(sc), a = new Float32Array(R * C), b = new Float32Array(R * C);
    const hr = (kr.length - 1) / 2, hc = (kc.length - 1) / 2;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      let s = 0; for (let i = -hr; i <= hr; i++) s += kr[i + hr] * M[refl(r + i, R) * C + c];
      a[r * C + c] = s;
    }
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      let s = 0; for (let i = -hc; i <= hc; i++) s += kc[i + hc] * a[r * C + refl(c + i, C)];
      b[r * C + c] = s;
    }
    return b;
  }

  function contornos(cel, R, C, regioes) {
    const n = regioes.length, rk = regioes.map((r, i) => r.z + i * 1e-3);
    const borda = new Uint8Array(R * C), tem = new Uint8Array(n);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const p = r * C + c, a = cel[p];
      for (let k = 0; k < 4; k++) {
        const rr = clamp(r + VIZ[k][0], 0, R - 1), cc = clamp(c + VIZ[k][1], 0, C - 1), b = cel[rr * C + cc];
        if (b !== a && rk[a] > rk[b]) { borda[p] = 1; tem[a] = 1; break; }
      }
    }
    const car = new Uint8Array(R * C);                              // índice em BORDA
    for (let i = 0; i < n; i++) {
      if (!tem[i]) continue;
      const M = new Float32Array(R * C);
      for (let p = 0; p < R * C; p++) M[p] = cel[p] === i ? 1 : 0;
      const S = suavizar(M, R, C, 0.7, 1.4);
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const p = r * C + c;
        if (!borda[p] || cel[p] !== i) continue;
        const gy = (r === 0 ? S[C + c] - S[p] : r === R - 1 ? S[p] - S[p - C] : (S[p + C] - S[p - C]) / 2) / 2;
        const gx = c === 0 ? S[p + 1] - S[p] : c === C - 1 ? S[p] - S[p - 1] : (S[p + 1] - S[p - 1]) / 2;
        let ang = Math.atan2(gx, -gy) % Math.PI; if (ang < 0) ang += Math.PI;
        car[p] = Math.floor((ang + Math.PI / 8) / (Math.PI / 4)) % 4;
      }
    }
    return { borda, car };
  }

  /* ================================================================ 5. compressão do texto */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ehVogal = ch => 'aeiou'.indexOf(ch.normalize('NFD')[0].toLowerCase()) >= 0;

  function comprimir(texto, n, rng) {            // texto: array de caracteres
    const excesso = texto.length - n;
    if (excesso <= 0) return texto;
    const cls = [[], []];
    texto.forEach((ch, i) => cls[ehVogal(ch) ? 0 : 1].push(i));
    const sai = new Set();
    for (let c = 0; c < 2; c++) {                 // vogais primeiro; depois consoantes, espaços e pontuação juntos
      let faltam = excesso - sai.size;
      if (faltam <= 0) break;
      const cand = cls[c].slice();
      faltam = Math.min(faltam, cand.length);
      for (let k = 0; k < faltam; k++) {          // sorteio sem repetição, espalhado
        const j = k + Math.floor(rng() * (cand.length - k));
        const t = cand[k]; cand[k] = cand[j]; cand[j] = t;
        sai.add(cand[k]);
      }
    }
    return texto.filter((_, i) => !sai.has(i));
  }

  function textoPara(n, desc, modo, rng, stats) {
    if (desc.length > n) { stats.comprimido++; return comprimir(desc, n, rng); }
    if (modo === 'repetido') {
      const bloco = desc.concat(SEP), out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = bloco[i % bloco.length];
      return out;
    }
    return desc;
  }

  /* ================================================================ 4. fluxo do texto (horizontal / vertical) */
  function fluxos(comp, C, minimo) {
    let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
    for (const p of comp) { const r = (p / C) | 0, c = p - r * C; if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; }
    const h = r1 - r0 + 1, w = c1 - c0 + 1, m = new Uint8Array(h * w);
    for (const p of comp) { const r = (p / C) | 0, c = p - r * C; m[(r - r0) * w + (c - c0)] = 1; }
    const hr = new Int16Array(h * w), vr = new Int16Array(h * w);
    for (let r = 0; r < h; r++) for (let c = 0; c < w;) {
      if (!m[r * w + c]) { c++; continue; }
      let k = c; while (k < w && m[r * w + k]) k++;
      for (let j = c; j < k; j++) hr[r * w + j] = k - c;
      c = k;
    }
    for (let c = 0; c < w; c++) for (let r = 0; r < h;) {
      if (!m[r * w + c]) { r++; continue; }
      let k = r; while (k < h && m[k * w + c]) k++;
      for (let j = r; j < k; j++) vr[j * w + c] = k - r;
      r = k;
    }
    const vert = new Uint8Array(h * w);
    let nv = 0;
    for (let i = 0; i < h * w; i++) if (m[i] && 2 * vr[i] > 1.5 * hr[i]) { vert[i] = 1; nv++; }   // altura visual > 1,5x a largura
    if (nv < minimo) vert.fill(0);
    else if (comp.length - nv < minimo) for (let i = 0; i < h * w; i++) vert[i] = m[i];
    const H = [], V = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const i = r * w + c; if (m[i] && !vert[i]) H.push((r0 + r) * C + c0 + c); }
    for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) { const i = r * w + c; if (m[i] && vert[i]) V.push((r0 + r) * C + c0 + c); }
    return { H, V };
  }

  /* ================================================================ reduzir a imagem (média por área) */
  function reduzir(img, Wn) {
    const W = img.width, H = img.height, Hn = Math.max(1, Math.round(H * Wn / W));
    const s = new Float64Array(Wn * Hn * 3), n = new Uint32Array(Wn * Hn), d = img.data;
    const cx = new Int32Array(W); for (let x = 0; x < W; x++) cx[x] = Math.min(Wn - 1, Math.floor(x * Wn / W));
    for (let y = 0; y < H; y++) {
      const ry = Math.min(Hn - 1, Math.floor(y * Hn / H)) * Wn;
      for (let x = 0; x < W; x++) {
        const c = ry + cx[x], q = (y * W + x) * 4;
        s[c * 3] += d[q]; s[c * 3 + 1] += d[q + 1]; s[c * 3 + 2] += d[q + 2]; n[c]++;
      }
    }
    const out = new Uint8ClampedArray(Wn * Hn * 4);
    for (let c = 0; c < Wn * Hn; c++) {
      const k = n[c] || 1;
      out[c * 4] = s[c * 3] / k; out[c * 4 + 1] = s[c * 3 + 1] / k; out[c * 4 + 2] = s[c * 3 + 2] / k; out[c * 4 + 3] = 255;
    }
    return { data: out, width: Wn, height: Hn };
  }

  /* ================================================================ renderizar */
  function renderizar(img, regioes, opcoes) {
    const op = Object.assign({ cols: 120, modo: 'repetido', seed: 7, iteracoes: 6, suave: 3.0, pesoFora: 2.0, pesoZ: 4.0, minimo: 6 }, opcoes || {});
    if (!img || !img.data || !img.width || !img.height) throw new Error('Imagem inválida.');
    op.cols = clamp(Math.round(op.cols), LIM.cols[0], LIM.cols[1]);
    const t0 = Date.now();
    let src = img;
    if (img.width > op.cols * 3.2) src = reduzir(img, Math.round(op.cols * 3));
    const W = src.width, H = src.height, N = W * H, d = src.data, n = regioes.length;
    const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N), lab = new Float64Array(3);
    for (let p = 0; p < N; p++) { rgb2lab(d[p * 4], d[p * 4 + 1], d[p * 4 + 2], lab, 0); L[p] = lab[0]; A[p] = lab[1]; B[p] = lab[2]; }
    const tmp = new Float32Array(N), sg = 1.5 * W / 623;
    gauss(L, tmp, W, H, sg); gauss(A, tmp, W, H, sg); gauss(B, tmp, W, H, sg);

    const lbl = segmentar(L, A, B, W, H, regioes, op);
    const { rows: R, cor, cel } = grade(d, W, H, lbl, n, op.cols), C = op.cols;
    limpar(cel, R, C, n, op.minimo);
    const { borda, car: dirB } = contornos(cel, R, C, regioes);

    // brilho clássico (reserva)
    const lum = new Float32Array(R * C);
    for (let p = 0; p < R * C; p++) lum[p] = 0.2126 * cor[p * 3] + 0.7152 * cor[p * 3 + 1] + 0.0722 * cor[p * 3 + 2];
    const ord = Array.from(lum).sort((a, b) => a - b);
    const lo = ord[Math.floor(0.02 * (ord.length - 1))], hi = ord[Math.floor(0.98 * (ord.length - 1))];
    const car = new Uint32Array(R * C);
    for (let p = 0; p < R * C; p++) {
      const t = clamp((lum[p] - lo) / Math.max(hi - lo, 1e-6), 0, 0.999);
      car[p] = RAMPA.charCodeAt(Math.floor(t * RAMPA.length));
    }

    const rng = mulberry32(op.seed), stats = { comprimido: 0, componentes: 0, verticais: 0 };
    const porRegiao = {}, mask = new Uint8Array(R * C);
    regioes.forEach((reg, i) => {
      for (let p = 0; p < R * C; p++) mask[p] = cel[p] === i && !borda[p] ? 1 : 0;
      const desc = Array.from(reg.desc);
      let usadas = 0;
      for (const comp of componentes(cel, R, C, mask)) {
        const { H: hs, V: vs } = fluxos(comp, C, 12);
        stats.componentes++; if (vs.length) stats.verticais++;
        for (const cells of [hs, vs]) {
          if (!cells.length) continue;
          const s = textoPara(cells.length, desc, op.modo, rng, stats);
          for (let k = 0; k < s.length; k++) car[cells[k]] = s[k].codePointAt(0);
          usadas += cells.length;
        }
      }
      porRegiao[reg.id] = usadas;
    });
    for (let p = 0; p < R * C; p++) if (borda[p]) car[p] = BORDA[dirB[p]].charCodeAt(0);
    stats.ms = Date.now() - t0;
    return { R, C, car, cor, cel, borda, stats, porRegiao };
  }

  /* ================================================================ saída */
  function realcar(cor, n) {                        // estica luzes e sombras da imagem toda
    const v = new Float32Array(n);
    for (let p = 0; p < n; p++) v[p] = Math.max(cor[p * 3], cor[p * 3 + 1], cor[p * 3 + 2]);
    const ord = Array.from(v).sort((a, b) => a - b);
    const lo = ord[Math.floor(0.02 * (n - 1))], hi = ord[Math.floor(0.98 * (n - 1))];
    const vis = new Float32Array(n * 3), t = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      const tt = clamp((v[p] - lo) / Math.max(hi - lo, 1e-6), 0, 1), novo = 255 * (0.3 + 0.7 * tt), f = novo / Math.max(v[p], 1);
      t[p] = tt;
      for (let k = 0; k < 3; k++) vis[p * 3 + k] = clamp(cor[p * 3 + k] * f, 0, 255);
    }
    return { vis, t };
  }

  function desenhar(ctx, res, o) {
    const op = Object.assign({ escala: 1, fundoCor: true, forca: 0.4, familia: 'monospace', base: [11, 13, 16] }, o || {});
    const { R, C, car, cor } = res, cw = 10 * op.escala, ch = 20 * op.escala, fs = cw / 0.6, base = op.base;
    const { vis, t } = realcar(cor, R * C);
    ctx.fillStyle = 'rgb(' + base.join(',') + ')';
    ctx.fillRect(0, 0, C * cw, R * ch);
    ctx.textBaseline = 'alphabetic';
    const fNormal = fs + 'px ' + op.familia, fNegrito = 'bold ' + fs + 'px ' + op.familia;
    let atual = '';
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const p = r * C + c, x = c * cw, y = r * ch;
      if (op.fundoCor) {
        ctx.fillStyle = 'rgb(' + [0, 1, 2].map(k => Math.round(base[k] + (vis[p * 3 + k] - base[k]) * op.forca)).join(',') + ')';
        ctx.fillRect(x, y, cw + 0.5, ch + 0.5);
      }
      if (car[p] === 32) continue;
      const f = t[p] > 0.6 ? fNegrito : fNormal;
      if (f !== atual) { ctx.font = f; atual = f; }
      ctx.fillStyle = 'rgb(' + Math.round(vis[p * 3]) + ',' + Math.round(vis[p * 3 + 1]) + ',' + Math.round(vis[p * 3 + 2]) + ')';
      ctx.fillText(String.fromCodePoint(car[p]), x, y + ch * 0.79);
    }
  }

  function paraTexto(res) {
    const linhas = [];
    for (let r = 0; r < res.R; r++) {
      let s = '';
      for (let c = 0; c < res.C; c++) s += String.fromCodePoint(res.car[r * res.C + c]);
      linhas.push(s.replace(/\s+$/, ''));
    }
    return linhas.join('\n') + '\n';
  }

  const api = { extrairJSON, validar, renderizar, desenhar, paraTexto, comprimir, mulberry32, LIM, _fluxos: fluxos, _reduzir: reduzir };
  root.Sonho = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
