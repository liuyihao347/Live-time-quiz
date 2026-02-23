# -*- coding: utf-8 -*-
"""Notebook PDF Writer Script

This script assembles a JSON payload into a beautiful PDF.
Usage: python notebook_pdf_writer.py <payload.json> <out.pdf>

Dependencies: reportlab (pip install reportlab)
"""
import json
import sys
import re
from pathlib import Path

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.fonts import addMapping
except Exception:
    A4 = None


def _register_chinese_fonts():
    """Register Chinese fonts for PDF generation. Returns (normal_font, bold_font, italic_font)."""
    import os
    
    # Check Windows fonts directory
    windows_fonts_dir = Path("C:/Windows/Fonts")
    
    # Try different font options in order of preference
    font_options = [
        # (font_name, normal_file, bold_file)
        ("MicrosoftYaHei", "msyh.ttc", "msyhbd.ttc"),
        ("SimHei", "simhei.ttf", "simhei.ttf"),  # SimHei doesn't have separate bold
        ("SimSun", "simsun.ttc", "simsun.ttc"),
    ]
    
    for font_family, normal_file, bold_file in font_options:
        normal_path = windows_fonts_dir / normal_file
        bold_path = windows_fonts_dir / bold_file
        
        if normal_path.exists():
            try:
                # Register normal font
                normal_font_name = f"{font_family}_Normal"
                pdfmetrics.registerFont(TTFont(normal_font_name, str(normal_path)))
                
                # Register bold font (use normal if bold doesn't exist)
                bold_font_name = f"{font_family}_Bold"
                if bold_path.exists() and bold_file != normal_file:
                    pdfmetrics.registerFont(TTFont(bold_font_name, str(bold_path)))
                else:
                    # Use same font for bold if no separate bold file
                    bold_font_name = normal_font_name
                
                # Set up font family mapping
                addMapping(font_family, 0, 0, normal_font_name)  # normal
                addMapping(font_family, 1, 0, bold_font_name)     # bold
                addMapping(font_family, 0, 1, normal_font_name)   # italic
                addMapping(font_family, 1, 1, bold_font_name)     # bold+italic
                
                print(f"Successfully registered font: {font_family}")
                # Return the actual font names to use
                return normal_font_name, bold_font_name, normal_font_name
                
            except Exception as e:
                print(f"Failed to register {font_family}: {e}")
                continue
    
    # Ultimate fallback - this should not happen on normal Windows systems
    print("WARNING: No Chinese fonts found, using Helvetica fallback")
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


def _safe_hex_color(value: str | None, fallback: str) -> str:
    """Validate and return hex color, fallback if invalid."""
    if not isinstance(value, str):
        return fallback
    text = value.strip()
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", text):
        return text
    return fallback


def _markdown_to_plain(text: str) -> str:
    """Strip markdown syntax, return plain text. No HTML tags to avoid font issues."""
    # Remove bold markers
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    # Remove italic markers  
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    # Remove inline code markers
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return text


def _is_table_line(line: str) -> bool:
    """Check if line is part of a markdown table."""
    stripped = line.strip()
    if not stripped.startswith('|'):
        return False
    return stripped.count('|') >= 2


def _is_table_separator(line: str) -> bool:
    """Check if line is a table separator like |---|---|"""
    stripped = line.strip()
    if not stripped.startswith('|'):
        return False
    content = stripped.replace('|', '').replace('-', '').replace(':', '').replace(' ', '')
    return len(content) == 0


def _parse_table(lines: list, start_idx: int) -> tuple:
    """Parse markdown table starting at start_idx. Returns (table_data, end_idx)."""
    table_lines = []
    i = start_idx
    while i < len(lines) and _is_table_line(lines[i]):
        if not _is_table_separator(lines[i]):
            table_lines.append(lines[i])
        i += 1
    
    rows = []
    for line in table_lines:
        cells = [cell.strip() for cell in line.split('|')]
        cells = [cell for cell in cells if cell]
        if cells:
            # Apply markdown conversion to each cell
            cells = [_markdown_to_plain(cell) for cell in cells]
            rows.append(cells)
    
    return rows, i


def _is_flowchart_line(line: str) -> bool:
    """Check if line is part of a flowchart using box-drawing characters."""
    stripped = line.strip()
    if not stripped:
        return False
    # Must contain box drawing characters
    box_chars = set('┌┐└┘├┤┬┴─│┏┓┗┛┣┫┳┻━┃╔╗╚╝╠╣╦╩═║')
    has_box = any(c in box_chars for c in stripped)
    if not has_box:
        return False
    # Count box chars vs total chars - should be significant portion
    box_count = sum(1 for c in stripped if c in box_chars)
    return box_count >= 2  # At least 2 box chars


