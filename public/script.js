const socket = io();

const morningListEl = document.getElementById("morningList");
const afternoonListEl = document.getElementById("afternoonList");
const morningDrawEl = document.getElementById("morningDraw");
const afternoonDrawEl = document.getElementById("afternoonDraw");
const rulesEl = document.getElementById("rules");
const errorBox = document.getElementById("errorBox");

document.getElementById("btnAdicionar").addEventListener("click", () => {
  const nameInput = document.getElementById("nome"); // Adicionada esta linha
  const name = nameInput.value.trim();
  if (!name) return;

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  let period = null;

  const morningStartHour = 5;
  const morningEndHour = 9;
  const morningEndMinute = 44;
  if ((hour >= morningStartHour && hour < morningEndHour) || (hour === morningEndHour && minute <= morningEndMinute)) {
    period = "morning";
  }

  const afternoonStartHour = 12;
  const afternoonEndHour = 14;
  const afternoonEndMinute = 44;
  if ((hour >= afternoonStartHour && hour < afternoonEndHour) || (hour === afternoonEndHour && minute <= afternoonEndMinute)) {
    period = "afternoon";
  }

  if (period) {
    socket.emit("addName", { name, period });
    nameInput.value = ""; // Adicionada esta linha para limpar o campo
  } else {
    errorBox.textContent = "Não é possível adicionar nomes fora dos horários permitidos.";
    setTimeout(() => {
      errorBox.textContent = "";
    }, 5000);
  }
});

socket.on("updateLists", (data) => {
  morningListEl.innerHTML = data.morningList.map((n) => `<li>${n}</li>`).join("");
  afternoonListEl.innerHTML = data.afternoonList.map((n) => `<li>${n}</li>`).join("");
  morningDrawEl.innerHTML = data.morningDraw.map((n, i) => `<li>${i + 1}º ${n}</li>`).join("");
  afternoonDrawEl.innerHTML = data.afternoonDraw.map((n, i) => `<li>${i + 1}º ${n}</li>`).join("");
  rulesEl.innerText = data.rules;
  errorBox.textContent = "";
});

socket.on("errorMessage", (message) => {
  errorBox.textContent = message;
  setTimeout(() => {
      errorBox.textContent = "";
  }, 5000);
});
