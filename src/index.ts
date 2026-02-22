import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join, resolve, dirname } from "path";
import { homedir } from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "").trim().substring(0, 40);
}

function generateQuizFilename(quiz: QuizData): string {
  const category = quiz.category || "未分类";
  const questionPreview = sanitizeFilename(quiz.question.split(/[，。？！,.?!]/)[0]);
  const shortDate = new Date(quiz.createdAt).toISOString().slice(0, 10).replace(/-/g, "");
  return `${shortDate}_${category}_${questionPreview}.py`;
}

function generateStandaloneQuizPy(quiz: QuizData): string {
  const quizJson = JSON.stringify(quiz, null, 2);
  
  return `# -*- coding: utf-8 -*-
"""
Quiz: ${quiz.question.split(/[，。？！,.?!]/)[0]}
Category: ${quiz.category || "未分类"}
Created: ${new Date(quiz.createdAt).toLocaleString("zh-CN")}

这是一个自包含的测验文件，双击即可运行。
"""

import tkinter as tk
from tkinter import ttk, messagebox
import json
import sys

# 嵌入的测验数据
QUIZ_DATA = ${quizJson}

class QuizWindow:
    def __init__(self, quiz_data):
        self.quiz_data = quiz_data
        self.answered = False
        self.root = tk.Tk()
        self.root.title(f"Quiz - {quiz_data.get('category', '学习测验')}")
        self.root.geometry("750x650")
        self.root.configure(bg="#f5f7fa")
        
        # 窗口居中
        self.root.update_idletasks()
        width = 750
        height = 650
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f'{width}x{height}+{x}+{y}')
        
        self.setup_ui()
        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after(100, lambda: self.root.attributes('-topmost', False))
        self.root.mainloop()
    
    def setup_ui(self):
        main_frame = ttk.Frame(self.root, padding="25")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        category = self.quiz_data.get("category", "未分类")
        category_label = ttk.Label(main_frame, text=f"📂 {category}", 
                                   font=("Microsoft YaHei", 11), foreground="#666")
        category_label.pack(anchor=tk.W)
        
        question_label = ttk.Label(main_frame, text="📝 题目：", 
                                   font=("Microsoft YaHei", 13, "bold"))
        question_label.pack(anchor=tk.W, pady=(15, 8))
        
        question_text = tk.Text(main_frame, height=5, wrap=tk.WORD, 
                                font=("Microsoft YaHei", 12), bg="white",
                                relief=tk.FLAT, padx=12, pady=12,
                                highlightthickness=1, highlightbackground="#ddd")
        question_text.insert("1.0", self.quiz_data["question"])
        question_text.config(state=tk.DISABLED)
        question_text.pack(fill=tk.X, pady=(0, 20))
        
        options_frame = ttk.LabelFrame(main_frame, text="选项", padding="15")
        options_frame.pack(fill=tk.X, pady=(0, 20))
        
        self.option_vars = []
        self.option_buttons = []
        
        for i, option in enumerate(self.quiz_data["options"]):
            var = tk.StringVar()
            btn = tk.Radiobutton(options_frame, text=f"{chr(65+i)}. {option}", variable=var, 
                                value=str(i), font=("Microsoft YaHei", 12),
                                bg="#f5f7fa", activebackground="#e3f2fd",
                                command=lambda idx=i: self.on_select(idx))
            btn.config(highlightthickness=0)
            btn.pack(anchor=tk.W, pady=6, fill=tk.X)
            self.option_vars.append(var)
            self.option_buttons.append(btn)
        
        self.submit_btn = ttk.Button(main_frame, text="提交答案", 
                                     command=self.submit_answer, state=tk.DISABLED)
        self.submit_btn.pack(pady=10)
        
        self.result_frame = ttk.LabelFrame(main_frame, text="答案解析", padding="15")
        self.result_frame.pack(fill=tk.BOTH, expand=True, pady=(10, 0))
        
        self.result_label = ttk.Label(self.result_frame, text="选择一个选项并点击提交查看答案", 
                                      wraplength=650, font=("Microsoft YaHei", 11))
        self.result_label.pack(anchor=tk.W)
        
        self.knowledge_label = ttk.Label(self.result_frame, text="", 
                                         wraplength=650, font=("Microsoft YaHei", 10),
                                         foreground="#2196F3")
        self.knowledge_label.pack(anchor=tk.W, pady=(15, 0))
    
    def on_select(self, idx):
        self.submit_btn.config(state=tk.NORMAL)
    
    def submit_answer(self):
        if self.answered:
            return
        
        selected = None
        for i, var in enumerate(self.option_vars):
            if var.get():
                selected = i
                break
        
        if selected is None:
            messagebox.showwarning("提示", "请选择一个答案")
            return
        
        self.answered = True
        correct = self.quiz_data["correctIndex"]
        
        for i, btn in enumerate(self.option_buttons):
            if i == correct:
                btn.config(fg="#4CAF50", font=("Microsoft YaHei", 12, "bold"))
            elif i == selected and selected != correct:
                btn.config(fg="#f44336", font=("Microsoft YaHei", 12, "bold"))
        
        explanation = self.quiz_data.get("explanation", "")
        knowledge = self.quiz_data.get("knowledgeSummary", "")
        
        if selected == correct:
            result_text = f"✅ 回答正确！\\n\\n{explanation}"
        else:
            correct_answer = self.quiz_data['options'][correct]
            result_text = f"❌ 回答错误\\n\\n正确答案是: {chr(65+correct)}. {correct_answer}\\n\\n{explanation}"
        
        self.result_label.config(text=result_text)
        
        if knowledge:
            points = knowledge.split("|")
            knowledge_text = "💡 核心知识点:\\n" + "\\n".join(f"  • {p.strip()}" for p in points if p.strip())
            self.knowledge_label.config(text=knowledge_text)
        
        self.submit_btn.config(text="已提交", state=tk.DISABLED)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--extract":
        print(json.dumps(QUIZ_DATA))
    else:
        QuizWindow(QUIZ_DATA)
`;
}

