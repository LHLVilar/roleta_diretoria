const cron = require("node-cron");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
// (Google Sheets) ---
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// --- Configuração do Google Sheets ---
const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Substitui '\n' se for lido de variável de ambiente
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});
// ID da sua planilha
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID; 

// Inicializa o objeto da planilha
const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

// Função auxiliar para obter a aba pelo nome (Ex: 'morning_list')
function getSheetByTitle(title) {
    const sheet = doc.sheetsByTitle[title];
    if (!sheet) {
        throw new Error(`Aba "${title}" não encontrada na planilha.`);
    }
    return sheet;
}

let morningList = [];
let afternoonList = [];
let morningDraw = [];
let afternoonDraw = [];

const lastDrawDate = { morning: null, afternoon: null };

const rules = `
Regras:
- Manhã: adicionar nomes de 05:00 a 09:44:59. Sorteio às 09:45.
- Tarde: adicionar nomes de 12:00 a 14:44:59. Sorteio às 14:45.
- Listas visíveis até 23:59.
- Às 00:00 as listas são apagadas e o ciclo recomeça.
`;

let lastResetDate = null;

function log(msg) {
  console.log(`[${new Date().toLocaleString()}] ${msg}`);
}

function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

function getSaoPauloTime() {
  const serverNow = new Date();
  const utcOffset = serverNow.getTimezoneOffset() * 60000;
  const saoPauloOffset = -3 * 60 * 60000;
  return new Date(serverNow.getTime() + utcOffset + saoPauloOffset);
}

function canAddOrRemoveName(period) {
  const now = getSaoPauloTime();
  const hour = now.getHours();
  const minute = now.getMinutes();

  if (period === "morning") {
    return (hour >= 5 && hour < 9) || (hour === 9 && minute <= 44);
  }
  if (period === "afternoon") {
    return (hour >= 12 && hour < 22) || (hour === 14 && minute <= 44);
  }
  return false;
}

function updateListsForAllClients() {
  io.emit("updateLists", {
    morningList,
    afternoonList,
    morningDraw,
    afternoonDraw,
    rules,
  });
}
// ---- FUNÇÃO ADAPTADA PARA GOOGLE SHEETS ----
async function fetchListsFromDb() {
    try {
        // As abas Morning List e Afternoon List devem ter as colunas: name, timestamp, socket_id
        const morningSheet = getSheetByTitle('morning_list');
        const afternoonSheet = getSheetByTitle('afternoon_list');
        
        // As abas Morning Draw e Afternoon Draw devem ter a coluna: name
        const morningDrawSheet = getSheetByTitle('morning_draw');
        const afternoonDrawSheet = getSheetByTitle('afternoon_draw');

        // Busca e mapeia a lista da manhã
        const morningRows = await morningSheet.getRows();
        morningList = morningRows.map(row => ({
            name: row.get('name'),
            timestamp: row.get('timestamp'),
            socketId: row.get('socket_id') 
        }));

        // Busca e mapeia a lista da tarde
        const afternoonRows = await afternoonSheet.getRows();
        afternoonList = afternoonRows.map(row => ({
            name: row.get('name'),
            timestamp: row.get('timestamp'),
            socketId: row.get('socket_id')
        }));

        // Busca e mapeia os resultados do sorteio da manhã
        const morningDrawRows = await morningDrawSheet.getRows();
        morningDraw = morningDrawRows.map(row => row.get('name'));

        // Busca e mapeia os resultados do sorteio da tarde
        const afternoonDrawRows = await afternoonDrawSheet.getRows();
        afternoonDraw = afternoonDrawRows.map(row => row.get('name'));

    } catch (err) {
        log("Erro ao buscar listas do Google Sheets: " + err.message);
    }
}

