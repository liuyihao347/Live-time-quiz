import { contextBridge, ipcRenderer } from "electron";

export interface QuizData {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  knowledgeSummary: string;
  createdAt: number;
  category?: string;
}

export interface QuizBookConfig {
  savePath: string;
  autoQuizEnabled: boolean;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Receive quiz from main process
  onShowQuiz: (callback: (quiz: QuizData) => void) => {
    ipcRenderer.on("show-quiz", (_, quiz) => callback(quiz));
  },

  // Receive config updates
  onConfigUpdated: (callback: (config: QuizBookConfig) => void) => {
    ipcRenderer.on("config-updated", (_, config) => callback(config));
  },

  // Save quiz to quiz book
  saveToQuizBook: (quiz: QuizData) => ipcRenderer.invoke("save-to-quizbook", quiz),

  // Select quiz book path
  selectQuizBookPath: () => ipcRenderer.invoke("select-quizbook-path"),

  // Get current config
  getConfig: () => ipcRenderer.invoke("get-config"),

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
