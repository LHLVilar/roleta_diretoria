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

  const now = new Date();
  const hour = now.getHours();

  let period = null;
  const morningStartHour = 5;
  const morningEndHour = 9;
  const afternoonStartHour = 12;
  const afternoonEndHour = 14;

  if (hour >= morningStartHour && hour <= morningEndHour) {
    period = "morning";
  } else if (hour >= afternoonStartHour && hour <= afternoonEndHour) {
    period = "afternoon";
  }
  
  // Apenas envia o nome e o período, sem validação complexa
  socket.emit("addName", { name, period });
  nameInput.value = "";
});

socket.on("updateLists", (data) => {
  morningListEl.innerHTML = data.morningList.map((n) => `<li>${n.name} <span class="horario">${n.timestamp}</span></li>`).join("");
  afternoonListEl.innerHTML = data.afternoonList.map((n) => `<li>${n.name} <span class="horario">${n.timestamp}</span></li>`).join("");
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