def _render_markdown(story, markdown_text: str, h_style, h3_style, body_style, quote_style, code_style, mono_style, table_style, mono_box_style):
    """Render markdown text into reportlab story with full formatting support."""
    if not markdown_text.strip():
        return

    fence = chr(96) * 3
    in_code = False
    in_flowchart = False
    flowchart_buffer = []
    lines = markdown_text.splitlines()
    i = 0
    
    def _flush_flowchart():
        nonlocal flowchart_buffer
        if flowchart_buffer:
            # Add spacing
            story.append(Spacer(1, 4))
            # Render flowchart with monospace
            for fline in flowchart_buffer:
                safe = (
                    fline.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace(" ", "&nbsp;")
                )
                story.append(Paragraph(safe or "&nbsp;", mono_style))
            story.append(Spacer(1, 4))
            flowchart_buffer = []
    
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip("\n")
        stripped = line.strip()

        # Code fence handling
        if stripped.startswith(fence):
            _flush_flowchart()
            in_code = not in_code
            i += 1
            continue

        if in_code:
            _flush_flowchart()
            safe = (
                line.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace(" ", "&nbsp;")
            )
            story.append(Paragraph(safe or "&nbsp;", code_style))
            i += 1
            continue

        # Empty line
        if not stripped:
            _flush_flowchart()
            story.append(Spacer(1, 4))
            i += 1
            continue

        # Check if this is a flowchart line
        is_flow = _is_flowchart_line(line)
        if is_flow:
            flowchart_buffer.append(line)
            i += 1
            continue
        elif flowchart_buffer:
            # We were in a flowchart but this line is not
            _flush_flowchart()

        # Headings
        if stripped.startswith("### "):
            html_text = _markdown_to_plain(stripped[4:])
            story.append(Paragraph(html_text, h3_style))
            i += 1
            continue

        if stripped.startswith("## "):
            html_text = _markdown_to_plain(stripped[3:])
            story.append(Paragraph(html_text, h_style))
            i += 1
            continue

        if stripped.startswith("# "):
            html_text = _markdown_to_plain(stripped[2:])
            story.append(Paragraph(html_text, h_style))
            i += 1
            continue

        # Quote
        if stripped.startswith("> "):
            html_text = _markdown_to_plain(stripped[2:])
            story.append(Paragraph(html_text, quote_style))
            i += 1
            continue

        # Table detection and rendering
        if _is_table_line(stripped) and not _is_table_separator(stripped):
            table_data, next_idx = _parse_table(lines, i)
            if len(table_data) >= 1:
                story.append(Spacer(1, 8))
                t = Table(table_data, hAlign="LEFT", repeatRows=1)
                t.setStyle(table_style)
                story.append(t)
                story.append(Spacer(1, 8))
                i = next_idx
                continue

        # List items - convert checkboxes to numbered checklist
        if stripped.startswith("- ") or stripped.startswith("* "):
            content = stripped[2:]
            # Convert any checkbox to number (will be handled by tracking index)
            if content.startswith("[ ] ") or content.startswith("[x] ") or content.startswith("[X] "):
                content = content[4:]
            prefix = ""  # Just use the content, numbering handled separately if needed
            plain_text = _markdown_to_plain(content)
            story.append(Paragraph(plain_text, body_style))
            i += 1
            continue

        # Ordered list
        ordered = re.match(r"^(\d+)[\.)]\s+(.*)$", stripped)
        if ordered:
            html_text = _markdown_to_plain(stripped)
            story.append(Paragraph(html_text, body_style))
            i += 1
            continue

        # Regular paragraph with markdown formatting
        html_text = _markdown_to_plain(stripped)
        story.append(Paragraph(html_text, body_style))
        i += 1
    
    # Flush any remaining flowchart
    _flush_flowchart()


