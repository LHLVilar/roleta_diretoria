// ---- Conexão com Socket.IO ----
const socket = io(); // Inicializa a conexão com o servidor

// Elementos do DOM
const nameInput = document.getElementById("nome");
const btnAdicionar = document.getElementById("btnAdicionar");
const errorBox = document.getElementById("errorBox");
const morningListContainer = document.getElementById("morningList");
const afternoonListContainer = document.getElementById("afternoonList");

// ---- Função para atualizar as listas no front-end ----
function updateLists({ morningList, afternoonList }) {
    morningListContainer.innerHTML = morningList.map(n => `<li>${n.name}</li>`).join("");
    afternoonListContainer.innerHTML = afternoonList.map(n => `<li>${n.name}</li>`).join("");
}

// ---- Recebe atualização do servidor ----
socket.on("updateLists", (lists) => {
    updateLists(lists);
});

// ---- Adicionar nome ----
btnAdicionar.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;

    if (!socket.id) {
        errorBox.textContent = "Aguarde a conexão com o servidor. Tente novamente em 2 segundos.";
        setTimeout(() => { errorBox.textContent = ""; }, 5000);
        return;
    }

    // Define o período (para testes, usamos tarde)
    const period = "afternoon"; // ou "morning" se for manhã
    const listName = period === "morning" ? "morning_list" : "afternoon_list";

    try {
        const response = await fetch('/add-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, list: listName, socketId: socket.id })
        });

        const data = await response.json();

        if (response.ok) {
            nameInput.value = "";
            errorBox.textContent = `Nome adicionado à lista da ${period}.`;
        } else {
            errorBox.textContent = data.message || `Erro ao adicionar nome: ${response.statusText}`;
        }
    } catch (error) {
        console.error('Erro na requisição:', error);
        errorBox.textContent = "Erro de conexão com o servidor. Tente novamente.";
    }

    setTimeout(() => { errorBox.textContent = ""; }, 5000);
});
