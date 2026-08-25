/**
 * src/utils/pdfExtractor.js
 * Extrai texto bruto de um PDF de edital para envio ao Claude.
 */

const fs = require('fs');
const pdfParse = require('pdf-parse');

/**
 * Extrai o texto de um arquivo PDF.
 * @param {string} caminhoArquivo
 * @returns {Promise<string>}
 */
async function extrairTextoPdf(caminhoArquivo) {
  const buffer = fs.readFileSync(caminhoArquivo);
  const dados = await pdfParse(buffer);
  return dados.text;
}

/**
 * Editais costumam ser longos. Como a extração de texto de PDFs escaneados
 * (imagem) resulta em texto vazio ou "ruído", fazemos uma checagem simples
 * e avisamos o usuário — nesse caso seria necessário OCR (fora do escopo
 * deste MVP).
 */
function pareceTextoValido(texto) {
  const textoLimpo = (texto || '').replace(/\s+/g, ' ').trim();
  return textoLimpo.length > 200;
}

module.exports = { extrairTextoPdf, pareceTextoValido };
