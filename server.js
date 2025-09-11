const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, "public")));

// Alterado para armazenar objetos
let morningList = [];
let afternoonList = [];
let morningDraw = [];
let afternoonDraw = [];

// Regras de horários
const rules = `
Regras:
- Manhã: adicionar nomes de 05:00 a 09:44:59. Sorteio às 10:00.
- Tarde: adicionar nomes de 12:00 a 14:44:59. Sorteio às 15:00.
- Listas visíveis até 23:59.
- Às 00:00 as listas são apagadas e o ciclo recomeça.
`;

function log(msg) {
  console.log(`[${new Date().toLocaleString()}] ${msg}`);
}

// Verifica se está dentro do horário permitido
function canAddName(period) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  if (period === "morning") {
    const morningStart = new Date();
    morningStart.setHours(5, 0, 0, 0);
    const morningEnd = new Date();
    morningEnd.setHours(9, 44, 59, 999);
    return now >= morningStart && now <= morningEnd;
  }

  if (period === "afternoon") {
    const afternoonStart = new Date();
    afternoonStart.setHours(12, 0, 0, 0);
    const afternoonEnd = new Date();
    afternoonEnd.setHours(14, 44, 59, 999);
    return now >= afternoonStart && now <= afternoonEnd;
  }

  return false;
}

// Embaralha uma lista
function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

// Realiza o sorteio
function runDraw(period) {
  if (period === "morning" && morningList.length > 0) {
    morningDraw = shuffle([...morningList]);
  } else if (period === "afternoon" && afternoonList.length > 0) {
    afternoonDraw = shuffle([...afternoonList]);
  }
  io.emit("updateLists", {
    morningList,
    afternoonList,
    morningDraw,
    afternoonDraw,
    rules,
  });
}

// Tarefas automáticas
setInterval(() => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  // Sorteio da manhã
  if (hour === 09 && minute === 45 && second === 0) {
    log("Sorteio automático da manhã.");
    runDraw("morning");
  }

  // Sorteio da tarde
  if (hour === 14 && minute === 45 && second === 0) {
    log("Sorteio automático da tarde.");
    runDraw("afternoon");
  }

  // Limpeza das listas à meia-noite
  if (hour === 0 && minute === 0 && second === 0) {
    log("Listas limpas.");
    morningList = [];
    afternoonList = [];
    morningDraw = [];
    afternoonDraw = [];
    io.emit("updateLists", {
      morningList,
      afternoonList,
      morningDraw,
      afternoonDraw,
      rules,
    });
  }
}, 1000);

// Conexão com Socket.io
io.on("connection", (socket) => {
  log("Novo usuário conectado.");

  socket.emit("updateLists", {
    morningList,
    afternoonList,
    morningDraw,
    afternoonDraw,
    rules,
  });

  socket.on("addName", ({ name, period }) => {
    if (!canAddName(period)) {
      log(`Tentativa fora do horário: ${name} (${period})`);
      socket.emit("errorMessage", `Não é possível adicionar ${name} na lista da ${period === "morning" ? "manhã" : "tarde"} fora do horário permitido.`);
      return;
    }

    const newName = name.trim();
    const timestamp = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    if (period === "morning") {
      // Verifica se o nome já existe na lista
      if (!morningList.some((n) => n.name === newName)) {
        morningList.push({ name: newName, timestamp: timestamp });
      }
    } else {
      if (!afternoonList.some((n) => n.name === newName)) {
        afternoonList.push({ name: newName, timestamp: timestamp });
      }
    }

    log(`Nome adicionado: ${name} (${period})`);

    io.emit("updateLists", {
      morningList,
      afternoonList,
      morningDraw,
      afternoonDraw,
      rules,
    });
  });

  socket.on("manualDraw", (period) => {
    log(`Sorteio manual solicitado (${period})`);
    runDraw(period);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(`Servidor rodando na porta ${PORT}`);

});
