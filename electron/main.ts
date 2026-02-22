import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join, resolve, dirname } from "path";
import { homedir } from "os";
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Keep global reference
let mainWindow: BrowserWindow | null = null;

interface QuizData {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  knowledgeSummary: string;
  createdAt: number;
  category?: string;
}

interface QuizBookConfig {
  savePath: string;
  autoQuizEnabled: boolean;
}

const tempDir = join(homedir(), ".live-time-quiz", "temp");
const configPath = join(homedir(), ".live-time-quiz", "config.json");

function loadConfig(): QuizBookConfig {
  try {
    if (existsSync(configPath)) {
      const configData = readFileSync(configPath, "utf-8");
      return { ...{ savePath: join(homedir(), "Desktop", "QuizBook"), autoQuizEnabled: true }, ...JSON.parse(configData) };
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }
  return {
    savePath: join(homedir(), "Desktop", "QuizBook"),
    autoQuizEnabled: true,
  };
}

function ensureQuizBookDir(): string {
  const config = loadConfig();
  if (!existsSync(config.savePath)) {
    mkdirSync(config.savePath, { recursive: true });
  }
  return config.savePath;
}

function readCurrentQuiz(): QuizData | null {
  const tempPath = join(tempDir, "current_quiz.json");
  try {
    if (existsSync(tempPath)) {
      const content = readFileSync(tempPath, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("Failed to read quiz:", error);
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f5f7fa",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load renderer
  mainWindow.loadFile(join(__dirname, "renderer", "index.html"));

  // Show window when ready and send quiz data
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    
    // Read and send quiz data
    const quiz = readCurrentQuiz();
    if (quiz && mainWindow) {
      mainWindow.webContents.send("show-quiz", quiz);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    // Clean up temp file
    try {
      const tempPath = join(tempDir, "current_quiz.json");
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {}
  });
}

// IPC Handlers
ipcMain.handle("save-to-quizbook", async (_, quiz: QuizData) => {
  try {
    const quizBookDir = ensureQuizBookDir();
    const jsonPath = join(quizBookDir, `quiz_${quiz.id}.json`);
    writeFileSync(jsonPath, JSON.stringify(quiz, null, 2), "utf-8");
    return { success: true, path: jsonPath };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("select-quizbook-path", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "选择 Quiz Book 保存位置",
  });
  
  if (result.filePaths[0]) {
    // Update config
    try {
      const config = loadConfig();
      config.savePath = result.filePaths[0];
      const configDir = join(homedir(), ".live-time-quiz");
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }
  
  return result.filePaths[0] || null;
});

ipcMain.handle("get-config", () => {
  return loadConfig();
});

ipcMain.handle("get-quiz-list", () => {
  try {
    const quizBookDir = ensureQuizBookDir();
    const files = readdirSync(quizBookDir);
    const quizzes = [];
    
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const content = readFileSync(join(quizBookDir, file), "utf-8");
          const quiz = JSON.parse(content);
          quizzes.push({
            id: quiz.id,
            question: quiz.question,
            category: quiz.category || "未分类",
            createdAt: quiz.createdAt,
            filePath: join(quizBookDir, file),
          });
        } catch {}
      }
    }
    
    return quizzes.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
});

ipcMain.handle("open-quiz-by-path", async (_, filePath: string) => {
  try {
    const content = readFileSync(filePath, "utf-8");
    const quiz: QuizData = JSON.parse(content);
    
    // Save to temp
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = join(tempDir, "current_quiz.json");
    writeFileSync(tempPath, JSON.stringify(quiz, null, 2), "utf-8");
    
    // Send to renderer
    if (mainWindow) {
      mainWindow.webContents.send("show-quiz", quiz);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Single instance lock
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      const quiz = readCurrentQuiz();
      if (quiz) {
        mainWindow.webContents.send("show-quiz", quiz);
      }
    }
  });
}
