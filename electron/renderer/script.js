// State
let currentQuiz = null;
let answered = false;

// Elements
const quizContainer = document.getElementById("quizContainer");
const quizContent = document.getElementById("quizContent");
const categoryTag = document.getElementById("categoryTag");
const questionText = document.getElementById("questionText");
const optionsList = document.getElementById("optionsList");
const feedbackSection = document.getElementById("feedbackSection");
const resultBox = document.getElementById("resultBox");
const resultIcon = document.getElementById("resultIcon");
const resultText = document.getElementById("resultText");
const explanationText = document.getElementById("explanationText");
const knowledgeList = document.getElementById("knowledgeList");
const actionBar = document.getElementById("actionBar");
const saveBtn = document.getElementById("saveBtn");
const dismissBtn = document.getElementById("dismissBtn");

// Settings Modal
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const autoQuizToggle = document.getElementById("autoQuizToggle");
const currentPath = document.getElementById("currentPath");
const changePathBtn = document.getElementById("changePathBtn");

// History Modal
const historyBtn = document.getElementById("historyBtn");
const historyModal = document.getElementById("historyModal");
const closeHistory = document.getElementById("closeHistory");
const quizList = document.getElementById("quizList");

// Initialize
function init() {
  // Listen for quiz from main process
  window.electronAPI.onShowQuiz((quiz) => {
    showQuiz(quiz);
  });

  // Listen for config updates
  window.electronAPI.onConfigUpdated((config) => {
    updateSettingsUI(config);
  });

  // Load initial config
  window.electronAPI.getConfig().then((config) => {
    updateSettingsUI(config);
  });

  // Event listeners
  settingsBtn.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", closeSettingsModal);
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  historyBtn.addEventListener("click", openHistory);
  closeHistory.addEventListener("click", closeHistoryModal);
  historyModal.addEventListener("click", (e) => {
    if (e.target === historyModal) closeHistoryModal();
  });

  autoQuizToggle.addEventListener("change", toggleAutoQuiz);
  changePathBtn.addEventListener("click", changeQuizBookPath);

  saveBtn.addEventListener("click", saveToQuizBook);
  dismissBtn.addEventListener("click", () => {
    window.close();
  });
}

function showQuiz(quiz) {
  currentQuiz = quiz;
  answered = false;

  // Hide empty state, show quiz
  quizContainer.style.display = "none";
  quizContent.style.display = "block";
  feedbackSection.style.display = "none";
  actionBar.style.display = "none";

  // Set content
  categoryTag.textContent = quiz.category || "未分类";
  questionText.textContent = quiz.question;

  // Generate options
  const letters = ["A", "B", "C", "D"];
  optionsList.innerHTML = "";

  quiz.options.forEach((option, index) => {
    const optionCard = document.createElement("div");
    optionCard.className = "option-card";
    optionCard.dataset.index = index.toString();
    optionCard.dataset.letter = letters[index];
    optionCard.innerHTML = `
      <div class="option-badge">${letters[index]}</div>
      <div class="option-content">${escapeHtml(option)}</div>
    `;
    optionCard.addEventListener("click", () => handleAnswer(index));
    optionsList.appendChild(optionCard);
  });

  // Parse and display knowledge points
  const knowledgePoints = quiz.knowledgeSummary
    ? quiz.knowledgeSummary.split("|").map((s) => s.trim()).filter((s) => s)
    : [];

  knowledgeList.innerHTML = knowledgePoints.length
    ? knowledgePoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")
    : "<li>暂无知识点总结</li>";

  explanationText.textContent = quiz.explanation;
}

function handleAnswer(selectedIndex) {
  if (answered || !currentQuiz) return;
  answered = true;

  const correctIndex = currentQuiz.correctIndex;
  const isCorrect = selectedIndex === correctIndex;
  const letters = ["A", "B", "C", "D"];

  // Mark all as answered
  document.querySelectorAll(".option-card").forEach((card) => {
    card.classList.add("answered");
  });

  // Style selected
  const selectedCard = optionsList.children[selectedIndex];
  if (isCorrect) {
    selectedCard.classList.add("correct");
  } else {
    selectedCard.classList.add("wrong");
    // Highlight correct
    const correctCard = optionsList.children[correctIndex];
    correctCard.classList.add("correct");
  }

  // Show feedback
  resultBox.className = `result-box ${isCorrect ? "correct" : "wrong"}`;
  resultIcon.textContent = isCorrect ? "✓" : "✕";
  resultText.textContent = isCorrect
    ? "回答正确！"
    : `你的选择：${letters[selectedIndex]} · 正确答案：${letters[correctIndex]}`;

  feedbackSection.style.display = "block";
  actionBar.style.display = "flex";

  // Scroll to feedback
  setTimeout(() => {
    feedbackSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 100);
}

async function saveToQuizBook() {
  if (!currentQuiz) return;

  const result = await window.electronAPI.saveToQuizBook(currentQuiz);
  if (result.success) {
    saveBtn.innerHTML = "<span>✓</span><span>已保存</span>";
    saveBtn.disabled = true;
    saveBtn.style.background = "#10b981";
  } else {
    saveBtn.innerHTML = "<span>✕</span><span>保存失败</span>";
  }
}

// Settings
async function openSettings() {
  const config = await window.electronAPI.getConfig();
  updateSettingsUI(config);
  settingsModal.style.display = "flex";
}

function closeSettingsModal() {
  settingsModal.style.display = "none";
}

function updateSettingsUI(config) {
  autoQuizToggle.checked = config.autoQuizEnabled;
  currentPath.textContent = config.savePath.replace(getHomeDir(), "~");
}

function getHomeDir() {
  // Simple homedir detection for display
  return process?.platform === "win32"
    ? process?.env?.USERPROFILE || "C:\\Users\\" + process?.env?.USERNAME
    : process?.env?.HOME || "~";
}

async function toggleAutoQuiz() {
  // This will be handled by MCP server via config
  console.log("Auto quiz:", autoQuizToggle.checked);
}

async function changeQuizBookPath() {
  const newPath = await window.electronAPI.selectQuizBookPath();
  if (newPath) {
    currentPath.textContent = newPath.replace(getHomeDir(), "~");
  }
}

// History
async function openHistory() {
  // Load quiz list from main process
  quizList.innerHTML = `
    <div class="empty-state-small">
      <p>📚 历史功能开发中...</p>
      <p style="font-size: 12px; margin-top: 8px;">保存的测验将在此显示</p>
    </div>
  `;
  historyModal.style.display = "flex";
}

function closeHistoryModal() {
  historyModal.style.display = "none";
}

// Utilities
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start
init();
