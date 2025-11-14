const cron = require("node-cron");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configura o Express para servir arquivos estáticos (CSS, JS, imagens)
app.use(express.static(path.join(__dirname, "public")));

// ⚠️ ADIÇÃO DA ROTA PRINCIPAL (/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

let afternoonSelections = {};      // já existia no seu — se não tiver, adicionar
let selectionWindowOpen = false;   // já existia no seu — se não tiver, adicionar

let afternoonCrossed = {};         // nova variável
let selectionDisplayTime = "19h";  // nova variável

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
    return (hour >= 12 && hour < 14) || (hour === 14 && minute <= 44);
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

    afternoonSelections,   // envia marcações da tarde
    afternoonCrossed,      // envia nomes riscados
    selectionWindowOpen,   // envia status da janela
    selectionDisplayTime   // envia "19h"
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

    // --- popula mapas de selecionados e riscados a partir das colunas selected/crossed ---
    afternoonSelections = {};
    afternoonCrossed = {};
    afternoonDrawRows.forEach(row => {
      const name = (row.get('name') || "").toString().trim();

      const selRaw = row.get('selected');
      const crossedRaw = row.get('crossed');

      const selected = selRaw !== undefined && (
        selRaw === true ||
        selRaw.toString().toUpperCase() === 'TRUE' ||
        selRaw.toString() === '1'
      );

      const crossed = crossedRaw !== undefined && (
        crossedRaw === true ||
        crossedRaw.toString().toUpperCase() === 'TRUE' ||
        crossedRaw.toString() === '1'
      );

      if (name) {
        afternoonSelections[name] = !!selected;
        afternoonCrossed[name] = !!crossed;
      }
    });

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

	afternoonSelections = {};   // zera marcações anteriores
        afternoonCrossed = {};      // zera nomes riscados

        // embaralha lista e escolhe vencedores
        const shuffled = [...listToDraw].sort(() => Math.random() - 0.5); // nova linha
        afternoonDraw = shuffled.slice(0, 5);   // nova linha: define sorteados
    
	updateListsForAllClients();   // atualiza front após sorteio
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
