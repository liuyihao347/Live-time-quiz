<p align="center">
  <img src="https://img.shields.io/badge/MCP-Compatible-6366f1?style=flat-square" alt="MCP Compatible">
  <img src="https://img.shields.io/badge/Cursor-Supported-10b981?style=flat-square" alt="Cursor Supported">
  <img src="https://img.shields.io/badge/Kilo_Code-Supported-10b981?style=flat-square" alt="Kilo Code Supported">
  <img src="https://img.shields.io/badge/Windsurf-Supported-10b981?style=flat-square" alt="Windsurf Supported">
  <img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square" alt="MIT License">
</p>

<h1 align="center">⚡ Live-time-tutorial MCP</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">Chinese</a>
</p>

<p align="center">
  <strong>AI generates interactive knowledge quizzes with instant feedback and one-click Notebook export</strong>
</p>

---

## 🧠 Highlights

- **Instant Feedback** - Clear result status, explanation, and walkthrough demo
- **Notebook Export** - Click "Save to Notebook" to auto-generate PDF
- **Auto PDF Generation** - When user clicks Save to Notebook, PDF is generated immediately after quiz closes
- **Easy Integration** - Works with Cursor, Kilo Code, Windsuraf & more

## 🔄 How It Works

```
Task Complete → AI Summarizes → Generate Quiz → User Answers in GUI 
→ [If Save to Notebook clicked] → PDF Auto-generated → Saved to ~/Desktop/Notebook/
```

1. **Task Trigger** - AI extracts key knowledge points after finishing a task
2. **Quiz Generation** - Creates a multiple-choice question and opens GUI
3. **User Answers** - Click an option in the GUI to submit
4. **Save to Notebook** - User clicks button to save screenshot (shows "Great! Check {path} later.")
5. **Window Closes** - MCP waits for GUI window to close
6. **Auto PDF** - If Save to Notebook was clicked, agent automatically creates rich PDF with screenshot as header

## 🚀 Installation

### 1. Build
```bash
npm install
npm run build
```

### 2. Configure IDE
Add to your IDE's MCP config, replacing `[PATH_TO_PROJECT]` with the actual path:

**Config locations:**
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **VS Code / Kilo Code**: `.vscode/mcp.json`

**Configuration:**
```json
{
  "mcpServers": {
    "live-time-tutorial": {
      "command": "node",
      "args": ["[PATH_TO_PROJECT]/dist/index.js"],
      "env": { "NODE_ENV": "production" },
      "autoApprove": ["generate_quiz", "set_notebook_path", "save_notebook_note_pdf"]
    }
  }
}
```

### 3. Restart IDE
Restart your IDE to activate the MCP service.

## 📖 Usage

- **Auto-trigger**: AI asks for a quiz after completing tasks
- **Manual trigger**: Type "give me a quiz" or "quiz" in chat
- **Answer in GUI**: Click an option card to submit instantly
- **Save to Notebook**: Click **Save to Notebook** after answering
- **Close window**: Close the GUI window when done
- **PDF auto-generated**: If you clicked Save to Notebook, a PDF will be created automatically

All files are saved directly to `~/Desktop/Notebook/`:
- `{topic}.pdf` - Rich study note with screenshot as header

## 🧰 MCP Tools

### `generate_quiz`

Generate a quiz and open the GUI window. MCP waits for window to close, then returns:
- Question, your selected answer, correct answer
- Explanation and knowledge points
- Whether Save to Notebook was clicked
- Screenshot path (if saved)

**Behavior:**
- If user clicked **Save to Notebook** → Agent automatically calls `save_notebook_note_pdf`
- If user did NOT click → Agent summarizes and ends conversation

### `set_notebook_path`

Set custom Notebook storage path (default: `~/Desktop/Notebook`).

### `save_notebook_note_pdf`

Generate a rich PDF study note using the `rich-notebook-pdf-generator` agent skill.

**Parameters:**
- `topic` - Note title / PDF filename
- `screenshotPath` (optional) - Path to screenshot for header image

## 🎭 Built-in Agent Skills

Located in `src/builtin-skills/rich-notebook-pdf-generator/`:

**SKILL.md** guides the agent to generate content with:

1. **Terminology & Definitions** - Key terms with bold highlighting
2. **Key Concepts & Principles** - Core ideas with critical takeaways
3. **Practical Examples** - Runnable code and real-world scenarios
4. **Analogy & Memory Aids** - Everyday analogies and comparisons
5. **Summary Table** - Comparison tables for quick review
6. **Process Flowchart** - Text-based flowcharts using box-drawing characters

**Formatting Rules:**
- Use **bold liberally** for key terms and conclusions
- Numbered hierarchy: `1.`, `1.1`, `1.2`, `2.`...
- Tables over bullet lists
- No checkboxes (`[ ]` or `[x]`)
- Screenshot inserted as header image below title

**PDF Generation:**
```bash
python scripts/notebook_pdf_writer.py <payload.json> [out.pdf]
```

## 🏗️ Project Structure

```
Live-time-tutorial/
├── src/
│   ├── index.ts              # MCP server core
│   └── builtin-skills/
│       └── rich-notebook-pdf-generator/  # Agent skill & PDF script
├── python/
│   └── quiz_gui.py           # Interactive quiz GUI
└── dist/                     # Compiled output
```

## � License

[MIT](LICENSE)

---

<p align="center">
  Crafted with ❤️ for effective learning
</p>

