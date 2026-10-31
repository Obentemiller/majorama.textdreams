# Manual do Majorama.sonho

> Prefere um passeio guiado? Toque em **? Ajuda** na barra superior (no celular, na barra de baixo). O tutorial se adapta à tela em que você está.

O Majorama.sonho é um "DeepDream de um LLM": um modelo de visão **descreve** as regiões da sua imagem, e este site preenche cada região com a **própria descrição**, em ASCII colorido. Tudo roda no seu navegador; nada é enviado a lugar nenhum.

## 1. A tela

- **Barra superior:** `Início` (volta à abertura), o botão principal (muda conforme a etapa: *Criar a arte*, *Já tenho o resultado*, *Gerar*), `Painel` (abre/fecha a entrada) e `? Ajuda`. `FPS` mostra a velocidade da animação de fundo.
- **Palco (esquerda):** na abertura e no guia, mostra o fundo animado; na tela de geração, mostra a sua arte. **Clique na arte** para alternar entre "caber na tela" e "tamanho real".
- **Painel (direita):** a entrada (imagem, JSON, mundo, colunas) e os botões de gerar e baixar. Arraste o **divisor** para redimensionar (setas do teclado também; duplo clique restaura). No celular em pé, ele vira uma gaveta embaixo.
- **Console:** mensagens do programa (erros, avisos, tempo de geração).

## 2. Como usar

1. **Abertura.** Leia a história do DeepDream e do que muda aqui. Clique em **Criar a arte**.
2. **Guia.** Clique em **Copiar o prompt**. Abra um LLM com visão (de preferência o Claude), cole o prompt, anexe **a imagem** e envie. A resposta vem como um bloco de código JSON. Copie ele inteiro. Clique em **Já tenho o resultado**.
3. **Gerar.**
   1. *Imagem:* escolha (ou solte) **a mesma imagem** que mostrou ao LLM. PNG, JPG, WebP, GIF (primeiro quadro), BMP ou AVIF, até 25 MB / 80 megapixels.
   2. *Resposta do LLM:* cole o JSON. Pode vir com texto em volta e com a cerca ```` ```json ````: o programa encontra o JSON sozinho. Abaixo do campo aparece `✓ N regiões` ou o motivo do erro.
   3. *O mundo:* **Mundo preto** (só as letras coloridas) ou **Cor da imagem** (o fundo de cada célula recebe o tom da foto). Trocar o mundo **não** precisa gerar de novo.
   4. *Colunas:* 80 a 200. Mais colunas = mais detalhe e mais tempo.
   5. **Gerar** (ou `Ctrl+Enter` no campo do JSON).
4. **Levar a arte.** `Baixar .txt` (texto puro, sem cor) ou `Baixar .png` (com cores e o mundo escolhido).

**Botão Exemplo:** carrega uma paisagem desenhada na hora e um JSON pronto, para ver o resultado sem precisar de LLM.

## 3. O que o programa faz com o JSON

- Cada região tem `bbox` (caixa em %), `z` (camada: maior fica na frente), `cor` e `desc`.
- A caixa só é uma **dica**: a forma real vem da cor da imagem dentro e em volta da caixa.
- O contorno é feito de `/ \ | -`. Dentro, a descrição se repete para preencher a área.
- Área estreita e alta escreve na vertical; larga e baixa, na horizontal.
- Se a descrição não cabe, as letras somem espalhadas: **vogais primeiro**, depois consoantes e espaços juntos.
- Cores e sombras vêm da imagem original.

## 4. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `Não encontrei um JSON nessa resposta` | Você copiou só o texto de explicação; copie o bloco de código inteiro. |
| `O JSON está incompleto` | A resposta do LLM foi cortada. Peça "continue" ou refaça e cole tudo. |
| `O JSON tem erro de sintaxe` | Vírgula faltando ou aspas trocadas. Peça ao LLM para devolver só o bloco JSON válido. |
| `Regiões demais` | Máximo de 64 regiões. O prompt pede de 6 a 20. |
| Região "sumiu" ou virou outra | A caixa/cor do LLM não bate com a imagem. Confira se é **a mesma imagem** e se `cor` é a cor real da região. |
| Letras demais viram bagunça | Descrição longa em área pequena: pedaços somem de propósito. Use mais colunas ou descrições mais curtas (a parte importante primeiro). |
| `Formato não suportado` | O arquivo não é uma imagem aceita (SVG é recusado de propósito). |
| `Demorou demais` | Reduza as colunas ou use uma imagem menor. |
| O botão Colar não funciona | O navegador bloqueou a área de transferência: clique no campo e use `Ctrl+V`. |
| Animação de fundo parada | Seu sistema pede "reduzir movimento": o fundo fica em um quadro só. |

## 5. Privacidade e segurança

- A imagem e o JSON **ficam no seu navegador**. A página bloqueia, por política de segurança (CSP), qualquer conexão de rede e qualquer script que não seja o do próprio projeto.
- O tipo da imagem é conferido pelos bytes, não pelo nome. O texto do LLM só vira letras desenhadas; nunca é interpretado como código ou HTML.
- Os arquivos baixados têm nome fixo (`sonho-profundo.txt` / `.png`).

## 6. Limites conhecidos

- **Não é o algoritmo do DeepDream:** nenhum pixel é alterado por gradiente. É a mesma ideia, "a máquina mostrando o que enxerga", só que em palavras.
- O segmentador é uma heurística (caixa do LLM + cor real). Regiões finas, muito parecidas na cor ou com caixas muito erradas podem sair imprecisas.
- O LLM só **descreve**; quem desenha é o script. Por isso o resultado é padronizado, mas depende da qualidade das caixas e cores que o LLM devolve.
- Só imagens estáticas (GIF usa o primeiro quadro). Vídeo ainda não.
- A animação da abertura é pré-programada: é uma ilustração de como o LLM "descreve", não uma execução real.
