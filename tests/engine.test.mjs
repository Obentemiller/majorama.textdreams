// Testes do motor (Node puro, sem dependências):  node tests/engine.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const S = createRequire(import.meta.url)('../engine.js');
let falhas = 0;
function teste(n, f) { try { f(); console.log('ok     ', n); } catch (e) { falhas++; console.log('FALHOU ', n, '->', e.message); } }

// imagem sintética: céu em cima, montanha no meio, campo embaixo
function imagem(W = 200, H = 200) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, c = y < H * 0.5 ? [120, 184, 230] : y < H * 0.75 ? [95, 160, 140] : [124, 194, 67];
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
  }
  return { data, width: W, height: H };
}
const REG = [
  { id: 'ceu', bbox: [0, 0, 100, 50], z: 0, cor: '#78b8e6', desc: 'Céu azul claro e aberto' },
  { id: 'colina', bbox: [0, 50, 100, 75], z: 1, cor: '#5fa08c', desc: 'Colina verde azulada' },
  { id: 'campo', bbox: [0, 75, 100, 100], z: 2, cor: '#7cc243', desc: 'Campo de grama viva' },
];

teste('extrairJSON: JSON puro, com cerca ```json e com texto em volta', () => {
  const o = { regioes: [{ id: 'a' }] }, j = JSON.stringify(o);
  assert.deepEqual(S.extrairJSON(j), o);
  assert.deepEqual(S.extrairJSON('Claro! Aqui está:\n```json\n' + j + '\n```\nEspero ter ajudado {com isso}.'), o);
  assert.deepEqual(S.extrairJSON('antes ' + j + ' depois'), o);
});
teste('extrairJSON: chaves dentro de strings não confundem o fechamento', () => {
  assert.deepEqual(S.extrairJSON('{"a":"} ] {","b":1} sobra'), { a: '} ] {', b: 1 });
});
teste('extrairJSON: recusa vazio, sem JSON, cortado, inválido e gigante', () => {
  for (const t of ['', '   ', 'só texto']) assert.throws(() => S.extrairJSON(t));
  assert.throws(() => S.extrairJSON('{"regioes":[{"id":"a"'), /incompleto|cortada/i);
  assert.throws(() => S.extrairJSON('{a:1}'), /sintaxe/i);
  assert.throws(() => S.extrairJSON('{"x":"' + 'a'.repeat(S.LIM.json) + '"}'), /grande/i);
});
teste('validar: aceita o exemplo do projeto e normaliza', () => {
  const v = S.validar(S.extrairJSON(fs.readFileSync(path.join(AQUI, 'paisagem.regioes.json'), 'utf8')));
  assert.ok(v.regioes.length >= 5);
  for (const r of v.regioes) {
    assert.ok(r.bbox.every(n => n >= 0 && n <= 100), 'bbox dentro de 0..100');
    assert.match(r.cor, /^#[0-9a-f]{6}$/i);
    assert.ok(r.desc.length > 0 && r.desc.length <= S.LIM.desc);
  }
});
teste('validar: limites, caracteres invisíveis, emoji e bbox fora da imagem', () => {
  const muitas = Array.from({ length: S.LIM.regioes + 1 }, (_, i) => ({ id: 'r' + i, bbox: [0, 0, 10, 10], z: 0, cor: '#ffffff', desc: 'x' }));
  assert.throws(() => S.validar({ regioes: muitas }), /demais/i);
  assert.throws(() => S.validar({}));
  assert.throws(() => S.validar({ regioes: [] }));
  const v = S.validar({ regioes: [{ id: 'a', bbox: [-50, -5, 300, 999], z: 0, cor: '#ABCDEF', desc: 'oi\u0000‮ mundo 😀 ' + 'x'.repeat(500) }] });
  const r = v.regioes[0];
  assert.deepEqual(r.bbox, [0, 0, 100, 100]);
  assert.ok(!/[\u0000-\u001f‮]/.test(r.desc) && !/\p{Extended_Pictographic}/u.test(r.desc));
  assert.ok(Array.from(r.desc).length <= S.LIM.desc);
});
teste('validar: cor inválida é recusada', () => {
  assert.throws(() => S.validar({ regioes: [{ id: 'a', bbox: [0, 0, 1, 1], z: 0, cor: 'azul', desc: 'x' }] }));
});
teste('renderizar: grade 1:2, todas as células preenchidas, contornos e texto presentes', () => {
  const r = S.renderizar(imagem(), S.validar({ regioes: REG }).regioes, { cols: 80 });
  assert.equal(r.C, 80); assert.ok(r.R >= 38 && r.R <= 42, 'linhas ~ metade das colunas (' + r.R + ')');
  assert.equal(r.car.length, r.C * r.R); assert.equal(r.cor.length, r.C * r.R * 3);
  const txt = S.paraTexto(r), linhas = txt.split('\n').filter(Boolean);
  assert.ok(linhas.length > 0 && linhas.every(l => Array.from(l).length <= r.C), 'linhas não passam da largura');
  assert.ok(/[\\/|-]/.test(txt), 'tem contornos');
  assert.ok(/céu|azul|campo|grama/i.test(txt), 'tem o texto das descrições');
});
teste('renderizar: determinístico com a mesma semente', () => {
  const v = S.validar({ regioes: REG }).regioes;
  assert.equal(S.paraTexto(S.renderizar(imagem(), v, { cols: 60, seed: 7 })), S.paraTexto(S.renderizar(imagem(), v, { cols: 60, seed: 7 })));
});
teste('renderizar: descrição longa em área pequena comprime (some vogal antes) e não estoura', () => {
  const v = S.validar({ regioes: [{ id: 'a', bbox: [0, 0, 100, 100], z: 0, cor: '#78b8e6', desc: 'a'.repeat(10) },
    { id: 'b', bbox: [40, 40, 52, 52], z: 1, cor: '#7cc243', desc: 'Pequeno detalhe verde com bastante descrição para não caber' }] }).regioes;
  const img = imagem();                                   // pinta um quadradinho verde onde fica a região "b"
  for (let y = 80; y < 104; y++) for (let x = 80; x < 104; x++) { const o = (y * 200 + x) * 4; img.data[o] = 124; img.data[o + 1] = 194; img.data[o + 2] = 67; }
  const r = S.renderizar(img, v, { cols: 60 });
  assert.ok(r.porRegiao.b > 0, 'a região pequena existe');
  assert.ok(r.stats.comprimido >= 1, 'comprimiu');
});
teste('renderizar: colunas extremas e imagem mínima não quebram', () => {
  const v = S.validar({ regioes: REG }).regioes;
  for (const cols of [S.LIM.cols[0], S.LIM.cols[1]]) assert.ok(S.renderizar(imagem(), v, { cols }).C >= 1);
  assert.ok(S.renderizar(imagem(4, 4), v, { cols: 40 }).R >= 1);
});
teste('renderizar: desempenho aceitável (200 colunas em < 3 s no Node)', () => {
  const v = S.validar({ regioes: REG }).regioes, t = Date.now();
  S.renderizar(imagem(600, 600), v, { cols: 200 });
  assert.ok(Date.now() - t < 3000, 'demorou ' + (Date.now() - t) + ' ms');
});
if (falhas) { console.log(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\ntodos os testes do motor passaram');
