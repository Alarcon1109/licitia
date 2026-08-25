/**
 * src/outreach/whatsappGenerator.js
 * Gera um texto curto de abordagem, pronto para colar no WhatsApp, para
 * enviar a donos de PMEs sobre uma oportunidade de licitação encontrada.
 */

const fs = require('fs');
const path = require('path');

const PASTA_ABORDAGENS = path.join(__dirname, '..', '..', 'abordagens');

function garantirPasta(pasta) {
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
}

function slugify(texto) {
  return (texto || 'edital')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

/**
 * Monta a mensagem de abordagem baseada no resultado da análise do edital.
 */
function montarMensagem(dados, nomeEmpresa) {
  const emoji = dados.recomendacao === 'GO' ? '🟢' : dados.recomendacao === 'NO-GO' ? '🔴' : '🟡';

  return `Olá! 👋 Aqui é da ${nomeEmpresa}.

Encontramos uma licitação que pode ser uma boa oportunidade para o seu negócio:

📋 *${dados.orgao || 'Órgão público'}* (${dados.cidade_uf || ''})
🎯 ${dados.objeto_resumo || 'Objeto não especificado'}
💰 Valor estimado: ${dados.valor_estimado || 'não especificado no edital'}
📅 Sessão de abertura: ${dados.data_sessao_abertura || 'a confirmar'}

${emoji} Nossa análise de viabilidade deu *${dados.score_viabilidade ?? 'N/A'}/100* (${dados.recomendacao || 'N/A'}).

Preparamos um relatório completo de 1 página com os requisitos de habilitação e os principais riscos do edital — quer que eu te envie? Assim você decide em 5 minutos se vale a pena participar, sem precisar ler o edital inteiro.

Se tiver interesse, é só responder aqui. 🚀`;
}

/**
 * Gera e salva o texto de abordagem em ./abordagens
 * @param {object} dados - objeto retornado pelo analyzer.js
 * @param {object} opcoes - { nomeEmpresa }
 * @returns {{arquivo: string, mensagem: string}}
 */
function gerarAbordagem(dados, opcoes = {}) {
  const nomeEmpresa = opcoes.nomeEmpresa || process.env.NOME_EMPRESA || 'LicitIA';
  garantirPasta(PASTA_ABORDAGENS);

  const mensagem = montarMensagem(dados, nomeEmpresa);
  const nomeArquivo = `${slugify(dados.orgao)}__${slugify(dados.numero_edital)}__${Date.now()}.txt`;
  const caminho = path.join(PASTA_ABORDAGENS, nomeArquivo);
  fs.writeFileSync(caminho, mensagem, 'utf-8');

  return { arquivo: caminho, mensagem };
}

module.exports = { gerarAbordagem };
