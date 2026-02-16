<p align="center">
  <img src="https://img.shields.io/badge/MCP-Compatible-6366f1?style=flat-square" alt="MCP Compatible">
  <img src="https://img.shields.io/badge/Cursor-Supported-10b981?style=flat-square" alt="Cursor Supported">
  <img src="https://img.shields.io/badge/Kilo_Code-Supported-10b981?style=flat-square" alt="Kilo Code Supported">
  <img src="https://img.shields.io/badge/Windsurf-Supported-10b981?style=flat-square" alt="Windsurf Supported">
  <img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square" alt="MIT License">
</p>

<h1 align="center">⚡ Live-time Quiz MCP</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">简体中文</a>
</p>

<p align="center">
  <strong>AI generates knowledge quizzes after task completion to reinforce learning and boost retention</strong>
</p>

---

## 🧠 Highlights

- **Instant Quiz** - Auto-generates quizzes after AI completes tasks
- **Instant Feedback** - Auto-grading with detailed explanations
- **Skip Anytime** - Decline quizzes without disrupting workflow
- **Easy Integration** - Works with Cursor, Kilo Code, Windsurf & more

## 🔄 How It Works

```
Task Complete → AI Summarizes → Quiz Prompt → Generate Questions → Answer → Get Feedback
```

1. **Task Trigger** - AI extracts key knowledge points after finishing a task
2. **Optional Quiz** - Asks if you want a quiz to reinforce memory
3. **On-the-fly Generation** - Creates a multiple-choice question instantly
4. **Smart Evaluation** - Automatically checks your answer
5. **Knowledge Reinforcement** - Provides detailed analysis and summary

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
    "live-time-quiz": {
      "command": "node",
      "args": ["[PATH_TO_PROJECT]/dist/index.js"],
      "env": { "NODE_ENV": "production" },
      "autoApprove": ["generate_quiz", "submit_answer", "skip_quiz", "get_quiz_feedback"]
    }
  }
}
```

### 3. Restart IDE
Restart your IDE to activate the MCP service.

## 📖 Usage

- **Auto-trigger**: AI asks for a quiz after completing tasks
- **Manual trigger**: Type "give me a quiz" or "quiz" in chat
- **Answer**:
  - Chat mode: Submit by typing the option letter (A/B/C/D)
  - **VS Code Extension**: Click option buttons to answer (recommended)

## 🏗️ Project Structure

- `src/index.ts`: MCP service core
- `vscode-extension/`: VS Code helper extension

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Crafted with ❤️ for effective learning
</p>

