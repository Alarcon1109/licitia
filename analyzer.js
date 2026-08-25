/**
 * src/analysis/analyzer.js
 *
 * Pipeline de análise de editais usando a API da Anthropic (Claude).
 * Recebe o texto extraído do PDF e retorna um objeto estruturado (JSON)
 * com os campos que o LicitIA precisa para montar o relatório executivo.
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

const PROMPT_SISTEMA = `Você é o analista sênior de licitações da LicitIA, uma consultoria B2G que
ajuda pequenas e médias empresas brasileiras a decidir rapidamente se vale a
pena participar de uma licitação pública. Você lê editais completos e produz
uma extração estruturada, rigorosa e objetiva. Você NUNCA inventa informação:
se um campo não estiver claro no texto, preencha com "Não especificado no
edital" em vez de supor. Responda SOMENTE com um objeto JSON válido, sem
markdown, sem texto antes ou depois, seguindo exatamente este schema:

{
  "orgao": string,
  "cidade_uf": string,
  "objeto_resumo": string (2 frases, linguagem simples, o que o governo quer comprar),
  "valor_estimado": string (formatado em R$, ou "Não especificado no edital"),
  "modalidade": string (ex: Pregão Eletrônico, Concorrência, Dispensa),
  "numero_edital": string,
  "data_sessao_abertura": string (data e hora, ou "Não especificado no edital"),
  "prazo_impugnacao": string,
  "prazo_entrega_execucao": string,
  "habilitacao_requerida": string[] (lista de certidões, atestados, balanços exigidos),
  "riscos_e_pegadinhas": string[] (multas por atraso, exigência de marca específica, prazos apertados, exigências incomuns),
  "score_viabilidade": number (0 a 100, avaliando: clareza do edital, prazo até a sessão ser suficiente para uma PME se organizar, exigências de habilitação acessíveis a uma PME, riscos identificados),
  "recomendacao": "GO" | "NO-GO" | "GO COM RESSALVAS",
  "justificativa_score": string (2-3 frases explicando o score e a recomendação)
}`;

/**
 * Analisa o texto de um edital e retorna o objeto estruturado.
 * @param {string} textoEdital
 * @returns {Promise<object>}
 */
async function analisarEdital(textoEdital) {
  // Editais podem ser muito longos; truncamos com uma margem segura para
  // caber no contexto mantendo início (objeto/valor) e fim (anexos/prazos)
  // do documento, que costumam concentrar as informações mais relevantes.
  const LIMITE_CARACTERES = 60000;
  let textoParaAnalise = textoEdital;
  if (textoEdital.length > LIMITE_CARACTERES) {
    const metade = Math.floor(LIMITE_CARACTERES / 2);
    textoParaAnalise =
      textoEdital.slice(0, metade) +
      '\n\n[...trecho intermediário omitido por limite de tamanho...]\n\n' +
      textoEdital.slice(-metade);
  }

  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 2000,
    system: PROMPT_SISTEMA,
    messages: [
      {
        role: 'user',
        content: `Analise o edital abaixo e retorne o JSON estruturado conforme o schema definido.\n\n--- TEXTO DO EDITAL ---\n${textoParaAnalise}`,
      },
    ],
  });

  const textoResposta = resposta.content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n')
    .trim();

  // Remove eventuais cercas de código markdown, caso o modelo as inclua
  const jsonLimpo = textoResposta.replace(/^```json\s*|^```\s*|```$/gm, '').trim();

  try {
    return JSON.parse(jsonLimpo);
  } catch (erro) {
    throw new Error(
      `Falha ao interpretar resposta da IA como JSON. Resposta bruta:\n${textoResposta}\n\nErro: ${erro.message}`
    );
  }
}

module.exports = { analisarEdital };
