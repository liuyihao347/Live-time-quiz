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
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.fonts import addMapping
except Exception:
    A4 = None


def _register_chinese_fonts():
    """Register Chinese fonts for PDF generation. Returns (normal_font, bold_font, italic_font, symbol_font)."""
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
    
    registered_font = None
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
                registered_font = (normal_font_name, bold_font_name, normal_font_name)
                break
                
            except Exception as e:
                print(f"Failed to register {font_family}: {e}")
                continue
    
    # Register symbol font for Unicode characters (arrows, box drawing, etc.)
    symbol_font_name = normal_font_name  # fallback
    symbol_font_options = [
        ("SegoeUISymbol", "seguisym.ttf"),  # Segoe UI Symbol - Windows 内置，完整 Unicode 符号支持
        ("ArialUnicodeMS", "ARIALUNI.TTF"),  # Arial Unicode MS
        ("SegoeUI", "segoeui.ttf"),  # Windows 10/11 现代字体
        ("LucidaSansUnicode", "l_10646.ttf"),  # Lucida Sans Unicode
    ]
    
    for font_family_symbol, font_file in symbol_font_options:
        font_path = windows_fonts_dir / font_file
        if font_path.exists():
            try:
                symbol_font_name = f"{font_family_symbol}_Symbol"
                pdfmetrics.registerFont(TTFont(symbol_font_name, str(font_path)))
                print(f"Successfully registered symbol font: {font_family_symbol}")
                break
            except Exception as e:
                print(f"Failed to register symbol font {font_family_symbol}: {e}")
                continue
    
    if registered_font:
        return (*registered_font, symbol_font_name)
    
    # Ultimate fallback - this should not happen on normal Windows systems
    print("WARNING: No Chinese fonts found, using Helvetica fallback")
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica"


def _register_flowchart_font(default_font: str) -> str:
    """Register and return a grid-friendly font for text flowcharts.

    Prefer SimSun/NSimSun on Windows because box-drawing characters align
    more consistently with CJK text than proportional UI fonts.
    """
    windows_fonts_dir = Path("C:/Windows/Fonts")
    candidates = [
        ("FlowchartSimSun", "simsun.ttc"),
        ("FlowchartNSimSun", "nsimsun.ttc"),
    ]

    for font_name, font_file in candidates:
        font_path = windows_fonts_dir / font_file
        if not font_path.exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
            return font_name
        except Exception:
            continue

    return default_font


def _safe_hex_color(value: str | None, fallback: str) -> str:
    """Validate and return hex color, fallback if invalid."""
    if not isinstance(value, str):
        return fallback
    text = value.strip()
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", text):
        return text
    return fallback


# Unicode ranges that need symbol font rendering
_SYMBOL_RANGES = [
    (0x2190, 0x21FF),  # Arrows
    (0x2500, 0x257F),  # Box Drawing
    (0x2580, 0x259F),  # Block Elements
    (0x25A0, 0x25FF),  # Geometric Shapes (▲▼◄► etc.)
    (0x2600, 0x26FF),  # Miscellaneous Symbols
    (0x2700, 0x27BF),  # Dingbats (➜➡➤ etc.)
    (0x27F0, 0x27FF),  # Supplemental Arrows-A
    (0x2900, 0x297F),  # Supplemental Arrows-B
    (0x2B00, 0x2BFF),  # Misc Symbols and Arrows
]


def _is_symbol_char(ch: str) -> bool:
    """Check if a character needs the symbol font (box drawing, arrows, etc.)."""
    cp = ord(ch)
    for lo, hi in _SYMBOL_RANGES:
        if lo <= cp <= hi:
            return True
    return False


def _normalize_content(text: str) -> str:
    """Normalize content: convert literal \\n sequences to real newlines."""
    # Replace literal two-char sequences '\n' with real newline
    text = text.replace('\\n', '\n')
    return text


def _escape_html(text: str) -> str:
    """Escape text for use inside reportlab Paragraph XML."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _escape_html_preserve_space(text: str) -> str:
    """Escape text and convert spaces to &nbsp; for monospace rendering."""
    return _escape_html(text).replace(" ", "&nbsp;")


def _render_mixed_line(text: str, normal_font: str, symbol_font: str, preserve_space: bool = False) -> str:
    """Build XML string with font switching for mixed Chinese/symbol text."""
    escape_fn = _escape_html_preserve_space if preserve_space else _escape_html

    has_symbol = any(_is_symbol_char(c) for c in text)
    if not has_symbol:
        return escape_fn(text) or "&nbsp;"

    fragments = []
    current_is_symbol = None
    buf = []

    def flush():
        nonlocal buf, current_is_symbol
        if not buf:
            return
        chunk = ''.join(buf)
        escaped = escape_fn(chunk)
        if escaped:
            font = symbol_font if current_is_symbol else normal_font
            fragments.append(f'<font name="{font}">{escaped}</font>')
        buf = []

    for ch in text:
        is_sym = _is_symbol_char(ch)
        if current_is_symbol is None:
            current_is_symbol = is_sym
        elif is_sym != current_is_symbol:
            flush()
            current_is_symbol = is_sym
        buf.append(ch)
    flush()
    return ''.join(fragments) or "&nbsp;"
    
def _md_to_xml(text: str, normal_font: str, symbol_font: str) -> str:
    """Convert inline markdown to reportlab XML with proper font handling."""
    # Bold
    def _bold_repl(m):
        inner = _render_mixed_line(m.group(1), normal_font, symbol_font)
        return f'<b>{inner}</b>'
    text = re.sub(r'\*\*(.+?)\*\*', _bold_repl, text)
    # Italic
    def _italic_repl(m):
        inner = _render_mixed_line(m.group(1), normal_font, symbol_font)
        return f'<i>{inner}</i>'
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', _italic_repl, text)
    # Inline code
    def _code_repl(m):
        return _escape_html(m.group(1))
    text = re.sub(r'`([^`]+)`', _code_repl, text)
    # Remaining plain text segments need symbol font handling
    # We process what's left that isn't already in XML tags
    return text


def _markdown_to_plain(text: str) -> str:
    """Strip markdown syntax, return plain text. No HTML tags to avoid font issues."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
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
    """Check if line is part of a flowchart using box-drawing / arrow characters."""
    stripped = line.strip()
    if not stripped:
        return False
    sym_count = sum(1 for c in stripped if _is_symbol_char(c))
    return sym_count >= 2


