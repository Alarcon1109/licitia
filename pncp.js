/**
 * src/scraper/pncp.js
 *
 * Módulo de automação de navegador (Playwright) para buscar editais no
 * Portal Nacional de Contratações Públicas (PNCP - pncp.gov.br) e baixar
 * os PDFs correspondentes.
 *
 * IMPORTANTE — leia antes de usar:
 * O PNCP também expõe uma API pública de consulta (sem necessidade de
 * navegador): https://pncp.gov.br/api/consulta/v1/... Essa API é mais
 * rápida e estável que "clicar" na interface web, então incluímos abaixo
 * a função `buscarViaApi` como alternativa/complemento ao Playwright.
 * Como você pediu explicitamente automação via Playwright, o fluxo
 * principal (`buscarViaBrowser`) usa o navegador. Os seletores CSS abaixo
 * foram escritos com base na estrutura pública conhecida do portal, mas
 * sites mudam com frequência — se algum seletor não encontrar elementos,
 * abra o navegador em modo não-headless (headless: false) e ajuste os
 * seletores usando o DevTools (F12 > inspecionar elemento).
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const https = require('https');

const PASTA_PENDENTES = path.join(__dirname, '..', '..', 'editais', 'pendentes');

function garantirPasta(pasta) {
  if (!fs.existsSync(pasta)) {
    fs.mkdirSync(pasta, { recursive: true });
  }
}

function slugify(texto) {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/**
 * Baixa um arquivo binário via HTTPS para o disco.
 */
function baixarArquivo(url, destino) {
  return new Promise((resolve, reject) => {
    const arquivo = fs.createWriteStream(destino);
    https.get(url, (resposta) => {
      if (resposta.statusCode >= 300 && resposta.statusCode < 400 && resposta.headers.location) {
        // segue redirecionamento simples
        baixarArquivo(resposta.headers.location, destino).then(resolve).catch(reject);
        return;
      }
      resposta.pipe(arquivo);
      arquivo.on('finish', () => arquivo.close(resolve));
    }).on('error', (erro) => {
      fs.unlink(destino, () => reject(erro));
    });
  });
}

/**
 * FLUXO PRINCIPAL: busca editais no PNCP usando Playwright (navegador real)
 * e baixa os PDFs encontrados para ./editais/pendentes.
 *
 * @param {string[]} palavrasChave - ex: ['Informática', 'TI', 'Ar-Condicionado']
 * @param {object} opcoes - { uf, headless, limitePorPalavra }
 * @returns {Promise<Array<{titulo: string, orgao: string, arquivo: string}>>}
 */
async function buscarViaBrowser(palavrasChave, opcoes = {}) {
  const { uf = '', headless = true, limitePorPalavra = 10 } = opcoes;
  garantirPasta(PASTA_PENDENTES);

  const browser = await chromium.launch({ headless });
  const contexto = await browser.newContext({ acceptDownloads: true });
  const pagina = await contexto.newPage();

  const resultados = [];

  for (const palavra of palavrasChave) {
    console.log(`\n🔎 Buscando editais para: "${palavra}"${uf ? ` (UF: ${uf})` : ''}`);

    const urlBusca = `https://pncp.gov.br/app/editais?q=${encodeURIComponent(palavra)}${uf ? `&uf=${uf}` : ''}`;
    await pagina.goto(urlBusca, { waitUntil: 'networkidle', timeout: 60000 });

    // Aguarda a lista de resultados carregar. Ajuste o seletor conforme o
    // DOM real do portal no momento em que você rodar (a interface do PNCP
    // é uma SPA e pode alterar classes com o tempo).
    try {
      await pagina.waitForSelector('[data-testid="resultado-edital"], .resultado-busca-item, .card-edital', { timeout: 15000 });
    } catch {
      console.warn(`  ⚠️  Nenhum resultado carregado para "${palavra}" (ou o seletor mudou). Pulando.`);
      continue;
    }

    const cards = await pagina.$$('[data-testid="resultado-edital"], .resultado-busca-item, .card-edital');
    const cardsLimitados = cards.slice(0, limitePorPalavra);

    for (const card of cardsLimitados) {
      try {
        const titulo = (await card.$eval('h3, .titulo-edital, .card-title', el => el.textContent.trim())
          .catch(() => 'edital-sem-titulo'));
        const orgao = (await card.$eval('.orgao, .card-subtitle, .nome-orgao', el => el.textContent.trim())
          .catch(() => 'orgao-desconhecido'));

        const linkEdital = await card.$eval('a', el => el.href).catch(() => null);
        if (!linkEdital) continue;

        // Abre a página de detalhe do edital em nova aba para localizar o PDF
        const paginaDetalhe = await contexto.newPage();
        await paginaDetalhe.goto(linkEdital, { waitUntil: 'networkidle', timeout: 60000 });

        const linkPdf = await paginaDetalhe
          .$eval('a[href$=".pdf"], a[href*="arquivo"], a[href*="download"]', el => el.href)
          .catch(() => null);

        if (linkPdf) {
          const nomeArquivo = `${slugify(orgao)}__${slugify(titulo)}__${Date.now()}.pdf`;
          const destino = path.join(PASTA_PENDENTES, nomeArquivo);
          await baixarArquivo(linkPdf, destino);
          console.log(`  ✅ Baixado: ${nomeArquivo}`);
          resultados.push({ titulo, orgao, arquivo: destino, urlOrigem: linkEdital });
        } else {
          console.warn(`  ⚠️  Não encontrei link de PDF para "${titulo}" (${orgao}).`);
        }

        await paginaDetalhe.close();
      } catch (erroCard) {
        console.warn('  ⚠️  Erro processando um resultado, pulando:', erroCard.message);
      }
    }
  }

  await browser.close();
  return resultados;
}

/**
 * ALTERNATIVA MAIS ROBUSTA: consulta a API pública de dados abertos do PNCP
 * diretamente (sem navegador). Recomendada como fallback caso os seletores
 * do site mudem. Documentação: https://pncp.gov.br/api/consulta/swagger-ui/
 *
 * Esta função busca contratações por palavra-chave no endpoint de consulta
 * e retorna os metadados; o download do PDF do edital ainda precisa ser
 * feito a partir do campo de arquivo retornado (quando disponível).
 */
async function buscarViaApi(palavrasChave, opcoes = {}) {
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  const { uf = '', tamanhoPagina = 10 } = opcoes;
  const resultados = [];

  for (const palavra of palavrasChave) {
    const params = new URLSearchParams({
      palavraChave: palavra,
      tamanhoPagina: String(tamanhoPagina),
      pagina: '1',
    });
    if (uf) params.set('uf', uf);

    const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?${params.toString()}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`  ⚠️  API respondeu ${resp.status} para "${palavra}"`);
        continue;
      }
      const dados = await resp.json();
      resultados.push({ palavra, itens: dados.data || dados });
    } catch (erro) {
      console.warn(`  ⚠️  Falha consultando API para "${palavra}":`, erro.message);
    }
  }

  return resultados;
}

module.exports = { buscarViaBrowser, buscarViaApi, PASTA_PENDENTES };
