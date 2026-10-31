# AGENTS.md — Majorama.sonho

Este projeto segue o **padrão Majorama UI** (`vendor/majorama-ui/` + `PADRAO.md` do kit). Regras:
1. Não edite `vendor/majorama-ui/*`: mudanças de visual/comportamento geral vão para o repositório do kit. Regras do projeto: `app.css` / `app.js`.
2. Mantenha os ids da convenção do kit e o sistema de ajuda (`? Ajuda`, `PASSOS` em `app.js`, `manual.md`). Mudou um controle? Atualize o passo do tutorial e o manual.
3. Sem estilos inline, sem `onclick=`, sem `innerHTML` com dados de usuário. `localStorage` sempre em try/catch.
4. Todo controle precisa ter alvo de toque ≥ 44 px no modo vertical e funcionar com o dedo (sem depender de hover).
5. Antes de concluir: `npm install --no-save jsdom && node tests/ui_smoke.mjs && node tests/engine.test.mjs`; confira o visual no navegador, em tela larga e em celular (em pé e deitado).

## Regras específicas do Majorama.sonho

- **Roda 100% no navegador.** Nada de `fetch`, XHR, WebSocket, CDN, fontes ou imagens externas. A CSP do `index.html` (`default-src 'none'`, `connect-src 'none'`, `script-src 'self'`) é parte da segurança: se precisar relaxar algo, discuta antes. Sem scripts, `style=` ou handlers inline.
- **Scripts clássicos, sem módulos** (funciona abrindo de qualquer servidor estático; o Worker usa `importScripts`).
- **Texto do LLM/usuário** só entra na página por `textContent` ou dentro do canvas. Tudo que vem do JSON passa por `Sonho.validar` (limites, caracteres invisíveis, emoji, bbox 0–100, cor hex).
- **Divisão de arquivos:** `engine.js` (motor puro: JSON → grade de caracteres; roda em Worker, na página e no Node) · `worker.js` · `arte.js` (arquivos/imagem/canvas/download) · `prompt.js` (o prompt guia) · `bg.js` (fundo animado) · `app.js` (UI, telas, tutorial).
- **Padrão de arte:** modo repetido (a descrição se repete até preencher), contornos `/ \ | -`, texto vertical em área estreita, compressão por vogais → consoantes+espaços. Mudar isso muda o produto: confirme com o autor.
- **Se mudar o formato do JSON**, atualize juntos: `prompt.js`, `Sonho.validar`, `Arte.EXEMPLO_JSON`, `tests/paisagem.regioes.json`, `manual.md`.
- **Desempenho:** a animação de fundo é leve de propósito (15 fps, DPR ≤ 2, pausa com a aba oculta e fora das telas de abertura/guia). Não troque por loops por pixel ou por bibliotecas.
- Os links do rodapé e do tutorial usam o placeholder `USUARIO/REPO`; troque pelo repositório real (`index.html` e `app.js`).
