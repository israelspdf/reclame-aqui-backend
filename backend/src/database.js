// ========================================
// DATABASE - GERENCIAMENTO DO BANCO DE DADOS
// ========================================
// Este arquivo gerencia toda a comunicação com
// o banco de dados PostgreSQL

const { Pool } = require('pg');
require('dotenv').config();

// ========================================
// CONFIGURAÇÃO DA CONEXÃO
// ========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Testa a conexão ao iniciar
pool.on('connect', () => {
  console.log('✅ Conectado ao banco de dados');
});

pool.on('error', (erro) => {
  console.error('❌ Erro no pool de conexões:', erro);
});

// ========================================
// INICIALIZAR BANCO (Criar tabelas se não existirem)
// ========================================
async function inicializarBanco() {
  const client = await pool.connect();
  try {
    console.log('📊 Inicializando banco de dados...');

    // Cria a tabela de reclamações
    await client.query(`
      CREATE TABLE IF NOT EXISTS reclamacoes (
        id SERIAL PRIMARY KEY,
        id_externo VARCHAR(255),
        empresa VARCHAR(255) NOT NULL,
        titulo TEXT NOT NULL,
        descricao TEXT,
        status VARCHAR(100),
        data VARCHAR(100),
        local VARCHAR(255),
        link TEXT,
        coletado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(id_externo, empresa)
      )
    `);

    // Cria a tabela de configurações de monitoramento
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        id SERIAL PRIMARY KEY,
        empresa VARCHAR(255) UNIQUE NOT NULL,
        intervalo VARCHAR(50) NOT NULL,
        ativo BOOLEAN DEFAULT true,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Cria índices para melhorar performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reclamacoes_empresa 
      ON reclamacoes(empresa)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reclamacoes_data 
      ON reclamacoes(coletado_em DESC)
    `);

    console.log('✅ Banco de dados inicializado com sucesso');

  } catch (erro) {
    console.error('❌ Erro ao inicializar banco:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// SALVAR RECLAMAÇÕES
// ========================================
async function salvarReclamacoesDB(reclamacoes) {
  const client = await pool.connect();
  try {
    let salvos = 0;
    let duplicados = 0;

    for (const reclamacao of reclamacoes) {
      try {
        await client.query(
          `INSERT INTO reclamacoes 
           (id_externo, empresa, titulo, descricao, status, data, local, link, coletado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id_externo, empresa) DO NOTHING`,
          [
            reclamacao.id,
            reclamacao.empresa,
            reclamacao.titulo,
            reclamacao.descricao,
            reclamacao.status,
            reclamacao.data,
            reclamacao.local,
            reclamacao.link,
            reclamacao.coletadoEm
          ]
        );
        
        salvos++;
      } catch (erro) {
        if (erro.code === '23505') { // Código de duplicata
          duplicados++;
        } else {
          console.error('❌ Erro ao salvar reclamação:', erro.message);
        }
      }
    }

    console.log(`💾 Salvas: ${salvos} | Duplicadas: ${duplicados}`);
    return { salvos, duplicados };

  } catch (erro) {
    console.error('❌ Erro ao salvar reclamações:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// BUSCAR RECLAMAÇÕES
// ========================================
async function buscarReclamacoesDB(empresa, limite = 50) {
  const client = await pool.connect();
  try {
    const resultado = await client.query(
      `SELECT * FROM reclamacoes 
       WHERE empresa = $1 
       ORDER BY coletado_em DESC 
       LIMIT $2`,
      [empresa, limite]
    );

    return resultado.rows;

  } catch (erro) {
    console.error('❌ Erro ao buscar reclamações:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// BUSCAR TODAS AS RECLAMAÇÕES (COM FILTROS)
// ========================================
async function buscarTodasReclamacoes(filtros = {}) {
  const client = await pool.connect();
  try {
    let query = 'SELECT * FROM reclamacoes WHERE 1=1';
    const params = [];
    let paramCount = 1;

    // Filtro por empresa
    if (filtros.empresa) {
      query += ` AND empresa = $${paramCount}`;
      params.push(filtros.empresa);
      paramCount++;
    }

    // Filtro por status
    if (filtros.status) {
      query += ` AND status = $${paramCount}`;
      params.push(filtros.status);
      paramCount++;
    }

    // Filtro por data
    if (filtros.dataInicio) {
      query += ` AND coletado_em >= $${paramCount}`;
      params.push(filtros.dataInicio);
      paramCount++;
    }

    if (filtros.dataFim) {
      query += ` AND coletado_em <= $${paramCount}`;
      params.push(filtros.dataFim);
      paramCount++;
    }

    // Ordenação e limite
    query += ' ORDER BY coletado_em DESC';
    
    if (filtros.limite) {
      query += ` LIMIT $${paramCount}`;
      params.push(filtros.limite);
    }

    const resultado = await client.query(query, params);
    return resultado.rows;

  } catch (erro) {
    console.error('❌ Erro ao buscar todas as reclamações:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// SALVAR CONFIGURAÇÃO DE MONITORAMENTO
// ========================================
async function salvarConfiguracao(empresa, intervalo) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO configuracoes (empresa, intervalo, ativo)
       VALUES ($1, $2, true)
       ON CONFLICT (empresa) 
       DO UPDATE SET 
         intervalo = $2,
         ativo = true,
         atualizado_em = CURRENT_TIMESTAMP`,
      [empresa, intervalo]
    );

    console.log(`💾 Configuração salva para ${empresa}`);

  } catch (erro) {
    console.error('❌ Erro ao salvar configuração:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// OBTER CONFIGURAÇÕES
// ========================================
async function obterConfiguracoes(apenasAtivos = true) {
  const client = await pool.connect();
  try {
    let query = 'SELECT * FROM configuracoes';
    
    if (apenasAtivos) {
      query += ' WHERE ativo = true';
    }
    
    query += ' ORDER BY criado_em DESC';

    const resultado = await client.query(query);
    return resultado.rows;

  } catch (erro) {
    console.error('❌ Erro ao obter configurações:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// DESATIVAR MONITORAMENTO
// ========================================
async function desativarMonitoramento(empresa) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE configuracoes 
       SET ativo = false, atualizado_em = CURRENT_TIMESTAMP
       WHERE empresa = $1`,
      [empresa]
    );

    console.log(`🔴 Monitoramento desativado para ${empresa}`);

  } catch (erro) {
    console.error('❌ Erro ao desativar monitoramento:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// ESTATÍSTICAS
// ========================================
async function obterEstatisticas(empresa = null) {
  const client = await pool.connect();
  try {
    let query, params;

    if (empresa) {
      query = `
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT status) as status_diferentes,
          MIN(coletado_em) as primeira_coleta,
          MAX(coletado_em) as ultima_coleta
        FROM reclamacoes
        WHERE empresa = $1
      `;
      params = [empresa];
    } else {
      query = `
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT empresa) as empresas_diferentes,
          COUNT(DISTINCT status) as status_diferentes,
          MIN(coletado_em) as primeira_coleta,
          MAX(coletado_em) as ultima_coleta
        FROM reclamacoes
      `;
      params = [];
    }

    const resultado = await client.query(query, params);
    return resultado.rows[0];

  } catch (erro) {
    console.error('❌ Erro ao obter estatísticas:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// LIMPAR RECLAMAÇÕES ANTIGAS
// ========================================
async function limparReclamacoesAntigas(diasAtras = 30) {
  const client = await pool.connect();
  try {
    const resultado = await client.query(
      `DELETE FROM reclamacoes 
       WHERE coletado_em < NOW() - INTERVAL '${diasAtras} days'
       RETURNING id`,
    );

    const removidos = resultado.rowCount;
    console.log(`🗑️  ${removidos} reclamações antigas removidas (>${diasAtras} dias)`);
    
    return removidos;

  } catch (erro) {
    console.error('❌ Erro ao limpar reclamações antigas:', erro);
    throw erro;
  } finally {
    client.release();
  }
}

// ========================================
// FECHAR CONEXÕES
// ========================================
async function fecharConexoes() {
  await pool.end();
  console.log('👋 Conexões com banco de dados fechadas');
}

// Inicializa o banco ao carregar o módulo
inicializarBanco().catch(console.error);

// ========================================
// EXPORTA AS FUNÇÕES
// ========================================
module.exports = {
  salvarReclamacoesDB,
  buscarReclamacoesDB,
  buscarTodasReclamacoes,
  salvarConfiguracao,
  obterConfiguracoes,
  desativarMonitoramento,
  obterEstatisticas,
  limparReclamacoesAntigas,
  fecharConexoes,
  pool // Exporta o pool para uso direto se necessário
};
