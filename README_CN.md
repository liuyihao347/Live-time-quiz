<p align="center">
  <img src="https://img.shields.io/badge/MCP-Compatible-6366f1?style=flat-square" alt="MCP Compatible">
  <img src="https://img.shields.io/badge/Cursor-Supported-10b981?style=flat-square" alt="Cursor Supported">
  <img src="https://img.shields.io/badge/Kilo_Code-Supported-10b981?style=flat-square" alt="Kilo Code Supported">
  <img src="https://img.shields.io/badge/Windsurf-Supported-10b981?style=flat-square" alt="Windsurf Supported">
  <img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square" alt="MIT License">
</p>

<h1 align="center">⚡ Live-time Tutorial MCP</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">简体中文</a>
</p>

<p align="center">
  <strong>让AI在完成任务后生成知识测验，帮你巩固记忆、提升学习效果</strong>
</p>

---

## 🧠 特性

- **即时测验** - AI完成任务后自动生成精选知识测验
- **即时反馈** - 自动判断对错，提供详细解析
- **随时跳过** - 用户可随时拒绝测验，不影响对话流程
- **轻松集成** - 支持Cursor、Kilo Code、Windsurf等AI IDE

## 🔄 工作原理

```
用户任务完成 → AI总结精华 → 询问是否测验 → 生成选择题 → 用户作答 → 即时反馈
```

1. **任务结束触发** - 当AI完成一项任务后，总结最精华的知识点
2. **可选测验** - 询问用户是否需要一道测验来巩固记忆
3. **即时生成** - 如果用户同意，立即生成一道选择题
4. **智能判断** - 用户作答后自动判断对错
5. **知识巩固** - 提供详细解析和知识总结

## 🚀 部署安装

### 1. 构建服务
```bash
npm install
npm run build
```

### 2. 配置 IDE
在对应 IDE 的配置文件中添加如下内容，注意替换 `[PATH_TO_PROJECT]` 为本项目实际绝对路径：

**配置文件路径：**
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **VS Code / Kilo Code**: `.vscode/mcp.json`

**配置内容：**
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

### 3. 重启 IDE
配置完成后重启 IDE 即可激活 MCP 服务。

## 📖 使用指南

- **自动触发**：AI 完成任务后会询问是否需要测验。
- **手动触发**：直接在对话中输入 "给我出个测验" 或 "quiz"。
- **回答方式**：
  - 对话模式：输入选项字母（A/B/C/D）提交。
  - **VS Code 扩展模式**：点击选项按钮直接作答（推荐）。

## 🏗️ 项目结构

- `src/index.ts`: MCP 服务核心。
- `vscode-extension/`: VS Code 辅助扩展。

## 📄 许可证

[MIT](LICENSE)

---

<p align="center">
  Crafted with ❤️ for effective learning
</p>
