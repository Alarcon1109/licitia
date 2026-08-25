/**
 * src/reports/reportGenerator.js
 * Gera o relatório executivo de 1 página (Markdown + PDF) a partir do
 * objeto estruturado retornado pelo analyzer.js.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const PASTA_RELATORIOS = path.join(__dirname, '..', '..', 'relatorios');

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

function emojiRecomendacao(recomendacao) {
  if (recomendacao === 'GO') return '✅';
  if (recomendacao === 'NO-GO') return '❌';
  return '⚠️';
}

/**
 * Monta o texto Markdown do relatório executivo.
 */
function montarMarkdown(dados, nomeEmpresa) {
  const habilitacao = (dados.habilitacao_requerida || []).map((h) => `  - ${h}`).join('\n') || '  - Não especificado no edital';
  const riscos = (dados.riscos_e_pegadinhas || []).map((r) => `  - ${r}`).join('\n') || '  - Nenhum risco relevante identificado';
  const emoji = emojiRecomendacao(dados.recomendacao);

  return `--------------------------------------------------
🚀 [${nomeEmpresa}] - RELATÓRIO DE INTELIGÊNCIA DE EDITAL
--------------------------------------------------
• Órgão Público / Cidade: ${dados.orgao || 'Não especificado'} — ${dados.cidade_uf || 'Não especificado'}
• Modalidade / Nº Edital: ${dados.modalidade || 'Não especificado'} — ${dados.numero_edital || 'Não especificado'}
• Objeto: ${dados.objeto_resumo || 'Não especificado'}
• Valor Estimado: ${dados.valor_estimado || 'Não especificado no edital'}
• Data da Sessão: ${dados.data_sessao_abertura || 'Não especificado no edital'}
• Prazo de Impugnação: ${dados.prazo_impugnacao || 'Não especificado no edital'}
• Prazo de Entrega/Execução: ${dados.prazo_entrega_execucao || 'Não especificado no edital'}

• Habilitação Requerida:
${habilitacao}

• Principais Riscos/Pegadinhas:
${riscos}

• Score de Viabilidade LicitIA: ${dados.score_viabilidade ?? 'N/A'} -> ${emoji} ${dados.recomendacao || 'N/A'}
  ${dados.justificativa_score || ''}
--------------------------------------------------
`;
}

/**
 * Gera o PDF de 1 página a partir dos dados estruturados.
 */
function gerarPdf(dados, nomeEmpresa, caminhoDestino) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(caminhoDestino);
    doc.pipe(stream);

    doc.fontSize(18).fillColor('#1a1a1a').text(`🚀 [${nomeEmpresa}] Relatório de Inteligência de Edital`, { underline: false });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666666').text(new Date().toLocaleString('pt-BR'));
    doc.moveDown(1);

    const linha = (rotulo, valor) => {
      doc.fontSize(11).fillColor('#1a1a1a').font('Helvetica-Bold').text(`${rotulo}: `, { continued: true });
      doc.font('Helvetica').fillColor('#333333').text(valor || 'Não especificado');
      doc.moveDown(0.3);
    };

    linha('Órgão Público / Cidade', `${dados.orgao || ''} — ${dados.cidade_uf || ''}`);
    linha('Modalidade / Nº Edital', `${dados.modalidade || ''} — ${dados.numero_edital || ''}`);
    linha('Objeto', dados.objeto_resumo);
    linha('Valor Estimado', dados.valor_estimado);
    linha('Data da Sessão', dados.data_sessao_abertura);
    linha('Prazo de Impugnação', dados.prazo_impugnacao);
    linha('Prazo de Entrega/Execução', dados.prazo_entrega_execucao);

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Habilitação Requerida:');
    doc.font('Helvetica');
    (dados.habilitacao_requerida || ['Não especificado no edital']).forEach((h) => doc.text(`• ${h}`));

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Principais Riscos/Pegadinhas:');
    doc.font('Helvetica');
    (dados.riscos_e_pegadinhas || ['Nenhum risco relevante identificado']).forEach((r) => doc.text(`• ${r}`));

    doc.moveDown(1);
    const emoji = emojiRecomendacao(dados.recomendacao);
    doc.fontSize(14).font('Helvetica-Bold').fillColor(
      dados.recomendacao === 'GO' ? '#0a7d32' : dados.recomendacao === 'NO-GO' ? '#b02a2a' : '#b07a2a'
    ).text(`Score de Viabilidade LicitIA: ${dados.score_viabilidade ?? 'N/A'} -> ${emoji} ${dados.recomendacao || 'N/A'}`);
    doc.fontSize(10).font('Helvetica').fillColor('#333333').text(dados.justificativa_score || '');

    doc.end();
    stream.on('finish', () => resolve(caminhoDestino));
    stream.on('error', reject);
  });
}

/**
 * Gera os dois formatos de relatório (Markdown e PDF) e salva em ./relatorios
 * @param {object} dados - objeto retornado pelo analyzer.js
 * @param {object} opcoes - { nomeEmpresa }
 * @returns {Promise<{md: string, pdf: string}>}
 */
async function gerarRelatorio(dados, opcoes = {}) {
  const nomeEmpresa = opcoes.nomeEmpresa || process.env.NOME_EMPRESA || 'LicitIA';
  garantirPasta(PASTA_RELATORIOS);

  const baseNome = `${slugify(dados.orgao)}__${slugify(dados.numero_edital)}__${Date.now()}`;
  const caminhoMd = path.join(PASTA_RELATORIOS, `${baseNome}.md`);
  const caminhoPdf = path.join(PASTA_RELATORIOS, `${baseNome}.pdf`);

  const markdown = montarMarkdown(dados, nomeEmpresa);
  fs.writeFileSync(caminhoMd, markdown, 'utf-8');
  await gerarPdf(dados, nomeEmpresa, caminhoPdf);

  return { md: caminhoMd, pdf: caminhoPdf, markdown };
}

module.exports = { gerarRelatorio, montarMarkdown };
