/* Majorama.sonho — lógica do projeto + passos do tutorial. O kit cuida do layout e da ajuda; o motor está em engine.js
   (e roda em worker.js, fora da thread da interface). Nada aqui faz requisição de rede.
   Texto vindo do usuário/LLM só entra na página por textContent ou dentro do canvas, nunca por innerHTML. */
(() => {
  'use strict';
  const g = id => document.getElementById(id);
  const S = window.Sonho, Arte = window.SonhoArte, BG = window.SonhoBg, PROMPT = window.SonhoPrompt;
  const LINK_MANUAL = 'https://github.com/USUARIO/REPO/blob/main/manual.md';

  const PASSOS = [
    { alvo: '#brand', titulo: 'Bem-vindo ao Majorama.sonho', texto: 'Um <b>DeepDream de palavras</b>: um LLM descreve o que vê na sua imagem e cada descrição vira um pedaço da arte ASCII.' },
    { alvo: '#intro-cta', titulo: 'Aqui começa', texto: 'Leia a história do DeepDream e do que fizemos diferente, depois clique para <b>criar a arte</b>.' },
    { alvo: '#prompt-box', titulo: 'O prompt guia', texto: 'Este texto ensina o LLM a devolver as regiões da imagem no formato certo. <b>Copie</b> e cole no chat.' },
    { alvo: '#chat-anim', titulo: 'Como fazer, em animação', texto: 'Cole o prompt, anexe a imagem, envie. A resposta é um bloco de código JSON: copie ele inteiro.' },
    { alvo: '#guia-pronto', titulo: 'Quando tiver a resposta', texto: 'Com o JSON copiado, clique aqui para ir à tela que processa tudo.' },
    { alvo: '#in-imagem', abrir: true, titulo: '1 · A imagem', texto: 'Envie a <b>mesma imagem</b> que você mostrou ao LLM (ou solte o arquivo aqui). Ela não sai do seu navegador.' },
    { alvo: '#in-json', abrir: true, titulo: '2 · A resposta do LLM', texto: 'Cole o JSON que o LLM devolveu. Pode colar com o texto em volta: o programa acha o JSON sozinho.' },
    { alvo: '#in-fundo', abrir: true, titulo: '3 · O mundo', texto: '<b>Mundo preto</b> deixa só as letras coloridas; <b>Cor da imagem</b> pinta o fundo de cada célula com o tom da foto, e a imagem aparece melhor.' },
    { alvo: '#btnGerar', abrir: true, titulo: 'Gerar', texto: 'Faz a segmentação e o desenho. Trocar o mundo depois não precisa gerar de novo.' },
    { alvo: '#terminal-container', titulo: 'O palco', texto: 'No início, o fundo é um sonho pré-programado. Depois de gerar, a sua arte aparece aqui; <b>clique nela</b> para ver em tamanho real.' },
    { alvo: '#btnTxt', abrir: true, titulo: 'Levar a arte', texto: 'Baixe como <code>.txt</code> (texto puro, sem cor) ou como <code>.png</code> (com as cores).' },
    { alvo: '#acaoBtn', titulo: 'O botão principal', texto: 'Ele muda conforme a etapa: criar a arte, avançar ou gerar. <b>Início</b> volta ao começo.' },
    { alvo: '#bY', titulo: 'Painel de entrada', texto: 'Abre e fecha o painel. <b>Arraste o divisor</b> para redimensionar; no celular ele vira uma gaveta.' },
    { alvo: null, titulo: 'Pronto! 🏁', texto: 'Para rever este tutorial, toque em <b>? Ajuda</b>.', link: ['Abrir o manual', LINK_MANUAL] },
  ];

  const ui = MajoramaUI.iniciar({ passos: PASSOS });
  window.UI = ui;

  const log = (s, cls) => {
    const l = document.createElement('div');
    if (cls) l.className = cls;
    l.textContent = s;
    const o = g('console-output');
    o.appendChild(l); o.scrollTop = o.scrollHeight;
  };
  const status = s => { g('status-msg').textContent = s; };
  const mono = () => getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';
  const salvar = (k, v) => { try { localStorage.setItem('majorama.sonho.' + k, v); } catch (_) {} };
  const ler = k => { try { return localStorage.getItem('majorama.sonho.' + k); } catch (_) { return null; } };

  const estado = { tela: 'intro', bmp: null, res: null, fundo: 'cor', ocupado: false, timerJson: 0 };

  /* ---------------- motor em worker (com plano B na própria página) ---------------- */
  const Motor = (() => {
    let w = null, id = 0, semWorker = false;
    const pend = new Map();
    function falhar(msg) { for (const p of pend.values()) { clearTimeout(p.t); p.err(new Error(msg)); } pend.clear(); }
    function criar() {
      try {
        w = new Worker('worker.js');
        w.onmessage = e => {
          const m = e.data || {}, p = pend.get(m.id);
          if (!p) return;
          pend.delete(m.id); clearTimeout(p.t);
          if (m.ok) p.ok(m.r); else p.err(new Error(m.erro));
        };
        w.onerror = () => { try { w.terminate(); } catch (_) {} w = null; semWorker = true; falhar('__sem_worker__'); };
      } catch (_) { w = null; semWorker = true; }
    }
    function noWorker(img, regioes, opts) { return new Promise((ok, err) => setTimeout(() => { try { ok(S.renderizar(img, regioes, opts)); } catch (e) { err(e); } }, 20)); }
    async function processar(img, regioes, opts) {
      if (!semWorker && !w) criar();
      if (semWorker) return noWorker(img, regioes, opts);
      try {
        return await new Promise((ok, err) => {
          const meu = ++id;
          const t = setTimeout(() => { pend.delete(meu); try { w.terminate(); } catch (_) {} w = null; err(new Error('Demorou demais (mais de 40 s). Tente menos colunas.')); }, 40000);
          pend.set(meu, { ok, err, t });
          w.postMessage({ id: meu, img, regioes, opts });
        });
      } catch (e) {
        if (e.message === '__sem_worker__') return noWorker(img, regioes, opts);
        throw e;
      }
    }
    return { processar };
  })();

  /* ---------------- telas ---------------- */
  const TELAS = {
    intro: { acao: ['▶', 'Criar a arte'], bg: true, painel: false, foco: 'introTitulo', msg: 'Pronto. Comece por "Criar a arte".' },
    guia: { acao: ['✓', 'Já tenho o resultado'], bg: true, painel: false, foco: 'guiaTitulo', msg: 'Copie o prompt, peça ao LLM e volte com o resultado.' },
    gerar: { acao: ['▶', 'Gerar'], bg: false, painel: true, foco: 'gerarTitulo', msg: 'Envie a imagem, cole o JSON e clique em Gerar.' },
  };
  function irPara(nome, empurrar) {
    if (!TELAS[nome]) nome = 'intro';
    const t = TELAS[nome];
    estado.tela = nome;
    for (const k of Object.keys(TELAS)) g('tela-' + k).hidden = k !== nome;
    g('acaoBtn').querySelector('.ic').textContent = t.acao[0];
    g('acaoBtn').querySelector('.txt').textContent = t.acao[1];
    if (t.bg) BG.ligar(); else BG.desligar();
    if (nome === 'guia') Guia.iniciar(); else Guia.parar();
    if (t.painel) ui.layout.abrir(); else ui.layout.fechar();
    status(t.msg);
    if (empurrar) { try { history.pushState({ t: nome }, '', '#' + nome); } catch (_) {} }
    const f = g(t.foco); if (f && g('tour').hidden) f.focus({ preventScroll: true });
    const tela = g('tela-' + nome); if (tela) tela.scrollTop = 0;
  }
  addEventListener('popstate', () => irPara((location.hash || '').slice(1), false));

  /* ---------------- tela 2: prompt e animação ---------------- */
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (_) { /* cai no plano B */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.setAttribute('readonly', ''); ta.className = 'fora';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      return ok;
    } catch (_) { return false; }
  }
  g('prompt-box').textContent = PROMPT;
  g('btnCopiar').addEventListener('click', async () => {
    const ok = await copiar(PROMPT), t = g('btnCopiar').querySelector('.txt');
    t.textContent = ok ? 'Copiado ✓' : 'Selecione o texto e copie (Ctrl+C)';
    if (!ok) { const r = document.createRange(); r.selectNodeContents(g('prompt-box')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    setTimeout(() => { t.textContent = 'Copiar o prompt'; }, 2200);
  });

  const Guia = (() => {
    let timers = [], ativo = false;
    const JSON_LINHAS = ['{', '  "regioes": [', '    { "id": "ceu",', '      "bbox": [0, 0, 100, 46], "z": 0,', '      "cor": "#7fb8e6",', '      "desc": "Céu azul claro..." },', '    { "id": "colinas", ... },', '    ...', '  ]', '}'];
    const lns = () => [...document.querySelectorAll('#chat-anim .ln')];
    const marcar = n => document.querySelectorAll('#tela-guia .passo').forEach(li => li.classList.toggle('ativo', +li.dataset.n === n));
    const legenda = s => { g('ca-legenda').textContent = s; };
    const agenda = (ms, f) => { timers.push(setTimeout(() => { if (ativo) f(); }, ms)); };
    function zerar() {
      timers.forEach(clearTimeout); timers = [];
      lns().forEach(l => l.classList.remove('on'));
      for (const id of ['ca-anexo', 'ca-ia', 'ca-copiar', 'ca-env']) g(id).classList.remove('on');
      g('ca-json').textContent = '';
    }
    function estatico() {
      lns().forEach(l => l.classList.add('on'));
      for (const id of ['ca-anexo', 'ca-ia', 'ca-copiar']) g(id).classList.add('on');
      g('ca-json').textContent = JSON_LINHAS.join('\n');
      legenda('Prompt + imagem  ->  resposta em JSON'); marcar(0);
    }
    function ciclo() {
      zerar(); marcar(1); legenda('1 · Copie o prompt guia (Ctrl+C)');
      agenda(1400, () => { marcar(2); legenda('2 · Cole no chat (Ctrl+V)'); lns().forEach((l, i) => agenda(i * 170, () => l.classList.add('on'))); });
      agenda(3400, () => { legenda('2 · Anexe a imagem'); g('ca-anexo').classList.add('on'); });
      agenda(4800, () => { legenda('2 · Envie'); g('ca-env').classList.add('on'); });
      agenda(5500, () => { g('ca-ia').classList.add('on'); legenda('O LLM responde com um JSON…'); });
      JSON_LINHAS.forEach((_, i) => agenda(5800 + i * 330, () => { g('ca-json').textContent = JSON_LINHAS.slice(0, i + 1).join('\n'); }));
      agenda(9400, () => { marcar(3); legenda('3 · Copie a resposta e volte aqui'); g('ca-copiar').classList.add('on'); });
      agenda(14200, ciclo);
    }
    return {
      iniciar() { if (ativo) return; ativo = true; if (matchMedia('(prefers-reduced-motion: reduce)').matches) estatico(); else ciclo(); },
      parar() { ativo = false; zerar(); },
    };
  })();

  /* ---------------- tela 3: entrada ---------------- */
  function nomeSeguro(s) { return String(s || '').replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 60); }

  async function escolherArquivo(file) {
    if (!file) return;
    try {
      const bmp = await Arte.decodificar(file);
      if (estado.bmp) estado.bmp.close();
      estado.bmp = bmp;
      Arte.miniatura(bmp, g('miniatura'), 72);
      g('miniatura').hidden = false;
      g('infoImagem').textContent = nomeSeguro(file.name) + ' · ' + bmp.width + '×' + bmp.height;
      log('Imagem carregada: ' + bmp.width + '×' + bmp.height + '.', 'ok');
    } catch (e) { log(e.message, 'err'); status(e.message); }
  }
  g('btnImagem').addEventListener('click', () => g('arquivo').click());
  g('arquivo').addEventListener('change', async e => { await escolherArquivo(e.target.files[0]); e.target.value = ''; });
  for (const alvo of [g('drop'), g('terminal-container')]) {
    alvo.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); g('drop').classList.add('sobre'); } });
    alvo.addEventListener('dragleave', () => g('drop').classList.remove('sobre'));
    alvo.addEventListener('drop', async e => {
      e.preventDefault(); g('drop').classList.remove('sobre');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (estado.tela !== 'gerar') irPara('gerar', true);
      await escolherArquivo(f);
    });
  }

  function validarJsonAoDigitar() {
    clearTimeout(estado.timerJson);
    estado.timerJson = setTimeout(() => {
      const el = g('jsonInfo'), t = g('code-editor').value;
      el.className = 'dim';
      if (!t.trim()) { el.textContent = ''; return; }
      try {
        const v = S.validar(S.extrairJSON(t));
        el.textContent = '✓ ' + v.regioes.length + ' regiões' + (v.avisos.length ? ' (' + v.avisos.length + ' aviso(s))' : '');
        el.className = 'ok';
      } catch (e) { el.textContent = '✗ ' + e.message; el.className = 'err'; }
    }, 250);
  }
  g('code-editor').addEventListener('input', validarJsonAoDigitar);
  g('code-editor').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); gerar(); } });
  g('btnColar').addEventListener('click', async () => {
    try { g('code-editor').value = await navigator.clipboard.readText(); validarJsonAoDigitar(); }
    catch (_) { log('O navegador não deixou ler a área de transferência. Clique no campo e use Ctrl+V.', 'warn'); g('code-editor').focus(); }
  });
  g('btnLimparJson').addEventListener('click', () => { g('code-editor').value = ''; validarJsonAoDigitar(); });

  function definirFundo(f, redesenhar) {
    estado.fundo = f;
    g('fundoPreto').setAttribute('aria-pressed', String(f === 'preto'));
    g('fundoCor').setAttribute('aria-pressed', String(f === 'cor'));
    salvar('fundo', f);
    if (redesenhar && estado.res) mostrar();
  }
  g('fundoPreto').addEventListener('click', () => definirFundo('preto', true));
  g('fundoCor').addEventListener('click', () => definirFundo('cor', true));
  g('colunas').addEventListener('change', () => salvar('colunas', g('colunas').value));

  /* ---------------- gerar e mostrar ---------------- */
  function mostrar() {
    const r = estado.res, cv = g('arte');
    cv.width = r.C * 10; cv.height = r.R * 20;
    S.desenhar(cv.getContext('2d'), r, { escala: 1, fundoCor: estado.fundo === 'cor', familia: mono() });
    cv.hidden = false; g('vazio').hidden = true;
    g('btnTxt').disabled = g('btnPng').disabled = false;
  }
  function ocupado(b) {
    estado.ocupado = b;
    g('btnGerar').disabled = b; g('acaoBtn').disabled = b;
    g('btnGerar').querySelector('.txt').textContent = b ? 'Gerando…' : 'Gerar';
  }
  async function gerar() {
    if (estado.ocupado) return;
    if (estado.tela !== 'gerar') irPara('gerar', true);
    if (!estado.bmp) { log('Falta a imagem: escolha o arquivo no painel.', 'err'); status('Falta a imagem.'); g('btnImagem').focus(); return; }
    let v;
    try { v = S.validar(S.extrairJSON(g('code-editor').value)); }
    catch (e) { log(e.message, 'err'); status(e.message); g('code-editor').focus(); return; }
    v.avisos.forEach(a => log(a, 'warn'));
    ocupado(true); status('Sonhando…');
    try {
      const cols = +g('colunas').value || 120;
      const img = Arte.paraImageData(estado.bmp, cols * 3);
      const r = await Motor.processar(img, v.regioes, { cols });
      estado.res = r; mostrar();
      log('Pronto: ' + r.C + '×' + r.R + ' caracteres em ' + r.stats.ms + ' ms; ' + r.stats.comprimido + ' área(s) com texto comprimido.', 'ok');
      status('Pronto. Clique na arte para ver em tamanho real.');
    } catch (e) { log('Não consegui gerar: ' + e.message, 'err'); status('Erro ao gerar. Veja o console.'); }
    finally { ocupado(false); }
  }
  g('btnGerar').addEventListener('click', gerar);
  g('arte').addEventListener('click', () => g('arte').classList.toggle('real'));
  g('btnTxt').addEventListener('click', () => { if (estado.res) Arte.baixar('sonho-profundo.txt', new Blob([S.paraTexto(estado.res)], { type: 'text/plain;charset=utf-8' })); });
  g('btnPng').addEventListener('click', () => { if (estado.res) g('arte').toBlob(b => { if (b) Arte.baixar('sonho-profundo.png', b); }, 'image/png'); });

  async function usarExemplo() {
    try {
      const bmp = await createImageBitmap(Arte.paisagemExemplo());
      if (estado.bmp) estado.bmp.close();
      estado.bmp = bmp;
      Arte.miniatura(bmp, g('miniatura'), 72); g('miniatura').hidden = false;
      g('infoImagem').textContent = 'exemplo (paisagem desenhada na hora) · ' + bmp.width + '×' + bmp.height;
      g('code-editor').value = Arte.EXEMPLO_JSON; validarJsonAoDigitar();
      log('Exemplo carregado.', 'ok');
      await gerar();
    } catch (e) { log('Não consegui carregar o exemplo: ' + e.message, 'err'); }
  }
  g('btnExemplo').addEventListener('click', usarExemplo);
  g('btnExemplo2').addEventListener('click', usarExemplo);
  g('btnLimparTudo').addEventListener('click', () => {
    if (estado.bmp) { estado.bmp.close(); estado.bmp = null; }
    estado.res = null;
    g('code-editor').value = ''; validarJsonAoDigitar();
    g('miniatura').hidden = true; g('infoImagem').textContent = 'ou solte o arquivo aqui';
    g('arte').hidden = true; g('arte').classList.remove('real'); g('vazio').hidden = false;
    g('btnTxt').disabled = g('btnPng').disabled = true;
    status('Tudo limpo.');
  });

  /* ---------------- navegação ---------------- */
  g('intro-cta').addEventListener('click', () => irPara('guia', true));
  g('guia-pronto').addEventListener('click', () => irPara('gerar', true));
  g('homeBtn').addEventListener('click', () => irPara('intro', true));
  g('acaoBtn').addEventListener('click', () => {
    if (estado.tela === 'intro') irPara('guia', true);
    else if (estado.tela === 'guia') irPara('gerar', true);
    else gerar();
  });

  /* ---------------- início ---------------- */
  const bg = BG.iniciar(g('bg'), { onFps: n => { g('fps').textContent = 'FPS: ' + (n == null || n === 0 ? '--' : n); } });
  BG.ligar = bg.ligar; BG.desligar = bg.desligar;
  { const f = ler('fundo'); if (f === 'preto' || f === 'cor') definirFundo(f, false); }
  { const c = ler('colunas'); if (c && [...g('colunas').options].some(o => o.value === c)) g('colunas').value = c; }
  irPara((location.hash || '').slice(1), false);
  log(ui.tour.visto() ? 'Pronto.' : 'Pronto. Primeira vez? Toque em "? Ajuda" para o tutorial.');
  window.Sonho_ui = { irPara, gerar, estado };
})();
