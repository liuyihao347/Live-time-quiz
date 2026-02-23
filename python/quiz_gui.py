import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import json
import sys
from pathlib import Path
from datetime import datetime
import ctypes  # For Windows DPI awareness

# Set Windows DPI awareness for crisp rendering on high-DPI displays
if sys.platform == "win32":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)  # Per-monitor DPI aware
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()  # Fallback
        except Exception:
            pass

try:
    from PIL import ImageGrab
    HAS_PIL = True
except Exception:
    HAS_PIL = False

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


def _extract_points(text: str) -> list[str]:
    if not text:
        return []
    return [p.strip() for p in text.replace("\n", "|").split("|") if p.strip()]


def _build_demo_steps(explanation: str, selected_text: str, correct_text: str) -> list[str]:
    steps = []
    if explanation:
        sentences = [s.strip() for s in explanation.replace("\n", " ").split(".") if s.strip()]
        for sentence in sentences[:3]:
            steps.append(sentence)

    if not steps:
        steps = [
            "Understand what the question is really asking.",
            "Compare each option with the required time complexity.",
            "Choose the option that satisfies both correctness and efficiency.",
        ]

    steps.append(f"Your selected option: {selected_text}")
    steps.append(f"Best option: {correct_text}")
    return steps


def _capture_gui_screenshot(root: tk.Tk, notebook_dir: Path, topic: str) -> Path:
    """Capture GUI screenshot and save as PNG."""
    if not HAS_PIL:
        raise RuntimeError("Pillow is required for screenshot. Install with: pip install Pillow")
    
    # Ensure window is fully rendered
    root.update_idletasks()
    root.update()
    
    # Get window geometry
    x = root.winfo_rootx()
    y = root.winfo_rooty()
    width = root.winfo_width()
    height = root.winfo_height()
    
    # Capture screenshot
    screenshot = ImageGrab.grab(bbox=(x, y, x + width, y + height))
    
    # Save as PNG directly to notebook_dir
    filename = _sanitize_filename(topic) + ".png"
    png_path = notebook_dir / filename
    screenshot.save(str(png_path), "PNG", dpi=(144, 144))
    
    return png_path


