/* Majorama.sonho — bg.js: o fundo. Uma paisagem pré-programada que "sonha": cada região é feita do texto em que um LLM
   a descreveria, as frases trocam como se ele reformulasse o que vê, e uma varredura (como o segmentador) passa
   rotulando as regiões. Sem rede, sem dependências, sem imagens.
   Leve de propósito: grade grosseira (~130 colunas), 15 quadros/s, texto desenhado em trechos de mesma cor
   (centenas de chamadas por quadro, não milhares), DPR limitado a 2, pausa com a aba oculta e com a tela de resultado,
   e um único quadro parado quando o sistema pede "reduzir movimento". */
(function () {
  'use strict';
  const FRASES = [
    ['Céu azul claro, mais intenso no alto, com nuvens finas riscadas', 'Vejo um céu aberto e calmo, sem pressa', 'O azul esmaece perto do horizonte'],
    ['Sol baixo e dourado, luz quente que fura a névoa', 'Disco de luz, brilho macio nas bordas'],
    ['Nuvem branca, fofa, bordas suaves, topo iluminado', 'Cúmulo volumoso com a base azulada', 'Algodão no céu, devagar'],
    ['Montanhas azuladas e enevoadas ao fundo, contorno suave', 'Cadeia distante, pouco contraste, quase céu'],
    ['Colinas ondulantes verde-azuladas, com névoa nos vales', 'Ondas de relevo suave em sombra leve'],
    ['Árvores e arbustos verde-escuros, copas iluminadas pelo sol', 'Mata densa na encosta, folhas em manchas'],
    ['Campo de grama verde viva, textura fina com tufos escuros', 'Relva em primeiro plano, cada tufo uma sombra'],
  ];
  const COR = [[120, 185, 235], [255, 221, 140], [236, 243, 251], [130, 170, 196], [95, 160, 140], [72, 140, 72], [132, 200, 72]];
  const ALFA = [0.20, 0.32, 0.46];
  const SEP = ' · ';
  const TEXTOS = FRASES.map(l => l.map(f => f + SEP));
  const CORES = [];                                                     // chave = regiao*3 + nivel; 21 = varredura; 22..25 = rótulos
  COR.forEach(c => ALFA.forEach(a => CORES.push('rgba(' + c.join(',') + ',' + a + ')')));
  CORES.push('rgba(75,227,161,0.85)');
  [0.35, 0.6, 0.8, 1].forEach(a => CORES.push('rgba(95,179,255,' + a + ')'));
  const K_VARRE = 21, K_TAG = 22;
  const NUVENS = [[0.20, 0.11, 0.012, 0.075, 0.07], [0.62, 0.30, 0.008, 0.10, 0.06], [0.90, 0.17, 0.010, 0.06, 0.05]];   // base, altura, vel, semi-largura, semi-altura
  const FPS = 15;

  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function iniciar(canvas, op) {
    op = op || {};
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return { ligar() {}, desligar() {}, redesenhar() {}, ativo: () => false };
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)');
    let w = 0, h = 0, cw = 8, ch = 16, C = 0, R = 0, razao = 0, mono = 'monospace';
    let reg, chBuf, keyBuf, topo = [[], [], [], [], [], [], []];
    let ligado = false, raf = 0, ult = 0, t0 = 0, quadros = 0, tFps = 0;

    function medir() {
      const m = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim();
      if (m) mono = m;
      ctx.font = '100px ' + mono;
      razao = (ctx.measureText('M').width / 100) || 0.6;
    }
    function ajustar() {
      const pai = canvas.parentNode, r = pai.getBoundingClientRect();
      w = Math.round(r.width); h = Math.round(r.height);
      if (w < 20 || h < 20) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!razao) medir();
      cw = Math.max(8, Math.round(w / 130)); ch = cw * 2;
      ctx.font = (cw / razao) + 'px ' + mono; ctx.textBaseline = 'middle';
      C = Math.ceil(w / cw); R = Math.ceil(h / ch);
      reg = new Uint8Array(C * R); chBuf = new Uint16Array(C * R); keyBuf = new Uint8Array(C * R);
      for (let k = 3; k <= 6; k++) topo[k] = new Float32Array(C + 2);
      return true;
    }

    function quadro(tt) {
      if (!C) return;
      for (let x = 0; x < C + 2; x++) {                                  // cristas "respirando" (x desloca 1: vizinhos para a inclinação)
        const u = (x - 1) / C;
        topo[3][x] = R * (0.50 + 0.05 * Math.sin(u * 5 + tt * 0.15) + 0.03 * Math.sin(u * 11 - tt * 0.10));
        topo[4][x] = R * (0.60 + 0.04 * Math.sin(u * 4 + 1 + tt * 0.20) + 0.02 * Math.sin(u * 9 + tt * 0.13));
        topo[5][x] = R * (0.71 + 0.035 * Math.sin(u * 6 + 2 - tt * 0.17) + 0.02 * Math.sin(u * 13 + tt * 0.09));
        topo[6][x] = R * (0.85 + 0.02 * Math.sin(u * 3 + tt * 0.10));
      }
      const sx = C * 0.80, sy = R * (0.22 + 0.02 * Math.sin(tt * 0.3)), sr = Math.min(C, R * 2) * 0.075 * (1 + 0.05 * Math.sin(tt * 0.8));
      const nuv = NUVENS.map(n => ({ cx: (((n[0] + tt * n[2]) % 1.4) - 0.2) * C, cy: R * n[1], a: C * n[3], b: R * n[4] }));
      const fase = (tt * 0.10) % 1.3, xs = (fase - 0.15) * C;
      const periodo = 9;

      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
        let k = 0;
        if (y >= topo[6][x + 1]) k = 6; else if (y >= topo[5][x + 1]) k = 5; else if (y >= topo[4][x + 1]) k = 4; else if (y >= topo[3][x + 1]) k = 3;
        else {
          const dx = x - sx, dy = (y - sy) * 2;
          if (dx * dx + dy * dy < sr * sr) k = 1;
          else for (let i = 0; i < 3; i++) {
            const n = nuv[i];
            for (let j = -1; j <= 1; j++) {
              const ex = (x - (n.cx + j * n.a * 0.55)) / n.a, ey = (y - n.cy + (j === 0 ? 1 : 0)) / n.b;
              if (ex * ex + ey * ey < 1) { k = 2; break; }
            }
            if (k === 2) break;
          }
        }
        reg[y * C + x] = k;
      }

      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
        const p = y * C + x, k = reg[p];
        const ciclo = tt / periodo + k * 0.37, n = Math.floor(ciclo), prog = clamp((ciclo - n) * periodo / 1.2, 0, 1);
        const L = TEXTOS[k].length, atual = TEXTOS[k][n % L], ant = TEXTOS[k][(n - 1 + L * 4) % L];
        const T = prog < 1 && hash(x, y, n) > prog ? ant : atual;        // a frase nova "pega" célula a célula
        let c = T.charCodeAt((x + y * 7 + Math.floor(tt * (2 + k * 0.3))) % T.length);
        let nivel = Math.sin(x * 0.11 + tt * 0.4) + Math.sin(y * 0.23 - tt * 0.3);
        nivel = nivel < -0.7 ? 0 : nivel < 0.7 ? 1 : 2;
        let key = k * 3 + nivel;
        if (k >= 3 && y > 0 && reg[p - C] < k) {                          // contorno: a região da frente carrega a linha
          const vs = (topo[k][x + 2] - topo[k][x]) / 2 * 2, a = Math.abs(vs);
          c = a < 0.35 ? 45 : a > 3 ? 124 : vs < 0 ? 47 : 92;             // - | / \
          key = k * 3 + 2;
        }
        if (Math.abs(x - xs) < 2.5) key = K_VARRE;
        chBuf[p] = c; keyBuf[p] = key;
      }

      const tags = [
        ['[céu]', C * 0.45, R * 0.07], ['[sol]', sx - 2, sy], ['[nuvem]', nuv[0].cx - 3, nuv[0].cy],
        ['[montanhas]', C * 0.22, topo[3][Math.floor(C * 0.22) + 1] + 2], ['[colinas]', C * 0.62, topo[4][Math.floor(C * 0.62) + 1] + 2],
        ['[mata]', C * 0.30, topo[5][Math.floor(C * 0.30) + 1] + 3], ['[campo]', C * 0.55, R * 0.93],
      ];
      for (const [txt, tx, ty] of tags) {
        const desde = (((fase - (tx / C + 0.15)) % 1.3) + 1.3) % 1.3 / 0.10;   // segundos desde que a varredura passou
        if (desde > 4) continue;
        const q = clamp(Math.ceil((1 - desde / 4) * 4) - 1, 0, 3), y = Math.round(ty), x0 = Math.round(tx);
        if (y < 0 || y >= R) continue;
        for (let i = 0; i < txt.length; i++) { const x = x0 + i; if (x >= 0 && x < C) { chBuf[y * C + x] = txt.charCodeAt(i); keyBuf[y * C + x] = K_TAG + q; } }
      }

      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < R; y++) {
        let x = 0;
        while (x < C) {
          const k = keyBuf[y * C + x]; let e = x + 1;
          while (e < C && keyBuf[y * C + e] === k) e++;
          ctx.fillStyle = CORES[k];
          ctx.fillText(String.fromCharCode.apply(null, chBuf.subarray(y * C + x, y * C + e)), x * cw, (y + 0.5) * ch);
          x = e;
        }
      }
    }

    function laco(agora) {
      if (!ligado) { raf = 0; return; }
      raf = requestAnimationFrame(laco);
      if (agora - ult < 1000 / FPS - 2) return;
      ult = agora;
      quadro((agora - t0) / 1000);
      quadros++;
      if (agora - tFps >= 1000) { if (op.onFps) op.onFps(Math.round(quadros * 1000 / (agora - tFps))); quadros = 0; tFps = agora; }
    }
    function arrancar() {
      if (raf || !ligado || document.hidden) return;
      if (!ajustar()) return;
      if (reduzido.matches) { quadro(14); if (op.onFps) op.onFps(0); return; }   // um quadro parado
      t0 = performance.now() - 14000; ult = 0; tFps = performance.now(); quadros = 0;
      raf = requestAnimationFrame(laco);
    }
    function parar() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function ligar() { ligado = true; canvas.hidden = false; arrancar(); }
    function desligar() { ligado = false; parar(); canvas.hidden = true; if (op.onFps) op.onFps(null); }
    function redesenhar() { if (!ligado) return; parar(); arrancar(); }

    document.addEventListener('visibilitychange', () => { if (document.hidden) parar(); else arrancar(); });
    reduzido.addEventListener ? reduzido.addEventListener('change', redesenhar) : 0;
    let pend = 0;
    const aoRedimensionar = () => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; redesenhar(); }); };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(aoRedimensionar).observe(canvas.parentNode); else addEventListener('resize', aoRedimensionar);
    return { ligar, desligar, redesenhar, ativo: () => ligado };
  }

  window.SonhoBg = { iniciar };
})();
