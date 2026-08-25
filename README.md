# LicitIA — Automação de Licitações para PMEs

MVP local (Node.js) que busca editais no PNCP, analisa os PDFs com o Claude
e gera relatórios executivos + textos de abordagem para WhatsApp.

## ⚠️ Antes de começar — leia isto

Este código foi escrito e revisado, mas **não foi testado rodando de verdade**
contra o site do PNCP, porque foi gerado em um ambiente sem acesso à internet.
Isso significa duas coisas na prática:

1. **Os seletores CSS do scraper Playwright (`src/scraper/pncp.js`) podem
   precisar de ajuste.** O PNCP é uma SPA (site dinâmico) e sua estrutura
   HTML pode ter mudado desde o meu conhecimento. Rode primeiro com
   `--headful` (navegador visível) para ver o que está acontecendo e ajustar
   os seletores pelo DevTools (F12) se necessário.
2. Incluí como alternativa a função `buscarViaApi`, que usa a **API pública
   oficial do PNCP** (mais estável que raspar a interface). Se o scraper via
   navegador der muito trabalho de manutenção, migrar para a API é o caminho
   recomendado a médio prazo.

## Passo a passo de instalação

```bash
cd licitia

# 1. Instalar dependências
npm install

# 2. Instalar o navegador do Playwright (Chromium)
npm run playwright:install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# edite o .env e cole sua ANTHROPIC_API_KEY (console.anthropic.com)
```

## Como testar se o Playwright abre o navegador corretamente

```bash
node index.js buscar --palavras "Informática" --headful
```

Isso abre uma janela do Chromium visível navegando até o PNCP. Se a busca
falhar por causa de um seletor desatualizado, você verá um aviso no console
indicando qual etapa não encontrou o elemento esperado — abra o DevTools na
janela do navegador para localizar o seletor certo e ajuste
`src/scraper/pncp.js`.

## Uso normal (dia a dia)

```bash
# Buscar editais e baixar PDFs
node index.js buscar --palavras "Informática,TI,Ar-Condicionado,Manutenção" --uf SP

# Analisar todos os PDFs pendentes (gera relatório .md + .pdf e texto de WhatsApp)
node index.js analisar

# Ou tudo de uma vez:
node index.js pipeline --palavras "TI,Manutenção" --uf SP
```

## Estrutura de pastas

```
licitia/
├── index.js                    # CLI / orquestrador
├── .env.example
├── src/
│   ├── scraper/pncp.js         # Playwright: busca e baixa PDFs do PNCP
│   ├── utils/pdfExtractor.js   # Extração de texto do PDF
│   ├── analysis/analyzer.js    # Análise estruturada via Claude API
│   ├── reports/reportGenerator.js  # Gera relatório .md e .pdf
│   └── outreach/whatsappGenerator.js  # Gera texto de abordagem
├── editais/
│   ├── pendentes/              # PDFs baixados, aguardando análise
│   └── processados/            # PDFs já analisados
├── relatorios/                 # Relatórios executivos gerados (.md e .pdf)
└── abordagens/                 # Textos prontos para enviar no WhatsApp
```

## Próximos passos sugeridos

- Trocar o download manual do texto de abordagem por integração direta com
  a API do WhatsApp Business (ou `whatsapp-web.js`) para envio automático.
- Adicionar um `cron`/agendador (ex: `node-cron`) para rodar `pipeline`
  diariamente.
- Se o volume de editais escaneados (imagem) for alto, adicionar OCR
  (ex: Tesseract.js) ao `pdfExtractor.js`.
- Persistir os resultados em um banco simples (SQLite) para não reprocessar
  editais repetidos e para montar um histórico de score por cliente.