// Função para verificar e resetar as listas se for um novo dia
async function checkAndResetDaily() {
    try {
        const today = getSaoPauloTime().toISOString().split('T')[0];
        
        // 1. Acessa a aba de reset e busca a última data
        const resetSheet = getSheetByTitle('daily_reset');
        const resetRows = await resetSheet.getRows();
        
        const lastResetRow = resetRows[resetRows.length - 1];
        const lastResetDate = lastResetRow ? lastResetRow.get('last_reset') : null;

        if (lastResetDate !== today) {
            log("Detectado novo dia. Resetando listas.");
            
            // 2. Apaga o conteúdo das abas (Deleta todas as linhas existentes)
            const morningSheet = getSheetByTitle('morning_list');
            const afternoonSheet = getSheetByTitle('afternoon_list');
            const morningDrawSheet = getSheetByTitle('morning_draw');
            const afternoonDrawSheet = getSheetByTitle('afternoon_draw');

            // Deleta todas as linhas (rows)
            await morningSheet.clearRows();
            await afternoonSheet.clearRows();
            await morningDrawSheet.clearRows();
            await afternoonDrawSheet.clearRows();
            
            // 3. Insere o registro de novo reset (Substitui o INSERT INTO daily_reset)
            if (lastResetRow) {
                await lastResetRow.delete();
            }
            await resetSheet.addRow({ last_reset: today });
            
            morningList = [];
            afternoonList = [];
            morningDraw = [];
            afternoonDraw = [];
            
            updateListsForAllClients(); // Atualiza o frontend
        }
    } catch (err) {
        log("Erro ao verificar e resetar listas no Sheets: " + err.message);
    }
}
// ---- FUNÇÃO ADAPTADA PARA GOOGLE SHEETS ----
async function runDraw(period) {
    await fetchListsFromDb();
    let listToDraw = [];
    let drawSheet = null;

    if (period === "morning") {
        listToDraw = morningList.map(n => n.name);
        drawSheet = getSheetByTitle("morning_draw");
    } else if (period === "afternoon") {
        listToDraw = afternoonList.map(n => n.name);
        drawSheet = getSheetByTitle("afternoon_draw");
    } else {
        return;
    }

    const shuffledList = shuffle([...listToDraw]);
    
    // 1. Limpa o sorteio anterior (Substitui o DELETE do SQL)
    await drawSheet.clearRows(); 

    // 2. Insere os nomes sorteados na aba de sorteio (Substitui o INSERT INTO)
    // No Sheets, o ON CONFLICT não existe, mas como acabamos de limpar a aba, 
    // a inserção será segura.
    for (const name of shuffledList) {
        try {
            await drawSheet.addRow({ name: name });
        } catch (err) {
            log(`Erro ao inserir nome no sorteio do Sheets: ${name} - ${err.message}`);
        }
    }

    await fetchListsFromDb();
    updateListsForAllClients();
}
// Sorteio da manhã - 09:45
cron.schedule("45 9 * * *", async () => {
  const now = getSaoPauloTime();
  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  if (lastDrawDate.morning !== todayKey) {
    lastDrawDate.morning = todayKey;
    log("Sorteio automático da manhã.");
    await runDraw("morning");
  }
}, {
  timezone: "America/Sao_Paulo"
});

// Sorteio da tarde - 14:45
cron.schedule("45 14 * * *", async () => {
  const now = getSaoPauloTime();
  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  if (lastDrawDate.afternoon !== todayKey) {
    lastDrawDate.afternoon = todayKey;
    log("Sorteio automático da tarde.");
    await runDraw("afternoon");
  }
}, {
  timezone: "America/Sao_Paulo"
});

