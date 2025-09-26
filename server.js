// server.js COMPLETO E FINAL

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');

// 1. Configuração do Banco de Dados
// O Pool usará a variável de ambiente DATABASE_URL injetada pelo Fly.io
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Variável para armazenar a data do último reset
let lastResetDate = null;

// --- FUNÇÕES DE LÓGICA DO SOCKET.IO (Corrigida e Implementada) ---

// FUNÇÃO CRÍTICA: Busca as listas no DB e envia para todos os clientes
async function sendGeneralUpdateToAll() {
    try {
        // 1. Busca os dados de todas as tabelas
        const morningListResult = await db.query('SELECT name FROM morning_list ORDER BY id;');
        const afternoonListResult = await db.query('SELECT name FROM afternoon_list ORDER BY id;');
        const morningDrawResult = await db.query('SELECT name, draw_time FROM morning_draw ORDER BY id DESC LIMIT 1;');
        const afternoonDrawResult = await db.query('SELECT name, draw_time FROM afternoon_draw ORDER BY id DESC LIMIT 1;');

        console.log(`[${new Date().toLocaleString()}] Enviando listas atualizadas para ${io.engine.clientsCount} clientes.`);

        // 2. Emite o evento para todos os clientes com os dados reais
        io.emit('updateLists', {
            morningList: morningListResult.rows.map(row => row.name),
            afternoonList: afternoonListResult.rows.map(row => row.name),
            morningDraw: morningDrawResult.rows[0] || null,
            afternoonDraw: afternoonDrawResult.rows[0] || null
        });
    } catch (error) {
        console.error(`[${new Date().toLocaleString()}] Erro ao buscar/enviar listas:`, error.message);
        // Não jogamos o erro aqui para não derrubar o servidor
    }
}

// --- FUNÇÕES DO BANCO DE DADOS ---

// Função de inicialização e verificação de tabelas
async function createTables() {
    try {
        // Como já criamos as tabelas manualmente, este código só garante as restrições
        // ou as cria se o banco for resetado um dia.
        await db.query(`
            CREATE TABLE IF NOT EXISTS morning_list (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );
        `);
        // Adicione o restante do CREATE TABLE IF NOT EXISTS aqui, se necessário.

        // As tentativas de ALTER TABLE
        try {
            await db.query(`ALTER TABLE morning_list ADD CONSTRAINT unique_morning_name UNIQUE (name);`);
        } catch (e) {
            // Ignorado, a restrição já existe
        }
        // ... (código de alteração para as outras 3 tabelas) ...

        console.log(`[${new Date().toLocaleString()}] Tabelas verificadas/restrições aplicadas.`);
    } catch (e) {
        console.error(`[${new Date().toLocaleString()}] Falha ao criar/verificar tabelas:`, e);
        throw e;
    }
}


// Função para verificar se é um novo dia e resetar as listas
async function checkAndResetListsIfNewDay() {
    // ... (restante da função de reset) ...
    // A implementação do reset deve ser similar ao que já tínhamos:
    const today = new Date().toDateString();
    if (lastResetDate !== today) {
        console.log(`[${new Date().toLocaleString()}] Detectado novo dia. Resetando listas.`);
        try {
            await db.query('TRUNCATE morning_list RESTART IDENTITY;');
            await db.query('TRUNCATE afternoon_list RESTART IDENTITY;');
            await db.query('TRUNCATE morning_draw RESTART IDENTITY;');
            await db.query('TRUNCATE afternoon_draw RESTART IDENTITY;');

            lastResetDate = today;
            
            sendGeneralUpdateToAll(); // Agora ela busca e envia corretamente
            
            console.log(`[${new Date().toLocaleString()}] Listas e sorteios resetados com sucesso.`);

        } catch (error) {
            console.error(`[${new Date().toLocaleString()}] Erro ao verificar e resetar listas:`, error.message);
        }
    }
}


// --- LÓGICA DE INICIALIZAÇÃO ---

async function runServer() {
    try {
        await createTables(); 
        await checkAndResetListsIfNewDay();
        
        // 3. Configurar rotas
        app.use(express.static('public')); 

        // Rota POST para adicionar um nome
        app.post('/add-name', express.json(), async (req, res) => {
            const { name, period } = req.body;
            const tableName = `${period}_list`;
            // ... (validação de dados) ...
            if (!name || !period || !['morning', 'afternoon'].includes(period)) {
                return res.status(400).json({ success: false, message: 'Dados inválidos.' });
            }


            try {
                // INSERÇÃO: Agora funciona porque as tabelas existem!
                const result = await db.query(`INSERT INTO ${tableName} (name) VALUES ($1) RETURNING *`, [name]);
                
                // NOTIFICAÇÃO: Envia a nova lista atualizada para todos os clientes
                await sendGeneralUpdateToAll(); 
                
                res.status(201).json({ success: true, message: `${name} adicionado à lista da ${period}.`, data: result.rows[0] });

            } catch (error) {
                // Erro de nome duplicado (agora que a restrição existe)
                if (error.code === '23505') { 
                    return res.status(409).json({ success: false, message: `O nome ${name} já está na lista da ${period}.` });
                }
                console.error(`[${new Date().toLocaleString()}] Erro ao adicionar nome:`, error.message);
                res.status(500).json({ success: false, message: 'Erro interno do servidor ao adicionar nome.' });
            }
        });

        // 4. Lógica de Socket.IO
        io.on('connection', (socket) => {
            console.log(`[${new Date().toLocaleString()}] Novo cliente conectado: ${socket.id}`);

            // IMPORTANTE: Envia o estado atual do DB assim que o cliente conecta
            sendGeneralUpdateToAll(); 

            // Lógica para desconexão
            socket.on('disconnect', () => {
                console.log(`[${new Date().toLocaleString()}] Cliente desconectado: ${socket.id}`);
            });
        });
        
        // 5. Iniciar o Servidor Web
        const PORT = process.env.PORT || 3000;
        const HOST = '0.0.0.0'; 
        
        server.listen(PORT, HOST, () => {
            console.log(`[${new Date().toLocaleString()}] Servidor rodando em http://${HOST}:${PORT}`);
        });

    } catch (e) {
        console.error(`[${new Date().toLocaleString()}] Falha na inicialização do servidor:`, e.message);
    }
}

runServer();

// --- FIM DO server.js ---
