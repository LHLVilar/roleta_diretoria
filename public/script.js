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
    // NOVO: Adiciona o listener para o botão de check (presença)
    else if (e.target.classList.contains("btn-check")) {
        const name = e.target.getAttribute("data-nome");
        // Emite o evento para o servidor para marcar a presença
        socket.emit("checkName", { name });
        // O servidor processará e enviará a lista atualizada de volta.
    }
});

socket.on("updateLists", ({ morningList, afternoonList, morningDraw, afternoonDraw, rules, isCheckPeriodActive }) => {
  // BLOCO DE RENDERIZAÇÃO DA LISTA DA MANHÃ (sem alteração)
    morningListEl.innerHTML = morningList.map((n) => `
        <li class="list-group-item">
            <span>${n.name}</span>
            <span class="horario">${n.timestamp}</span>
            ${n.socketId === mySocketId ? `<button class="btn btn-sm btn-danger btn-excluir" data-nome="${n.name}">X</button>` : ''}
        </li>
    `).join("");

    // BLOCO DE RENDERIZAÇÃO DA LISTA DA TARDE (AGORA COM LÓGICA DE CHECKBOX)
    afternoonListEl.innerHTML = afternoonList.map((n) => {
        // 1. O nome foi adicionado por este cliente?
        const isMyName = n.socketId === mySocketId;
        
        // 2. O período de checagem está ativo E é meu nome E eu ainda não marquei?
        const showCheck = isCheckPeriodActive && isMyName && !n.checked;
        
        // 3. O nome já está checado?
        const isChecked = n.checked ? ' (PRESENTE)' : ''; 

        let controlsHtml = '';
        
        if (showCheck) {
            // Se o período estiver ativo e for meu nome (e não checado), mostra o botão de checagem
            controlsHtml = `<button class="btn btn-sm btn-success btn-check" data-nome="${n.name}">✓ PRESENÇA</button>`;
        } else if (isMyName && !isCheckPeriodActive) {
            // Se não estiver no período de checagem, mostra o botão de exclusão (se for meu nome)
            controlsHtml = `<button class="btn btn-sm btn-danger btn-excluir" data-nome="${n.name}">X</button>`;
        }
        // Se o nome já foi marcado (n.checked = true), nenhum controle é mostrado, apenas o status (PRESENTE)

        return `
            <li class="list-group-item">
                <span>${n.name}${isChecked}</span>
                <span class="horario">${n.timestamp}</span>
                ${controlsHtml}
            </li>
        `;
    }).join("");

    morningDrawEl.innerHTML = morningDraw.map((n, i) => `<li>${i + 1}º ${n.name}</li>`).join("");
    afternoonDrawEl.innerHTML = afternoonDraw.map((n, i) => `<li>${i + 1}º ${n.name}</li>`).join("");
    errorBox.textContent = "";

    // 4. Salva as regras (necessário se você estiver usando rules)
    if (rules) {
        document.getElementById('rules').textContent = rules;
    }
});

socket.on("errorMessage", (message) => {
  errorBox.textContent = message;
  setTimeout(() => {
      errorBox.textContent = "";
  }, 5000);
});