def _render_markdown(story, markdown_text: str, h_style, h3_style, body_style, quote_style, code_style, mono_style, table_style, mono_box_style, font_normal: str, font_symbol: str):
    """Render markdown text into reportlab story with full formatting support."""
    # Normalize literal \n sequences to real newlines
    markdown_text = _normalize_content(markdown_text)

    if not markdown_text.strip():
        return

    fence = chr(96) * 3
    in_code = False
    flowchart_buffer = []
    lines = markdown_text.splitlines()
    i = 0

    def _make_body(text):
        """Convert markdown inline formatting to XML for body paragraphs."""
        return _md_to_xml(text, font_normal, font_symbol)

    def _make_mixed(text):
        """Render text with mixed font support preserving spaces."""
        return _render_mixed_line(text, font_normal, font_symbol, preserve_space=True)

    def _flush_flowchart():
        nonlocal flowchart_buffer
        if flowchart_buffer:
            story.append(Spacer(1, 4))
            for fline in flowchart_buffer:
                # Keep the whole line in one font to preserve box alignment.
                safe = _escape_html_preserve_space(fline)
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
            safe = _escape_html_preserve_space(line)
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
        if _is_flowchart_line(line):
            flowchart_buffer.append(line)
            i += 1
            continue
        elif flowchart_buffer:
            _flush_flowchart()

        # Headings
        if stripped.startswith("### "):
            story.append(Paragraph(_make_body(stripped[4:]), h3_style))
            i += 1
            continue
        if stripped.startswith("## "):
            story.append(Paragraph(_make_body(stripped[3:]), h_style))
            i += 1
            continue
        if stripped.startswith("# "):
            story.append(Paragraph(_make_body(stripped[2:]), h_style))
            i += 1
            continue

        # Quote
        if stripped.startswith("> "):
            story.append(Paragraph(_make_body(stripped[2:]), quote_style))
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

        # List items
        if stripped.startswith("- ") or stripped.startswith("* "):
            content = stripped[2:]
            if content.startswith("[ ] ") or content.startswith("[x] ") or content.startswith("[X] "):
                content = content[4:]
            story.append(Paragraph(_make_body(content), body_style))
            i += 1
            continue

        # Ordered list
        ordered = re.match(r"^(\d+)[.\)]\s+(.*)$", stripped)
        if ordered:
            story.append(Paragraph(_make_body(stripped), body_style))
            i += 1
            continue

        # Regular paragraph
        story.append(Paragraph(_make_body(stripped), body_style))
        i += 1

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
    font_normal, font_bold, font_italic, font_symbol = _register_chinese_fonts()
    flowchart_font = _register_flowchart_font(font_normal)

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
        fontName=flowchart_font,
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

    # Insert screenshot as header image right below the title
    screenshot_path = payload.get("screenshotPath")
    if screenshot_path and Path(screenshot_path).exists():
        try:
            img = Image(screenshot_path)
            # Scale to fit page width while maintaining aspect ratio
            page_width = A4[0] - 36 * mm
            ratio = page_width / img.drawWidth
            img.drawWidth = page_width
            img.drawHeight = img.drawHeight * ratio
            # Cap max height
            max_h = 120 * mm
            if img.drawHeight > max_h:
                scale = max_h / img.drawHeight
                img.drawHeight = max_h
                img.drawWidth = img.drawWidth * scale
            story.append(Spacer(1, 6))
            story.append(img)
            story.append(Spacer(1, 8))
        except Exception as e:
            print(f"Warning: Could not insert screenshot: {e}")

    summary = (payload.get("summary") or "").strip()
    if summary:
        story.append(Paragraph(summary, meta_style))

    tags = [str(tag).strip() for tag in (payload.get("tags") or []) if str(tag).strip()]
    if tags:
        story.append(Paragraph("Tags: " + "  |  ".join(tags), meta_style))

    content_markdown = (payload.get("contentMarkdown") or "").strip()
    if content_markdown:
        _render_markdown(story, content_markdown, h_style, h3_style, body_style, quote_style, code_style, mono_style, table_style, None, font_normal, font_symbol)

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
    
    # Delete JSON intermediate file and screenshot after successful PDF generation
    try:
        if payload_path.exists():
            payload_path.unlink()
            print(f"Cleaned up: {payload_path}")
    except Exception as e:
        print(f"Warning: Could not delete JSON file: {e}")
    
    # Delete screenshot file since it's now embedded in the PDF
    screenshot_path = payload.get("screenshotPath")
    if screenshot_path:
        try:
            sp = Path(screenshot_path)
            if sp.exists():
                sp.unlink()
                print(f"Cleaned up screenshot: {sp}")
        except Exception as e:
            print(f"Warning: Could not delete screenshot: {e}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
