const socket = io(); // Conecta-se ao host atual (seu app no Fly.io)

const morningListEl = document.getElementById("morningList");
const afternoonListEl = document.getElementById("afternoonList");
const morningDrawEl = document.getElementById("morningDraw");
const afternoonDrawEl = document.getElementById("afternoonDraw");
const errorBox = document.getElementById("errorBox");
const relogioEl = document.getElementById("relogio");

// Função para formatar as listas no frontend
function formatList(list, myId) {
    return list.map((n) => `
        <li class="list-group-item">
            <span>${n.name}</span>
            <span class="horario">${new Date(n.timestamp).toLocaleTimeString('pt-BR')}</span>
            ${n.socket_id === myId ? `<button class="btn btn-sm btn-danger btn-excluir" data-nome="${n.name}">X</button>` : ''}
        </li>
    `).join("");
}

// Função para formatar os resultados de sorteio
function formatDraw(draw) {
    return draw.map((n, i) => {
        // Formata a hora para melhor leitura
        const drawTime = n.draw_time ? new Date(n.draw_time).toLocaleTimeString('pt-BR') : '';
        return `
            <li class="list-unstyled-item text-success">
                <strong>${i + 1}º Sorteado:</strong> ${n.name} (${drawTime})
            </li>
        `;
    }).join("");
}

function atualizarRelogio() {
    const agora = new Date();
    const hora = agora.getHours().toString().padStart(2, '0');
    const minuto = agora.getMinutes().toString().padStart(2, '0');
    const segundo = agora.getSeconds().toString().padStart(2, '0');
    relogioEl.textContent = `${hora}:${minuto}:${segundo}`;
}

atualizarRelogio();
setInterval(atualizarRelogio, 1000);

document.getElementById("btnAdicionar").addEventListener("click", async () => {
    const nameInput = document.getElementById("nome");
    const name = nameInput.value.trim();
    if (!name) return;

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    let listName = null;
    let period = null;

    // Horários: Manhã (05:00 a 09:44) / Tarde (12:00 a 14:44)
    if ((hour >= 5 && hour < 9) || (hour === 9 && minute < 45)) {
        listName = "morning_list";
        period = "manhã";
    } else if ((hour >= 12 && hour < 14) || (hour === 14 && minute < 45)) {
        listName = "afternoon_list";
        period = "tarde";
    }
    
    if (listName) {
        // 🚨 CHAVE DA CORREÇÃO: Usar fetch (HTTP POST) para a rota do servidor
        try {
            const response = await fetch('/add-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, list: listName, socketId: socket.id })
            });

            const data = await response.json();

            if (response.ok) {
                // Sucesso: a atualização virá pelo Socket.IO
                nameInput.value = "";
                errorBox.textContent = `Nome adicionado à lista da ${period}.`;
            } else {
                // Erro do servidor (ex: nome já existe)
                errorBox.textContent = data.message || `Erro ao adicionar nome: ${response.statusText}`;
            }
        } catch (error) {
            console.error('Erro na requisição:', error);
            errorBox.textContent = "Erro de conexão com o servidor. Tente novamente.";
        }
    } else {
        errorBox.textContent = "Não é possível adicionar nomes fora dos horários permitidos.";
    }

    setTimeout(() => {
        errorBox.textContent = "";
    }, 5000);
});

// Permitir adicionar nome pressionando "Enter"
document.getElementById("nome").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault(); // Evita que o formulário submeta, se houver
        document.getElementById("btnAdicionar").click();
    }
});

// ----------------------------------------------------------------------
// REMOÇÃO VIA SOCKET (Se a remoção ainda estiver implementada via Socket.IO no server.js)
// ----------------------------------------------------------------------

document.getElementById("morningList").addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-excluir")) {
        const name = e.target.getAttribute("data-nome");
        if (confirm(`Tem certeza que deseja apagar o nome "${name}"?`)) {
            // Se a remoção for via Socket.IO, mantemos o emit
            socket.emit("removeName", { name, list: "morning_list" });
        }
    }
});

document.getElementById("afternoonList").addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-excluir")) {
        const name = e.target.getAttribute("data-nome");
        if (confirm(`Tem certeza que deseja apagar o nome "${name}"?`)) {
            // Se a remoção for via Socket.IO, mantemos o emit
            socket.emit("removeName", { name, list: "afternoon_list" });
        }
    }
});

// ----------------------------------------------------------------------
// RECEBIMENTO DE DADOS (SOCKET.IO)
// ----------------------------------------------------------------------

socket.on("updateLists", (data) => {
    // data.myId é usado para exibir o botão 'X' apenas para o usuário que adicionou o nome
    const myId = socket.id;

    morningListEl.innerHTML = formatList(data.morningList, myId);
    afternoonListEl.innerHTML = formatList(data.afternoonList, myId);

    // Atualiza os resultados dos sorteios
    morningDrawEl.innerHTML = formatDraw(data.morningDraw);
    afternoonDrawEl.innerHTML = formatDraw(data.afternoonDraw);
    
    errorBox.textContent = "";
});

socket.on("errorMessage", (message) => {
    errorBox.textContent = message;
    setTimeout(() => {
        errorBox.textContent = "";
    }, 5000);
});
