import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

interface QuizData {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  knowledgeSummary: string;
  createdAt: number;
}

interface QuizSession {
  quiz: QuizData;
  answered: boolean;
  selectedIndex?: number;
  isCorrect?: boolean;
}

class QuizMCPServer {
  private server: Server;
  private sessions: Map<string, QuizSession> = new Map();
  private currentSessionId: string | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "live-time-quiz-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "generate_quiz",
            description: "基于学习内容生成一道选择题测验。Agent应根据上下文自行生成题目、选项和解析。",
            inputSchema: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "测验问题",
                },
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "4个选项",
                },
                correctIndex: {
                  type: "number",
                  description: "正确选项索引 (0-3)",
                },
                explanation: {
                  type: "string",
                  description: "答案解析",
                },
                knowledgeSummary: {
                  type: "string",
                  description: "知识点总结",
                },
              },
              required: ["question", "options", "correctIndex", "explanation"],
            },
          },
          {
            name: "submit_answer",
            description: "提交用户对测验的答案，系统将自动判断对错并返回反馈",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "测验会话ID",
                },
                selectedIndex: {
                  type: "number",
                  description: "用户选择的选项索引（0-based）",
                },
              },
              required: ["sessionId", "selectedIndex"],
            },
          },
          {
            name: "get_quiz_feedback",
            description: "获取测验的详细反馈和知识巩固建议",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "测验会话ID",
                },
              },
              required: ["sessionId"],
            },
          },
          {
            name: "skip_quiz",
            description: "用户选择跳过测验，结束当前测验会话",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "测验会话ID",
                },
              },
              required: ["sessionId"],
            },
          },
        ] as Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "generate_quiz":
            return await this.handleGenerateQuiz(args as { question: string; options: string[]; correctIndex: number; explanation: string; knowledgeSummary?: string });
          case "submit_answer":
            return await this.handleSubmitAnswer(args as { sessionId: string; selectedIndex: number });
          case "get_quiz_feedback":
            return await this.handleGetFeedback(args as { sessionId: string });
          case "skip_quiz":
            return await this.handleSkipQuiz(args as { sessionId: string });
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
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
  }) {
    const sessionId = this.generateSessionId();

    const quiz: QuizData = {
      id: sessionId,
      question: args.question,
      options: args.options,
      correctIndex: args.correctIndex,
      explanation: args.explanation,
      knowledgeSummary: args.knowledgeSummary || "",
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, { quiz, answered: false });
    this.currentSessionId = sessionId;

    return {
      content: [
        {
          type: "text",
          text: this.formatQuizDisplay(quiz, sessionId),
        },
      ],
    };
  }

  private formatQuizDisplay(quiz: QuizData, sessionId: string): string {
    const letters = ['A', 'B', 'C', 'D'];
    let display = `## 🎯 知识测验\n\n`;
    display += `**${quiz.question}**\n\n`;
    display += `| 选项 | 内容 |\n`;
    display += `|:---:|:---|\n`;
    quiz.options.forEach((option, i) => {
      display += `| **${letters[i]}** | ${option} |\n`;
    });
    display += `\n> 💡 回复选项字母 **A / B / C / D** 即可作答\n`;
    return display;
  }

  private async handleSubmitAnswer(args: { sessionId: string; selectedIndex: number }) {
    const session = this.sessions.get(args.sessionId);

    if (!session) {
      return {
        content: [{ type: "text", text: "❌ 未找到测验会话，请重新生成测验。" }],
      };
    }

    session.answered = true;
    session.selectedIndex = args.selectedIndex;
    session.isCorrect = args.selectedIndex === session.quiz.correctIndex;

    const letters = ['A', 'B', 'C', 'D'];
    const selectedLetter = letters[args.selectedIndex];
    const correctLetter = letters[session.quiz.correctIndex];

    let feedback = '';
    if (session.isCorrect) {
      feedback += `✅ **回答正确！**\n\n`;
      feedback += `你的选择：**${selectedLetter}**\n\n`;
    } else {
      feedback += `❌ **回答错误**\n\n`;
      feedback += `你的选择：**${selectedLetter}** · 正确答案：**${correctLetter}**\n\n`;
    }
    feedback += `💡 **解析：** ${session.quiz.explanation}`;
    if (!session.isCorrect && session.quiz.knowledgeSummary) {
      feedback += `\n\n📚 **知识点总结：** ${session.quiz.knowledgeSummary}`;
    }

    return {
      content: [{ type: "text", text: feedback }],
    };
  }

  private async handleGetFeedback(args: { sessionId: string }) {
    const session = this.sessions.get(args.sessionId);

    if (!session) {
      return {
        content: [{ type: "text", text: "❌ 未找到测验会话。" }],
      };
    }

    const letters = ['A', 'B', 'C', 'D'];
    const status = session.isCorrect ? '✅ 正确' : session.answered ? '❌ 错误' : '⏳ 待回答';

    let feedback = `📊 **测验详情**\n\n`;
    feedback += `**问题：** ${session.quiz.question}\n`;
    feedback += `**正确答案：** ${letters[session.quiz.correctIndex]}\n`;
    feedback += `**你的答案：** ${session.answered ? letters[session.selectedIndex!] : '未作答'}\n`;
    feedback += `**状态：** ${status}\n\n`;
    feedback += `💡 **解析：** ${session.quiz.explanation}`;
    if (session.quiz.knowledgeSummary) {
      feedback += `\n\n📚 **知识点总结：** ${session.quiz.knowledgeSummary}`;
    }

    return {
      content: [{ type: "text", text: feedback }],
    };
  }

  private async handleSkipQuiz(args: { sessionId: string }) {
    this.sessions.delete(args.sessionId);
    if (this.currentSessionId === args.sessionId) {
      this.currentSessionId = null;
    }

    return {
      content: [{ type: "text", text: "👋 测验已跳过，随时可以重新开始！" }],
    };
  }

  private generateSessionId(): string {
    return `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Live-time Quiz MCP server running on stdio");
  }
}

const server = new QuizMCPServer();
server.run().catch(console.error);
