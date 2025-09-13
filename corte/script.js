const socket = io();

const morningListEl = document.getElementById("morningList");
const afternoonListEl = document.getElementById("afternoonList");
const morningDrawEl = document.getElementById("morningDraw");
const afternoonDrawEl = document.getElementById("afternoonDraw");
const errorBox = document.getElementById("errorBox");
const cutChecklistSection = document.getElementById("cutChecklistSection");
const morningCutHeading = document.getElementById("morningCutHeading");
const afternoonCutHeading = document.getElementById("afternoonCutHeading");
const morningCutList = document.getElementById("morningCutList");
const afternoonCutList = document.getElementById("afternoonCutList");
const corujaoSection = document.getElementById("corujaoSection");
const corujaoList = document.getElementById("corujaoList");
const drawsSection = document.getElementById("drawsSection");

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

document.getElementById("morningDrawButton").addEventListener("click", () => {
  socket.emit("manualDraw", "morning");
});

document.getElementById("afternoonDrawButton").addEventListener("click", () => {
  socket.emit("manualDraw", "afternoon");
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
  // Esconder todas as seções por padrão
  cutChecklistSection.style.display = "none";
  drawsSection.style.display = "none";
  corujaoSection.style.display = "none";

  // Lógica de exibição com base nos dados do servidor
  if (data.showMorningChecklist || data.showAfternoonChecklist) {
    cutChecklistSection.style.display = "block";
    drawsSection.style.display = "block";
    morningCutHeading.style.display = data.showMorningChecklist ? "block" : "none";
    afternoonCutHeading.style.display = data.showAfternoonChecklist ? "block" : "none";

    morningCutList.innerHTML = data.morningDraw.map((n) => {
      const className = n.kept ? "" : "strike-through";
      return `<li><span class="${className}">${n.name}</span></li>`;
    }).join("");

    afternoonCutList.innerHTML = data.afternoonDraw.map((n) => {
      const className = n.kept ? "" : "strike-through";
      return `<li><span class="${className}">${n.name}</span></li>`;
    }).join("");

  } else if (data.showCorujao) {
    corujaoSection.style.display = "block";
    let corujaoNames = [];
    if (data.morningDraw) {
      corujaoNames = corujaoNames.concat(data.morningDraw.filter(n => n.kept).map(n => n.name));
    }
    if (data.afternoonDraw) {
      corujaoNames = corujaoNames.concat(data.afternoonDraw.filter(n => n.kept).map(n => n.name));
    }
    corujaoList.innerHTML = corujaoNames.map((n, i) => `<li>${i + 1}º ${n}</li>`).join("");

  } else {
    drawsSection.style.display = "block";
    morningDrawEl.innerHTML = data.morningDraw.map((n, i) => `<li>${i + 1}º ${n.name}</li>`).join("");
    afternoonDrawEl.innerHTML = data.afternoonDraw.map((n, i) => `<li>${i + 1}º ${n.name}</li>`).join("");
  }

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

  errorBox.textContent = "";
});

document.getElementById("morningCutList").addEventListener("click", (e) => {
  if (e.target.tagName === "SPAN" || e.target.tagName === "LI") {
    e.target.classList.toggle("strike-through");
    
    const keptNames = Array.from(e.target.parentNode.children).map(li => li.querySelector("span")).filter(span => !span.classList.contains("strike-through")).map(span => span.textContent);
    
    socket.emit("updateKeptNames", { period: "morning", keptNames });
  }
});

document.getElementById("afternoonCutList").addEventListener("click", (e) => {
  if (e.target.tagName === "SPAN" || e.target.tagName === "LI") {
    e.target.classList.toggle("strike-through");
    
    const keptNames = Array.from(e.target.parentNode.children).map(li => li.querySelector("span")).filter(span => !span.classList.contains("strike-through")).map(span => span.textContent);
    
    socket.emit("updateKeptNames", { period: "afternoon", keptNames });
  }
});
