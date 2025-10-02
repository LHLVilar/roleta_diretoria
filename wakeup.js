const { io } = require("socket.io-client");

const URL = "https://roleta-diretoria-2.onrender.com/";

function wakeUp() {
  console.log("Tentando acordar app:", new Date().toISOString());

  const socket = io(URL, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
  });

  socket.on("connect", () => {
    console.log("Conectado com sucesso!");
    setTimeout(() => {
      socket.disconnect();
      console.log("Desconectado após acordar o app.");
    }, 3000);
  });

  socket.on("connect_error", (err) => {
    console.error("Erro de conexão:", err.message);
    process.exit(1);
  });
}

wakeUp();
