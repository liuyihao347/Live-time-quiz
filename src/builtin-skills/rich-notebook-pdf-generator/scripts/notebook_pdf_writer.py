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
except Exception:
    A4 = None


def _safe_hex_color(value: str | None, fallback: str) -> str:
    """Validate and return hex color, fallback if invalid."""
    if not isinstance(value, str):
        return fallback
    text = value.strip()
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", text):
        return text
    return fallback


def _render_markdown(story, markdown_text: str, h_style, h3_style, body_style, quote_style, code_style):
    """Render markdown text into reportlab story."""
    if not markdown_text.strip():
        return

    fence = chr(96) * 3
    in_code = False

    for raw in markdown_text.splitlines():
        line = raw.rstrip("\n")
        stripped = line.strip()

        if stripped.startswith(fence):
            in_code = not in_code
            continue

        if in_code:
            safe = (
                line.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace(" ", "&nbsp;")
            )
            story.append(Paragraph(safe or "&nbsp;", code_style))
            continue

        if not stripped:
            story.append(Spacer(1, 4))
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(stripped[4:], h3_style))
            continue

        if stripped.startswith("## "):
            story.append(Paragraph(stripped[3:], h_style))
            continue

        if stripped.startswith("# "):
            story.append(Paragraph(stripped[2:], h_style))
            continue

        if stripped.startswith("> "):
            story.append(Paragraph(stripped[2:], quote_style))
            continue

        if stripped.startswith("- ") or stripped.startswith("* "):
            story.append(Paragraph(f"• {stripped[2:]}", body_style))
            continue

        ordered = re.match(r"^\d+[\.)]\s+(.*)$", stripped)
        if ordered:
            story.append(Paragraph(stripped, body_style))
            continue

        story.append(Paragraph(stripped, body_style))


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

    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=heading_color,
        spaceAfter=10,
    )
    h_style = ParagraphStyle(
        "HeadingStyle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=heading_color,
        spaceBefore=10,
        spaceAfter=6,
    )
    h3_style = ParagraphStyle(
        "Heading3Style",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10.8,
        leading=14,
        textColor=colors.HexColor("#1F2937"),
        spaceBefore=6,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor("#111827"),
    )
    quote_style = ParagraphStyle(
        "QuoteStyle",
        parent=styles["BodyText"],
        fontName="Helvetica-Oblique",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        leftIndent=10,
        borderPadding=6,
    )
    code_style = ParagraphStyle(
        "CodeStyle",
        parent=styles["BodyText"],
        fontName="Courier",
        fontSize=9.2,
        leading=12,
        textColor=colors.HexColor("#0F172A"),
    )
    meta_style = ParagraphStyle(
        "MetaStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
    )

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
        _render_markdown(story, content_markdown, h_style, h3_style, body_style, quote_style, code_style)

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
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
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
    if len(sys.argv) < 3:
        print("Usage: python notebook_pdf_writer.py <payload.json> <out.pdf>")
        return 1
    payload_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    _write_pdf(out_path, payload)
    print(str(out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
