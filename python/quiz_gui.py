import tkinter as tk
from tkinter import ttk, messagebox
import json
import os
import sys
import base64
from pathlib import Path

DEFAULT_QUIZ_DATA = None

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
        
        # 分类标签
        category = self.quiz_data.get("category", "未分类")
        category_label = ttk.Label(main_frame, text=f"📂 {category}", 
                                   font=("Microsoft YaHei", 11), foreground="#666")
        category_label.pack(anchor=tk.W)
        
        # 题目区域
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
        
        # 选项区域
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
        
        # 提交按钮
        self.submit_btn = ttk.Button(main_frame, text="提交答案", 
                                     command=self.submit_answer, state=tk.DISABLED)
        self.submit_btn.pack(pady=10)
        
        # 答案解析区域
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
        
        # 高亮显示正确答案和错误答案
        for i, btn in enumerate(self.option_buttons):
            if i == correct:
                btn.config(fg="#4CAF50", font=("Microsoft YaHei", 12, "bold"))
            elif i == selected and selected != correct:
                btn.config(fg="#f44336", font=("Microsoft YaHei", 12, "bold"))
        
        explanation = self.quiz_data.get("explanation", "")
        knowledge = self.quiz_data.get("knowledgeSummary", "")
        
        if selected == correct:
            result_text = f"✅ 回答正确！\n\n{explanation}"
        else:
            correct_answer = self.quiz_data['options'][correct]
            result_text = f"❌ 回答错误\n\n正确答案是: {chr(65+correct)}. {correct_answer}\n\n{explanation}"
        
        self.result_label.config(text=result_text)
        
        if knowledge:
            points = knowledge.split("|")
            knowledge_text = "💡 核心知识点:\n" + "\n".join(f"  • {p.strip()}" for p in points if p.strip())
            self.knowledge_label.config(text=knowledge_text)
        
        self.submit_btn.config(text="已提交", state=tk.DISABLED)

def load_quiz_from_args():
    """从命令行参数加载quiz数据"""
    # 检查是否有嵌入的数据（DEFAULT_QUIZ_DATA不为None表示这是自包含文件）
    if DEFAULT_QUIZ_DATA is not None:
        return DEFAULT_QUIZ_DATA
    
    if len(sys.argv) < 2:
        # 没有参数时显示错误
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("错误", "使用方法:\npython quiz_gui.py <quiz文件路径>")
        sys.exit(1)
    
    quiz_file = sys.argv[1]
    
    if not os.path.exists(quiz_file):
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("错误", f"文件不存在: {quiz_file}")
        sys.exit(1)
    
    # 检查是否是Python文件（自包含格式）
    if quiz_file.endswith('.py'):
        # 执行Python文件获取数据
        import subprocess
        result = subprocess.run([sys.executable, quiz_file, "--extract"], 
                                capture_output=True, text=True)
        if result.returncode == 0:
            return json.loads(result.stdout)
    
    # 尝试作为JSON加载
    try:
        with open(quiz_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("错误", f"无法解析文件: {quiz_file}")
        sys.exit(1)

if __name__ == "__main__":
    quiz_data = load_quiz_from_args()
    QuizWindow(quiz_data)
