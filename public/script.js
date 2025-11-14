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

// RENDERIZAÇÃO E MANUTENÇÃO DE ESTADO
function renderAfternoonDraw(data) {
  afternoonDrawEl.innerHTML = '';
  data.afternoonDraw.forEach((n, i) => {
    const isChecked = window.afternoonSelections[n] || false;
    const isCrossed = window.afternoonCrossed[n] || false;

    const li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center justify-content-between';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${i + 1}º ${n}`;
    if (isCrossed) nameSpan.style.textDecoration = 'line-through';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'afternoon-checkbox';
    checkbox.dataset.name = n;
    checkbox.checked = isChecked;
    checkbox.disabled = !window.selectionWindowOpen;

    checkbox.addEventListener('change', () => {
      window.afternoonSelections[n] = checkbox.checked;
      socket.emit("selectAfternoonName", { name: n, selected: checkbox.checked });
    });

    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.margin = '0';
    label.appendChild(checkbox);

    const timeSpan = document.createElement('span');
    timeSpan.style.fontFamily = 'Roboto, sans-serif';
    timeSpan.style.fontWeight = '700';
    timeSpan.textContent = window.selectionDisplayTime || '19h';
    label.appendChild(timeSpan);

    const leftDiv = document.createElement('div');
    leftDiv.appendChild(nameSpan);

    const rightDiv = document.createElement('div');
    rightDiv.className = 'd-flex align-items-center';
    rightDiv.appendChild(label);

    li.appendChild(leftDiv);
    li.appendChild(rightDiv);

    afternoonDrawEl.appendChild(li);
  });
}

socket.on("updateLists", (data) => {
  // armazenar dados recebidos para uso posterior no front
  window.afternoonSelections = data.afternoonSelections || {};
  window.afternoonCrossed = data.afternoonCrossed || {};
  window.selectionWindowOpen = data.selectionWindowOpen || false;
  window.selectionDisplayTime = data.selectionDisplayTime || "19h";

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

  // DRAW MANHÃ
  morningDrawEl.innerHTML = data.morningDraw
    .map((n, i) => `<li>${i + 1}º ${n}</li>`)
    .join("");

  // DRAW TARDE — USANDO FUNÇÃO DE RENDERIZACAO
  renderAfternoonDraw(data);

  errorBox.textContent = "";
});

// listener: envia seleção quando checkbox muda (FRONT) — removido pois agora cada checkbox tem seu próprio listener

socket.on("errorMessage", (message) => {
  errorBox.textContent = message;
  setTimeout(() => {
    errorBox.textContent = "";
  }, 5000);
});
