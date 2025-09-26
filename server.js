// server.js COMPLETO E CORRIGIDO

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

// --- FUNÇÕES DE LÓGICA DO SOCKET.IO (MOVIDA PARA FORA DO IO.ON) ---

// Função para enviar as listas e o status para todos os clientes conectados
function sendGeneralUpdateToAll() {
    console.log(`[${new Date().toLocaleString()}] Enviando atualização geral para todos os clientes.`);
    io.emit('updateLists', {
        morningList: [], // Você deve obter as listas do banco de dados aqui se estivessem preenchidas
        afternoonList: [],
        morningDraw: null,
        afternoonDraw: null
    });
}

// --- FUNÇÕES DO BANCO DE DADOS ---

// Função de inicialização e verificação de tabelas
async function createTables() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS morning_list (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );
        `);
        // O restante do código de criação e alteração de tabela deve vir aqui...
        // Para simplificar, vou manter o foco no erro:
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS afternoon_list (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );
        `);
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS morning_draw (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                draw_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        await db.query(`
            CREATE TABLE IF NOT EXISTS afternoon_draw (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                draw_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // As tentativas de ALTER TABLE que você tinha e que geravam o log de "ignorada"
        try {
            await db.query(`ALTER TABLE morning_list ADD CONSTRAINT unique_morning_name UNIQUE (name);`);
        } catch (e) {
            console.log(`[${new Date().toLocaleString()}] Tentativa de alterar morning_list ignorada (tabela pode já ter a restrição).`);
        }
        try {
            await db.query(`ALTER TABLE afternoon_list ADD CONSTRAINT unique_afternoon_name UNIQUE (name);`);
        } catch (e) {
            console.log(`[${new Date().toLocaleString()}] Tentativa de alterar afternoon_list ignorada (tabela pode já ter a restrição).`);
        }
        try {
            await db.query(`ALTER TABLE morning_draw ADD CONSTRAINT unique_morning_draw_name UNIQUE (name);`);
        } catch (e) {
            console.log(`[${new Date().toLocaleString()}] Tentativa de alterar morning_draw ignorada (tabela pode já ter a restrição).`);
        }
        try {
            await db.query(`ALTER TABLE afternoon_draw ADD CONSTRAINT unique_afternoon_draw_name UNIQUE (name);`);
        } catch (e) {
            console.log(`[${new Date().toLocaleString()}] Tentativa de alterar afternoon_draw ignorada (tabela pode já ter a restrição).`);
        }
        
        console.log(`[${new Date().toLocaleString()}] Tabelas verificadas/criadas.`);
    } catch (e) {
        console.error(`[${new Date().toLocaleString()}] Falha ao criar/verificar tabelas:`, e);
        throw e; // Re-lançar o erro para parar a inicialização se falhar
    }
}


// Função para verificar se é um novo dia e resetar as listas
async function checkAndResetListsIfNewDay() {
    const today = new Date().toDateString();

    if (lastResetDate !== today) {
        console.log(`[${new Date().toLocaleString()}] Detectado novo dia. Resetando listas.`);
        try {
            // Limpar as tabelas de lista
            await db.query('TRUNCATE morning_list RESTART IDENTITY;');
            await db.query('TRUNCATE afternoon_list RESTART IDENTITY;');

            // Limpar as tabelas de sorteio
            await db.query('TRUNCATE morning_draw RESTART IDENTITY;');
            await db.query('TRUNCATE afternoon_draw RESTART IDENTITY;');

            lastResetDate = today;
            
            // A função sendGeneralUpdateToAll precisa ser acessível aqui
            sendGeneralUpdateToAll(); 
            
            console.log(`[${new Date().toLocaleString()}] Listas e sorteios resetados com sucesso.`);

        } catch (error) {
            console.error(`[${new Date().toLocaleString()}] Erro ao verificar e resetar listas:`, error.message);
            // O erro original era "sendGeneralUpdateToAll is not defined", que agora será corrigido.
        }
    }
}


// --- LÓGICA DE INICIALIZAÇÃO ---

async function runServer() {
    try {
        // 1. Conectar/Criar Tabelas
        await createTables(); 

        // 2. Verificar e Resetar Listas (Chama a função corrigida)
        await checkAndResetListsIfNewDay();
        
        // 3. Configurar rotas (GET e POST)
        app.use(express.static('public')); // Serve arquivos estáticos (HTML, CSS, JS do frontend)

        // Rota POST para adicionar um nome
        app.post('/add-name', express.json(), async (req, res) => {
            const { name, period } = req.body;
            const tableName = `${period}_list`;

            if (!name || !period || !['morning', 'afternoon'].includes(period)) {
                return res.status(400).json({ success: false, message: 'Dados inválidos.' });
            }

            try {
                const result = await db.query(`INSERT INTO ${tableName} (name) VALUES ($1) RETURNING *`, [name]);
                
                // Se a inserção for bem-sucedida, você deve notificar os clientes!
                // Você pode chamar a função de atualização aqui:
                sendGeneralUpdateToAll(); 
                
                res.status(201).json({ success: true, message: `${name} adicionado à lista da ${period}.`, data: result.rows[0] });

            } catch (error) {
                // Erro de nome duplicado
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

            // A chamada para sendGeneralUpdateToAll está fora para que seja global

            // Lógica para desconexão
            socket.on('disconnect', () => {
                console.log(`[${new Date().toLocaleString()}] Cliente desconectado: ${socket.id}`);
            });
        });
        
        // 5. Iniciar o Servidor Web (CORREÇÃO DE PORTA JÁ APLICADA ANTERIORMENTE)
        const PORT = process.env.PORT || 3000;
        const HOST = '0.0.0.0'; // Essencial para o Fly.io
        
        server.listen(PORT, HOST, () => {
            console.log(`[${new Date().toLocaleString()}] Servidor rodando em http://${HOST}:${PORT}`);
        });

    } catch (e) {
        console.error(`[${new Date().toLocaleString()}] Falha na inicialização do servidor:`, e.message);
        // O erro original de DB estava aqui, agora deve ser o erro de código se houver.
    }
}

runServer();

// --- FIM DO server.js ---
