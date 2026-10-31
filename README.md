# Majorama.textdreams

A **DeepDream for an LLM**: a vision model describes the regions of an image, and the site fills each region with its own description, in colored ASCII. It runs entirely in the browser (no data leaves your machine).

## How it works

1. **Intro:** the history of DeepDream (2015) and what changes here.
2. **Guide:** you copy a prompt, paste it into a vision-capable LLM (preferably Claude) along with the image, and receive a JSON of regions.
3. **Generate:** paste the image and the JSON; choose a black background or one with the image's color; download `.txt` or `.png`.

The LLM only describes; the **script** draws: it segments by color within the boxes, traces outlines `/ \ | -`, repeats the description to fill each region (vertically if it's narrow) and, if there isn't enough space, erases scattered letters (vowels first).

Usage details: [`manual.md`](manual.md).

## Publishing on GitHub Pages

1. Replace `USUARIO/REPO` in `index.html` and `app.js` with your username and repository.
2. Upload the files to the repository (root).
3. *Settings → Pages → Deploy from a branch → `main` / `(root)`*.

To test locally: `python3 -m http.server` and open `http://localhost:8000` (don't open `index.html` directly from disk: the Worker needs a server; without it the site falls back to a slower plan B, on the page itself).

## Structure

| File | Role |
|---|---|
| `index.html` | Pages, CSP, Majorama pattern ids |
| `app.js` / `app.css` | Screens, tutorial, interaction |
| `engine.js` / `worker.js` | Engine (JSON → ASCII grid), in a Web Worker |
| `arte.js` | Image, thumbnail, example, downloads |
| `prompt.js` | The guide prompt |
| `bg.js` | Preprogrammed animated background |
| `vendor/majorama-ui/` | Interface kit (do not edit) |
| `tests/` | `engine.test.mjs` (pure Node), `ui_smoke.mjs` (jsdom) |

## Tests

```
node tests/engine.test.mjs
npm install --no-save jsdom && node tests/ui_smoke.mjs
```

## Security

Restrictive CSP (`default-src 'none'`, no network, scripts only from the site itself), no `innerHTML` with external data, images validated by their bytes (SVG rejected), size limits (25 MB, 80 MP, JSON 200 thousand characters, 64 regions), downloads with fixed names.

## Limits

It is not the original DeepDream algorithm. The segmenter is heuristic (LLM box + actual color). Static images only.