io.on("connection", async (socket) => {
  log(`Novo usuário conectado com ID: ${socket.id}`);
  await fetchListsFromDb();
  updateListsForAllClients();
    
    // ---- FUNÇÃO ADAPTADA PARA GOOGLE SHEETS (#7) ----
    socket.on("addName", async ({ name, period }) => {
        if (!canAddOrRemoveName(period)) {
            socket.emit("errorMessage", `Não é possível adicionar nomes fora dos horários permitidos.`);
            log(`Tentativa de adicionar fora do horário: ${name} (${period})`);
            return;
        }

        const newName = name.trim();
        const timestamp = getSaoPauloTime().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const sheetTitle = period === "morning" ? "morning_list" : "afternoon_list";

        try {
            const sheet = getSheetByTitle(sheetTitle);

            // 1. Verifica se o nome já existe no Sheets (Substitui o ON CONFLICT do SQL)
            // É necessário carregar todas as linhas e verificar manualmente.
            const rows = await sheet.getRows();
            const isDuplicate = rows.some(row => row.get('name').toLowerCase() === newName.toLowerCase());

            if (isDuplicate) {
                log(`Tentativa de adicionar nome duplicado: ${newName}`);
                socket.emit("errorMessage", `O nome "${newName}" já está na lista.`);
            } else {
                // 2. Insere o novo nome (Substitui o INSERT INTO)
                await sheet.addRow({ name: newName, timestamp: timestamp, socket_id: socket.id });

                log(`Nome adicionado: ${newName} (${period})`);
                await fetchListsFromDb();
                updateListsForAllClients();
            }
        } catch (err) {
            log("Erro ao adicionar nome no Sheets: " + err.message);
            socket.emit("errorMessage", "Erro ao adicionar nome. Tente novamente.");
        }
    });
// ---- FUNÇÃO ADAPTADA PARA GOOGLE SHEETS (#8) ----
    socket.on("removeName", async ({ name, period }) => {
        if (!canAddOrRemoveName(period)) {
            socket.emit("errorMessage", `Não é possível remover nomes fora dos horários permitidos.`);
            log(`Tentativa de remover fora do horário: ${name} (${period})`);
            return;
        }

        const trimmedName = name.trim();
        const sheetTitle = period === "morning" ? "morning_list" : "afternoon_list";

        try {
            const sheet = getSheetByTitle(sheetTitle);
            const rows = await sheet.getRows();

            // 1. Encontra a linha que corresponde ao nome E ao socket_id
            const rowToDelete = rows.find(
                row => row.get('name').toLowerCase() === trimmedName.toLowerCase() && row.get('socket_id') === socket.id
            );

            if (rowToDelete) {
                // 2. Deleta a linha
                await rowToDelete.delete();
                log(`Nome removido: ${trimmedName} (${period})`);
            } else {
                log(`Tentativa de remover nome de outro usuário ou inexistente: ${trimmedName}`);
                socket.emit("errorMessage", "Você só pode remover o seu próprio nome ou o nome não foi encontrado.");
            }

            await fetchListsFromDb();
            updateListsForAllClients();
        } catch (err) {
            log("Erro ao remover nome do Sheets: " + err.message);
            socket.emit("errorMessage", "Erro ao remover nome. Tente novamente.");
        }
    });

    socket.on("manualDraw", async (period) => {
        log(`Sorteio manual solicitado (${period})`);
        await runDraw(period);
    });
});

  // --- Definição da nova função de inicialização ---
async function initializeSheets() {
    try {
        await doc.loadInfo(); 
        log("Conexão com Google Sheets estabelecida.");

        // Chamadas de funções de inicialização:
        await checkAndResetDaily();
        await fetchListsFromDb();
    } catch (err) {
        log("Falha na conexão inicial com o Google Sheets. O servidor está rodando, mas o DB está inacessível: " + err.message);
        log("⚠️ VERIFIQUE SUAS VARIÁVEIS DE AMBIENTE: GOOGLE_PRIVATE_KEY e GOOGLE_SERVICE_ACCOUNT_EMAIL");
    }
}

// --------------------------------------------------
// O `server.listen` deve estar aqui (na raiz do arquivo)!
// --------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { 
    log(`Servidor rodando na porta ${PORT}`);

    // Chamamos a função assíncrona AQUI.
    initializeSheets();
});
runServer();







