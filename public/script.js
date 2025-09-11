const socket = io();

const morningListEl = document.getElementById("morningList");
const afternoonListEl = document.getElementById("afternoonList");
const morningDrawEl = document.getElementById("morningDraw");
const afternoonDrawEl = document.getElementById("afternoonDraw");
const errorBox = document.getElementById("errorBox");

document.getElementById("btnAdicionar").addEventListener("click", () => {
  const nameInput = document.getElementById("nome");
  const name = nameInput.value.trim();
  if (!name) return;

  // === CÓDIGO FINAL COM AS REGRAS DE TEMPO REATIVADAS ===
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  let period = null;

  if ((hour >= 5 && hour < 9) || (hour === 9 && minute < 45)) {
    period = "morning";
  } else if ((hour >= 12 && hour < 14) || (hour === 14 && minute < 45)) {
    period = "afternoon";
  }

  if (period) {
    socket.emit("addName", { name, period });
    nameInput.value = "";
  } else {
    errorBox.textContent = "Não é possível adicionar nomes fora dos horários permitidos.";
    setTimeout(() => {
      errorBox.textContent = "";
    }, 5000);
  }
});

// Delegação de evento para os botões "X"
document.getElementById("morningList").addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-excluir")) {
    const name = e.target.getAttribute("data-nome");
    if (confirm(`Tem certeza que deseja apagar o nome "${name}"?`)) {
      socket.emit("removeName", { name, period: "morning" });
    }
  }
});

document.getElementById("afternoonList").addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-excluir")) {
    const name = e.target.getAttribute("data-nome");
    if (confirm(`Tem certeza que deseja apagar o nome "${name}"?`)) {
      socket.emit("removeName", { name, period: "afternoon" });
    }
  }
});

socket.on("updateLists", (data) => {
  morningListEl.innerHTML = data.morningList.map((n) => `
    <li class="list-group-item">
      <span>${n.name}</span>
      <span class="horario">${n.timestamp}</span>
      ${n.socketId === data.myId ? `<button class="btn btn-sm btn-danger btn-excluir" data-nome="${n.name}">X</button>` : ''}
    </li>
  `).join("");

  afternoonListEl.innerHTML = data.afternoonList.map((n) => `
    <li class="list-group-item">
      <span>${n.name}</span>
      <span class="horario">${n.timestamp}</span>
      ${n.socketId === data.myId ? `<button class="btn btn-sm btn-danger btn-excluir" data-nome="${n.name}">X</button>` : ''}
    </li>
  `).join("");

  morningDrawEl.innerHTML = data.morningDraw.map((n, i) => `<li>${i + 1}º ${n}</li>`).join("");
  afternoonDrawEl.innerHTML = data.afternoonDraw.map((n, i) => `<li>${i + 1}º ${n}</li>`).join("");
  errorBox.textContent = "";
});

socket.on("errorMessage", (message) => {
  errorBox.textContent = message;
  setTimeout(() => {
      errorBox.textContent = "";
  }, 5000);
});
