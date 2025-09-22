const cron = require("node-cron");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Conexão com banco (Render)
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(express.static(path.join(__dirname, "public")));

let morningList = [];
let afternoonList = [];
let morningDraw = [];
let afternoonDraw = [];

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
    return (hour >= 0 && hour < 24) || (hour === 14 && minute <= 44);
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

async function fetchListsFromDb() {
  try {
    const morningResult = await db.query("SELECT * FROM morning_list ORDER BY timestamp ASC;");
    morningList = morningResult.rows.map(row => ({ name: row.name, timestamp: row.timestamp, socketId: row.socket_id }));

    const afternoonResult = await db.query("SELECT * FROM afternoon_list ORDER BY timestamp ASC;");
    afternoonList = afternoonResult.rows.map(row => ({ name: row.name, timestamp: row.timestamp, socketId: row.socket_id }));

    const morningDrawResult = await db.query("SELECT * FROM morning_draw ORDER BY id ASC;");
    morningDraw = morningDrawResult.rows.map(row => row.name);

    const afternoonDrawResult = await db.query("SELECT * FROM afternoon_draw ORDER BY id ASC;");
    afternoonDraw = afternoonDrawResult.rows.map(row => row.name);
  } catch (err) {
    log("Erro ao buscar listas do banco de dados: " + err.message);
  }
}

// Função para verificar e resetar as listas se for um novo dia
async function checkAndResetDaily() {
    try {
        const today = getSaoPauloTime().toISOString().split('T')[0];
        const lastResetResult = await db.query("SELECT last_reset FROM daily_reset ORDER BY id DESC LIMIT 1;");
        const lastResetDate = lastResetResult.rows.length > 0 ? lastResetResult.rows[0].last_reset.toISOString().split('T')[0] : null;

        if (lastResetDate !== today) {
            log("Detectado novo dia. Resetando listas.");
            await db.query("DELETE FROM morning_list;");
            await db.query("DELETE FROM afternoon_list;");
            await db.query("DELETE FROM morning_draw;");
            await db.query("DELETE FROM afternoon_draw;");
            
            await db.query("INSERT INTO daily_reset (last_reset) VALUES ($1);", [today]);
            
            morningList = [];
            afternoonList = [];
            morningDraw = [];
            afternoonDraw = [];
            
            sendGeneralUpdateToAll();
        }
    } catch (err) {
        log("Erro ao verificar e resetar listas: " + err.message);
    }
}

async function runDraw(period) {
  await fetchListsFromDb();
  let listToDraw = [];
  let tableToDraw = "";

  if (period === "morning") {
    listToDraw = morningList.map(n => n.name);
    tableToDraw = "morning_draw";
  } else if (period === "afternoon") {
    listToDraw = afternoonList.map(n => n.name);
    tableToDraw = "afternoon_draw";
  } else {
    return;
  }

  const shuffledList = shuffle([...listToDraw]);
  await db.query(`DELETE FROM ${tableToDraw};`);

  for (const name of shuffledList) {
    await db.query(`INSERT INTO ${tableToDraw} (name) VALUES ($1);`, [name]);
  }

  await fetchListsFromDb();
  updateListsForAllClients();
}

// Evita sorteio duplicado no mesmo dia
const lastDrawDate = { morning: null, afternoon: null };

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
  
  socket.on("addName", async ({ name, period }) => {
    if (!canAddOrRemoveName(period)) {
      socket.emit("errorMessage", `Não é possível adicionar nomes fora dos horários permitidos.`);
      log(`Tentativa de adicionar fora do horário: ${name} (${period})`);
      return;
    }

    const newName = name.trim();
    const timestamp = getSaoPauloTime().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const table = period === "morning" ? "morning_list" : "afternoon_list";

    try {
      const insertResult = await db.query(
        `INSERT INTO ${table} (name, timestamp, socket_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
        RETURNING id;`,
        [newName, timestamp, socket.id]
      );

      if (insertResult.rowCount === 0) {
        log(`Tentativa de adicionar nome duplicado: ${newName}`);
        socket.emit("errorMessage", `O nome "${newName}" já está na lista.`);
      } else {
        log(`Nome adicionado: ${newName} (${period})`);
        await fetchListsFromDb();
        updateListsForAllClients();
      }
    } catch (err) {
      log("Erro ao adicionar nome no banco de dados: " + err.message);
      socket.emit("errorMessage", "Erro ao adicionar nome. Tente novamente.");
    }
  });

  socket.on("removeName", async ({ name, period }) => {
    if (!canAddOrRemoveName(period)) {
      socket.emit("errorMessage", `Não é possível remover nomes fora dos horários permitidos.`);
      log(`Tentativa de remover fora do horário: ${name} (${period})`);
      return;
    }

    const trimmedName = name.trim();
    const table = period === "morning" ? "morning_list" : "afternoon_list";

    try {
      const result = await db.query(
        `DELETE FROM ${table} WHERE name = $1 AND socket_id = $2 RETURNING *;`,
        [trimmedName, socket.id]
      );

      if (result.rowCount > 0) {
        log(`Nome removido: ${trimmedName} (${period})`);
      } else {
        log(`Tentativa de remover nome de outro usuário ou inexistente: ${trimmedName}`);
        socket.emit("errorMessage", "Você só pode remover o seu próprio nome.");
      }

      await fetchListsFromDb();
      updateListsForAllClients();
    } catch (err) {
      log("Erro ao remover nome do banco de dados: " + err.message);
      socket.emit("errorMessage", "Erro ao remover nome. Tente novamente.");
    }
  });

  socket.on("manualDraw", async (period) => {
    log(`Sorteio manual solicitado (${period})`);
    await runDraw(period);
  });
});

async function runServer() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS morning_list (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        timestamp VARCHAR(20),
        socket_id VARCHAR(255)
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS afternoon_list (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        timestamp VARCHAR(20),
        socket_id VARCHAR(255)
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS morning_draw (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS afternoon_draw (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS daily_reset (
        id SERIAL PRIMARY KEY,
        last_reset DATE
      );
    `);
     // NOVO: tabela para controlar último reset diário
    await db.query(`
      CREATE TABLE IF NOT EXISTS daily_reset (
        id SERIAL PRIMARY KEY,
        last_reset DATE
      );
    `);
    
    log("Tabelas verificadas/criadas.");

    await fetchListsFromDb();

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (err) {
    log("Falha na inicialização do servidor: " + err.message);
  }
}

runServer();








