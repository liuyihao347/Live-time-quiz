import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
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

interface NotebookConfig {
  notebookPath: string;
}

interface NotebookNotePayload {
  topic: string;
  summary?: string;
  sections?: Array<{ heading: string; body: string }>;
  keyPoints?: string[];
  table?: { headers: string[]; rows: string[][] };
  chart?: { title?: string; labels: string[]; values: number[] };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "").trim().substring(0, 40);
}

function generateQuizFilename(quiz: QuizData): string {
  const category = quiz.category || "Uncategorized";
  const questionPreview = sanitizeFilename(quiz.question.split(/[，。？！,.?!]/)[0]);
  const shortDate = new Date(quiz.createdAt).toISOString().slice(0, 10).replace(/-/g, "");
  return `${shortDate}_${category}_${questionPreview}.py`;
}

function generateStandaloneQuizPy(quiz: QuizData): string {
  const quizJson = JSON.stringify(quiz, null, 2);

  return `# -*- coding: utf-8 -*-
"""\\
Quiz: ${quiz.question.split(/[，。？！,.?!]/)[0]}
Category: ${quiz.category || "Uncategorized"}
Created: ${new Date(quiz.createdAt).toISOString()}

This is a standalone quiz file. Double-click to run.
"""\

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import json
import sys
from pathlib import Path

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
except Exception:
    A4 = None

QUIZ_DATA = ${quizJson}


def _default_notebook_dir() -> Path:
    return Path.home() / "Desktop" / "Notebook"


def _config_path() -> Path:
    return Path.home() / ".live-time-tutorial" / "config.json"


def _load_config() -> dict:
    cfg_path = _config_path()
    try:
        if cfg_path.exists():
            return json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"notebookPath": str(_default_notebook_dir())}


def _save_config(cfg: dict) -> None:
    cfg_path = _config_path()
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def _sanitize_filename(name: str) -> str:
    bad = '<>:"/\\\\|?*'
    for ch in bad:
        name = name.replace(ch, "")
    name = " ".join(name.split()).strip()
    return name[:80] if len(name) > 80 else name


def _build_note_payload(quiz_data: dict, selected_index: int) -> dict:
    correct_index = int(quiz_data.get("correctIndex", 0))
    is_correct = selected_index == correct_index
    knowledge = quiz_data.get("knowledgeSummary", "") or ""
    points = [p.strip() for p in knowledge.replace("\\n", "|").split("|") if p.strip()]

    correct_text = quiz_data.get("options", [""])[correct_index]
    selected_text = quiz_data.get("options", [""])[selected_index]

    title = quiz_data.get("category") or "Notebook"
    topic = quiz_data.get("question", "").strip()
    explanation = (quiz_data.get("explanation", "") or "").strip()

    return {
        "title": title,
        "topic": topic,
        "summary": "Correct" if is_correct else "Incorrect",
        "sections": [
            {"heading": "Question", "body": topic},
            {"heading": "Your Answer", "body": f"{chr(65 + selected_index)}. {selected_text}"},
            {"heading": "Correct Answer", "body": f"{chr(65 + correct_index)}. {correct_text}"},
            {"heading": "Explanation", "body": explanation if explanation else "(No explanation provided)"},
        ],
        "key_points": points,
    }


def _write_notebook_pdf(notebook_dir: Path, payload: dict) -> Path:
    if A4 is None:
        raise RuntimeError("reportlab is required. Install with: pip install reportlab")

    notebook_dir.mkdir(parents=True, exist_ok=True)
    notes_dir = notebook_dir / "notes"
    notes_dir.mkdir(parents=True, exist_ok=True)

    filename = _sanitize_filename(payload.get("topic") or "note") + ".pdf"
    pdf_path = notes_dir / filename

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=payload.get("topic") or "Notebook",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=10,
    )
    h_style = ParagraphStyle(
        "HeadingStyle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#111827"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor("#111827"),
    )
    meta_style = ParagraphStyle(
        "MetaStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
    )

    story = []
    story.append(Paragraph(payload.get("topic") or "Notebook", title_style))
    story.append(Paragraph(f"Status: {payload.get('summary', '')}", meta_style))

    for sec in payload.get("sections", []) or []:
        story.append(Paragraph(sec.get("heading", ""), h_style))
        body = (sec.get("body") or "").replace("\\n", "<br/>")
        story.append(Paragraph(body, body_style))

    key_points = payload.get("key_points", [])
    if key_points:
        story.append(Paragraph("Key Points", h_style))
        kp_html = "<br/>".join([f"• {p}" for p in key_points])
        story.append(Paragraph(kp_html, body_style))

    doc.build(story)
    return pdf_path


class QuizWindow:
    def __init__(self, quiz_data: dict):
        self.quiz_data = quiz_data
        self.answered = False
        self.selected_index = None

        self.config = _load_config()
        self.notebook_dir = Path(self.config.get("notebookPath") or str(_default_notebook_dir()))

        self.root = tk.Tk()
        self.root.title(f"Live-time Tutorial - {quiz_data.get('category', 'Quiz')}")
        width = 860
        height = 720
        self.root.geometry(f"{width}x{height}")
        self.root.configure(bg="#0B1220")

        self.root.update_idletasks()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

        self._setup_style()
        self.setup_ui()

        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.after(100, lambda: self.root.attributes("-topmost", False))
        self.root.mainloop()

    def _setup_style(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass

        style.configure("App.TFrame", background="#0B1220")
        style.configure("Card.TFrame", background="#0F172A")
        style.configure("Muted.TLabel", background="#0F172A", foreground="#94A3B8", font=("Segoe UI", 10))
        style.configure("Title.TLabel", background="#0F172A", foreground="#F8FAFC", font=("Segoe UI", 16, "bold"))
        style.configure("H2.TLabel", background="#0F172A", foreground="#E2E8F0", font=("Segoe UI", 11, "bold"))
        style.configure("Pill.TLabel", background="#111C33", foreground="#A5B4FC", font=("Segoe UI", 9, "bold"))
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"), padding=(14, 10))
        style.configure("Secondary.TButton", font=("Segoe UI", 10), padding=(12, 10))
        style.configure("Option.TRadiobutton", background="#0F172A", foreground="#E2E8F0", font=("Segoe UI", 11), padding=(12, 10))
        style.map(
            "Option.TRadiobutton",
            background=[("active", "#111C33")],
            foreground=[("disabled", "#64748B"), ("active", "#F8FAFC")],
        )

    def setup_ui(self):
        app = ttk.Frame(self.root, padding=26, style="App.TFrame")
        app.pack(fill=tk.BOTH, expand=True)

        title_card = ttk.Frame(app, padding=18, style="Card.TFrame")
        title_card.pack(fill=tk.X)

        category = self.quiz_data.get("category", "Quiz")
        ttk.Label(title_card, text=f"{category}", style="Title.TLabel").pack(anchor=tk.W)
        ttk.Label(title_card, text="Click an option to submit instantly.", style="Muted.TLabel").pack(anchor=tk.W, pady=(6, 0))

        notebook_row = ttk.Frame(title_card, style="Card.TFrame")
        notebook_row.pack(fill=tk.X, pady=(14, 0))

        self.notebook_path_label = ttk.Label(
            notebook_row,
            text=f"Notebook: {self.notebook_dir}",
            style="Muted.TLabel",
        )
        self.notebook_path_label.pack(side=tk.LEFT, anchor=tk.W)

        ttk.Button(
            notebook_row,
            text="Change...",
            style="Secondary.TButton",
            command=self.change_notebook_path,
        ).pack(side=tk.RIGHT)

        opt_card = ttk.Frame(app, padding=18, style="Card.TFrame")
        opt_card.pack(fill=tk.X, pady=(16, 0))
        ttk.Label(opt_card, text="Options", style="H2.TLabel").pack(anchor=tk.W)

        self.selected_var = tk.IntVar(value=-1)
        self.option_buttons = []
        for i, option in enumerate(self.quiz_data.get("options", [])):
            rb = ttk.Radiobutton(
                opt_card,
                text=f"{chr(65 + i)}. {option}",
                variable=self.selected_var,
                value=i,
                style="Option.TRadiobutton",
                command=self.submit_answer,
            )
            rb.pack(fill=tk.X, pady=7)
            self.option_buttons.append(rb)

        result_card = ttk.Frame(app, padding=18, style="Card.TFrame")
        result_card.pack(fill=tk.BOTH, expand=True, pady=(16, 0))
        ttk.Label(result_card, text="Result", style="H2.TLabel").pack(anchor=tk.W)

        self.result_text = tk.Text(
            result_card,
            height=12,
            wrap=tk.WORD,
            font=("Segoe UI", 10.5),
            bg="#0B1220",
            fg="#E2E8F0",
            relief=tk.FLAT,
            padx=12,
            pady=12,
            highlightthickness=1,
            highlightbackground="#23304A",
            insertbackground="#E2E8F0",
        )
        self.result_text.insert("1.0", "Select an option to see feedback and explanation.")
        self.result_text.config(state=tk.DISABLED)
        self.result_text.pack(fill=tk.BOTH, expand=True, pady=(10, 0))

        self.add_btn = ttk.Button(
            result_card,
            text="Add to Notebook (PDF)",
            style="Primary.TButton",
            command=self.add_to_notebook,
            state=tk.DISABLED,
        )
        self.add_btn.pack(fill=tk.X, pady=(14, 0))

    def change_notebook_path(self):
        chosen = filedialog.askdirectory(title="Select Notebook folder")
        if not chosen:
            return
        self.notebook_dir = Path(chosen)
        self.config["notebookPath"] = str(self.notebook_dir)
        try:
            _save_config(self.config)
        except Exception:
            pass
        self.notebook_path_label.config(text=f"Notebook: {self.notebook_dir}")

    def submit_answer(self):
        if self.answered:
            return

        selected = int(self.selected_var.get())
        if selected < 0:
            return

        self.selected_index = selected
        self.answered = True
        correct = int(self.quiz_data.get("correctIndex", 0))

        for rb in self.option_buttons:
            rb.state(["disabled"])

        explanation = (self.quiz_data.get("explanation") or "").strip()
        correct_answer = self.quiz_data.get("options", [""])[correct]
        selected_answer = self.quiz_data.get("options", [""])[selected]

        badge = "Correct" if selected == correct else "Incorrect"
        lines = [
            badge,
            "",
            f"Your answer: {chr(65 + selected)}. {selected_answer}",
            f"Correct answer: {chr(65 + correct)}. {correct_answer}",
            "",
            "Explanation",
            explanation if explanation else "(No explanation provided)",
        ]

        self.result_text.config(state=tk.NORMAL)
        self.result_text.delete("1.0", tk.END)
        self.result_text.insert("1.0", "\\n".join(lines))
        self.result_text.config(state=tk.DISABLED)
        self.add_btn.config(state=tk.NORMAL)

    def add_to_notebook(self):
        if not self.answered or self.selected_index is None:
            return

        try:
            payload = _build_note_payload(self.quiz_data, int(self.selected_index))
            pdf_path = _write_notebook_pdf(self.notebook_dir, payload)
            messagebox.showinfo("Saved", f"Notebook PDF saved:\\n{pdf_path}")
        except Exception as e:
            messagebox.showerror("Failed", str(e))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--extract":
        print(json.dumps(QUIZ_DATA))
    else:
        QuizWindow(QUIZ_DATA)
`;
}

