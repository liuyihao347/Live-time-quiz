<p align="center">
  <img src="https://img.shields.io/badge/MCP-Compatible-6366f1?style=flat-square" alt="MCP Compatible">
  <img src="https://img.shields.io/badge/Cursor-Supported-10b981?style=flat-square" alt="Cursor Supported">
  <img src="https://img.shields.io/badge/Kilo_Code-Supported-10b981?style=flat-square" alt="Kilo Code Supported">
  <img src="https://img.shields.io/badge/Windsurf-Supported-10b981?style=flat-square" alt="Windsurf Supported">
  <img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square" alt="MIT License">
</p>

<h1 align="center">⚡ Live-time-tutorial MCP</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">简体中文</a>
</p>

<p align="center">
  <strong>让AI在完成任务后生成知识测验，一键保存截图并自动生成精美PDF笔记</strong>
</p>

---

## 🧠 特性

- **即时反馈** - 答题后立即显示对错、解析和思路演示
- **一键存笔记** - 点击"Save to Notebook"保存截图并自动生成PDF
- **自动PDF生成** - 用户点击保存后，测验窗口关闭时自动调用AI生成PDF笔记
- **轻松集成** - 支持Cursor、Kilo Code、Windsurf等AI IDE

## 🔄 工作原理

```
任务完成 → AI总结知识点 → 生成测验 → 用户在GUI作答
→ [如果点击了Save to Notebook] → PDF自动生成 → 保存到 ~/Desktop/Notebook/
```

1. **任务结束触发** - AI完成任务后，总结最精华的知识点
2. **生成测验** - 创建一道多选题并打开GUI窗口
3. **用户作答** - 在GUI中点击选项卡片提交答案
4. **保存到笔记** - 用户点击"Save to Notebook"按钮（显示"Great! Check {path} later."）
5. **窗口关闭** - MCP等待GUI窗口关闭
6. **自动PDF** - 如果用户点击了保存，AI自动创建带截图的丰富PDF笔记

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

- **自动触发**：AI 完成任务后会询问是否需要测验
- **手动触发**：直接在对话中输入 "给我出个测验" 或 "quiz"
- **GUI作答**：点击选项卡片直接提交答案
- **保存截图**：作答后点击 **Save to Notebook** 按钮
- **关闭窗口**：完成后关闭GUI窗口
- **PDF自动生成**：如果点击了Save to Notebook，PDF会自动生成

所有文件直接保存到 `~/Desktop/Notebook/`：
- `{topic}.pdf` - 带截图的精美学习笔记

## 🧰 MCP 工具

### `generate_quiz`

生成测验并打开GUI窗口。MCP等待窗口关闭后返回：
- 题目、用户选择的答案、正确答案
- 解析和知识点总结
- 是否点击了Save to Notebook
- 截图路径（如果保存了）

**行为逻辑：**
- 用户点击了 **Save to Notebook** → Agent 自动调用 `save_notebook_note_pdf`
- 用户未点击 → Agent 总结结果并结束对话

### `set_notebook_path`

设置自定义笔记保存路径（默认：`~/Desktop/Notebook`）

### `save_notebook_note_pdf`

使用 `rich-notebook-pdf-generator` Agent技能生成丰富的PDF学习笔记。

**参数：**
- `topic` - 笔记标题 / PDF文件名
- `screenshotPath`（可选）- 截图路径，会作为顶图插入PDF

## 🎭 内置Agent技能

位于 `src/builtin-skills/rich-notebook-pdf-generator/`：

**SKILL.md** 指导Agent生成以下内容：

1. **术语与定义** - 关键术语使用**加粗**高亮
2. **核心概念与原理** - 核心思想与关键结论
3. **实践示例** - 可运行的代码和真实场景
4. **类比与记忆法** - 日常类比和对比记忆
5. **总结表格** - 对比表格便于快速复习
6. **流程图** - 使用制表符绘制文本流程图

**格式规则：**
- 大量使用 **加粗** 标记关键术语和结论
- 层级编号：`1.`、`1.1`、`1.2`、`2.`...
- 优先使用表格而非列表
- 不使用复选框（`[ ]` 或 `[x]`）
- 截图作为顶图插入标题下方

**PDF生成命令：**
```bash
python scripts/notebook_pdf_writer.py <payload.json> [out.pdf]
```

## 🏗️ 项目结构

```
Live-time-tutorial/
├── src/
│   ├── index.ts              # MCP服务核心
│   └── builtin-skills/
│       └── rich-notebook-pdf-generator/  # Agent技能与PDF脚本
├── python/
│   └── quiz_gui.py           # 交互式测验GUI
└── dist/                     # 编译输出
```

## 📄 许可证

[MIT](LICENSE)

---

<p align="center">
  Crafted with ❤️ for effective learning
</p>
