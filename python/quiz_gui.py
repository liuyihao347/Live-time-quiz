import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import json
import os
import sys
import base64
from pathlib import Path

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
except Exception:
    A4 = None

DEFAULT_QUIZ_DATA = None


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
    bad = '<>:"/\\|?*'
    for ch in bad:
        name = name.replace(ch, "")
    name = " ".join(name.split()).strip()
    return name[:80] if len(name) > 80 else name


def _build_note_payload(quiz_data: dict, selected_index: int) -> dict:
    correct_index = int(quiz_data.get("correctIndex", 0))
    is_correct = selected_index == correct_index
    knowledge = quiz_data.get("knowledgeSummary", "") or ""
    points = [p.strip() for p in knowledge.replace("\n", "|").split("|") if p.strip()]

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
            {
                "heading": "Question",
                "body": topic,
            },
            {
                "heading": "Your Answer",
                "body": f"{chr(65 + selected_index)}. {selected_text}",
            },
            {
                "heading": "Correct Answer",
                "body": f"{chr(65 + correct_index)}. {correct_text}",
            },
            {
                "heading": "Explanation",
                "body": explanation if explanation else "(No explanation provided)",
            },
        ],
        "key_points": points,
        "table": {
            "headers": ["Option", "Text"],
            "rows": [[chr(65 + i), opt] for i, opt in enumerate(quiz_data.get("options", []))],
        },
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

    for sec in payload.get("sections", []):
        story.append(Paragraph(sec.get("heading", ""), h_style))
        body = (sec.get("body") or "").replace("\n", "<br/>")
        story.append(Paragraph(body, body_style))

    key_points = payload.get("key_points", [])
    if key_points:
        story.append(Paragraph("Key Points", h_style))
        kp_html = "<br/>".join([f"• {p}" for p in key_points])
        story.append(Paragraph(kp_html, body_style))

    table_data = payload.get("table")
    if table_data and table_data.get("headers") and table_data.get("rows"):
        story.append(Paragraph("Options Table", h_style))
        data = [table_data["headers"]] + table_data["rows"]
        t = Table(data, colWidths=[28 * mm, 150 * mm])
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

    doc.build(story)
    return pdf_path

class QuizWindow:
    def __init__(self, quiz_data):
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

        # Center window
        self.root.update_idletasks()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f'{width}x{height}+{x}+{y}')
        
        self._setup_style()
        self.setup_ui()
        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after(100, lambda: self.root.attributes('-topmost', False))
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
        style.configure("Body.TLabel", background="#0F172A", foreground="#E2E8F0", font=("Segoe UI", 11))
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

        header = ttk.Frame(app, padding=0, style="App.TFrame")
        header.pack(fill=tk.X)

        title_card = ttk.Frame(header, padding=18, style="Card.TFrame")
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

        content = ttk.Frame(app, padding=(0, 18, 0, 0), style="App.TFrame")
        content.pack(fill=tk.BOTH, expand=True)

        left = ttk.Frame(content, style="App.TFrame")
        left.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        right = ttk.Frame(content, style="App.TFrame")
        right.pack(side=tk.RIGHT, fill=tk.BOTH)

        q_card = ttk.Frame(left, padding=18, style="Card.TFrame")
        q_card.pack(fill=tk.X)
        ttk.Label(q_card, text="Question", style="H2.TLabel").pack(anchor=tk.W)

        self.question_text = tk.Text(
            q_card,
            height=6,
            wrap=tk.WORD,
            font=("Segoe UI", 11),
            bg="#0B1220",
            fg="#E2E8F0",
            relief=tk.FLAT,
            padx=12,
            pady=12,
            highlightthickness=1,
            highlightbackground="#23304A",
            insertbackground="#E2E8F0",
        )
        self.question_text.insert("1.0", self.quiz_data.get("question", ""))
        self.question_text.config(state=tk.DISABLED)
        self.question_text.pack(fill=tk.X, pady=(10, 0))

        opt_card = ttk.Frame(left, padding=18, style="Card.TFrame")
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

        self.hint_label = ttk.Label(opt_card, text="Tip: You can click once. No extra submit step.", style="Muted.TLabel")
        self.hint_label.pack(anchor=tk.W, pady=(8, 0))

        result_card = ttk.Frame(right, padding=18, style="Card.TFrame")
        result_card.pack(fill=tk.BOTH, expand=True)
        ttk.Label(result_card, text="Result", style="H2.TLabel").pack(anchor=tk.W)

        self.result_badge = ttk.Label(result_card, text="Waiting", style="Pill.TLabel")
        self.result_badge.pack(anchor=tk.W, pady=(10, 0))

        self.result_text = tk.Text(
            result_card,
            height=18,
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
        self.result_text.insert("1.0", "Select an option to see feedback, explanation, and a quick recap.")
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
        is_correct = selected == correct

        for i, rb in enumerate(self.option_buttons):
            rb.state(["disabled"])

        explanation = (self.quiz_data.get("explanation") or "").strip()
        knowledge = (self.quiz_data.get("knowledgeSummary") or "").strip()
        points = [p.strip() for p in knowledge.replace("\n", "|").split("|") if p.strip()]

        correct_answer = self.quiz_data.get("options", [""])[correct]
        selected_answer = self.quiz_data.get("options", [""])[selected]

        badge = "Correct" if is_correct else "Incorrect"
        self.result_badge.config(text=badge)

        lines = []
        lines.append(f"{badge}\n")
        lines.append(f"Your answer: {chr(65 + selected)}. {selected_answer}")
        lines.append(f"Correct answer: {chr(65 + correct)}. {correct_answer}\n")

        if explanation:
            lines.append("Explanation")
            lines.append(explanation.strip() + "\n")

        if points:
            lines.append("Key points")
            for p in points:
                lines.append(f"- {p}")

        text = "\n".join(lines)
        self.result_text.config(state=tk.NORMAL)
        self.result_text.delete("1.0", tk.END)
        self.result_text.insert("1.0", text)
        self.result_text.config(state=tk.DISABLED)

        self.add_btn.config(state=tk.NORMAL)

    def add_to_notebook(self):
        if not self.answered or self.selected_index is None:
            return

        try:
            payload = _build_note_payload(self.quiz_data, int(self.selected_index))
            pdf_path = _write_notebook_pdf(self.notebook_dir, payload)
            messagebox.showinfo("Saved", f"Notebook PDF saved:\n{pdf_path}")
        except Exception as e:
            messagebox.showerror("Failed", str(e))

def load_quiz_from_args():
    """Load quiz data from command line args."""
    # If DEFAULT_QUIZ_DATA is set, this is a standalone quiz file.
    if DEFAULT_QUIZ_DATA is not None:
        return DEFAULT_QUIZ_DATA
    
    if len(sys.argv) < 2:
        # No args
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", "Usage:\npython quiz_gui.py <quiz file path>")
        sys.exit(1)
    
    quiz_file = sys.argv[1]
    
    if not os.path.exists(quiz_file):
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", f"File not found: {quiz_file}")
        sys.exit(1)
    
    # If this is a standalone Python quiz file, extract embedded JSON.
    if quiz_file.endswith('.py'):
        # Execute the file to extract embedded data
        import subprocess
        result = subprocess.run([sys.executable, quiz_file, "--extract"], 
                                capture_output=True, text=True)
        if result.returncode == 0:
            return json.loads(result.stdout)
    
    # Otherwise, treat it as a JSON file.
    try:
        with open(quiz_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", f"Failed to parse file: {quiz_file}")
        sys.exit(1)

if __name__ == "__main__":
    quiz_data = load_quiz_from_args()
    QuizWindow(quiz_data)
