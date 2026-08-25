#!/usr/bin/env node
/**
 * index.js — Orquestrador / CLI da LicitIA
 *
 * Comandos:
 *   node index.js buscar     [--palavras "TI,Ar-Condicionado"] [--uf SP] [--headful]
 *   node index.js analisar   (processa todos os PDFs pendentes)
 *   node index.js pipeline   (buscar + analisar + relatório + abordagem, tudo em sequência)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

const { buscarViaBrowser } = require('./src/scraper/pncp');
const { extrairTextoPdf, pareceTextoValido } = require('./src/utils/pdfExtractor');
const { analisarEdital } = require('./src/analysis/analyzer');
const { gerarRelatorio } = require('./src/reports/reportGenerator');
const { gerarAbordagem } = require('./src/outreach/whatsappGenerator');

const PASTA_PENDENTES = path.join(__dirname, 'editais', 'pendentes');
const PASTA_PROCESSADOS = path.join(__dirname, 'editais', 'processados');

function checarApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n❌ ANTHROPIC_API_KEY não encontrada. Copie .env.example para .env e preencha sua chave.\n');
    process.exit(1);
  }
}

function garantirPasta(pasta) {
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
}

/**
 * Processa um único PDF: extrai texto -> analisa com Claude -> gera relatório
 * -> gera abordagem WhatsApp -> move o PDF para "processados".
 */
async function processarPdf(caminhoPdf) {
  console.log(`\n📄 Processando: ${path.basename(caminhoPdf)}`);

  const texto = await extrairTextoPdf(caminhoPdf);
  if (!pareceTextoValido(texto)) {
    console.warn('  ⚠️  Texto extraído parece vazio ou inválido (PDF pode ser escaneado/imagem). Pulando.');
    return null;
  }

  const dados = await analisarEdital(texto);
  console.log(`  ✅ Análise concluída. Score: ${dados.score_viabilidade} (${dados.recomendacao})`);

  const relatorio = await gerarRelatorio(dados);
  console.log(`  📝 Relatório salvo em: ${relatorio.md}`);
  console.log(`  📕 PDF salvo em: ${relatorio.pdf}`);

  const abordagem = gerarAbordagem(dados);
  console.log(`  💬 Texto de abordagem salvo em: ${abordagem.arquivo}`);

  garantirPasta(PASTA_PROCESSADOS);
  const destino = path.join(PASTA_PROCESSADOS, path.basename(caminhoPdf));
  fs.renameSync(caminhoPdf, destino);

  return { dados, relatorio, abordagem };
}

async function comandoBuscar(opcoes) {
  const palavras = (opcoes.palavras || process.env.PNCP_PALAVRAS_CHAVE || 'Informática,TI')
    .split(',').map((p) => p.trim()).filter(Boolean);
  const uf = opcoes.uf || process.env.PNCP_UF || '';

  console.log(`Iniciando busca no PNCP para: ${palavras.join(', ')}`);
  const resultados = await buscarViaBrowser(palavras, {
    uf,
    headless: !opcoes.headful,
  });

  console.log(`\n✅ Busca concluída. ${resultados.length} edital(is) baixado(s) em ./editais/pendentes`);
  return resultados;
}

async function comandoAnalisar() {
  checarApiKey();
  garantirPasta(PASTA_PENDENTES);

  const arquivos = fs.readdirSync(PASTA_PENDENTES).filter((f) => f.toLowerCase().endsWith('.pdf'));
  if (arquivos.length === 0) {
    console.log('Nenhum PDF pendente em ./editais/pendentes. Rode "buscar" primeiro (ou coloque PDFs manualmente na pasta).');
    return;
  }

  console.log(`Encontrados ${arquivos.length} PDF(s) pendente(s).`);
  for (const arquivo of arquivos) {
    try {
      await processarPdf(path.join(PASTA_PENDENTES, arquivo));
    } catch (erro) {
      console.error(`  ❌ Erro processando ${arquivo}:`, erro.message);
    }
  }
}

async function comandoPipeline(opcoes) {
  await comandoBuscar(opcoes);
  await comandoAnalisar();
}

const program = new Command();
program.name('licitia').description('LicitIA - automação de busca e análise de licitações públicas');

program
  .command('buscar')
  .description('Busca editais no PNCP via Playwright e baixa os PDFs para ./editais/pendentes')
  .option('--palavras <lista>', 'palavras-chave separadas por vírgula')
  .option('--uf <uf>', 'sigla da UF para filtrar (ex: SP)')
  .option('--headful', 'abre o navegador visível (útil para depurar seletores)')
  .action(comandoBuscar);

program
  .command('analisar')
  .description('Analisa todos os PDFs pendentes com o Claude, gera relatórios e abordagens')
  .action(comandoAnalisar);

program
  .command('pipeline')
  .description('Executa busca + análise em sequência')
  .option('--palavras <lista>', 'palavras-chave separadas por vírgula')
  .option('--uf <uf>', 'sigla da UF para filtrar (ex: SP)')
  .option('--headful', 'abre o navegador visível')
  .action(comandoPipeline);

program.parseAsync(process.argv);
