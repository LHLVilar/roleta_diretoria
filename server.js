const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const { Client } = require("pg");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuração do banco de dados com a URL do Render
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
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
  io.sockets.sockets.forEach(s => {
    s.emit("updateLists", {
      morningList,
      afternoonList,
      morningDraw,
      afternoonDraw,
      rules,
      myId: s.id
    });
  });
}

async function fetchListsFromDb() {
  try {
    const morningResult = await dbClient.query("SELECT * FROM morning_list ORDER BY timestamp ASC;");
    morningList = morningResult.rows.map(row => ({ name: row.name, timestamp: row.timestamp, socketId: row.socket_id }));

    const afternoonResult = await dbClient.query("SELECT * FROM afternoon_list ORDER BY timestamp ASC;");
    afternoonList = afternoonResult.rows.map(row => ({ name: row.name, timestamp: row.timestamp, socketId: row.socket_id }));

    const morningDrawResult = await dbClient.query("SELECT * FROM morning_draw ORDER BY id ASC;");
    morningDraw = morningDrawResult.rows.map(row => row.name);

    const afternoonDrawResult = await dbClient.query("SELECT * FROM afternoon_draw ORDER BY id ASC;");
    afternoonDraw = afternoonDrawResult.rows.map(row => row.name);

  } catch (err) {
    log("Erro ao buscar listas do banco de dados: " + err.message);
  }
}

async function runDraw(period) {
  await fetchListsFromDb();
  let listToDraw = [];
  let tableToDraw = "";
  let tableToClear = "";

  if (period === "morning" && morningList.length > 0) {
    listToDraw = morningList.map(n => n.name);
    tableToDraw = "morning_draw";
    tableToClear = "afternoon_draw"; // Para garantir que só haja um resultado por vez
  } else if (period === "afternoon" && afternoonList.length > 0) {
    listToDraw = afternoonList.map(n => n.name);
    tableToDraw = "afternoon_draw";
    tableToClear = "morning_draw"; // Para garantir que só haja um resultado por vez
  } else {
    return;
  }
  
  const shuffledList = shuffle([...listToDraw]);
  
  // Limpa o resultado anterior antes de inserir o novo
  await dbClient.query(`DELETE FROM ${tableToDraw};`);
  await dbClient.query(`DELETE FROM ${tableToClear};`);
  
  for (const name of shuffledList) {
    await dbClient.query(`INSERT INTO ${tableToDraw} (name) VALUES ($1);`, [name]);
  }
  
  await fetchListsFromDb(); // Busca os novos resultados para a memória
  updateListsForAllClients();
}

setInterval(async () => {
  const now = getSaoPauloTime();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  if (hour === 9 && minute === 45 && second === 0) {
    log("Sorteio automático da manhã.");
    await runDraw("morning");
  }

  if (hour === 14 && minute === 45 && second === 0) {
    log("Sorteio automático da tarde.");
    await runDraw("afternoon");
  }

  if (hour === 0 && minute === 0 && second === 0) {
    log("Listas limpas no banco de dados.");
    await dbClient.query("DELETE FROM morning_list;");
    await dbClient.query("DELETE FROM afternoon_list;");
    await dbClient.query("DELETE FROM morning_draw;");
    await dbClient.query("DELETE FROM afternoon_draw;");
    morningList = [];
    afternoonList = [];
    morningDraw = [];
    afternoonDraw = [];
    updateListsForAllClients();
  }
}, 1000);

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
    let table = period === "morning" ? "morning_list" : "afternoon_list";

    try {
      const checkResult = await dbClient.query(`SELECT 1 FROM ${table} WHERE name = $1;`, [newName]);
      if (checkResult.rowCount > 0) {
        log(`Tentativa de adicionar nome duplicado: ${newName}`);
        socket.emit("errorMessage", `O nome "${newName}" já está na lista.`);
        return;
      }
      
      await dbClient.query(
        `INSERT INTO ${table} (name, timestamp, socket_id) VALUES ($1, $2, $3);`,
        [newName, timestamp, socket.id]
      );
      log(`Nome adicionado: ${newName} (${period})`);
      await fetchListsFromDb();
      updateListsForAllClients();
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
    let table = period === "morning" ? "morning_list" : "afternoon_list";

    try {
      const result = await dbClient.query(
        `DELETE FROM ${table} WHERE name = $1 AND socket_id = $2 RETURNING *;`,
        [trimmedName, socket.id]
      );
      
      if (result.rowCount > 0) {
        log(`Nome removido: ${trimmedName} (${period})`);
      } else {
        log(`Tentativa de remover nome de outro usuário ou nome inexistente: ${trimmedName}`);
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
    await dbClient.connect();
    log("Conectado ao banco de dados.");
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS morning_list (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        timestamp VARCHAR(20),
        socket_id VARCHAR(255)
      );
    `);
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS afternoon_list (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        timestamp VARCHAR(20),
        socket_id VARCHAR(255)
      );
    `);
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS morning_draw (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      );
    `);
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS afternoon_draw (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
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