class QuizMCPServer {
  private server: Server;
  private config: NotebookConfig;
  private configPath: string;
  private tempDir: string;

  constructor() {
    this.server = new Server(
      {
        name: "live-time-tutorial-mcp",
        version: "4.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.configPath = join(homedir(), ".live-time-tutorial", "config.json");
    this.tempDir = join(homedir(), ".live-time-tutorial", "temp");
    this.config = this.loadConfig();
    this.setupToolHandlers();

    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };
  }

  private loadConfig(): NotebookConfig {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, "utf-8");
        return { ...{ notebookPath: join(homedir(), "Desktop", "Notebook") }, ...JSON.parse(configData) };
      }
    } catch (error) {
      console.error("Failed to load config:", error);
    }
    return {
      notebookPath: join(homedir(), "Desktop", "Notebook"),
    };
  }

  private saveConfig(): void {
    try {
      const configDir = join(homedir(), ".live-time-tutorial");
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }

  private ensureNotebookDir(): string {
    if (!existsSync(this.config.notebookPath)) {
      mkdirSync(this.config.notebookPath, { recursive: true });
    }
    return this.config.notebookPath;
  }

  private ensureTempDir(): string {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
    return this.tempDir;
  }

  private sanitizeNoteFilename(topic: string): string {
    const base = (topic || "note").replace(/[<>:"/\\|?*]/g, "").trim().replace(/\s+/g, " ");
    const shortened = base.length > 80 ? base.slice(0, 80) : base;
    return shortened || "note";
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "generate_quiz",
            description: "Generate a knowledge quiz and open a Python GUI window.",
            inputSchema: {
              type: "object",
              properties: {
                question: { type: "string", description: "Quiz question" },
                options: { type: "array", items: { type: "string" }, description: "Answer options" },
                correctIndex: { type: "number", description: "Correct option index (0-based)" },
                explanation: { type: "string", description: "Short explanation" },
                knowledgeSummary: { type: "string", description: "Key points separated by |" },
                category: { type: "string", description: "Category" },
              },
              required: ["question", "options", "correctIndex", "explanation"],
            },
          },
          {
            name: "set_notebook_path",
            description: "Set Notebook storage path (default: Desktop/Notebook).",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "New path, supports ~/" },
              },
              required: ["path"],
            },
          },
          {
            name: "save_notebook_note_pdf",
            description: "Save a Notebook note as a beautiful PDF (LLM-driven).",
            inputSchema: {
              type: "object",
              properties: {
                topic: { type: "string", description: "Note topic (also used as filename)" },
                summary: { type: "string", description: "Short summary/status line" },
                sections: {
                  type: "array",
                  description: "Sections in reading order",
                  items: {
                    type: "object",
                    properties: {
                      heading: { type: "string" },
                      body: { type: "string" },
                    },
                    required: ["heading", "body"],
                  },
                },
                keyPoints: { type: "array", items: { type: "string" }, description: "Key points" },
                table: {
                  type: "object",
                  properties: {
                    headers: { type: "array", items: { type: "string" } },
                    rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                  },
                },
                chart: {
                  type: "object",
                  description: "Simple bar chart",
                  properties: {
                    title: { type: "string" },
                    labels: { type: "array", items: { type: "string" } },
                    values: { type: "array", items: { type: "number" } },
                  },
                  required: ["labels", "values"],
                },
              },
              required: ["topic"],
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
          case "set_notebook_path":
            return await this.handleSetNotebookPath(args as any);
          case "save_notebook_note_pdf":
            return await this.handleSaveNotebookNotePdf(args as any);
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
      category: args.category || "Uncategorized",
    };

    const notebookDir = this.ensureNotebookDir();
    const filename = generateQuizFilename(quiz);
    const pyPath = join(notebookDir, filename);
    writeFileSync(pyPath, generateStandaloneQuizPy(quiz), "utf-8");

    this.launchPythonGui(pyPath);

    return {
      content: [
        {
          type: "text",
          text: `Quiz generated. A GUI window should appear shortly.\n\nCategory: ${quiz.category}\nQuestion: ${quiz.question.substring(0, 70)}${quiz.question.length > 70 ? "..." : ""}\nSaved: ${filename}\n\nTip: You can double-click the .py file to review later.`,
        },
      ],
    };
  }

  private launchPythonGui(quizPath: string): void {
    // Run standalone python quiz file
    const pythonExe = process.platform === "win32" ? "python" : "python3";
    
    const child = spawn(pythonExe, [quizPath], {
      detached: true,
      stdio: "ignore",
      shell: false,
    });

    child.unref();
    console.error(`[MCP] Launched Python GUI: ${quizPath}`);
  }

  private async handleSetNotebookPath(args: { path: string }) {
    let newPath = args.path.trim();
    if (newPath.startsWith("~/") || newPath === "~") {
      newPath = newPath.replace("~", homedir());
    }
    newPath = resolve(newPath);

    try {
      if (!existsSync(newPath)) {
        mkdirSync(newPath, { recursive: true });
      }

      this.config.notebookPath = newPath;
      this.saveConfig();

      return {
        content: [{ type: "text", text: `Notebook path updated:\n${newPath}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to set path: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  private async handleSaveNotebookNotePdf(args: NotebookNotePayload) {
    const notebookDir = this.ensureNotebookDir();
    const tempDir = this.ensureTempDir();

    const topic = (args.topic || "note").trim();
    if (!topic) {
      return { content: [{ type: "text", text: "topic is required" }], isError: true };
    }

    const filenameBase = this.sanitizeNoteFilename(topic);
    const payload: NotebookNotePayload = {
      topic,
      summary: args.summary,
      sections: args.sections || [],
      keyPoints: args.keyPoints || [],
      table: args.table,
      chart: args.chart,
    };

    const payloadPath = join(tempDir, `note_payload_${Date.now()}.json`);
    const outPath = join(notebookDir, "notes", `${filenameBase}.pdf`);

    mkdirSync(join(notebookDir, "notes"), { recursive: true });
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf-8");

    const pyScriptPath = join(tempDir, "notebook_pdf_writer.py");
    if (!existsSync(pyScriptPath)) {
      const script = `# -*- coding: utf-8 -*-
import json
import sys
from pathlib import Path

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics.charts.barcharts import VerticalBarChart
except Exception:
    A4 = None


def _write_pdf(out_path: Path, payload: dict) -> None:
    if A4 is None:
        raise RuntimeError("reportlab is required. Install with: pip install reportlab")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=payload.get("topic") or "Notebook",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=10,
    )
    h_style = ParagraphStyle(
        "HeadingStyle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#111827"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor("#111827"),
    )
    meta_style = ParagraphStyle(
        "MetaStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
    )

    story = []
    story.append(Paragraph(payload.get("topic") or "Notebook", title_style))
    summary = (payload.get("summary") or "").strip()
    if summary:
        story.append(Paragraph(summary, meta_style))

    for sec in payload.get("sections", []) or []:
        story.append(Paragraph(sec.get("heading", ""), h_style))
        body = (sec.get("body") or "").replace("\n", "<br/>")
        story.append(Paragraph(body, body_style))

    key_points = payload.get("keyPoints") or []
    if key_points:
        story.append(Paragraph("Key Points", h_style))
        kp_html = "<br/>".join([f"• {p}" for p in key_points if str(p).strip()])
        story.append(Paragraph(kp_html, body_style))

    table_data = payload.get("table")
    if table_data and table_data.get("headers") and table_data.get("rows"):
        story.append(Paragraph("Table", h_style))
        data = [table_data["headers"]] + table_data["rows"]
        t = Table(data, hAlign="LEFT")
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF2FF")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(Spacer(1, 6))
        story.append(t)

    chart = payload.get("chart")
    if chart and chart.get("labels") and chart.get("values"):
        labels = list(chart.get("labels") or [])
        values = list(chart.get("values") or [])
        if len(labels) == len(values) and len(labels) > 0:
            story.append(Paragraph(chart.get("title") or "Chart", h_style))

            w = 170 * mm
            h = 60 * mm
            d = Drawing(w, h)
            bc = VerticalBarChart()
            bc.x = 10
            bc.y = 10
            bc.height = h - 20
            bc.width = w - 20
            bc.data = [values]
            bc.categoryAxis.categoryNames = labels
            bc.valueAxis.forceZero = True
            bc.bars[0].fillColor = colors.HexColor("#6366F1")
            bc.strokeColor = colors.HexColor("#CBD5E1")
            bc.valueAxis.strokeColor = colors.HexColor("#CBD5E1")
            bc.categoryAxis.labels.angle = 30
            bc.categoryAxis.labels.dy = -12
            d.add(bc)
            story.append(Spacer(1, 6))
            story.append(d)

    doc.build(story)


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python notebook_pdf_writer.py <payload.json> <out.pdf>")
        return 1
    payload_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    _write_pdf(out_path, payload)
    print(str(out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;
      writeFileSync(pyScriptPath, script, "utf-8");
    }

    const pythonExe = process.platform === "win32" ? "python" : "python3";
    const child = spawn(pythonExe, [pyScriptPath, payloadPath, outPath], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    const out = await new Promise<{ code: number; stdout: string; stderr: string }>((resolvePromise) => {
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
    });

    if (out.code !== 0) {
      const msg = (out.stderr || out.stdout || "Failed to generate PDF").trim();
      return { content: [{ type: "text", text: msg }], isError: true };
    }

    return {
      content: [{ type: "text", text: `Saved Notebook PDF:\n${outPath}` }],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Live-time Tutorial MCP server running on stdio");
    console.error(`Notebook: ${this.config.notebookPath}`);
  }
}

const server = new QuizMCPServer();
server.run().catch(console.error);
