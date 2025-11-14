const socket = io("https://roleta-diretoria-2.onrender.com/");

const morningListEl = document.getElementById("morningList");
const afternoonListEl = document.getElementById("afternoonList");
const morningDrawEl = document.getElementById("morningDraw");
const afternoonDrawEl = document.getElementById("afternoonDraw");
const errorBox = document.getElementById("errorBox");
const relogioEl = document.getElementById("relogio");

// Variável para armazenar o ID do socket do cliente atual
let mySocketId = null;

// O servidor deve emitir seu ID após a conexão
socket.on('connect', () => {
    mySocketId = socket.id;
    console.log("Conectado com ID:", mySocketId);
});

function atualizarRelogio() {
  const agora = new Date();
  const hora = agora.getHours().toString().padStart(2, '0');
  const minuto = agora.getMinutes().toString().padStart(2, '0');
  const segundo = agora.getSeconds().toString().padStart(2, '0');
  relogioEl.textContent = `${hora}:${minuto}:${segundo}`;
}

atualizarRelogio();
setInterval(atualizarRelogio, 1000);

document.getElementById("btnAdicionar").addEventListener("click", () => {
  const nameInput = document.getElementById("nome");
  const name = nameInput.value.trim();
  if (!name) return;

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  let period = null;

  if ((hour >= 5 && hour < 9) || (hour === 9 && minute < 45)) {
    period = "morning";
  } else if ((hour >= 12 && hour < 22) || (hour === 14 && minute < 45)) {
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

// Permitir adicionar nome pressionando "Enter"
document.getElementById("nome").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    document.getElementById("btnAdicionar").click();
  }
});

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

  // armazenar dados recebidos para uso posterior no front
  window.afternoonSelections = data.afternoonSelections || {};    // nova linha
  window.afternoonCrossed = data.afternoonCrossed || {};          // nova linha
  window.selectionWindowOpen = data.selectionWindowOpen || false; // nova linha
  window.selectionDisplayTime = data.selectionDisplayTime || "19h"; // nova linha
  
  // BLOCO DE RENDERIZAÇÃO DA LISTA DA MANHÃ
morningListEl.innerHTML = data.morningList.map((n) => `
    <li class="list-group-item">
      <span>${n.name}</span>
      <span class="horario">${n.timestamp}</span>
      ${n.socketId === mySocketId ? `<button class="btn btn-sm btn-danger btn-excluir" data-nome="${n.name}">X</button>` : ''}
    </li>
`).join("");

 // BLOCO DE RENDERIZAÇÃO DA LISTA DA TARDE
afternoonListEl.innerHTML = data.afternoonList.map((n) => `
    <li class="list-group-item">
      <span>${n.name}</span>
      <span class="horario">${n.timestamp}</span>
      ${n.socketId === mySocketId ? `<button class="btn btn-sm btn-danger btn-excluir" data-nome="${n.name}">X</button>` : ''}
    </li>
`).join("");

// DRAW MANHÃ (igual)
morningDrawEl.innerHTML = data.morningDraw
  .map((n, i) => `<li>${i + 1}º ${n}</li>`)
  .join("");

// DRAW TARDE — ALTERADO
afternoonDrawEl.innerHTML = data.afternoonDraw.map((n, i) => `
    <li class="list-group-item d-flex align-items-center justify-content-between">
      <div>
        <span>${i + 1}º</span>
        <span class="ml-2" ${window.afternoonCrossed && window.afternoonCrossed[n] ? 'style="text-decoration: line-through;"' : ''}>${n}</span>
      </div>

      <div class="d-flex align-items-center">
        <label style="display:flex;align-items:center;gap:6px;margin:0;">
          <input
            type="checkbox"
            class="afternoon-checkbox"
            data-name="${n}"
            ${window.afternoonSelections && window.afternoonSelections[n] ? 'checked' : ''}
            ${window.selectionWindowOpen ? '' : 'disabled'}
          />
          <span style="font-family:Roboto, sans-serif;font-weight:700;">
            ${window.selectionDisplayTime || '19h'}
          </span>
        </label>
      </div>
    </li>
`).join("");

errorBox.textContent = "";
});

// listener: envia seleção quando checkbox muda
afternoonDrawEl.addEventListener("change", (e) => {
  if (e.target.classList.contains("afternoon-checkbox")) {
    const name = e.target.dataset.name;
    const selected = e.target.checked;
    socket.emit("selectAfternoonName", { name, selected });
  }
});

socket.on("errorMessage", (message) => {
  errorBox.textContent = message;
  setTimeout(() => {
      errorBox.textContent = "";
  }, 5000);
});
