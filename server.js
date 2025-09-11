const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, "public")));

let morningList = [];
let afternoonList = [];
let morningDraw = [];
let afternoonDraw = [];

// Regras de horários
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

function runDraw(period) {
  if (period === "morning" && morningList.length > 0) {
    morningDraw = shuffle([...morningList]);
  } else if (period === "afternoon" && afternoonList.length > 0) {
    afternoonDraw = shuffle([...afternoonList]);
  }
  io.emit("updateLists", { morningList, afternoonList, morningDraw, afternoonDraw, rules });
}

setInterval(() => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  if (hour === 9 && minute === 45 && second === 0) {
    log("Sorteio automático da manhã.");
    runDraw("morning");
  }

  if (hour === 14 && minute === 45 && second === 0) {
    log("Sorteio automático da tarde.");
    runDraw("afternoon");
  }

  if (hour === 0 && minute === 0 && second === 0) {
    log("Listas limpas.");
    morningList = [];
    afternoonList = [];
    morningDraw = [];
    afternoonDraw = [];
    io.emit("updateLists", { morningList, afternoonList, morningDraw, afternoonDraw, rules });
  }
}, 1000);

io.on("connection", (socket) => {
  log("Novo usuário conectado.");

  socket.emit("updateLists", { morningList, afternoonList, morningDraw, afternoonDraw, rules });

  socket.on("addName", ({ name, period }) => {
    if (period === "morning") {
      if (!morningList.some((n) => n.name === name)) {
        morningList.push({ name: name, timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) });
      }
    } else if (period === "afternoon") {
      if (!afternoonList.some((n) => n.name === name)) {
        afternoonList.push({ name: name, timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) });
      }
    }
    log(`Nome adicionado: ${name} (${period})`);
    io.emit("updateLists", { morningList, afternoonList, morningDraw, afternoonDraw, rules });
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
