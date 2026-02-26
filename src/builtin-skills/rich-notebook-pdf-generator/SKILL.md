---
name: rich-notebook-pdf-generator
description: |
  Generate structured PDF study notes with rich formatting.
  Use when: user wants a detailed study note after a quiz or learning session.
version: 3.0.0
tags: [agent-skill, notebook, pdf, study-notes]
created: 2026-02-23
updated: 2026-02-24
---

# Rich Notebook PDF Generator

Generate structured, visually clear PDF study notes.

## Quick Start

1. Generate rich markdown content following the content structure below
2. Pass JSON payload to the script via **stdin** (recommended) or file
3. Run the script to produce the PDF

### Method 1: Standard Input (Recommended - No intermediate file)

```bash
# Pipe JSON directly to the script
echo '{"topic": "Example", "contentMarkdown": "..."}' | python scripts/notebook_pdf_writer.py - [out.pdf]

# Or use a heredoc
python scripts/notebook_pdf_writer.py - [out.pdf] << 'EOF'
{
  "topic": "Your Topic",
  "contentMarkdown": "## 1. ..."
}
EOF
```

### Method 2: File Input (Legacy mode - auto-deletes file after generation)

```bash
python scripts/notebook_pdf_writer.py <payload.json> [out.pdf]
```

## Content Structure

Generate `contentMarkdown` using **numbered hierarchy** (`1.`, `1.1`, `1.2`, `2.`, `2.1` ...).

Use **bold** liberally to highlight key terms, definitions, and important conclusions.

Do NOT use checkboxes. Do NOT use bullet-only lists for main sections.

### 1. Terminology & Definitions

Use **bold** for each term being defined. Keep definitions concise.

```
## 1. Terminology & Definitions

**1.1 Term Name**: Clear one-line definition.

**1.2 Another Term**: Definition with `code` if technical.
```

### 2. Key Concepts & Principles

Explain the core ideas. Use **bold** for critical takeaways. Include common misconceptions.

```
## 2. Key Concepts & Principles

**2.1 Core Idea**: Explanation...

**2.2 Common Misconception**: Why X is wrong and Y is correct...
```

### 3. Practical Examples

Provide runnable code or step-by-step scenarios. Use code blocks for code.

```
## 3. Practical Examples

**3.1 Basic Example**

(code block or walkthrough)

**3.2 Real-world Scenario**

(application description)
```

### 4. Analogy & Memory Aids

Use everyday analogies to make concepts stick. Compare with similar concepts.

```
## 4. Analogy & Memory Aids

**4.1 Everyday Analogy**: "Think of X like..."

**4.2 Comparison**: X vs Y — key differences...
```

### 5. Summary Table

Always include at least one comparison or summary table. Tables are the most effective visual aid.

```
## 5. Summary Table

| Aspect | Option A | Option B |
|--------|----------|----------|
| Speed  | Fast     | Slow     |
| Memory | Low      | High     |
```

### 6. Process Flowchart

When applicable, describe a decision or process flow using a text-based flowchart with box-drawing characters.

```
## 6. Process Flowchart

┌─────────────┐
│ Start       │
└──────┬──────┘
       │
┌──────▼──────┐    Yes    ┌───────────┐
│ Condition?  ├──────────►│ Path A    │
└──────┬──────┘           └───────────┘
       │ No
┌──────▼──────┐
│ Path B      │
└─────────────┘
```

## Formatting Rules

1. **Bold liberally**: Every key term, definition name, and important conclusion should be **bold**
2. **Numbered hierarchy**: Use `1.`, `1.1`, `1.2`, `2.`, `2.1` for all sections and sub-sections
3. **Tables over lists**: Prefer comparison tables over long bullet lists
4. **No checkboxes**: Never use `[ ]` or `[x]` syntax
5. **No bullet-only sections**: Main content should use numbered structure, not just `-` lists
6. **Code blocks**: Use fenced code blocks with language tags for all code
7. **Flowcharts**: Use box-drawing characters (─│┌┐└┘├┤▼►) for process flows

## JSON Payload Format

```json
{
  "topic": "Your Topic Name",
  "summary": "Brief one-line description",
  "contentMarkdown": "## 1. Terminology...\n\n**1.1 Term**:...",
  "screenshotPath": "/path/to/screenshot.png",
  "tags": ["tag1", "tag2"],
  "design": {
    "theme": "clean",
    "accentColor": "#2563EB"
  }
}
```

### Fields

- **topic**: Note title (PDF filename)
- **summary**: One-line summary below title
- **contentMarkdown**: Main content following the structure above
- **screenshotPath**: Optional path to screenshot image, displayed as header image below title
- **tags**: Optional tags
- **design**: Optional styling — `theme`: "clean" | "warm" | "forest", `accentColor`: hex color

## PDF Generation Script

`scripts/notebook_pdf_writer.py` supports:
- Markdown rendering (headings, bold, lists, code blocks, quotes)
- Screenshot as header image (from `screenshotPath`)
- Markdown table detection and styled rendering
- Box-drawing flowchart rendering
- Theme support (clean/warm/forest) with accent colors
- Chinese font support (Microsoft YaHei, SimHei, SimSun)

**Dependencies**: `reportlab` (`pip install reportlab`)

**Usage**:
```bash
# From stdin (no intermediate files)
echo '{...}' | python scripts/notebook_pdf_writer.py - [out.pdf]

# From file (legacy, auto-deleted after use)
python scripts/notebook_pdf_writer.py <payload.json> [out.pdf]
```

## Output

- **Default save location**: `~/Desktop/Notebook/{topic}.pdf`
- **Screenshot cleanup**: Screenshot file is auto-deleted after being embedded in PDF

When using stdin mode, no intermediate JSON files are created.
