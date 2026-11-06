(function () {
  "use strict";

  const API_URL = ((window.APP_CONFIG && window.APP_CONFIG.API_URL) || "").replace(/\/+$/, "");
  const DEMO_MODE = API_URL === "";
  const ENDPOINT = `${API_URL}/hits`;
  const INTEREST_KEY = "lumi:interessado";
  const DEMO_TOTAL_KEY = "lumi:demo-total";

  const counterEl = document.getElementById("counter");
  const button = document.getElementById("interest-btn");
  const buttonText = button.querySelector(".cta-text");
  const statusEl = document.getElementById("status");

  const formatter = new Intl.NumberFormat("pt-BR");
  let currentValue = 0;

  // ---------- Chamadas à API ----------

  async function request(method) {
    if (DEMO_MODE) return demoRequest(method);

    const response = await fetch(ENDPOINT, {
      method,
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (typeof data.total !== "number") {
      throw new Error("Resposta inválida da API");
    }
    return data.total;
  }

  // Simula a API localmente quando API_URL não está configurada.
  function demoRequest(method) {
    let total = Number(localStorage.getItem(DEMO_TOTAL_KEY) || "0");
    if (method === "POST") {
      total += 1;
      localStorage.setItem(DEMO_TOTAL_KEY, String(total));
    }
    return new Promise((resolve) => setTimeout(() => resolve(total), 300));
  }

  // ---------- UI ----------

  function animateTo(target) {
    const start = currentValue;
    const diff = target - start;
    const duration = Math.min(1200, 300 + Math.abs(diff) * 20);
    const startTime = performance.now();

    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      counterEl.textContent = formatter.format(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(step);
    }

    currentValue = target;
    requestAnimationFrame(step);
  }

  function bump() {
    counterEl.classList.add("bump");
    setTimeout(() => counterEl.classList.remove("bump"), 200);
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function setButtonReady() {
    button.disabled = false;
    button.classList.remove("done");
    buttonText.textContent = "Tenho interesse!";
  }

  function setButtonDone() {
    button.disabled = true;
    button.classList.add("done");
    buttonText.textContent = "✓ Você já está na lista";
  }

  function alreadyInterested() {
    return localStorage.getItem(INTEREST_KEY) === "true";
  }

  // ---------- Fluxo ----------

  async function loadCounter() {
    try {
      const total = await request("GET");
      animateTo(total);
      if (alreadyInterested()) {
        setButtonDone();
      } else {
        setButtonReady();
      }
      setStatus(DEMO_MODE ? "Modo demonstração: configure API_URL em config.js." : "");
    } catch (err) {
      console.error("Erro ao carregar contador:", err);
      counterEl.textContent = "--";
      setButtonReady();
      setStatus("Não foi possível carregar o contador agora.", true);
    }
  }

  async function registerInterest() {
    if (alreadyInterested()) return;

    button.disabled = true;
    buttonText.textContent = "Registrando...";
    setStatus("");

    try {
      const total = await request("POST");
      localStorage.setItem(INTEREST_KEY, "true");
      animateTo(total);
      bump();
      setButtonDone();
      setStatus("Obrigado! Avisaremos você quando lançarmos.");
    } catch (err) {
      console.error("Erro ao registrar interesse:", err);
      setButtonReady();
      setStatus("Algo deu errado. Tente novamente em instantes.", true);
    }
  }

  button.addEventListener("click", registerInterest);
  loadCounter();
})();
