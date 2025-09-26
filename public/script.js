document.getElementById("btnAdicionar").addEventListener("click", async () => {
    const nameInput = document.getElementById("nome");
    const name = nameInput.value.trim();
    if (!name) return;

    // 🛑 NOVO CHECK: Garante que o ID do socket exista (CAUSA DO "DADOS INVÁLIDOS")
    if (!socket.id) {
        errorBox.textContent = "Aguarde a conexão com o servidor. Tente novamente em 2 segundos.";
        setTimeout(() => { errorBox.textContent = ""; }, 5000);
        return; 
    }
    
    // FORÇAMOS a lista da tarde para TESTE, ignorando o horário
    const listName = "afternoon_list"; 
    const period = "tarde";
    
    // ⚠️ ATENÇÃO: Se o código for muito diferente do seu, revise a linha abaixo 
    // ou substitua o script.js inteiro pelo último que te enviei.
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
                // Erro do servidor (ex: nome já existe, ou outro erro 400/500)
                errorBox.textContent = data.message || `Erro ao adicionar nome: ${response.statusText}`;
            }
        } catch (error) {
            console.error('Erro na requisição:', error);
            errorBox.textContent = "Erro de conexão com o servidor. Tente novamente.";
        }
    } else {
        errorBox.textContent = "Não é possível adicionar nomes (erro interno de período).";
    }

    setTimeout(() => {
        errorBox.textContent = "";
    }, 5000);
});
