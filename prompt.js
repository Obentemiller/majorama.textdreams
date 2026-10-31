/* Prompt guia que o usuário cola no LLM com visão, junto com a imagem. A resposta (JSON) é o que engine.js lê:
   se mudar o formato aqui, mude também Sonho.validar() em engine.js e o manual. */
window.SonhoPrompt = `Você é o "olho" de um filtro que transforma imagens em arte ASCII feita de texto.
Olhe a imagem anexada e divida-a em regiões visuais. Cada região será preenchida,
repetidas vezes, com a sua própria descrição, na cor que ela tem na imagem.

Responda SOMENTE com um bloco de código JSON, neste formato:

{
  "regioes": [
    {
      "id": "nome_curto",
      "bbox": [esquerda, topo, direita, base],
      "z": 0,
      "cor": "#rrggbb",
      "desc": "descrição curta da região"
    }
  ]
}

Regras:
1. "bbox" em porcentagem da imagem (0 a 100): [esquerda, topo, direita, base].
   Pode ser aproximada: o programa refina o contorno pela cor real da imagem.
2. "z" é a camada: 0 é o fundo e números maiores ficam na frente
   (um objeto na frente de outro tem "z" maior). Obrigatório em toda região.
3. "cor" é a cor média dominante da região, em hexadecimal (#rrggbb).
4. As regiões devem cobrir a imagem inteira, sem deixar buracos grandes. Divida em
   partes naturais (objeto > partes: mão > palma, dedos, unhas). Use de 6 a 20
   regiões: mais regiões dão mais detalhe.
5. "desc": UMA frase curta (até uns 100 caracteres), em português, com o mais
   importante primeiro (cor, forma, textura, luz). Em áreas pequenas o programa
   apaga letras (primeiro as vogais) para caber, então use palavras simples.
   Sem listas, aspas internas ou emojis.
6. Só inclua o que está realmente visível. Cada "id" deve ser único.
7. Não escreva nada fora do bloco de código.`;
