// ========================================
// SCHEDULER - AGENDAMENTO AUTOMÁTICO
// ========================================
// Este arquivo gerencia quando as buscas devem
// ser executadas automaticamente

const cron = require('node-cron');
const { buscarReclamacoes } = require('./scraper');
const { salvarReclamacoesDB } = require('./database');

// ========================================
// ARMAZENA OS JOBS ATIVOS
// ========================================
// Cada empresa terá seu próprio job de monitoramento
const jobsAtivos = new Map();

// ========================================
// CONVERTE INTERVALO PARA CRON
// ========================================
// Transforma intervalos amigáveis em expressões cron
function intervalParaCron(intervalo) {
  const conversoes = {
    '10min': '*/10 * * * *',     // A cada 10 minutos
    '30min': '*/30 * * * *',     // A cada 30 minutos
    '1h': '0 * * * *',           // A cada 1 hora (no minuto 0)
    '3h': '0 */3 * * *',         // A cada 3 horas
    '6h': '0 */6 * * *',         // A cada 6 horas
    '12h': '0 */12 * * *',       // A cada 12 horas
    'diario': '0 9 * * *',       // Diário às 9h da manhã
    '1d': '0 9 * * *',           // Mesmo que diário
    'semanal': '0 9 * * 1',      // Toda segunda-feira às 9h
    '1w': '0 9 * * 1'            // Mesmo que semanal
  };

  return conversoes[intervalo.toLowerCase()] || conversoes['1h'];
}

// ========================================
// EXECUTAR MONITORAMENTO
// ========================================
// Função que executa a busca e salva no banco
async function executarMonitoramento(empresa) {
  try {
    console.log(`\n⏰ [${new Date().toLocaleString('pt-BR')}] Executando monitoramento: ${empresa}`);
    
    // Busca as reclamações
    const reclamacoes = await buscarReclamacoes(empresa);
    
    if (reclamacoes.length === 0) {
      console.log(`ℹ️  Nenhuma reclamação nova encontrada para ${empresa}`);
      return;
    }

    // Salva no banco de dados
    await salvarReclamacoesDB(reclamacoes);
    
    console.log(`✅ ${reclamacoes.length} reclamações salvas para ${empresa}`);
    
  } catch (erro) {
    console.error(`❌ Erro no monitoramento de ${empresa}:`, erro.message);
  }
}

// ========================================
// INICIAR MONITORAMENTO
// ========================================
function iniciarMonitoramento(empresa, intervalo) {
  try {
    // Para o monitoramento anterior se existir
    pararMonitoramento(empresa);

    // Converte o intervalo para expressão cron
    const expressaoCron = intervalParaCron(intervalo);
    
    console.log(`\n🚀 Iniciando monitoramento:`);
    console.log(`   Empresa: ${empresa}`);
    console.log(`   Intervalo: ${intervalo}`);
    console.log(`   Cron: ${expressaoCron}`);

    // Executa imediatamente (primeira vez)
    executarMonitoramento(empresa);

    // Agenda as próximas execuções
    const job = cron.schedule(expressaoCron, () => {
      executarMonitoramento(empresa);
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo" // Ajuste para seu fuso horário
    });

    // Salva o job na lista de jobs ativos
    jobsAtivos.set(empresa, {
      job: job,
      intervalo: intervalo,
      iniciado: new Date().toISOString()
    });

    console.log(`✅ Monitoramento ativo para ${empresa}`);
    
    return true;

  } catch (erro) {
    console.error(`❌ Erro ao iniciar monitoramento para ${empresa}:`, erro.message);
    throw erro;
  }
}

// ========================================
// PARAR MONITORAMENTO
// ========================================
function pararMonitoramento(empresa) {
  try {
    if (jobsAtivos.has(empresa)) {
      const jobInfo = jobsAtivos.get(empresa);
      
      // Para o job
      jobInfo.job.stop();
      
      // Remove da lista
      jobsAtivos.delete(empresa);
      
      console.log(`🛑 Monitoramento parado para ${empresa}`);
      return true;
    }
    
    console.log(`ℹ️  Nenhum monitoramento ativo para ${empresa}`);
    return false;

  } catch (erro) {
    console.error(`❌ Erro ao parar monitoramento:`, erro.message);
    throw erro;
  }
}

// ========================================
// PARAR TODOS OS MONITORAMENTOS
// ========================================
function pararTodos() {
  console.log(`\n🛑 Parando todos os monitoramentos...`);
  
  jobsAtivos.forEach((jobInfo, empresa) => {
    jobInfo.job.stop();
    console.log(`   ✓ ${empresa} parado`);
  });
  
  jobsAtivos.clear();
  console.log(`✅ Todos os monitoramentos foram parados`);
}

// ========================================
// LISTAR MONITORAMENTOS ATIVOS
// ========================================
function listarMonitoramentos() {
  const lista = [];
  
  jobsAtivos.forEach((jobInfo, empresa) => {
    lista.push({
      empresa: empresa,
      intervalo: jobInfo.intervalo,
      iniciado: jobInfo.iniciado,
      ativo: true
    });
  });
  
  return lista;
}

// ========================================
// STATUS DO MONITORAMENTO
// ========================================
function statusMonitoramento(empresa) {
  if (jobsAtivos.has(empresa)) {
    const jobInfo = jobsAtivos.get(empresa);
    return {
      empresa: empresa,
      ativo: true,
      intervalo: jobInfo.intervalo,
      iniciado: jobInfo.iniciado
    };
  }
  
  return {
    empresa: empresa,
    ativo: false
  };
}

// ========================================
// OBTER RECLAMAÇÕES (CACHE)
// ========================================
// Esta função não é usada no momento, mas pode ser
// útil para implementar um sistema de cache
const cacheReclamacoes = new Map();

function obterReclamacoes(empresa) {
  if (cacheReclamacoes.has(empresa)) {
    const cache = cacheReclamacoes.get(empresa);
    
    // Verifica se o cache ainda é válido (5 minutos)
    const idadeCache = Date.now() - cache.timestamp;
    if (idadeCache < 5 * 60 * 1000) { // 5 minutos em milissegundos
      console.log(`📦 Retornando reclamações do cache para ${empresa}`);
      return cache.dados;
    }
  }
  
  return null;
}

// ========================================
// LIMPAR CACHE
// ========================================
function limparCache(empresa = null) {
  if (empresa) {
    cacheReclamacoes.delete(empresa);
  } else {
    cacheReclamacoes.clear();
  }
}

// ========================================
// TRATAMENTO DE ENCERRAMENTO
// ========================================
// Para todos os jobs quando o programa for encerrado
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Recebido sinal de interrupção...');
  pararTodos();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Recebido sinal de término...');
  pararTodos();
  process.exit(0);
});

// ========================================
// EXPORTA AS FUNÇÕES
// ========================================
module.exports = {
  iniciarMonitoramento,
  pararMonitoramento,
  pararTodos,
  listarMonitoramentos,
  statusMonitoramento,
  obterReclamacoes,
  limparCache,
  intervalParaCron
};