class QuizWindow:
    def __init__(self, quiz_data):
        self.quiz_data = quiz_data
        self.answered = False
        self.selected_index = None
        self.option_rows = []

        self.config = _load_config()
        self.notebook_dir = Path(self.config.get("notebookPath") or str(_default_notebook_dir()))

        self.root = tk.Tk()
        self.root.title(f"Live-time-tutorial - {quiz_data.get('category', 'Quiz')}")
        width = 980
        height = 760
        self.root.geometry(f"{width}x{height}")
        self.root.configure(bg="#0A1220")

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

        style.configure("App.TFrame", background="#0A1220")
        style.configure("Card.TFrame", background="#101B2D")
        style.configure("Title.TLabel", background="#101B2D", foreground="#F8FAFC", font=("Segoe UI", 18, "bold"))
        style.configure("H2.TLabel", background="#101B2D", foreground="#E2E8F0", font=("Segoe UI", 12, "bold"))
        style.configure("Muted.TLabel", background="#101B2D", foreground="#9FB0CB", font=("Segoe UI", 10))
        style.configure("Pill.TLabel", background="#1A2A44", foreground="#93C5FD", font=("Segoe UI", 9, "bold"))
        style.configure("Success.TLabel", background="#101B2D", foreground="#34D399", font=("Segoe UI", 11, "bold"))
        style.configure("Danger.TLabel", background="#101B2D", foreground="#F87171", font=("Segoe UI", 11, "bold"))
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"), padding=(14, 10))
        style.configure("Secondary.TButton", font=("Segoe UI", 10), padding=(12, 10))
    
    def setup_ui(self):
        app = ttk.Frame(self.root, padding=24, style="App.TFrame")
        app.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(app, padding=0, style="App.TFrame")
        header.pack(fill=tk.X)

        title_card = ttk.Frame(header, padding=18, style="Card.TFrame")
        title_card.pack(fill=tk.X)

        ttk.Label(title_card, text="Live-time-tutorial", style="Title.TLabel").pack(anchor=tk.W)
        ttk.Label(title_card, text="Interactive knowledge quiz with instant feedback", style="Muted.TLabel").pack(anchor=tk.W, pady=(6, 0))

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

        content = ttk.Frame(app, padding=(0, 16, 0, 0), style="App.TFrame")
        content.pack(fill=tk.BOTH, expand=True)

        left = ttk.Frame(content, style="App.TFrame")
        left.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        right = ttk.Frame(content, style="App.TFrame", width=360)
        right.pack(side=tk.RIGHT, fill=tk.BOTH)

        q_card = ttk.Frame(left, padding=18, style="Card.TFrame")
        q_card.pack(fill=tk.X)
        ttk.Label(q_card, text="Question", style="H2.TLabel").pack(anchor=tk.W)

        self.question_text = tk.Text(
            q_card,
            height=6,
            wrap=tk.WORD,
            font=("Segoe UI", 11),
            bg="#0A1220",
            fg="#E2E8F0",
            relief=tk.FLAT,
            padx=12,
            pady=12,
            highlightthickness=1,
            highlightbackground="#2D3B56",
            insertbackground="#E2E8F0",
        )
        self.question_text.insert("1.0", self.quiz_data.get("question", ""))
        self.question_text.config(state=tk.DISABLED)
        self.question_text.pack(fill=tk.X, pady=(10, 0))

        opt_card = ttk.Frame(left, padding=18, style="Card.TFrame")
        opt_card.pack(fill=tk.X, pady=(16, 0))
        ttk.Label(opt_card, text="Select an option", style="H2.TLabel").pack(anchor=tk.W)

        options_wrap = tk.Frame(opt_card, bg="#101B2D", highlightthickness=0)
        options_wrap.pack(fill=tk.X, pady=(10, 0))

        for i, option in enumerate(self.quiz_data.get("options", [])):
            row = tk.Frame(
                options_wrap,
                bg="#15233A",
                highlightthickness=1,
                highlightbackground="#2E3F60",
                cursor="hand2",
                padx=12,
                pady=11,
            )
            row.pack(fill=tk.X, pady=6)

            index_label = tk.Label(
                row,
                text=chr(65 + i),
                width=3,
                bg="#203554",
                fg="#DBEAFE",
                font=("Segoe UI", 10, "bold"),
                relief=tk.FLAT,
                padx=5,
                pady=4,
            )
            index_label.pack(side=tk.LEFT)

            text_label = tk.Label(
                row,
                text=option,
                bg="#15233A",
                fg="#E2E8F0",
                justify=tk.LEFT,
                wraplength=500,
                anchor=tk.W,
                font=("Segoe UI", 11),
                padx=10,
            )
            text_label.pack(side=tk.LEFT, fill=tk.X, expand=True)

            row.bind("<Button-1>", lambda _e, idx=i: self.submit_answer(idx))
            index_label.bind("<Button-1>", lambda _e, idx=i: self.submit_answer(idx))
            text_label.bind("<Button-1>", lambda _e, idx=i: self.submit_answer(idx))
            row.bind("<Enter>", lambda _e, widget=row: self._hover_option(widget, True))
            row.bind("<Leave>", lambda _e, widget=row: self._hover_option(widget, False))
            index_label.bind("<Enter>", lambda _e, widget=row: self._hover_option(widget, True))
            index_label.bind("<Leave>", lambda _e, widget=row: self._hover_option(widget, False))
            text_label.bind("<Enter>", lambda _e, widget=row: self._hover_option(widget, True))
            text_label.bind("<Leave>", lambda _e, widget=row: self._hover_option(widget, False))

            self.option_rows.append({"row": row, "index_label": index_label, "text_label": text_label})

        self.hint_label = ttk.Label(opt_card, text="Click any option to submit your answer", style="Muted.TLabel")
        self.hint_label.pack(anchor=tk.W, pady=(8, 0))

        result_card = ttk.Frame(right, padding=18, style="Card.TFrame")
        result_card.pack(fill=tk.BOTH, expand=True)
        ttk.Label(result_card, text="Result", style="H2.TLabel").pack(anchor=tk.W)

        self.result_badge = ttk.Label(result_card, text="Waiting for answer", style="Pill.TLabel")
        self.result_badge.pack(anchor=tk.W, pady=(10, 0))

        self.result_status = ttk.Label(result_card, text="", style="Muted.TLabel")
        self.result_status.pack(anchor=tk.W, pady=(6, 0))

        self.result_text = tk.Text(
            result_card,
            height=19,
            wrap=tk.WORD,
            font=("Segoe UI", 11),
            bg="#0A1220",
            fg="#E2E8F0",
            relief=tk.FLAT,
            padx=12,
            pady=12,
            highlightthickness=1,
            highlightbackground="#2D3B56",
            insertbackground="#E2E8F0",
        )
        self.result_text.insert("1.0", "Your result and explanation will appear here after answering.")
        self.result_text.config(state=tk.DISABLED)
        self.result_text.pack(fill=tk.BOTH, expand=True, pady=(10, 0))

        self.add_btn = ttk.Button(
            result_card,
            text="Save to Notebook",
            style="Primary.TButton",
            command=self.save_screenshot,
            state=tk.DISABLED,
        )
        self.add_btn.pack(fill=tk.X, pady=(14, 0))

        self.note_status = ttk.Label(result_card, text="Screenshot will be saved after answering", style="Muted.TLabel")
        self.note_status.pack(anchor=tk.W, pady=(10, 0))

    def _hover_option(self, row: tk.Frame, entering: bool):
        if self.answered:
            return
        row.configure(bg="#1D2F4E" if entering else "#15233A")

    def _set_option_style(self, idx: int, state: str):
        cfg = self.option_rows[idx]
        row = cfg["row"]
        dot = cfg["index_label"]
        text = cfg["text_label"]

        palette = {
            "idle": ("#15233A", "#203554", "#E2E8F0", "#DBEAFE", "#2E3F60"),
            "selected": ("#2A4062", "#355C8D", "#F8FAFC", "#DBEAFE", "#4A6999"),
            "correct": ("#0F3A2F", "#166543", "#ECFDF5", "#D1FAE5", "#21825A"),
            "wrong": ("#4A1E2A", "#7F1D1D", "#FEE2E2", "#FECACA", "#9F3131"),
        }
        bg, dot_bg, text_fg, dot_fg, border = palette[state]
        row.configure(bg=bg, highlightbackground=border, cursor="arrow")
        dot.configure(bg=dot_bg, fg=dot_fg)
        text.configure(bg=bg, fg=text_fg)
    
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
        self.note_status.config(text=f"Notebook path updated: {self.notebook_dir}")
    
    def submit_answer(self, selected: int):
        if self.answered:
            return

        self.selected_index = selected
        self.answered = True
        correct = int(self.quiz_data.get("correctIndex", 0))
        is_correct = selected == correct

        for i in range(len(self.option_rows)):
            self._set_option_style(i, "idle")

        self._set_option_style(selected, "selected")
        self._set_option_style(correct, "correct")
        if selected != correct:
            self._set_option_style(selected, "wrong")

        explanation = (self.quiz_data.get("explanation") or "").strip()
        knowledge = (self.quiz_data.get("knowledgeSummary") or "").strip()
        points = _extract_points(knowledge)

        correct_answer = self.quiz_data.get("options", [""])[correct]
        selected_answer = self.quiz_data.get("options", [""])[selected]

        badge = "Correct" if is_correct else "Incorrect"
        self.result_badge.config(text=badge)
        self.result_status.config(
            text="Correct! Review the explanation below."
            if is_correct
            else "Review the explanation to understand the correct approach."
        )

        demo_steps = _build_demo_steps(explanation, selected_answer, correct_answer)

        lines = [
            f"Result: {badge}",
            "",
            f"Your answer: {chr(65 + selected)}. {selected_answer}",
            f"Correct answer: {chr(65 + correct)}. {correct_answer}",
            "",
            "Clear Explanation",
            explanation if explanation else "(No explanation provided)",
            "",
            "Walkthrough Demo",
        ]

        for i, step in enumerate(demo_steps, start=1):
            lines.append(f"{i}. {step}")

        if points:
            lines.append("")
            lines.append("Key Points")
            for p in points:
                lines.append(f"- {p}")

        text = "\n".join(lines)
        self.result_text.config(state=tk.NORMAL)
        self.result_text.delete("1.0", tk.END)
        self.result_text.insert("1.0", text)
        self.result_text.config(state=tk.DISABLED)

        self.add_btn.config(state=tk.NORMAL)
        self.note_status.config(text="Ready to save screenshot")

        # Save result for MCP to read
        self._save_quiz_result(selected, is_correct)

    def _save_quiz_result(self, selected: int, is_correct: bool):
        """Save quiz result to file for MCP to read."""
        try:
            quiz_file = Path(sys.argv[1]) if len(sys.argv) > 1 else None
            if quiz_file:
                result_path = quiz_file.parent / f"{quiz_file.stem}.result.json"
                result = {
                    "quizId": self.quiz_data.get("id"),
                    "question": self.quiz_data.get("question"),
                    "selectedIndex": selected,
                    "selectedAnswer": self.quiz_data.get("options", [])[selected] if selected >= 0 else None,
                    "correctIndex": self.quiz_data.get("correctIndex", 0),
                    "correctAnswer": self.quiz_data.get("options", [])[self.quiz_data.get("correctIndex", 0)],
                    "isCorrect": is_correct,
                    "explanation": self.quiz_data.get("explanation"),
                    "knowledgeSummary": self.quiz_data.get("knowledgeSummary"),
                    "category": self.quiz_data.get("category"),
                    "answeredAt": datetime.now().isoformat(),
                }
                result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            print(f"Failed to save result: {e}", file=sys.stderr)

    def save_screenshot(self):
        if not self.answered or self.selected_index is None:
            return

        try:
            topic = self.quiz_data.get("question", "quiz_result").strip()
            png_path = _capture_gui_screenshot(self.root, self.notebook_dir, topic)
            self.note_status.config(text=f"Saved: {png_path}")
            messagebox.showinfo("Saved", f"Screenshot saved:\n{png_path}")
        except Exception as e:
            messagebox.showerror("Failed", str(e))

def load_quiz_from_args():
    """Load quiz data from command line args."""
    if len(sys.argv) < 2:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", "Usage:\npython quiz_gui.py <quiz file path>")
        sys.exit(1)

    quiz_file = Path(sys.argv[1]).expanduser().resolve()

    if not quiz_file.exists():
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", f"File not found: {quiz_file}")
        sys.exit(1)

    try:
        return json.loads(quiz_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Error", f"Failed to parse file: {quiz_file}")
        sys.exit(1)

if __name__ == "__main__":
    quiz_data = load_quiz_from_args()
    QuizWindow(quiz_data)
