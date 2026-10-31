// Teste da interface (jsdom): lógica, navegação, segurança estática. jsdom não faz layout nem desenha canvas.
//   npm install --no-save jsdom && node tests/ui_smoke.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM,VirtualConsole} from 'jsdom';

const RAIZ=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lerArq=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');
const css=lerArq('vendor/majorama-ui/majorama-ui.css'),jsKit=lerArq('vendor/majorama-ui/majorama-ui.js');
const htmlOrig=lerArq('index.html');
const html=htmlOrig.replace(/<script src="([^"]+)"><\/script>/g,(_,f)=>`<script>${lerArq(f)}</script>`);

const erros=[],vc=new VirtualConsole();vc.on('jsdomError',e=>erros.push(String(e.stack||e)));
const dim={w:1000,h:600},mq={matches:false,ls:[]};
let copiado=null;
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.matchMedia=q=>{if(q.includes('max-width')||q.includes('orientation'))mq.q=q;return{get matches(){return q.includes('prefers-reduced-motion')?false:mq.matches;},addEventListener:(_,f)=>mq.ls.push(f)};};
  const tam=()=>parseFloat(w.document.getElementById('workspace').style.getPropertyValue('--editor-size'))||0;
  const def=(p,f)=>Object.defineProperty(w.HTMLElement.prototype,p,{get(){return f(this);},configurable:true});
  def('clientWidth',e=>e.id==='workspace'?dim.w:0);def('clientHeight',e=>e.id==='workspace'?dim.h:0);
  def('offsetWidth',e=>e.id==='splitter'?6:e.id==='editor-pane'?tam():0);def('offsetHeight',e=>e.id==='splitter'?22:e.id==='editor-pane'?tam():0);
  w.Element.prototype.getBoundingClientRect=function(){const v=!this.closest('[hidden]');return{left:10,top:10,width:v?100:0,height:v?30:0,right:110,bottom:40};};
  const ctx=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:6}):()=>{},set:()=>true});
  w.HTMLCanvasElement.prototype.getContext=()=>ctx;
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async t=>{copiado=t;},readText:async()=>'{"regioes":[]}'},configurable:true});
}});
const w=dom.window,d=w.document,g=id=>d.getElementById(id),esperar=ms=>new Promise(r=>setTimeout(r,ms));
const tecla=(el,key,o={})=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...o}));
const tam=()=>parseFloat(g('workspace').style.getPropertyValue('--editor-size'));
const visivel=id=>!g(id).hidden;
let falhas=0;
async function teste(n,f){try{await f();console.log('ok     ',n);}catch(e){falhas++;console.log('FALHOU ',n,'->',e.message);}}

await teste('carrega sem erros e inicia kit + app',()=>{assert.deepEqual(erros,[]);assert.ok(w.MajoramaUI&&w.UI.layout&&w.UI.tour&&w.Sonho&&w.SonhoPrompt&&w.SonhoArte&&w.SonhoBg);});
await teste('a consulta do modo vertical é idêntica no CSS e no JS do kit',()=>{const q=w.MajoramaUI.MQ_VERTICAL;assert.ok(css.includes('@media '+q+'{'));assert.ok(jsKit.includes(q));});
await teste('ids exigidos pelo kit existem',()=>{
  for(const id of 'topbar brand controls workspace terminal-pane terminal-container editor-pane splitter bY closeEditor maxEditor helpBtn tour tour-hl tour-card tourTitulo tourTexto tourPos tourPrev tourNext tourSair tourLink status-bar footer console-header console-output'.split(' '))assert.ok(g(id),'falta #'+id);});
await teste('começa na intro: só ela visível, painel fechado, botão principal "Criar a arte"',()=>{
  assert.ok(visivel('tela-intro')&&!visivel('tela-guia')&&!visivel('tela-gerar'));assert.ok(g('editor-pane').hidden);
  assert.match(g('acaoBtn').textContent,/Criar a arte/);});
await teste('intro -> guia -> gerar pelos botões; painel abre só na última',async()=>{
  g('intro-cta').click();assert.ok(visivel('tela-guia')&&!visivel('tela-intro'));assert.ok(g('editor-pane').hidden);assert.match(g('acaoBtn').textContent,/Já tenho/);
  g('guia-pronto').click();assert.ok(visivel('tela-gerar'));assert.ok(!g('editor-pane').hidden);assert.match(g('acaoBtn').textContent,/Gerar/);
  g('homeBtn').click();assert.ok(visivel('tela-intro')&&g('editor-pane').hidden);});
await teste('o botão principal avança intro -> guia -> gerar',()=>{g('acaoBtn').click();assert.ok(visivel('tela-guia'));g('acaoBtn').click();assert.ok(visivel('tela-gerar'));g('homeBtn').click();});
await teste('voltar do navegador (popstate) restaura a tela',async()=>{
  g('intro-cta').click();w.history.pushState({},'','#gerar');w.dispatchEvent(new w.PopStateEvent('popstate'));assert.ok(visivel('tela-gerar'));
  w.history.pushState({},'','#lixo');w.dispatchEvent(new w.PopStateEvent('popstate'));assert.ok(visivel('tela-intro'),'hash desconhecido cai na intro');});
await teste('o prompt aparece inteiro na caixa e o botão copia exatamente o prompt',async()=>{
  assert.equal(g('prompt-box').textContent,w.SonhoPrompt);assert.ok(w.SonhoPrompt.includes('regioes')&&w.SonhoPrompt.includes('bbox'));
  g('btnCopiar').click();await esperar(30);assert.equal(copiado,w.SonhoPrompt);assert.match(g('btnCopiar').textContent,/Copiado/);});
