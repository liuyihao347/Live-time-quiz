---
name: rich-notebook-pdf-generator
description: |
  Generate comprehensive PDF study notes with 6 educational content sections.
  This skill provides guidance for creating rich educational content.
version: 2.0.0
tags: [agent-skill, notebook, pdf, study-notes, knowledge-consolidation]
created: 2026-02-23
updated: 2026-02-24
---

# Rich Notebook PDF Generator

Use this skill to generate comprehensive study notes with 6 educational sections.

## Quick Start

1. Generate rich markdown content following the 6-section structure below
2. Create a JSON payload file anywhere (will be auto-deleted after PDF generation)
3. Use the Python script to generate the PDF (defaults to ~/Desktop/Notebook/)

```bash
# Usage with explicit output path
python <path_to_script>/notebook_pdf_writer.py <payload.json> [out.pdf]

# Or use default output directory (~/Desktop/Notebook/)
python <path_to_script>/notebook_pdf_writer.py <payload.json>
```

**Default Output**: `~/Desktop/Notebook/{topic}.pdf`

**Script Location**: `src/builtin-skills/rich-notebook-pdf-generator/scripts/notebook_pdf_writer.py`

## Content Structure

Generate `contentMarkdown` with these 6 sections:

### 1. Terminology Definitions
- Define each term in simple language
- Include formulas if applicable
- Use inline `code` for technical terms

### 2. Knowledge Network
- Prerequisites (what to know first)
- Related topics (what connects to this)
- Follow-up concepts (where this leads)

### 3. Key Points
- Must-remember facts
- Common misconceptions to avoid
- Decision criteria (when to use this)

### 4. Practical Examples
- Minimal working example
- Real-world application scenario
- Step-by-step walkthrough

### 5. Analogies & Comparisons
- Everyday analogies
- Comparison with similar concepts
- Pros/cons tradeoffs

### 6. Visual Summary
- Decision flowchart
- Comparison table
- Quick reference checklist

## JSON Payload Format

Create a JSON file with this structure:

```json
{
  "topic": "Your Topic Name",
  "summary": "Brief description of the note",
  "contentMarkdown": "Your markdown content with the 6 sections...",
  "tags": ["tag1", "tag2"],
  "design": {
    "theme": "clean",
    "accentColor": "#2563EB"
  }
}
```

### Fields

- **topic**: Note title (used as PDF filename)
- **summary**: One-line summary shown below title
- **contentMarkdown**: Main content with the 6 sections
- **tags**: Optional array of tags
- **design**: Optional styling
  - `theme`: "clean" | "warm" | "forest"
  - `accentColor`: Hex color like "#2563EB"

### Optional Structured Data

If needed, you can also include:

```json
{
  "sections": [
    {"heading": "Section Name", "body": "Content..."}
  ],
  "keyPoints": ["Point 1", "Point 2"],
  "table": {
    "headers": ["Col1", "Col2"],
    "rows": [["A", "B"], ["C", "D"]]
  },
  "chart": {
    "title": "Chart Title",
    "labels": ["A", "B", "C"],
    "values": [10, 20, 30]
  }
}
```

## PDF Generation Script

The `scripts/notebook_pdf_writer.py` script handles:
- Markdown rendering (headings, lists, code blocks, quotes)
- Table generation with styling
- Bar chart creation
- Theme support (clean/warm/forest)
- Custom accent colors

**Dependencies**: `reportlab` (pip install reportlab)

## Best Practices

1. **Start with the big picture**: Why does this matter?
2. **Use consistent formatting**: `code` for code, **bold** for key terms
3. **Keep examples runnable**: Provide complete, copy-paste ready code
4. **Make analogies relatable**: Use everyday experiences
5. **Visual tables first**: Most learners prefer tables over long text

## Output

- **Default save location**: `~/Desktop/Notebook/{topic}.pdf`
- **JSON cleanup**: Intermediate JSON file is automatically deleted after PDF generation
- **Chinese support**: Built-in Chinese font support (SimHei, Microsoft YaHei, SimSun)
- **Theme support**: `clean`, `warm`, `forest` with custom accent colors
- **Dependencies**: Python with reportlab (`pip install reportlab`)
