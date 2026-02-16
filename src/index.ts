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
            description: "基于刚完成的任务内容生成一道知识测验选择题。在任务完成后调用，询问用户是否需要测验来巩固知识。",
            inputSchema: {
              type: "object",
              properties: {
                taskSummary: {
                  type: "string",
                  description: "已完成任务的总结内容，用于提取精华知识生成测验",
                },
                difficulty: {
                  type: "string",
                  enum: ["easy", "medium", "hard"],
                  description: "测验难度，默认为medium",
                  default: "medium",
                },
              },
              required: ["taskSummary"],
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
            return await this.handleGenerateQuiz(args as { taskSummary: string; difficulty?: string });
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

  private async handleGenerateQuiz(args: { taskSummary: string; difficulty?: string }) {
    const sessionId = this.generateSessionId();
    
    // 生成测验题目
    const quiz = this.generateQuizFromSummary(args.taskSummary, args.difficulty || "medium");
    
    this.sessions.set(sessionId, {
      quiz,
      answered: false,
    });
    this.currentSessionId = sessionId;

    // 构建美观的测验展示格式
    const quizDisplay = this.formatQuizDisplay(quiz, sessionId);

    return {
      content: [
        {
          type: "text",
          text: quizDisplay,
        },
      ],
    };
  }

  private generateQuizFromSummary(taskSummary: string, difficulty: string): QuizData {
    // 这里我们使用一个智能的解析逻辑
    // 实际使用中，可以让LLM在调用此工具前就准备好题目内容
    
    const lines = taskSummary.split('\n').filter(line => line.trim());
    
    // 提取关键知识点
    const keyPoints = this.extractKeyPoints(lines);
    
    // 基于知识点生成题目
    return this.createQuizFromKeyPoints(keyPoints, difficulty);
  }

  private extractKeyPoints(lines: string[]): string[] {
    const keyPoints: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      // 提取包含重要信息的行
      if (trimmed.length > 10 && 
          (trimmed.includes('：') || trimmed.includes(':') || 
           trimmed.includes('。') || trimmed.includes('.') ||
           trimmed.includes('应该') || trimmed.includes('需要') ||
           trimmed.includes('关键') || trimmed.includes('重要'))) {
        keyPoints.push(trimmed);
      }
    }
    
    return keyPoints.slice(0, 5); // 取前5个关键点
  }

  private createQuizFromKeyPoints(keyPoints: string[], difficulty: string): QuizData {
    if (keyPoints.length === 0) {
      // 如果没有提取到关键点，返回一个默认题目
      return {
        id: this.generateSessionId(),
        question: "基于刚才的内容，以下哪个是最重要的知识点？",
        options: [
          "需要仔细理解核心概念",
          "应该关注实现细节",
          "要注意常见错误",
          "重点是实践应用"
        ],
        correctIndex: 0,
        explanation: "理解核心概念是掌握知识的基础，细节和实践都应该建立在概念理解之上。",
        knowledgeSummary: "掌握核心概念是最重要的",
        createdAt: Date.now(),
      };
    }

    // 取第一个关键点作为题目基础
    const mainPoint = keyPoints[0];
    
    // 生成问题和选项
    let question: string;
    let options: string[];
    let correctIndex: number;
    let explanation: string;

    if (mainPoint.includes('：') || mainPoint.includes(':')) {
      const parts = mainPoint.split(/[：:]/);
      const concept = parts[0].trim();
      const definition = parts[1].trim();
      
      question = `关于"${concept}"，以下哪项描述是正确的？`;
      
      // 生成干扰项
      options = [
        definition.substring(0, 100),
        `与${concept}无关的功能或概念`,
        `${concept}的反义或错误描述`,
        `部分正确但不够完整的描述`
      ];
      correctIndex = 0;
      explanation = `"${concept}"的正确理解是：${definition}`;
    } else {
      question = "根据刚才的学习内容，以下哪项是正确的？";
      options = [
        mainPoint.substring(0, 100),
        "与上述内容相反的观点",
        "部分相关但不准确的描述",
        "完全无关的信息"
      ];
      correctIndex = 0;
      explanation = `正确答案是：${mainPoint}`;
    }

    return {
      id: this.generateSessionId(),
      question,
      options,
      correctIndex,
      explanation,
      knowledgeSummary: keyPoints.join(' | '),
      createdAt: Date.now(),
    };
  }

  private formatQuizDisplay(quiz: QuizData, sessionId: string): string {
    const letters = ['A', 'B', 'C', 'D'];
    
    let display = `
╔══════════════════════════════════════════════════════════════╗
║  🎯 知识测验 - 巩固你的学习成果                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📚 问题：${quiz.question.padEnd(42)}║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  选项：                                                      ║
`;

    quiz.options.forEach((option, index) => {
      const letter = letters[index];
      const truncated = option.length > 40 ? option.substring(0, 37) + '...' : option;
      display += `║     ${letter}. ${truncated.padEnd(48)}║\n`;
    });

    display += `╠══════════════════════════════════════════════════════════════╣
║  💡 提示：输入选项字母（A/B/C/D）或数字（0/1/2/3）回答      ║
║  🚫 输入 "skip" 跳过测验                                     ║
║  📋 Session ID: ${sessionId}                 ║
╚══════════════════════════════════════════════════════════════╝`;

    return display;
  }

  private async handleSubmitAnswer(args: { sessionId: string; selectedIndex: number }) {
    const session = this.sessions.get(args.sessionId);
    
    if (!session) {
      return {
        content: [
          {
            type: "text",
            text: "❌ 未找到测验会话，请重新生成测验。",
          },
        ],
      };
    }

    session.answered = true;
    session.selectedIndex = args.selectedIndex;
    session.isCorrect = args.selectedIndex === session.quiz.correctIndex;

    const result = session.isCorrect ? "✅ 回答正确！" : "❌ 回答错误";
    const letters = ['A', 'B', 'C', 'D'];
    const correctLetter = letters[session.quiz.correctIndex];
    const selectedLetter = letters[args.selectedIndex];

    let feedback = `
╔══════════════════════════════════════════════════════════════╗
║  ${result.padEnd(56)}║
╠══════════════════════════════════════════════════════════════╣
║  你的选择：${selectedLetter}                                               ║
║  正确答案：${correctLetter}                                               ║
╠══════════════════════════════════════════════════════════════╣
║  📖 解析：                                                   ║
║  ${session.quiz.explanation.padEnd(56)}║
╠══════════════════════════════════════════════════════════════╣
`;

    if (session.isCorrect) {
      feedback += `║  🎉 太棒了！你已经掌握了这个知识点！                         ║\n`;
    } else {
      feedback += `║  💪 别灰心！让我们再巩固一下这个知识：                       ║\n║  ${session.quiz.knowledgeSummary.substring(0, 52).padEnd(56)}║\n`;
    }

    feedback += `╚══════════════════════════════════════════════════════════════╝`;

    return {
      content: [
        {
          type: "text",
          text: feedback,
        },
      ],
    };
  }

  private async handleGetFeedback(args: { sessionId: string }) {
    const session = this.sessions.get(args.sessionId);
    
    if (!session) {
      return {
        content: [
          {
            type: "text",
            text: "❌ 未找到测验会话。",
          },
        ],
      };
    }

    const letters = ['A', 'B', 'C', 'D'];
    
    let feedback = `
╔══════════════════════════════════════════════════════════════╗
║  📊 测验详情                                               ║
╠══════════════════════════════════════════════════════════════╣
║  问题：${session.quiz.question.substring(0, 50).padEnd(50)}║
║  正确答案：${letters[session.quiz.correctIndex]}                                            ║
║  你的答案：${session.answered ? letters[session.selectedIndex!] : '未作答'}                                          ║
║  状态：${session.isCorrect ? '✅ 正确' : session.answered ? '❌ 错误' : '⏳ 待回答'}                                    ║
╠══════════════════════════════════════════════════════════════╣
║  📚 知识点总结：                                             ║
`;

    const summaryLines = this.wrapText(session.quiz.knowledgeSummary, 56);
    summaryLines.forEach(line => {
      feedback += `║  ${line.padEnd(56)}║\n`;
    });

    feedback += `╠══════════════════════════════════════════════════════════════╣
║  💡 详细解析：                                               ║
`;

    const explanationLines = this.wrapText(session.quiz.explanation, 56);
    explanationLines.forEach(line => {
      feedback += `║  ${line.padEnd(56)}║\n`;
    });

    feedback += `╚══════════════════════════════════════════════════════════════╝`;

    return {
      content: [
        {
          type: "text",
          text: feedback,
        },
      ],
    };
  }

  private async handleSkipQuiz(args: { sessionId: string }) {
    this.sessions.delete(args.sessionId);
    
    if (this.currentSessionId === args.sessionId) {
      this.currentSessionId = null;
    }

    return {
      content: [
        {
          type: "text",
          text: `
╔══════════════════════════════════════════════════════════════╗
║  🚫 测验已跳过                                               ║
║                                                              ║
║  好的，测验已取消。如果你之后想要复习，随时可以重新开始！   ║
╚══════════════════════════════════════════════════════════════╝
          `,
        },
      ],
    };
  }

  private generateSessionId(): string {
    return `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private wrapText(text: string, maxLength: number): string[] {
    const lines: string[] = [];
    let currentLine = '';
    
    const words = text.split('');
    for (const char of words) {
      if (currentLine.length + 1 <= maxLength) {
        currentLine += char;
      } else {
        lines.push(currentLine);
        currentLine = char;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [''];
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Live-time Quiz MCP server running on stdio");
  }
}

const server = new QuizMCPServer();
server.run().catch(console.error);