await teste('JSON: validação ao digitar (válido, inválido, vazio)',async()=>{
  const ed=g('code-editor'),dig=async t=>{ed.value=t;ed.dispatchEvent(new w.Event('input'));await esperar(320);};
  await dig(w.SonhoArte.EXEMPLO_JSON);assert.match(g('jsonInfo').textContent,/✓ 7 regiões/);assert.equal(g('jsonInfo').className,'ok');
  await dig('```json\n'+w.SonhoArte.EXEMPLO_JSON+'\n``` obrigado');assert.match(g('jsonInfo').textContent,/✓/);
  await dig('{"regioes": [');assert.match(g('jsonInfo').textContent,/✗/);assert.equal(g('jsonInfo').className,'err');
  await dig('');assert.equal(g('jsonInfo').textContent,'');});
await teste('gerar sem imagem avisa no console e não trava',async()=>{
  g('btnGerar').click();await esperar(30);assert.match(g('console-output').textContent,/Falta a imagem/);assert.equal(g('btnGerar').disabled,false);});
await teste('mundo preto/cor: alterna aria-pressed e persiste',()=>{
  g('fundoPreto').click();assert.equal(g('fundoPreto').getAttribute('aria-pressed'),'true');assert.equal(g('fundoCor').getAttribute('aria-pressed'),'false');
  assert.equal(w.localStorage.getItem('majorama.sonho.fundo'),'preto');g('fundoCor').click();assert.equal(w.localStorage.getItem('majorama.sonho.fundo'),'cor');});
await teste('limpar tudo zera entradas e desativa os downloads',()=>{
  g('btnLimparTudo').click();assert.equal(g('code-editor').value,'');assert.ok(g('btnTxt').disabled&&g('btnPng').disabled);assert.ok(!g('vazio').hidden);});
await teste('ajuda: percorre os passos visíveis até o fim, com link do manual, e fecha',async()=>{
  g('homeBtn').click();g('helpBtn').click();await esperar(80);assert.equal(g('tour').hidden,false);
  let vistos=0;
  for(let k=0;k<30&&!g('tour').hidden;k++){vistos++;assert.ok(g('tourTitulo').textContent);if(!g('tourLink').hidden){assert.match(g('tourLink').href,/manual\.md$/);}g('tourNext').click();await esperar(80);}
  assert.ok(vistos>=6,'passou por '+vistos+' passos');assert.equal(g('tour').hidden,true);assert.equal(w.UI.tour.visto(),true);});
await teste('ajuda: Esc sai',async()=>{g('helpBtn').click();await esperar(80);tecla(d.body,'Escape');assert.equal(g('tour').hidden,true);});
await teste('painel: modo vertical usa a altura',()=>{g('homeBtn').click();g('acaoBtn').click();g('acaoBtn').click();mq.matches=true;dim.h=700;mq.ls.forEach(f=>f());assert.equal(g('splitter').getAttribute('aria-orientation'),'horizontal');mq.matches=false;mq.ls.forEach(f=>f());});

// ---- segurança e padrão (estático) ----
const FONTES=['app.js','arte.js','bg.js','prompt.js','engine.js','worker.js'];
await teste('CSP presente e restritiva (sem unsafe-inline/unsafe-eval, sem rede)',()=>{
  const m=htmlOrig.match(/Content-Security-Policy" content="([^"]+)"/);assert.ok(m,'sem CSP');const p=m[1];
  assert.ok(/default-src 'none'/.test(p)&&/connect-src 'none'/.test(p)&&/script-src 'self'/.test(p));assert.ok(!/unsafe-/.test(p));assert.ok(!/https?:/.test(p));});
await teste('HTML sem style= inline, sem onclick/on*=, sem scripts inline, sem recursos externos',()=>{
  assert.ok(!/\sstyle=/i.test(htmlOrig),'style inline');assert.ok(!/\son[a-z]+\s*=/i.test(htmlOrig),'handler inline');
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(htmlOrig),'script inline');
  assert.ok(!/\ssrc="(https?:)?\/\//i.test(htmlOrig),'recurso externo (src)');
  assert.ok(!/<link[^>]+href="https?:/i.test(htmlOrig),'css externo');});
await teste('código próprio sem eval/Function/fetch/XHR/WebSocket/innerHTML/document.write',()=>{
  for(const f of FONTES){const t=lerArq(f).replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
    for(const [re,nome] of [[/\beval\s*\(/,'eval'],[/new\s+Function\s*\(/,'new Function'],[/\bfetch\s*\(/,'fetch'],[/XMLHttpRequest/,'XHR'],[/WebSocket/,'WebSocket'],[/\.innerHTML\s*=/,'innerHTML'],[/insertAdjacentHTML/,'insertAdjacentHTML'],[/document\.write/,'document.write'],[/\.outerHTML\s*=/,'outerHTML']])
      assert.ok(!re.test(t),f+' usa '+nome);}});
await teste('links externos têm rel="noopener noreferrer"',()=>{
  for(const a of d.querySelectorAll('a[href^="http"]'))assert.ok(/noopener/.test(a.rel)&&/noreferrer/.test(a.rel),a.href);});
await teste('manual, README e AGENTS existem; manual é linkado no rodapé',()=>{
  for(const f of ['manual.md','README.md','AGENTS.md'])assert.ok(fs.existsSync(path.join(RAIZ,f)),'falta '+f);
  assert.ok([...g('footer').querySelectorAll('a')].some(a=>/manual\.md$/.test(a.href)));});
await teste('sem erros de script ao longo dos testes',()=>assert.deepEqual(erros,[]));
if(falhas){console.log(`\n${falhas} teste(s) falharam`);process.exit(1);}
console.log('\ntodos os testes de interface passaram');process.exit(0);
