// ========================================
// SCRAPER - BUSCA RECLAMAÇÕES
// ========================================
// Este arquivo faz o trabalho de ir no site do
// Reclame Aqui e pegar as reclamações

const axios = require('axios');
const cheerio = require('cheerio');

// ========================================
// CONFIGURAÇÕES DO SCRAPER
// ========================================

const CONFIG = {
  // URL base do Reclame Aqui
  BASE_URL: 'https://www.reclameaqui.com.br',
  
  // Tempo de espera entre requisições (em milissegundos)
  // Isso evita sobrecarregar o site
  DELAY: 2000, // 2 segundos
  
  // Número máximo de reclamações por busca
  MAX_RECLAMACOES: 20,
  
  // User Agent - finge que é um navegador
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ========================================
// FUNÇÃO PARA ESPERAR (DELAY)
// ========================================
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// FUNÇÃO PRINCIPAL - BUSCAR RECLAMAÇÕES
// ========================================
async function buscarReclamacoes(nomeEmpresa) {
  try {
    console.log(`\n🔍 Iniciando busca para: ${nomeEmpresa}`);
    
    // Formata o nome da empresa para URL
    // Exemplo: "Banco do Brasil" -> "banco-do-brasil"
    const empresaFormatada = nomeEmpresa
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^\w\s]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-'); // Substitui espaços por hífen

    // Monta a URL de busca
    const urlBusca = `${CONFIG.BASE_URL}/empresa/${empresaFormatada}/lista-reclamacoes/`;
    
    console.log(`📡 URL de busca: ${urlBusca}`);

    // Faz a requisição HTTP
    const resposta = await axios.get(urlBusca, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      timeout: 10000 // 10 segundos de timeout
    });

    // Carrega o HTML com cheerio (jQuery para Node.js)
    const $ = cheerio.load(resposta.data);
    
    const reclamacoes = [];

    // ========================================
    // EXTRAI AS RECLAMAÇÕES
    // ========================================
    // NOTA: Os seletores CSS abaixo podem mudar se o
    // Reclame Aqui alterar o layout do site!
    
    // Busca cada card de reclamação
    $('.sc-1pe7b5t-0').each((index, elemento) => {
      if (index >= CONFIG.MAX_RECLAMACOES) return false; // Limite atingido

      const item = $(elemento);

      // Extrai os dados
      const titulo = item.find('[data-testid="complaint-title"]').text().trim();
      const descricao = item.find('[data-testid="complaint-description"]').text().trim();
      const status = item.find('[data-testid="complaint-status"]').text().trim();
      const data = item.find('[data-testid="complaint-creation-date"]').text().trim();
      const local = item.find('[data-testid="complaint-location"]').text().trim();
      const id = item.find('a').attr('href')?.split('/').pop() || null;

      // Só adiciona se tiver título
      if (titulo) {
        reclamacoes.push({
          id: id,
          titulo: titulo,
          descricao: descricao || 'Sem descrição',
          status: status || 'Não informado',
          data: data || new Date().toISOString(),
          local: local || 'Não informado',
          empresa: nomeEmpresa,
          link: id ? `${CONFIG.BASE_URL}/reclamacao/${id}` : null,
          coletadoEm: new Date().toISOString()
        });
      }
    });

    console.log(`✅ Encontradas ${reclamacoes.length} reclamações`);
    
    return reclamacoes;

  } catch (erro) {
    console.error('❌ Erro ao buscar reclamações:', erro.message);
    
    // Trata erros específicos
    if (erro.response) {
      // O servidor respondeu com erro
      console.error(`Status: ${erro.response.status}`);
      if (erro.response.status === 404) {
        throw new Error('Empresa não encontrada no Reclame Aqui');
      } else if (erro.response.status === 403) {
        throw new Error('Acesso bloqueado pelo Reclame Aqui');
      }
    } else if (erro.request) {
      // A requisição foi feita mas não houve resposta
      throw new Error('Sem resposta do servidor');
    }
    
    throw erro;
  }
}

// ========================================
// FUNÇÃO ALTERNATIVA - BUSCA POR PESQUISA
// ========================================
// Caso a URL direta não funcione, esta função
// faz uma busca pelo nome da empresa primeiro
async function buscarPorPesquisa(nomeEmpresa) {
  try {
    console.log(`\n🔎 Buscando empresa por pesquisa: ${nomeEmpresa}`);
    
    const urlPesquisa = `${CONFIG.BASE_URL}/busca/?q=${encodeURIComponent(nomeEmpresa)}`;
    
    const resposta = await axios.get(urlPesquisa, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT
      }
    });

    const $ = cheerio.load(resposta.data);
    
    // Busca o primeiro resultado (a empresa)
    const primeiroResultado = $('.company-card').first();
    const linkEmpresa = primeiroResultado.find('a').attr('href');
    
    if (!linkEmpresa) {
      throw new Error('Empresa não encontrada');
    }

    console.log(`✅ Empresa encontrada: ${linkEmpresa}`);
    
    // Agora busca as reclamações da empresa
    return await buscarReclamacoesDeURL(`${CONFIG.BASE_URL}${linkEmpresa}lista-reclamacoes/`);
    
  } catch (erro) {
    console.error('❌ Erro na busca por pesquisa:', erro.message);
    throw erro;
  }
}

// ========================================
// FUNÇÃO AUXILIAR - Busca de URL específica
// ========================================
async function buscarReclamacoesDeURL(url) {
  const resposta = await axios.get(url, {
    headers: {
      'User-Agent': CONFIG.USER_AGENT
    }
  });

  const $ = cheerio.load(resposta.data);
  const reclamacoes = [];

  $('.sc-1pe7b5t-0').each((index, elemento) => {
    if (index >= CONFIG.MAX_RECLAMACOES) return false;

    const item = $(elemento);
    const titulo = item.find('[data-testid="complaint-title"]').text().trim();
    const descricao = item.find('[data-testid="complaint-description"]').text().trim();

    if (titulo) {
      reclamacoes.push({
        titulo,
        descricao,
        coletadoEm: new Date().toISOString()
      });
    }
  });

  return reclamacoes;
}

// ========================================
// EXPORTA AS FUNÇÕES
// ========================================
module.exports = {
  buscarReclamacoes,
  buscarPorPesquisa
};
