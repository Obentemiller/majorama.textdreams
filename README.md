# Majorama.sonho

Um **DeepDream de um LLM**: um modelo de visão descreve as regiões de uma imagem, e o site preenche cada região com a própria descrição, em ASCII colorido. Roda inteiro no navegador (nenhum dado sai da sua máquina).

## Como funciona

1. **Abertura:** história do DeepDream (2015) e o que muda aqui.
2. **Guia:** você copia um prompt, cola num LLM com visão (de preferência o Claude) junto com a imagem e recebe um JSON de regiões.
3. **Gerar:** cole a imagem e o JSON; escolha mundo preto ou com a cor da imagem; baixe `.txt` ou `.png`.

O LLM só descreve; o **script** desenha: segmenta por cor dentro das caixas, traça contornos `/ \ | -`, repete a descrição para preencher cada região (na vertical se for estreita) e, se faltar espaço, apaga letras espalhadas (vogais primeiro).

Detalhes de uso: [`manual.md`](manual.md).

## Publicar no GitHub Pages

1. Troque `USUARIO/REPO` em `index.html` e `app.js` pelo seu usuário e repositório.
2. Envie os arquivos para o repositório (raiz).
3. *Settings → Pages → Deploy from a branch → `main` / `(root)`*.

Para testar localmente: `python3 -m http.server` e abra `http://localhost:8000` (não abra o `index.html` direto do disco: o Worker precisa de servidor; sem ele o site cai num plano B mais lento, na própria página).

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Páginas, CSP, ids do padrão Majorama |
| `app.js` / `app.css` | Telas, tutorial, interação |
| `engine.js` / `worker.js` | Motor (JSON → grade ASCII), em Web Worker |
| `arte.js` | Imagem, miniatura, exemplo, downloads |
| `prompt.js` | O prompt guia |
| `bg.js` | Fundo animado pré-programado |
| `vendor/majorama-ui/` | Kit de interface (não editar) |
| `tests/` | `engine.test.mjs` (Node puro), `ui_smoke.mjs` (jsdom) |

## Testes

```
node tests/engine.test.mjs
npm install --no-save jsdom && node tests/ui_smoke.mjs
```

## Segurança

CSP restritiva (`default-src 'none'`, sem rede, scripts só do próprio site), sem `innerHTML` com dados externos, imagem validada pelos bytes (SVG recusado), limites de tamanho (25 MB, 80 MP, JSON 200 mil caracteres, 64 regiões), downloads com nome fixo.

## Limites

Não é o algoritmo original do DeepDream. O segmentador é heurístico (caixa do LLM + cor real). Só imagens estáticas.
