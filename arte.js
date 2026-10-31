/* Majorama.sonho — arte.js: tudo que toca arquivos e DOM (entrada de imagem, miniatura, exemplo, download).
   O motor (engine.js) não sabe nada de arquivos: ele recebe pixels e devolve caracteres.
   Segurança: a imagem é identificada pelos bytes (não pelo nome nem pelo tipo declarado), tem limite de tamanho
   e de megapixels, e nunca é enviada a lugar nenhum. SVG é recusado de propósito. */
(function () {
  'use strict';
  const MAX_BYTES = 25 * 1024 * 1024, MAX_PIXELS = 80e6;

  async function tipoReal(file) {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const txt = (o, s) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
    if (b[0] === 0x89 && txt(1, 'PNG')) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (txt(0, 'GIF8')) return 'gif';
    if (txt(0, 'RIFF') && txt(8, 'WEBP')) return 'webp';
    if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
    if (txt(4, 'ftypavif') || txt(4, 'ftypavis')) return 'avif';
    return null;
  }

  async function decodificar(file) {
    if (!(file instanceof Blob)) throw new Error('Arquivo inválido.');
    if (file.size > MAX_BYTES) throw new Error('A imagem passa de 25 MB. Use uma menor.');
    if (!(await tipoReal(file))) throw new Error('Formato não suportado. Use PNG, JPG, WebP, GIF, BMP ou AVIF.');
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (_) { throw new Error('Não consegui abrir a imagem (arquivo corrompido?).'); }
    if (bmp.width * bmp.height > MAX_PIXELS) { bmp.close(); throw new Error('Imagem enorme demais (limite: 80 megapixels).'); }
    return bmp;
  }

  function canvasEm(src, w, h, leitura) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', leitura ? { willReadFrequently: true } : undefined);
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);          // transparência vira preto
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, w, h);
    return c;
  }

  // reduz por metades (média de área, sem serrilhado) até a largura pedida e devolve pixels RGBA
  function paraImageData(bmp, largura) {
    const W = Math.max(1, Math.min(bmp.width, Math.round(largura))), H = Math.max(1, Math.round(bmp.height * W / bmp.width));
    let src = bmp, w = bmp.width, h = bmp.height;
    while (w > 2 * W) {
      const nw = Math.max(W, Math.ceil(w / 2)), nh = Math.max(H, Math.ceil(h / 2));
      src = canvasEm(src, nw, nh); w = nw; h = nh;
    }
    const d = canvasEm(src, W, H, true).getContext('2d').getImageData(0, 0, W, H);
    return { data: d.data, width: W, height: H };
  }

  function miniatura(bmp, canvas, maxLado) {
    const k = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    canvas.width = w; canvas.height = h;
    const x = canvas.getContext('2d');
    if (x) x.drawImage(canvasEm(bmp, w, h), 0, 0);
  }

  function baixar(nome, blob) {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nome; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  /* ---- exemplo embutido: uma paisagem desenhada na hora (nenhuma imagem de terceiros) + o JSON que um LLM devolveria ---- */
  function paisagemExemplo() {
    const S = 600, c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    let g = x.createLinearGradient(0, 0, 0, S * 0.55);
    g.addColorStop(0, '#5aa9e6'); g.addColorStop(1, '#cfe6f5');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    g = x.createRadialGradient(S * 0.78, S * 0.18, 4, S * 0.78, S * 0.18, S * 0.16);
    g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(0.35, 'rgba(255,233,168,.95)'); g.addColorStop(1, 'rgba(255,233,168,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.fillStyle = 'rgba(255,255,255,.95)';
    for (const [cx, cy, r] of [[0.20, 0.22, 0.07], [0.27, 0.19, 0.09], [0.35, 0.23, 0.07], [0.25, 0.25, 0.08]]) {
      x.beginPath(); x.arc(cx * S, cy * S, r * S, 0, 7); x.fill();
    }
    const crista = (base, amp, f1, f2, ph, cor) => {
      x.fillStyle = cor; x.beginPath(); x.moveTo(0, S);
      for (let i = 0; i <= S; i += 6) { const u = i / S; x.lineTo(i, S * (base + amp * Math.sin(u * f1 + ph) + amp * 0.5 * Math.sin(u * f2 + ph * 2))); }
      x.lineTo(S, S); x.closePath(); x.fill();
    };
    crista(0.50, 0.04, 5, 11, 0.3, '#8fb4c9'); crista(0.60, 0.035, 4, 9, 1.2, '#5fa08a');
    crista(0.70, 0.03, 6, 13, 2.1, '#3f7a2e'); crista(0.84, 0.015, 3, 7, 0.5, '#7cc243');
    return c;
  }

  const EXEMPLO_JSON = JSON.stringify({ regioes: [
    { id: 'ceu', bbox: [0, 0, 100, 56], z: 0, cor: '#7fb8e6', desc: 'Céu azul claro, mais escuro no alto e esbranquiçado perto do horizonte' },
    { id: 'sol', bbox: [62, 2, 94, 34], z: 1, cor: '#ffe9a8', desc: 'Sol baixo e dourado, com um halo de luz quente que se espalha' },
    { id: 'nuvem', bbox: [10, 10, 46, 34], z: 1, cor: '#ffffff', desc: 'Nuvem branca e fofa, de bordas suaves e topo iluminado' },
    { id: 'montanhas', bbox: [0, 40, 100, 66], z: 1, cor: '#8fb4c9', desc: 'Montanhas azuladas e enevoadas ao fundo, contorno suave' },
    { id: 'colinas', bbox: [0, 54, 100, 74], z: 2, cor: '#5fa08a', desc: 'Colinas verde-azuladas em ondas suaves, com névoa nos vales' },
    { id: 'mata', bbox: [0, 64, 100, 88], z: 3, cor: '#3f7a2e', desc: 'Mata verde-escura de árvores e arbustos na encosta' },
    { id: 'campo', bbox: [0, 80, 100, 100], z: 4, cor: '#7cc243', desc: 'Campo de grama verde viva em primeiro plano, textura fina' },
  ] }, null, 2);

  window.SonhoArte = { decodificar, paraImageData, miniatura, baixar, paisagemExemplo, EXEMPLO_JSON, MAX_BYTES, MAX_PIXELS };
})();