class QuizMCPServer {
  private server: Server;
  private config: QuizBookConfig;
  private configPath: string;
  private tempDir: string;

  constructor() {
    this.server = new Server(
      {
        name: "live-time-quiz-mcp",
        version: "3.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.configPath = join(homedir(), ".live-time-quiz", "config.json");
    this.tempDir = join(homedir(), ".live-time-quiz", "temp");
    this.config = this.loadConfig();
    this.setupToolHandlers();

    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };
  }

  private loadConfig(): QuizBookConfig {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, "utf-8");
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

  private saveConfig(): void {
    try {
      const configDir = join(homedir(), ".live-time-quiz");
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }

  private ensureQuizBookDir(): string {
    if (!existsSync(this.config.savePath)) {
      mkdirSync(this.config.savePath, { recursive: true });
    }
    return this.config.savePath;
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "generate_quiz",
            description: "生成知识测验，自动弹出Python GUI窗口",
            inputSchema: {
              type: "object",
              properties: {
                question: { type: "string", description: "测验题目" },
                options: { type: "array", items: { type: "string" }, description: "4个选项" },
                correctIndex: { type: "number", description: "正确答案索引(0-3)" },
                explanation: { type: "string", description: "简洁答案解析" },
                knowledgeSummary: { type: "string", description: "核心知识点(用|分隔)" },
                category: { type: "string", description: "题目分类" },
              },
              required: ["question", "options", "correctIndex", "explanation"],
            },
          },
          {
            name: "get_quizbook_info",
            description: "获取Quiz Book信息",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "open_quiz",
            description: "打开历史测验复习",
            inputSchema: {
              type: "object",
              properties: {
                filePath: { type: "string", description: "测验文件路径" },
              },
              required: ["filePath"],
            },
          },
          {
            name: "set_quizbook_path",
            description: "设置Quiz Book保存路径",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "新路径，支持~/简写" },
              },
              required: ["path"],
            },
          },
          {
            name: "toggle_auto_quiz",
            description: "开启/关闭自动测验",
            inputSchema: {
              type: "object",
              properties: {
                enabled: { type: "boolean", description: "是否开启" },
              },
              required: ["enabled"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "generate_quiz":
            return await this.handleGenerateQuiz(args as any);
          case "get_quizbook_info":
            return await this.handleGetQuizBookInfo();
          case "open_quiz":
            return await this.handleOpenQuiz(args as any);
          case "set_quizbook_path":
            return await this.handleSetQuizBookPath(args as any);
          case "toggle_auto_quiz":
            return await this.handleToggleAutoQuiz(args as any);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  private async handleGenerateQuiz(args: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    knowledgeSummary?: string;
    category?: string;
  }) {
    const sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const knowledgePoints = args.knowledgeSummary
      ? args.knowledgeSummary.split(/[|\n]/).map(s => s.trim()).filter(s => s)
      : [];

    const quiz: QuizData = {
      id: sessionId,
      question: args.question,
      options: args.options,
      correctIndex: args.correctIndex,
      explanation: args.explanation,
      knowledgeSummary: knowledgePoints.join("|"),
      createdAt: Date.now(),
      category: args.category || "未分类",
    };

    const quizBookDir = this.ensureQuizBookDir();
    const filename = generateQuizFilename(quiz);
    const pyPath = join(quizBookDir, filename);
    writeFileSync(pyPath, generateStandaloneQuizPy(quiz), "utf-8");

    this.launchPythonGui(pyPath);

    return {
      content: [
        {
          type: "text",
          text: `🎯 测验已生成！GUI窗口正在弹出...\n\n📚 分类：${quiz.category}\n💡 题目：${quiz.question.substring(0, 50)}${quiz.question.length > 50 ? '...' : ''}\n📁 已保存: ${filename}\n\n💡 提示: 这个文件可以直接双击运行复习`,
        },
      ],
    };
  }

  private launchPythonGui(quizPath: string): void {
    // 直接运行Python文件（自包含格式）
    const pythonExe = process.platform === "win32" ? "python" : "python3";
    
    const child = spawn(pythonExe, [quizPath], {
      detached: true,
      stdio: "ignore",
      shell: false,
    });

    child.unref();
    console.error(`[MCP] Launched Python GUI: ${quizPath}`);
  }

  private async handleSetQuizBookPath(args: { path: string }) {
    let newPath = args.path.trim();
    if (newPath.startsWith("~/") || newPath === "~") {
      newPath = newPath.replace("~", homedir());
    }
    newPath = resolve(newPath);

    try {
      if (!existsSync(newPath)) {
        mkdirSync(newPath, { recursive: true });
      }

      this.config.savePath = newPath;
      this.saveConfig();

      return {
        content: [{ type: "text", text: `✅ Quiz Book 路径已更新！\n\n📁 ${newPath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ 设置失败：${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  private async handleGetQuizBookInfo() {
    const quizBookDir = this.ensureQuizBookDir();
    try {
      const files = readdirSync(quizBookDir);
      const pyFiles = files.filter(f => f.endsWith(".py"));
      const categories = new Set<string>();

      for (const file of pyFiles) {
        // 从文件名提取分类（格式: 日期_分类_题目.py）
        const parts = file.replace('.py', '').split('_');
        if (parts.length >= 2) {
          categories.add(parts[1]);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `📚 Quiz Book 信息\n\n📁 路径：${quizBookDir}\n📝 题目数：${pyFiles.length} 道\n📂 分类：${Array.from(categories).join(", ") || "未分类"}\n\n💡 提示: 双击任意.py文件即可打开测验`,
          },
        ],
      };
    } catch {
      return {
        content: [{ type: "text", text: `📚 Quiz Book 为空\n\n📁 ${quizBookDir}` }],
      };
    }
  }

  private async handleOpenQuiz(args: { filePath: string }) {
    const filePath = resolve(args.filePath);
    if (!existsSync(filePath)) {
      return { content: [{ type: "text", text: `❌ 文件不存在：${filePath}` }], isError: true };
    }

    try {
      // 支持打开Python文件
      if (filePath.endsWith('.py')) {
        this.launchPythonGui(filePath);
        return { content: [{ type: "text", text: `📖 已打开测验` }] };
      }

      // 尝试解析为JSON
      const content = readFileSync(filePath, "utf-8");
      const quiz: QuizData = JSON.parse(content);
      
      const tempPath = join(this.tempDir, "current_quiz.json");
      writeFileSync(tempPath, JSON.stringify(quiz, null, 2), "utf-8");

      this.launchPythonGui(tempPath);

      return { content: [{ type: "text", text: `📖 已打开测验：${quiz.question.substring(0, 30)}...` }] };
    } catch (error) {
      return { content: [{ type: "text", text: `❌ 打开失败：${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }

  private async handleToggleAutoQuiz(args: { enabled: boolean }) {
    this.config.autoQuizEnabled = args.enabled;
    this.saveConfig();

    return {
      content: [{ type: "text", text: `✅ 自动测验已${args.enabled ? "开启" : "关闭"}` }],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Live-time Quiz MCP server running on stdio");
    console.error(`Quiz Book: ${this.config.savePath}`);
  }
}

const server = new QuizMCPServer();
server.run().catch(console.error);
