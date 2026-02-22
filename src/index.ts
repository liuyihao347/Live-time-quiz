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
            description: "生成知识测验，自动弹出GUI窗口",
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

    // Save JSON for persistence
    const quizBookDir = this.ensureQuizBookDir();
    const jsonPath = join(quizBookDir, `quiz_${sessionId}.json`);
    writeFileSync(jsonPath, JSON.stringify(quiz, null, 2), "utf-8");

    // Save temp file for Electron to read
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
    const tempPath = join(this.tempDir, "current_quiz.json");
    writeFileSync(tempPath, JSON.stringify(quiz, null, 2), "utf-8");

    // Launch Electron GUI
    this.launchElectron();

    return {
      content: [
        {
          type: "text",
          text: `🎯 测验已生成！GUI窗口正在弹出...\n\n📚 分类：${quiz.category}\n💡 题目：${quiz.question.substring(0, 50)}...`,
        },
      ],
    };
  }

  private launchElectron(): void {
    // Determine electron path
    const electronPath = join(__dirname, "..", "node_modules", ".bin", "electron");
    const electronExe = process.platform === "win32" ? `${electronPath}.cmd` : electronPath;
    
    // Electron main script path
    const electronMain = join(__dirname, "..", "dist", "electron", "main.js");

    // Check if Electron is already running
    // For simplicity, we always spawn a new instance
    // In production, you might want to use single-instance lock
    const child = spawn(electronExe, [electronMain], {
      detached: true,
      stdio: "ignore",
    });

    child.unref();
    
    console.error(`[MCP] Launched Electron GUI (pid: ${child.pid})`);
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
      const jsonFiles = files.filter(f => f.endsWith(".json"));
      const categories = new Set<string>();

      for (const file of jsonFiles) {
        try {
          const content = readFileSync(join(quizBookDir, file), "utf-8");
          const quiz = JSON.parse(content);
          if (quiz.category) categories.add(quiz.category);
        } catch {}
      }

      return {
        content: [
          {
            type: "text",
            text: `📚 Quiz Book 信息\n\n📁 路径：${quizBookDir}\n📝 题目数：${jsonFiles.length} 道\n📂 分类：${Array.from(categories).join(", ") || "未分类"}`,
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
      const content = readFileSync(filePath, "utf-8");
      const quiz: QuizData = JSON.parse(content);
      
      // Save to temp and launch Electron
      if (!existsSync(this.tempDir)) {
        mkdirSync(this.tempDir, { recursive: true });
      }
      const tempPath = join(this.tempDir, "current_quiz.json");
      writeFileSync(tempPath, JSON.stringify(quiz, null, 2), "utf-8");

      this.launchElectron();

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
