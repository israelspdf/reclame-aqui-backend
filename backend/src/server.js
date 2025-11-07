// ========================================
// SERVIDOR PRINCIPAL
// ========================================
// Este arquivo cria o servidor que vai receber
// as requisições do frontend e responder com os dados

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { iniciarMonitoramento, pararMonitoramento, obterReclamacoes } = require('./scheduler');
const { buscarReclamacoesDB, salvarConfiguracao, obterConfiguracoes } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// CONFIGURAÇÕES DO SERVIDOR
// ========================================

// Permite que o frontend se comunique com o backend
app.use(cors());

// Permite receber dados em JSON
app.use(express.json());

// ========================================
// ROTAS DA API
// ========================================

// Rota de teste - verifica se o servidor está funcionando
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    mensagem: 'Bot Reclame Aqui funcionando!' 
  });
});

// ========================================
// INICIAR MONITORAMENTO
// ========================================
// POST /api/monitoramento/iniciar
// Body: { empresa: "Nome da Empresa", intervalo: "1h" }
app.post('/api/monitoramento/iniciar', async (req, res) => {
  try {
    const { empresa, intervalo } = req.body;

    // Validação simples
    if (!empresa || !intervalo) {
      return res.status(400).json({ 
        erro: 'Empresa e intervalo são obrigatórios' 
      });
    }

    // Salva a configuração no banco de dados
    await salvarConfiguracao(empresa, intervalo);

    // Inicia o monitoramento automático
    iniciarMonitoramento(empresa, intervalo);

    res.json({ 
      sucesso: true, 
      mensagem: `Monitoramento iniciado para ${empresa}`,
      intervalo: intervalo
    });
  } catch (erro) {
    console.error('Erro ao iniciar monitoramento:', erro);
    res.status(500).json({ 
      erro: 'Erro ao iniciar monitoramento',
      detalhes: erro.message 
    });
  }
});

// ========================================
// PARAR MONITORAMENTO
// ========================================
// POST /api/monitoramento/parar
// Body: { empresa: "Nome da Empresa" }
app.post('/api/monitoramento/parar', (req, res) => {
  try {
    const { empresa } = req.body;

    if (!empresa) {
      return res.status(400).json({ 
        erro: 'Nome da empresa é obrigatório' 
      });
    }

    pararMonitoramento(empresa);

    res.json({ 
      sucesso: true, 
      mensagem: `Monitoramento parado para ${empresa}` 
    });
  } catch (erro) {
    console.error('Erro ao parar monitoramento:', erro);
    res.status(500).json({ 
      erro: 'Erro ao parar monitoramento',
      detalhes: erro.message 
    });
  }
});

// ========================================
// BUSCAR RECLAMAÇÕES
// ========================================
// GET /api/reclamacoes/:empresa
// Retorna todas as reclamações de uma empresa
app.get('/api/reclamacoes/:empresa', async (req, res) => {
  try {
    const { empresa } = req.params;
    const limite = parseInt(req.query.limite) || 50;

    const reclamacoes = await buscarReclamacoesDB(empresa, limite);

    res.json({ 
      sucesso: true,
      empresa: empresa,
      total: reclamacoes.length,
      reclamacoes: reclamacoes 
    });
  } catch (erro) {
    console.error('Erro ao buscar reclamações:', erro);
    res.status(500).json({ 
      erro: 'Erro ao buscar reclamações',
      detalhes: erro.message 
    });
  }
});

// ========================================
// LISTAR MONITORAMENTOS ATIVOS
// ========================================
// GET /api/monitoramento/lista
// Retorna todas as empresas sendo monitoradas
app.get('/api/monitoramento/lista', async (req, res) => {
  try {
    const configuracoes = await obterConfiguracoes();

    res.json({ 
      sucesso: true,
      total: configuracoes.length,
      monitoramentos: configuracoes 
    });
  } catch (erro) {
    console.error('Erro ao listar monitoramentos:', erro);
    res.status(500).json({ 
      erro: 'Erro ao listar monitoramentos',
      detalhes: erro.message 
    });
  }
});

// ========================================
// BUSCAR RECLAMAÇÕES MANUALMENTE (SEM SALVAR)
// ========================================
// GET /api/buscar/:empresa
// Faz uma busca imediata e retorna as reclamações
app.get('/api/buscar/:empresa', async (req, res) => {
  try {
    const { empresa } = req.params;
    
    // Importa a função de scraping
    const { buscarReclamacoes } = require('./scraper');
    
    const reclamacoes = await buscarReclamacoes(empresa);

    res.json({ 
      sucesso: true,
      empresa: empresa,
      total: reclamacoes.length,
      reclamacoes: reclamacoes,
      mensagem: 'Busca realizada com sucesso (não salvo no banco)'
    });
  } catch (erro) {
    console.error('Erro na busca manual:', erro);
    res.status(500).json({ 
      erro: 'Erro na busca manual',
      detalhes: erro.message 
    });
  }
});

// ========================================
// INICIAR O SERVIDOR
// ========================================
app.listen(PORT, () => {
  console.log('========================================');
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 API disponível em: http://localhost:${PORT}`);
  console.log('========================================');
  console.log('\n📋 Rotas disponíveis:');
  console.log('  GET  /                             - Status do servidor');
  console.log('  POST /api/monitoramento/iniciar    - Iniciar monitoramento');
  console.log('  POST /api/monitoramento/parar      - Parar monitoramento');
  console.log('  GET  /api/monitoramento/lista      - Listar monitoramentos');
  console.log('  GET  /api/reclamacoes/:empresa     - Buscar reclamações salvas');
  console.log('  GET  /api/buscar/:empresa          - Buscar reclamações agora');
  console.log('\n✅ Pronto para receber requisições!\n');
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (erro) => {
  console.error('❌ Erro não tratado:', erro);
});