def _write_pdf(out_path: Path, payload: dict) -> None:
    """Write PDF to out_path using payload data."""
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
    design = payload.get("design") or {}
    theme = str(design.get("theme") or "clean").lower()
    default_accent = "#2563EB"
    if theme == "warm":
        default_accent = "#C2410C"
    elif theme == "forest":
        default_accent = "#0F766E"

    accent = _safe_hex_color(design.get("accentColor"), default_accent)
    heading_color = colors.HexColor(accent)
    table_header_bg = colors.HexColor("#EEF2FF") if theme == "clean" else (
        colors.HexColor("#FFF1E6") if theme == "warm" else colors.HexColor("#E6F7F1")
    )

    # Register Chinese fonts
    font_normal, font_bold, font_italic = _register_chinese_fonts()

    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Title"],
        fontName=font_bold,
        fontSize=18,
        leading=22,
        textColor=heading_color,
        spaceAfter=10,
    )
    h_style = ParagraphStyle(
        "HeadingStyle",
        parent=styles["Heading2"],
        fontName=font_bold,
        fontSize=12,
        leading=16,
        textColor=heading_color,
        spaceBefore=10,
        spaceAfter=6,
    )
    h3_style = ParagraphStyle(
        "Heading3Style",
        parent=styles["Heading3"],
        fontName=font_bold,
        fontSize=10.8,
        leading=14,
        textColor=colors.HexColor("#1F2937"),
        spaceBefore=6,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["BodyText"],
        fontName=font_normal,
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor("#111827"),
    )
    quote_style = ParagraphStyle(
        "QuoteStyle",
        parent=styles["BodyText"],
        fontName=font_italic,
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        leftIndent=10,
        borderPadding=6,
    )
    code_style = ParagraphStyle(
        "CodeStyle",
        parent=styles["BodyText"],
        fontName=font_normal,  # Use Chinese font for code blocks too
        fontSize=9.2,
        leading=12,
        textColor=colors.HexColor("#0F172A"),
        backColor=colors.HexColor("#F1F5F9"),
        leftIndent=8,
        rightIndent=8,
        spaceBefore=4,
        spaceAfter=4,
    )
    mono_style = ParagraphStyle(
        "MonoStyle",
        parent=styles["BodyText"],
        fontName=font_normal,  # Use Chinese font for flowcharts
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#374151"),
        leftIndent=0,
    )
    meta_style = ParagraphStyle(
        "MetaStyle",
        parent=styles["BodyText"],
        fontName=font_normal,
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
    )
    # Table style for markdown tables - use Chinese font for all cells
    table_style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), table_header_bg),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ("FONTNAME", (0, 0), (-1, 0), font_bold),  # Header row
        ("FONTNAME", (0, 1), (-1, -1), font_normal),  # Data rows use Chinese font
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ])

    story = []
    story.append(Paragraph(payload.get("topic") or "Notebook", title_style))
    summary = (payload.get("summary") or "").strip()
    if summary:
        story.append(Paragraph(summary, meta_style))

    tags = [str(tag).strip() for tag in (payload.get("tags") or []) if str(tag).strip()]
    if tags:
        story.append(Paragraph("Tags: " + "  |  ".join(tags), meta_style))

    content_markdown = (payload.get("contentMarkdown") or "").strip()
    if content_markdown:
        _render_markdown(story, content_markdown, h_style, h3_style, body_style, quote_style, code_style, mono_style, table_style, None)

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
                    ("BACKGROUND", (0, 0), (-1, 0), table_header_bg),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                    ("FONTNAME", (0, 0), (-1, 0), font_bold),
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
            bc.bars[0].fillColor = heading_color
            bc.strokeColor = colors.HexColor("#CBD5E1")
            bc.valueAxis.strokeColor = colors.HexColor("#CBD5E1")
            bc.categoryAxis.labels.angle = 30
            bc.categoryAxis.labels.dy = -12
            d.add(bc)
            story.append(Spacer(1, 6))
            story.append(d)

    doc.build(story)


def main() -> int:
    """Main entry point."""
    import os
    import shutil
    
    # Default output directory
    default_notebook_dir = Path.home() / "Desktop" / "Notebook"
    
    if len(sys.argv) < 2:
        print("Usage: python notebook_pdf_writer.py <payload.json> [out.pdf]")
        return 1
    
    payload_path = Path(sys.argv[1])
    
    # Parse payload to get topic for default filename
    try:
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
        topic = payload.get("topic", "notebook")
    except Exception as e:
        print(f"Error reading payload: {e}")
        return 1
    
    # Determine output path
    if len(sys.argv) >= 3:
        out_path = Path(sys.argv[2])
    else:
        # Use topic as filename, default to Notebook directory
        safe_filename = re.sub(r'[\\/*?:"<>|]', "_", topic) + ".pdf"
        out_path = default_notebook_dir / safe_filename
    
    # Ensure output directory exists
    out_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Generate PDF
    try:
        _write_pdf(out_path, payload)
        print(str(out_path))
    except Exception as e:
        print(f"Error generating PDF: {e}")
        return 1
    
    # Delete JSON intermediate file after successful PDF generation
    try:
        if payload_path.exists():
            payload_path.unlink()
            print(f"Cleaned up: {payload_path}")
    except Exception as e:
        print(f"Warning: Could not delete JSON file: {e}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
