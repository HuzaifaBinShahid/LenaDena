from pathlib import Path
from math import ceil

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_ALIGN_VERTICAL, WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path("/Users/huzaifabinshahid/Documents/Codex/2026-09-12/i-have-an-idea-regarding-building")
WORK = ROOT / "work"
ASSETS = WORK / "report_assets"
OUTPUT = ROOT / "outputs" / "friend_group_expense_app_product_plan_v5.docx"

ASSETS.mkdir(parents=True, exist_ok=True)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

INK = "17212B"
INK_2 = "2C3947"
CANVAS = "F7F3EA"
MINT = "35C3A5"
MINT_PALE = "EAF8F4"
CORAL = "FF7A6B"
CORAL_PALE = "FFF0ED"
AMBER = "F5C451"
AMBER_PALE = "FFF8DF"
SLATE = "637083"
LIGHT = "F3F6F7"
BORDER = "D9D9D9"
WHITE = "FFFFFF"
BLACK = "000000"
DANGER = "B4233A"


def rgb(hex_value):
    return RGBColor.from_string(hex_value)


def find_font(bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    return None


FONT_REGULAR = find_font(False)
FONT_BOLD = find_font(True)


def pil_font(size, bold=False):
    path = FONT_BOLD if bold else FONT_REGULAR
    if path:
        return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def wrap(draw, text, font, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(draw, xy, text, font, fill, max_width, line_gap=8, anchor=None):
    x, y = xy
    lines = wrap(draw, text, font, max_width)
    bbox = font.getbbox("Ag")
    line_h = bbox[3] - bbox[1] + line_gap
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill, anchor=anchor)
        y += line_h
    return y


def create_settlement_flow(path):
    image = Image.new("RGB", (1700, 760), "#FFFFFF")
    draw = ImageDraw.Draw(image)
    title = pil_font(48, True)
    label = pil_font(28, True)
    body = pil_font(23, False)
    small = pil_font(21, False)
    draw.text((70, 55), "Verified settlement state model", fill="#17212B", font=title)
    stages = [
        ("Open balance", "A member owes another member", "#F3F6F7"),
        ("Payment claimed", "Debtor taps I paid and adds proof", "#FFF8DF"),
        ("Awaiting review", "Recipient checks amount and evidence", "#EAF8F4"),
        ("Confirmed", "Recipient taps Money received", "#D9F4EC"),
    ]
    x_positions = [70, 475, 880, 1285]
    y = 220
    box_w, box_h = 320, 210
    for idx, ((heading, desc, fill), x) in enumerate(zip(stages, x_positions)):
        draw.rounded_rectangle((x, y, x + box_w, y + box_h), radius=26, fill=fill, outline="#D9D9D9", width=3)
        draw.text((x + 25, y + 28), heading, fill="#17212B", font=label)
        draw_wrapped(draw, (x + 25, y + 85), desc, body, "#2C3947", box_w - 50, 7)
        if idx < len(stages) - 1:
            ax1 = x + box_w + 18
            ax2 = x_positions[idx + 1] - 18
            ay = y + box_h // 2
            draw.line((ax1, ay, ax2, ay), fill="#637083", width=5)
            draw.polygon([(ax2, ay), (ax2 - 18, ay - 12), (ax2 - 18, ay + 12)], fill="#637083")
    reject_x, reject_y = 960, 535
    draw.line((1040, 430, 1040, reject_y), fill="#B4233A", width=4)
    draw.polygon([(1040, reject_y), (1030, reject_y - 16), (1050, reject_y - 16)], fill="#B4233A")
    draw.rounded_rectangle((reject_x, reject_y, reject_x + 460, reject_y + 140), radius=24, fill="#FFF0ED", outline="#FF7A6B", width=3)
    draw.text((reject_x + 24, reject_y + 22), "Needs attention", fill="#B4233A", font=label)
    draw.text((reject_x + 24, reject_y + 72), "Wrong amount, unclear proof, or money not received", fill="#2C3947", font=small)
    image.save(path)


def create_architecture(path):
    image = Image.new("RGB", (1700, 980), "#FFFFFF")
    draw = ImageDraw.Draw(image)
    title = pil_font(48, True)
    heading = pil_font(27, True)
    body = pil_font(21, False)
    draw.text((70, 55), "Recommended MVP architecture", fill="#17212B", font=title)

    boxes = [
        (70, 175, 445, 345, "frontend/", "React Native plus Expo\nTypeScript and NativeWind\nTop tabs and personal plan\nOne Button, Input, and Spinner", "#F7F3EA"),
        (625, 175, 445, 345, "backend/", "Node.js plus TypeScript and Fastify\nJWT authentication\nLedger and invitation rules\nOpenAPI contract and idempotency", "#EAF8F4"),
        (1180, 120, 450, 400, "Supabase", "Auth for verified email\nPostgres with RLS and constraints\nPrivate Storage for evidence\nBackups and database migrations", "#F3F6F7"),
        (70, 620, 445, 190, "On device input", "Speech, camera, shared image, and OCR\nMedia stays local until Save", "#EAF8F4"),
        (625, 620, 445, 190, "Backend worker", "Outbox, reminders, locks, retries,\nand delivery webhook processing", "#FFF8DF"),
        (1180, 620, 450, 190, "Email delivery", "Resend transactional email\nBounce and complaint webhooks", "#FFF0ED"),
    ]
    for x, y, w, h, name, desc, fill in boxes:
        draw.rectangle((x, y, x + w, y + h), fill=fill, outline="#D9D9D9", width=3)
        draw.text((x + 24, y + 24), name, fill="#17212B", font=heading)
        lines = desc.split("\n")
        yy = y + 78
        for line in lines:
            draw.text((x + 24, yy), line, fill="#2C3947", font=body)
            yy += 38

    arrows = [
        ((515, 345), (625, 345)),
        ((1070, 345), (1180, 345)),
        ((292, 520), (292, 620)),
        ((848, 520), (848, 620)),
        ((1070, 715), (1180, 715)),
    ]
    for (x1, y1), (x2, y2) in arrows:
        draw.line((x1, y1, x2, y2), fill="#637083", width=5)
        if abs(x2 - x1) > abs(y2 - y1):
            draw.polygon([(x2, y2), (x2 - 18, y2 - 12), (x2 - 18, y2 + 12)], fill="#637083")
        else:
            draw.polygon([(x2, y2), (x2 - 12, y2 - 18), (x2 + 12, y2 - 18)], fill="#637083")
    draw.text((70, 900), "The app sends a Supabase access token to the Node API; privileged database keys never ship in the frontend", fill="#637083", font=body)
    image.save(path)


def create_share_import_flow(path):
    image = Image.new("RGB", (1700, 850), "#FFFFFF")
    draw = ImageDraw.Draw(image)
    title = pil_font(48, True)
    label = pil_font(27, True)
    body = pil_font(21, False)
    small = pil_font(19, False)
    draw.text((70, 55), "WhatsApp photo to reviewed expense", fill="#17212B", font=title)
    stages = [
        (70, 220, 280, 215, "1 Share", "Member shares one receipt photo from WhatsApp", "#F7F3EA"),
        (400, 220, 280, 215, "2 Receive", "The operating system grants temporary image access", "#EAF8F4"),
        (730, 220, 280, 215, "3 Describe", "Confirm event name, event date, and total", "#FFF8DF"),
        (1060, 220, 280, 215, "4 Divide", "Choose group, payer, people, and split method", "#F7F3EA"),
        (1390, 220, 240, 215, "5 Save", "Review exact shares, then confirm", "#EAF8F4"),
    ]
    for idx, (x, y, w, h, heading, desc, fill) in enumerate(stages):
        draw.rounded_rectangle((x, y, x + w, y + h), radius=24, fill=fill, outline="#D9D9D9", width=3)
        draw.text((x + 22, y + 25), heading, fill="#17212B", font=label)
        draw_wrapped(draw, (x + 22, y + 82), desc, body, "#2C3947", w - 44, 7)
        if idx < len(stages) - 1:
            ax1 = x + w + 12
            ax2 = stages[idx + 1][0] - 12
            ay = y + h // 2
            draw.line((ax1, ay, ax2, ay), fill="#637083", width=5)
            draw.polygon([(ax2, ay), (ax2 - 16, ay - 11), (ax2 - 16, ay + 11)], fill="#637083")
    draw.rounded_rectangle((220, 560, 1480, 715), radius=24, fill="#FFF0ED", outline="#FF7A6B", width=3)
    draw.text((250, 585), "Privacy boundary", fill="#B4233A", font=label)
    draw_wrapped(
        draw,
        (250, 635),
        "The app receives only the selected image. It cannot read the WhatsApp chat, its members, or message history. The temporary copy is deleted unless the member keeps the receipt.",
        small,
        "#2C3947",
        1200,
        7,
    )
    image.save(path)


def create_mobile_concept(path):
    image = Image.new("RGB", (1840, 1120), "#FFFFFF")
    draw = ImageDraw.Draw(image)
    title = pil_font(48, True)
    h1 = pil_font(31, True)
    h2 = pil_font(25, True)
    body = pil_font(21, False)
    amount = pil_font(39, True)
    tiny = pil_font(18, False)
    draw.text((70, 45), "Dusk Blend mobile concept", fill="#17212B", font=title)
    draw.text((70, 104), "A dark summary band over warm light working surfaces", fill="#637083", font=body)

    def phone(x, heading):
        y = 170
        w, h = 500, 860
        draw.rounded_rectangle((x, y, x + w, y + h), radius=52, fill="#17212B", outline="#17212B", width=4)
        draw.rounded_rectangle((x + 12, y + 12, x + w - 12, y + h - 12), radius=44, fill="#F7F3EA")
        draw.rectangle((x + 12, y + 12, x + w - 12, y + 185), fill="#17212B")
        draw.text((x + 35, y + 62), heading, fill="#FFFFFF", font=h1)
        return x + 35, y + 215, w - 70

    x1, y1, cw = phone(70, "My plan")
    tab_labels = ["Plan", "Groups", "Reviews", "Activity"]
    tab_w = cw / len(tab_labels)
    for idx, label_text in enumerate(tab_labels):
        tx = x1 + idx * tab_w
        if idx == 0:
            draw.rounded_rectangle((tx, y1, tx + tab_w - 5, y1 + 54), radius=16, fill="#EAF8F4")
        draw.text((tx + (tab_w - 5) / 2, y1 + 27), label_text, fill="#17212B" if idx == 0 else "#637083", font=tiny, anchor="mm")
    draw.text((x1, y1 + 82), "Your balance", fill="#637083", font=body)
    draw.text((x1, y1 + 122), "You owe 2 friends", fill="#17212B", font=amount)
    draw.rounded_rectangle((x1, y1 + 192, x1 + cw, y1 + 322), radius=24, fill="#FFFFFF", outline="#D9D9D9", width=2)
    draw.text((x1 + 20, y1 + 215), "Weekend crew", fill="#17212B", font=h2)
    draw.text((x1 + 20, y1 + 258), "You owe Sara", fill="#637083", font=body)
    draw.text((x1 + cw - 150, y1 + 253), "Rs 2,400", fill="#B4233A", font=h2)
    draw.rounded_rectangle((x1, y1 + 342, x1 + cw, y1 + 472), radius=24, fill="#FFFFFF", outline="#D9D9D9", width=2)
    draw.text((x1 + 20, y1 + 365), "Flat bills", fill="#17212B", font=h2)
    draw.text((x1 + 20, y1 + 408), "Hamza owes you", fill="#637083", font=body)
    draw.text((x1 + cw - 155, y1 + 403), "Rs 1,100", fill="#087C67", font=h2)
    draw.rounded_rectangle((x1, y1 + 520, x1 + cw, y1 + 592), radius=22, fill="#35C3A5")
    draw.text((x1 + cw / 2, y1 + 556), "Add expense", fill="#17212B", font=h2, anchor="mm")

    x2, y2, cw2 = phone(670, "Add expense")
    draw.text((x2, y2), "Amount", fill="#637083", font=body)
    draw.text((x2, y2 + 37), "Rs 6,000", fill="#17212B", font=amount)
    fields = [
        ("Event name", "Dinner at Monal"),
        ("Event date", "12 Sep 2026"),
        ("Paid by", "You"),
        ("Split with", "You, Sara, Hamza"),
        ("Split", "Equally  Rs 2,000 each"),
    ]
    yy = y2 + 115
    for label_text, value in fields:
        draw.rounded_rectangle((x2, yy, x2 + cw2, yy + 74), radius=18, fill="#FFFFFF", outline="#D9D9D9", width=2)
        draw.text((x2 + 18, yy + 8), label_text, fill="#637083", font=tiny)
        draw.text((x2 + 18, yy + 38), value, fill="#17212B", font=body)
        yy += 87
    draw.rounded_rectangle((x2, yy + 10, x2 + cw2, yy + 78), radius=22, fill="#35C3A5")
    draw.text((x2 + cw2 / 2, yy + 44), "Save expense", fill="#17212B", font=h2, anchor="mm")

    x3, y3, cw3 = phone(1270, "Payment review")
    draw.text((x3, y3), "Hamza says he paid", fill="#17212B", font=h1)
    draw.text((x3, y3 + 48), "Rs 1,100  •  Flat bills", fill="#637083", font=body)
    draw.rounded_rectangle((x3, y3 + 105, x3 + cw3, y3 + 410), radius=24, fill="#FFFFFF", outline="#D9D9D9", width=2)
    draw.rectangle((x3 + 24, y3 + 134, x3 + cw3 - 24, y3 + 325), fill="#E8EDF0")
    draw.text((x3 + cw3 / 2, y3 + 230), "Payment proof preview", fill="#637083", font=body, anchor="mm")
    draw.text((x3 + 24, y3 + 350), "Submitted today at 4 32 PM", fill="#637083", font=tiny)
    draw.rounded_rectangle((x3, y3 + 440, x3 + cw3, y3 + 518), radius=22, fill="#35C3A5")
    draw.text((x3 + cw3 / 2, y3 + 479), "Money received", fill="#17212B", font=h2, anchor="mm")
    draw.rounded_rectangle((x3, y3 + 540, x3 + cw3, y3 + 618), radius=22, fill="#FFF0ED", outline="#FF7A6B", width=2)
    draw.text((x3 + cw3 / 2, y3 + 579), "Needs attention", fill="#B4233A", font=h2, anchor="mm")
    image.save(path)


def set_cell_fill(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color=BORDER, size="6"):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_cell_margins(cell, top=110, start=120, bottom=110, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def prevent_table_row_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def add_hyperlink(paragraph, text, url, color="1F5E8C", underline=True):
    part = paragraph.part
    rel_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), rel_id)
    run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    color_el = OxmlElement("w:color")
    color_el.set(qn("w:val"), color)
    r_pr.append(color_el)
    if underline:
        u = OxmlElement("w:u")
        u.set(qn("w:val"), "single")
        r_pr.append(u)
    r_fonts = OxmlElement("w:rFonts")
    r_fonts.set(qn("w:ascii"), "Arial")
    r_fonts.set(qn("w:hAnsi"), "Arial")
    r_pr.append(r_fonts)
    run.append(r_pr)
    text_el = OxmlElement("w:t")
    text_el.text = text
    run.append(text_el)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("Page ")
    run.font.size = Pt(9)
    run.font.color.rgb = rgb(SLATE)
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text_node = OxmlElement("w:t")
    text_node.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, separate, text_node, end])


def add_superscript_citation(paragraph, numbers):
    text = ",".join(str(n) for n in numbers)
    run = paragraph.add_run(text)
    run.font.superscript = True
    run.font.size = Pt(8)
    run.font.color.rgb = rgb(SLATE)


def add_para(doc, text="", bold_lead=None, citations=None, style=None, keep=False):
    p = doc.add_paragraph(style=style)
    if bold_lead:
        r = p.add_run(bold_lead)
        r.bold = True
        r.font.color.rgb = rgb(INK)
    r = p.add_run(text)
    r.font.color.rgb = rgb(INK_2)
    if citations:
        add_superscript_citation(p, citations)
    if keep:
        p.paragraph_format.keep_with_next = True
    return p


def add_bullets(doc, items, level=0):
    for item in items:
        p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
        if isinstance(item, tuple):
            lead, text = item
            run = p.add_run(lead)
            run.bold = True
            run.font.color.rgb = rgb(INK)
            p.add_run(text)
        else:
            p.add_run(item)
        for run in p.runs:
            run.font.color.rgb = rgb(INK_2)


def add_numbered(doc, items, compact=False):
    for number, item in enumerate(items, start=1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.28)
        p.paragraph_format.first_line_indent = Inches(-0.28)
        p.paragraph_format.space_after = Pt(1.5 if compact else 3.5)
        nr = p.add_run(f"{number}.  ")
        nr.bold = True
        nr.font.color.rgb = rgb(INK)
        if isinstance(item, tuple):
            lead, text = item
            r = p.add_run(lead)
            r.bold = True
            r.font.color.rgb = rgb(INK)
            p.add_run(text)
        else:
            p.add_run(item)
        for run in p.runs:
            run.font.color.rgb = rgb(INK_2)
            if compact:
                run.font.size = Pt(10.3)


def add_table(doc, headers, rows, widths=None, font_size=9.5, header_fill=INK):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    header = table.rows[0]
    set_repeat_table_header(header)
    prevent_table_row_split(header)
    for idx, text in enumerate(headers):
        cell = header.cells[idx]
        cell.text = str(text)
        set_cell_fill(cell, header_fill)
        set_cell_border(cell)
        set_cell_margins(cell, 120, 120, 120, 120)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(0)
            for run in p.runs:
                run.bold = True
                run.font.size = Pt(font_size)
                run.font.color.rgb = rgb(WHITE)
                run.font.name = "Arial"
    for ridx, row_data in enumerate(rows):
        row = table.add_row()
        prevent_table_row_split(row)
        for idx, value in enumerate(row_data):
            cell = row.cells[idx]
            cell.text = str(value)
            if ridx % 2 == 1:
                set_cell_fill(cell, LIGHT)
            set_cell_border(cell)
            set_cell_margins(cell, 105, 115, 105, 115)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.05
                for run in p.runs:
                    run.font.size = Pt(font_size)
                    run.font.color.rgb = rgb(INK_2)
                    run.font.name = "Arial"
        if widths:
            for idx, width in enumerate(widths):
                row.cells[idx].width = Inches(width)
    if widths:
        for idx, width in enumerate(widths):
            header.cells[idx].width = Inches(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return table


def add_figure(doc, image_path, width, caption):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    inline_shape = p.add_run().add_picture(str(image_path), width=Inches(width))
    inline_shape._inline.docPr.set("descr", caption)
    inline_shape._inline.docPr.set("title", image_path.stem.replace("_", " ").title())
    cap = doc.add_paragraph(caption)
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(10)
    for run in cap.runs:
        run.italic = True
        run.font.size = Pt(9)
        run.font.color.rgb = rgb(SLATE)


def new_page(doc):
    return None


create_settlement_flow(ASSETS / "settlement_flow.png")
create_architecture(ASSETS / "architecture.png")
create_mobile_concept(ASSETS / "mobile_concept.png")
create_share_import_flow(ASSETS / "share_import_flow.png")

doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.5)
section.page_height = Inches(11)
section.top_margin = Inches(0.72)
section.bottom_margin = Inches(0.95)
section.left_margin = Inches(0.78)
section.right_margin = Inches(0.78)
section.header_distance = Inches(0.30)
section.footer_distance = Inches(0.28)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Arial"
normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
normal.font.size = Pt(10.6)
normal.font.color.rgb = rgb(INK_2)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.08

title_style = styles["Title"]
title_style.font.name = "Arial"
title_style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
title_style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
title_style.font.size = Pt(27)
title_style.font.bold = True
title_style.font.color.rgb = rgb(BLACK)
title_style.paragraph_format.space_after = Pt(15)
title_ppr = title_style._element.get_or_add_pPr()
title_border = title_ppr.find(qn("w:pBdr"))
if title_border is not None:
    title_ppr.remove(title_border)

for style_name, size, before, after in [
    ("Heading 1", 18, 9, 8),
    ("Heading 2", 13.5, 8, 5),
    ("Heading 3", 11.5, 6, 3),
]:
    style = styles[style_name]
    style.font.name = "Arial"
    style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = rgb(BLACK)
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)
    style.paragraph_format.keep_with_next = True

for style_name in ("List Bullet", "List Bullet 2", "List Number"):
    style = styles[style_name]
    style.font.name = "Arial"
    style.font.size = Pt(10.4)
    style.font.color.rgb = rgb(INK_2)
    style.paragraph_format.space_after = Pt(3.5)
    style.paragraph_format.line_spacing = 1.05

header = section.header
hp = header.paragraphs[0]
hp.text = "Friend Group Expense App Product Plan"
hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
hp.paragraph_format.space_after = Pt(0)
for run in hp.runs:
    run.font.name = "Arial"
    run.font.size = Pt(8.5)
    run.font.color.rgb = rgb(SLATE)

footer = section.footer
fp = footer.paragraphs[0]
add_page_number(fp)


title_paragraph = doc.add_paragraph("Friend Group Expense App Product Plan and Architecture", style="Title")
title_direct_ppr = title_paragraph._p.get_or_add_pPr()
direct_border = OxmlElement("w:pBdr")
for edge in ("top", "left", "bottom", "right", "between"):
    edge_el = OxmlElement(f"w:{edge}")
    edge_el.set(qn("w:val"), "nil")
    direct_border.append(edge_el)
title_direct_ppr.append(direct_border)
add_para(
    doc,
    "Build the first version as a mobile first React Native application centered on one unusually clear workflow: a member records a shared expense with a required event name and event date, the app calculates who owes whom, the debtor marks the payment as sent with optional proof, and the recipient confirms that the money arrived. Every signed in member gets a private My plan view and can create their own groups. Voice dictation, receipt OCR, and photos explicitly shared from WhatsApp should enter the same reviewed expense form without a transcription key, WhatsApp API, or media processing server. The product should track payments made elsewhere and must not hold money in the MVP.",
)
add_para(
    doc,
    "The product should not compete by copying every feature in Splitwise or tricount. The closest current competitor already supports browser joining, nudges, mark as paid, and recipient confirmation. The opportunity is a more focused verification inbox, safer proof handling, and a friend group personality layer that makes reminders warm without becoming harassment.",
    citations=[1, 4, 8, 9],
)

doc.add_heading("Recommended product direction", level=1)
add_bullets(doc, [
    ("Positioning  ", "Shared expenses that close only when both people agree the payment landed."),
    ("MVP platform  ", "A TypeScript React Native frontend in frontend and a TypeScript Node.js API in backend, connected through a versioned HTTPS contract."),
    ("Account model  ", "Name and verified email only, using a passwordless magic link or email code."),
    ("Personal workspace  ", "My plan is the default member specific dashboard; every member may create and participate in multiple groups."),
    ("Primary wedge  ", "A settlement review queue with proof, confirmation, rejection, audit history, and reminders that automatically pause when a payment is under review."),
    ("Smart entry  ", "On device speech, receipt OCR, and share sheet photo intake that suggest field values but never save financial data without review."),
    ("Frontend system  ", "NativeWind supplies Tailwind style utilities over shared design tokens, with exactly one base Button, Input, and Spinner component."),
    ("Default visual theme  ", "Dusk Blend, with a charcoal summary band, warm off white working surfaces, mint actions, coral debt states, and amber humor accents."),
    ("Working name  ", "LenaDena, pending trademark, domain, social handle, and app store clearance."),
])

doc.add_heading("Contents", level=1)
contents = [
    "Research findings and competitive benchmark",
    "Product strategy and intended users",
    "MVP scope and core journeys",
    "Information architecture and screen design",
    "On device voice transcription and OCR",
    "WhatsApp and native share import",
    "Visual system, component library, theme, and splash",
    "Settlement state model",
    "Technical architecture and data model",
    "Email reminders and friend group tone",
    "Privacy security and abuse prevention",
    "Delivery roadmap, success metrics, naming, and risk decisions",
]
add_numbered(doc, contents, compact=True)

new_page(doc)
doc.add_heading("Research findings and competitive benchmark", level=1)
add_para(
    doc,
    "Current products prove that group expense tracking is a well understood behavior. Splitwise offers broad split methods, groups, external settlements, recurring expenses, and receipt scanning in its paid tier. Tricount emphasizes shared entry, offline use, uneven splits, photos, multiple currencies, and payment requests. Settle Up and Splid compete on understandable balances, reduced transaction counts, offline use, and low sign up friction.",
    citations=[1, 2, 3, 4, 5, 6, 7],
)
add_para(
    doc,
    "The proposed verification loop is not unique by itself. KittyPot publicly describes a five step sequence that ends with the debtor marking a payment as paid and the recipient confirming that it landed. It also supports browser joining, links, codes, QR invitations, receipts, and nudges. Bexbox presents proof backed IOUs and partial payments. These products validate the need but narrow the differentiation available.",
    citations=[8, 9],
)

competitor_rows = [
    ["Splitwise", "Breadth and mature balance tracking", "Groups, flexible splits, external settlement, recurring expenses", "Feature density and paid gating leave room for a calmer core flow", "Use as a completeness benchmark, not a screen template", "1 2 3"],
    ["tricount", "Fast group collaboration", "Link invites, shared entry, offline use, photos, currencies, payment requests", "Bank request availability is regional", "Copy its plain language and fast group entry", "4 5"],
    ["Settle Up", "Clear settlement suggestions", "Sync across a group and fewer suggested transfers", "Public material emphasizes accounting over verification", "Make the final who pays whom answer equally obvious", "6"],
    ["Splid", "Very low friction", "No sign up, offline mode, more than 150 currencies, export", "Lower identity assurance is a poor fit for proof confirmation", "Preserve its speed while verifying email ownership", "7"],
    ["KittyPot", "Closest workflow match", "Browser join, link code and QR invite, receipts, nudges, mark paid and recipient confirms", "The proposed idea needs a sharper reason to switch", "Differentiate through verification inbox, proof privacy, and email personality", "8"],
    ["Bexbox", "Evidence first ledger", "Proof attachments, partial payments, private ledgers, link and QR invites", "Narrow and Android focused public positioning", "Treat payment evidence as sensitive content", "9"],
]
add_table(
    doc,
    ["Product", "Strength", "Relevant features", "Opening", "Design lesson", "Sources"],
    competitor_rows,
    widths=[0.75, 1.1, 1.65, 1.6, 1.65, 0.45],
    font_size=8.3,
)

doc.add_heading("What the market evidence changes", level=2)
add_bullets(doc, [
    "Do not describe bilateral payment confirmation as a first in the category.",
    "Make the settlement inbox the fastest and best explained part of the product, because that is where the proposed app can feel meaningfully different.",
    "Keep the first version small. Mature competitors already cover currencies, charts, exports, and payment integrations; matching that breadth would delay learning. Include voice and OCR only as assisted entry, not as an automatic bookkeeping system.",
    "Remove app download as a condition for invite acceptance. Current competitors show that browser based joining is expected.",
    "Avoid a public trust score. The useful outcome is a shared record, while a reputation score can turn friendly debt into social punishment.",
])

new_page(doc)
doc.add_heading("Product strategy and intended users", level=1)
doc.add_heading("Product promise", level=2)
add_para(
    doc,
    "The product keeps a shared record of who paid, who owes a share, the name and calendar date of the event, what the share covers, and whether repayment has been confirmed. It removes repeated calculation and gives both sides a clear closing action. It does not replace a bank, wallet, or cash payment method.",
)

doc.add_heading("Initial users", level=2)
user_rows = [
    ["Friend group organizer", "Pays for bookings or meals and currently chases people in chat", "Add an expense in under one minute and see every open settlement"],
    ["Debtor", "Wants the exact amount and an easy way to show payment", "Open one link, review the share, tap I paid, and attach proof"],
    ["Expense recipient", "Needs to know which transfers arrived", "Review a compact queue and confirm or flag each payment"],
    ["Occasional guest", "Does not want another installed app", "Join from a secure browser link and verify email"],
]
add_table(doc, ["User", "Current difficulty", "Required outcome"], user_rows, widths=[1.35, 2.55, 2.95], font_size=9.3)

doc.add_heading("Jobs the MVP should solve", level=2)
add_bullets(doc, [
    "When I cover a group cost, give the event a recognizable name and date, record it before I forget, and divide it without doing arithmetic in chat.",
    "When I open the app, show my own plan first: what I owe, what others owe me, which payments need my review, and the groups I recently used.",
    "When I want a new circle, let me create a group myself, invite friends, and move between my groups without asking a platform administrator.",
    "When a receipt photo is already in WhatsApp, share that one photo into the app and continue from a prepared expense draft instead of downloading and uploading it again.",
    "When I owe money, show exactly why, where to pay outside the app, and what remains after a partial payment.",
    "When I send money, let me mark the payment as sent and provide evidence without exposing that evidence to the entire group.",
    "When someone says they paid me, let me confirm receipt or explain the problem without changing the ledger incorrectly.",
    "When a balance stays open, remind the right person at a reasonable cadence and stop as soon as the state changes.",
])

doc.add_heading("Positioning boundaries", level=2)
add_para(doc, "The app should use words such as track, record, claimed, and confirmed. It should not say that it processed, transferred, secured, or guaranteed a payment. Every settlement screen should state that money moves outside the app.")
add_para(doc, "The original expense payer is the recipient or creditor during repayment. The member who owes the share is the debtor. Interface labels should be written from the viewer's perspective: I paid for the debtor and Money received for the recipient. This avoids the ambiguous word payer.")

new_page(doc)
doc.add_heading("MVP scope and core journeys", level=1)
doc.add_heading("MVP capability list", level=2)
mvp_rows = [
    ["Identity", "Name, verified email, magic link or six digit email code, profile theme, private My plan dashboard"],
    ["Groups", "Every member can create multiple groups, becoming that group's owner; base currency, group accent, roles, invite link, invite email, revoke invite"],
    ["Expenses", "Required event name and event date, amount, optional merchant or note, one expense payer, equal, exact value, or percentage split, optional receipt, edit history"],
    ["Assisted entry", "Field dictation, receipt OCR, camera capture, and one image received from the native share sheet, with mandatory review"],
    ["Balances", "Per group and overall amounts, who owes whom, expense level explanation, no hidden simplification"],
    ["Settlements", "Full or partial amount, I paid, optional proof, awaiting review, confirm, needs attention, reversal"],
    ["Notifications", "Invite, new expense, reminder, proof submitted, confirmed, needs attention, bounce handling"],
    ["Controls", "Reminder cadence, quiet hours, mute group, tone preference, data export, account deletion"],
]
add_table(doc, ["Area", "Included behavior"], mvp_rows, widths=[1.25, 5.6], font_size=9.5)

doc.add_heading("Defer until after product validation", level=2)
add_bullets(doc, [
    ("Conversational expense parsing  ", "Do not promise that one spoken sentence can reliably identify every payer, member, amount, and split across every language. Start with field level dictation and reviewed suggestions."),
    ("Downloaded OCR language packs  ", "Add Tesseract based packs only for launch languages that the native OCR engines do not cover and only after device testing."),
    ("Multiple currencies  ", "Use one currency per group at launch. Add conversion only with a dated exchange rate and an explicit source."),
    ("Recurring expenses  ", "Useful for flatmates, but not required to test the verified settlement loop."),
    ("Payment app links  ", "Add region specific deep links after selecting a launch country and checking platform rules."),
    ("Desktop application  ", "Keep the web surface focused on invitations and essential review until the native mobile workflow is validated."),
    ("Debt simplification  ", "Keep off by default because redirected debts are harder to explain and verify."),
])

doc.add_heading("Explicitly out of scope", level=2)
add_para(doc, "The MVP should not hold funds, connect bank accounts, provide credit, arbitrate disputes, expose public payment feeds, calculate a social credit score, or let a member send unlimited reminders. These features raise compliance, security, or relationship risk without proving the main value.")

doc.add_heading("Core journey", level=2)
add_numbered(doc, [
    ("Create or join  ", "A member enters an email address, uses a one time link or code, adds a display name, and either creates a group or enters an invited group."),
    ("Record  ", "The expense payer types, dictates, scans a receipt, or shares one photo from WhatsApp. The member confirms a required Event name and Event date, then chooses the amount, group, payer, participants, and split method before saving. On device tools may suggest the merchant, printed date, and total."),
    ("Review  ", "Every affected member receives a concise notice and can open the expense explanation or raise an issue."),
    ("Settle  ", "The debtor pays elsewhere, returns to the app, taps I paid, enters the amount, and optionally uploads proof."),
    ("Confirm  ", "The recipient reviews the settlement and taps Money received or Needs attention."),
    ("Close  ", "The balance changes only after confirmation. Both members receive a short success message and the audit trail remains visible."),
])

new_page(doc)
doc.add_heading("Information architecture and screen design", level=1)
add_figure(doc, ASSETS / "mobile_concept.png", 7.0, "Original concept showing the member specific My plan dashboard, top tabs, expense entry, and payment review")

doc.add_heading("Personal plan and group ownership", level=2)
add_para(doc, "My plan is the default signed in view for every account. It is not a public plan or a manually maintained checklist: it is a personalized financial action summary derived from the authenticated member's groups, expenses, and settlements. It shows You owe, Owed to you, Awaiting your review, upcoming reminder state, and recent groups. A person sees only records allowed by active memberships and bilateral proof rules.")
add_para(doc, "Every verified member can create multiple groups. The creator becomes that group's owner and may invite members, assign another admin, change group presentation settings, archive the group, or leave after transferring ownership. Creating one group never gives the member access to another group's data. Group roles control administration; ordinary financial actions remain limited by who paid, who owes, and who receives a settlement.")

doc.add_heading("Navigation", level=2)
add_para(doc, "Use a sticky top tab switcher immediately below the signed in header: My plan, Groups, Reviews, and Activity. The selected tab keeps its state when the member opens an item and returns. Show small numeric badges only for actionable reviews, not for ordinary history. Keep profile, theme, and notification settings behind the member avatar. A single persistent Add expense action appears on My plan and Groups. Do not duplicate these destinations in a bottom bar; on compact screens the top tabs scroll horizontally while preserving full labels and accessible roles. Expo Router supplies universal routes and deep links, while React Navigation's top tab integration supports swiping, scrolling tabs, indicators, and badges behind the single TopTabs wrapper.", citations=[15, 16])

top_tab_rows = [
    ["My plan", "Personal balances, due or open items, recent groups, and next actions", "Default after sign in; scoped to the current member"],
    ["Groups", "Groups the member owns or has joined, plus Create group", "Any verified member can create a group"],
    ["Reviews", "Payment claims awaiting this member's confirmation and items needing attention", "Badge counts only decisions the member can make"],
    ["Activity", "Expenses, edits, reminders, claims, confirmations, and reversals", "Filters persist during the current session"],
]
add_table(doc, ["Top tab", "Content", "Behavior"], top_tab_rows, widths=[1.15, 3.55, 2.15], font_size=9.0)

screen_rows = [
    ["Sign in", "Email field, Continue button, code or link confirmation, name only for first use", "A new member reaches the invited group without creating a password"],
    ["My plan", "You owe, Owed to you, Awaiting your review, recent groups, primary Add expense action", "The default view answers what this member needs to do before showing history"],
    ["Groups", "Owned and joined groups, Create group, group balance summaries, invite state", "Every verified member can create a group and open any group they actively belong to"],
    ["Group detail", "Group balance, settle suggestion, members, chronological ledger, invite", "A member can explain any number by opening its expenses"],
    ["Add expense", "Event name, event date, image preview, amount, microphone, Scan receipt, merchant or note, paid by, participants, split method", "Typed, dictated, scanned, and shared photo entry all end in the same reviewable form"],
    ["Import expense", "Source image, discard, keep as receipt, group, event name, event date, OCR suggestions, Continue", "A WhatsApp share opens a draft without saving or uploading anything automatically"],
    ["Settle", "Recipient, amount, external payment note, I paid, optional proof", "Payment evidence is not required when friends trust each other"],
    ["Payment review", "Amount, sender, group, proof, timestamp, Money received, Needs attention", "No unrelated actions compete with the decision"],
    ["Reviews", "Payment claims awaiting a decision and items needing attention", "Only actionable items for the signed in member receive a badge"],
    ["Activity", "Expenses, edits, reminders, claims, confirmations, reversals", "Financial history is readable, attributable, and filterable"],
    ["You", "Name, email, theme, tone, reminders, quiet hours, exports, deletion", "People control their own inbox and theme"],
]
add_table(doc, ["Screen", "Primary content", "Acceptance standard"], screen_rows, widths=[1.05, 3.25, 2.55], font_size=8.8)

doc.add_heading("Event identity fields", level=2)
event_field_rows = [
    ["Event name", "Required short title such as Birthday dinner or Murree weekend", "Editable text, 1 to 80 visible characters; never use a receipt filename as the title"],
    ["Event date", "Required calendar date on which the meal, trip, booking, or shared cost occurred", "Default to today for manual entry; OCR may suggest a printed date, but the member must confirm it"],
    ["Merchant or note", "Optional supporting detail such as Monal or Advance tickets", "Keep separate from the event name so reminders remain understandable"],
    ["System timestamps", "Created at and updated at record application activity", "Do not replace the event date when an expense is imported late or edited later"],
]
add_table(doc, ["Field", "Member experience", "Validation and meaning"], event_field_rows, widths=[1.2, 3.05, 2.6], font_size=8.6)
add_para(doc, "Store Event date as a date only value interpreted in the group's timezone, separate from created at and updated at timestamps. Show Event name and Event date together on expense details, activity items, settlement reviews, and reminder emails so friends can recognize what the balance refers to.")

doc.add_heading("Interaction rules", level=2)
add_bullets(doc, [
    "Show the amount before every confirmation action and use the group currency symbol plus ISO code when ambiguity is possible.",
    "Keep destructive or corrective actions behind a More menu, but never hide the dispute action on an open settlement.",
    "Use optimistic updates only for reversible local actions. A confirmed settlement should wait for a committed server response.",
    "Never rely on green and red alone. Pair every state color with a label and icon.",
    "Show the calculation behind every share, including rounding, in one tap.",
    "When a proof is submitted, replace reminder actions with Awaiting review and stop scheduled nudges immediately.",
    "Treat voice, OCR, and shared image output as suggestions. Highlight every inserted field and require the member to review the final event name, event date, amount, payer, people, and split before saving.",
])

new_page(doc)
doc.add_heading("On device voice transcription and OCR", level=1)
add_para(
    doc,
    "The app can provide useful multilingual dictation and OCR without an application owned transcription service or API key. The React Native layer does not perform recognition itself; it bridges the operating system or a bundled native engine. These engines use machine learning internally, so the accurate product promise is on device processing with no cloud AI account, not no AI. Language and offline availability vary by device, operating system, installed models, and script.",
    citations=[26, 27, 29, 30],
)

doc.add_heading("Voice dictation design", level=2)
add_para(
    doc,
    "Use expo speech recognition in an Expo development build. It wraps Apple Speech on iOS and Android SpeechRecognizer behind one React Native interface and exposes on device capability and locale checks. Do not start with the archived React Native Voice package. Native libraries require a development build because Expo Go cannot contain arbitrary native code.",
    citations=[28, 31, 32],
)
voice_rows = [
    ["Language choice", "Default to the app language but let the member choose a BCP 47 locale before recording", "Never label the feature as every language; display only locales reported by the device"],
    ["Offline gate", "Check on device support and installed locale assets before activating the microphone", "If unavailable, offer model download where supported or return to keyboard entry"],
    ["Recording", "Short field level dictation for event name, note, merchant, date, or amount", "Do not upload or retain audio; stop immediately when the member leaves the screen"],
    ["Review", "Show partial text while listening, then place the final transcript in an editable preview", "Apply only after the member taps Use text"],
    ["Parsing", "Use locale aware number and date parsing plus exact group member name matching", "No free form command may silently choose participants or save a split"],
]
add_table(doc, ["Concern", "MVP behavior", "Guardrail"], voice_rows, widths=[1.15, 3.15, 2.55], font_size=8.8)
add_para(
    doc,
    "On iOS, require on device recognition only when SFSpeechRecognizer reports that the selected locale supports it. On Android, check isOnDeviceRecognitionAvailable and the supported locale list, then use the on device recognizer. The ordinary Android recognizer may stream audio to a provider, so strict local mode must not silently fall back to it. Automatic language detection is device dependent and should not replace a visible language selector.",
    citations=[26, 27, 28],
)

doc.add_heading("Receipt OCR design", level=2)
add_para(
    doc,
    "Capture a still image with React Native Vision Camera, then run OCR after the member crops and rotates the receipt. Avoid continuous frame processing in the MVP. On Android, ML Kit Text Recognition v2 can run from a bundled model or a model downloaded through Google Play services. It supports Latin, Chinese, Devanagari, Japanese, and Korean scripts. On iOS, Apple Vision performs text recognition on device and can report the languages supported by the current request revision.",
    citations=[29, 30, 35],
)
ocr_rows = [
    ["Capture", "Edge guide, focus warning, flash control, crop and rotate", "Keep the original local until the member decides whether to attach it"],
    ["Recognize", "Return text blocks and positions on device", "Do not send the image to an OCR server"],
    ["Extract", "Use deterministic patterns for totals, printed event dates, tax, and currency; use a detected merchant only as a starting point for Event name", "A rule can suggest a value but cannot replace user confirmation"],
    ["Review", "Overlay detected candidates and let the member tap the correct total and merchant", "Show the source crop beside each suggestion"],
    ["Persist", "Save confirmed structured fields; upload the receipt only when the member explicitly keeps it", "Delete temporary images and raw OCR text after the flow completes"],
]
add_table(doc, ["Stage", "MVP behavior", "Privacy and accuracy rule"], ocr_rows, widths=[1.0, 3.25, 2.6], font_size=8.8)

doc.add_heading("Language coverage strategy", level=2)
add_para(
    doc,
    "Ship a tested language matrix rather than a universal claim. The first release should support every locale that the phone reports as available for on device dictation and the scripts supported by the selected native OCR engine. For important launch scripts outside that set, a later native Tesseract module can use downloadable or bundled language packs. Tesseract provides data for more than 130 languages and over 35 scripts, including Urdu, but accuracy, binary size, right to left layout, and receipt formatting must be tested per language. Tesseract.js is not the React Native solution because its own documentation says React Native lacks the required WebAssembly support.",
    citations=[33, 34],
)
coverage_rows = [
    ["Tier 1", "Device native speech and OCR", "Fastest path, lowest app size, best privacy; exact coverage varies by device"],
    ["Tier 2", "Optional native Tesseract language pack", "Broader OCR scripts such as Urdu; larger downloads and more QA"],
    ["Fallback", "Keyboard, camera attachment, and manual amount entry", "Always available when recognition is unsupported or uncertain"],
]
add_table(doc, ["Tier", "Implementation", "Product promise"], coverage_rows, widths=[0.9, 2.7, 3.25], font_size=9.0)

new_page(doc)
doc.add_heading("WhatsApp and native share import", level=1)
add_para(
    doc,
    "Treat WhatsApp as an example source application, not as a data integration. A member opens a receipt photo in WhatsApp, taps the operating system Share action, chooses LenaDena, and continues in an Import expense screen. The app receives only that selected image through the iOS share extension or Android share intent. It does not request chat access, infer the people in the conversation, read message history, or require a Meta or WhatsApp API key.",
    citations=[36, 37, 38],
)
add_figure(doc, ASSETS / "share_import_flow.png", 7.0, "A shared WhatsApp photo becomes a local draft and reaches the ledger only after the member verifies every financial field")

doc.add_heading("Import journey", level=2)
share_journey_rows = [
    ["Share", "In WhatsApp, open one receipt photo, tap Share, and select LenaDena", "The app accepts one JPEG, PNG, or WebP image in the MVP"],
    ["Receive", "Copy the granted image into an application cache entry with a short local expiry", "Do not upload, create an expense, or retain the source URI automatically"],
    ["Unlock", "If the app is locked, preserve the local draft while the member verifies email or unlocks the app", "Show the image only after local authentication; expire abandoned drafts"],
    ["Review image", "Preview, rotate, crop, replace, discard, or choose Keep as receipt", "Warn when the image may contain chat names, phone numbers, bank details, or unrelated text"],
    ["Event details", "Enter a required Event name and Event date; OCR may suggest the merchant as a starting title and the printed receipt date", "Both fields remain editable and Save stays disabled until the member confirms them"],
    ["Choose people", "Select a group, Paid by, and the members included in the expense", "Default Paid by to Me but never infer chat participants or silently select a group"],
    ["Divide", "Choose Equal, Exact values, or Percentages and inspect the calculated amount for each member", "Disable Save until the allocation is mathematically complete"],
    ["Confirm", "Review Event name, Event date, total, payer, people, and exact shares, then tap Save expense", "Only confirmed structured data reaches the backend; upload the image only if Keep as receipt is selected"],
]
add_table(doc, ["Step", "Member experience", "Required guardrail"], share_journey_rows, widths=[0.9, 3.35, 2.6], font_size=8.5)

doc.add_heading("Split methods", level=2)
split_rows = [
    ["Equal", "Select the included members; include the expense payer by default with a visible toggle", "Divide integer minor units evenly and assign any leftover units deterministically"],
    ["Exact values", "Enter the amount assigned to every included member and show Remaining at all times", "The entered values must be nonnegative and sum exactly to the expense total"],
    ["Percentages", "Enter a percentage for every included member and show the calculated money amount beside it", "Percentages must total 100.00 percent; allocate rounding by largest remainder with stable member order as the tie break"],
]
add_table(doc, ["Method", "Interaction", "Validation and rounding"], split_rows, widths=[1.0, 3.15, 2.7], font_size=8.7)
add_para(doc, "Weighted shares such as one share versus two shares and item by item receipt assignment are useful follow ups. They should reuse the same allocation engine, but should not make the launch form harder to understand. Every method must end with a per member preview whose minor units sum exactly to the total.")

doc.add_heading("React Native implementation", level=2)
add_para(
    doc,
    "Create an IncomingShareAdapter so the expense form does not depend on one package. Expo Sharing now documents inbound shared data and MIME type configuration, but it labels the receive path experimental and notes an iOS behavior that Apple does not officially support. Use it for the technical spike, then keep the production gate explicit: Android receives ACTION SEND with image MIME types, while iOS uses a dedicated Share extension and App Group handoff if the official Expo path does not pass store and cold start testing.",
    citations=[36, 37, 38],
)
share_tech_rows = [
    ["Android", "ACTION SEND intent filter for image JPEG, PNG, and WebP; read the granted content URI", "Copy immediately to cache because the temporary grant may disappear after the activity ends"],
    ["iOS", "Small Share extension accepts one image and places a transient reference in an App Group container", "Keep the extension UI minimal and move OCR, group selection, and splitting into the main app"],
    ["Navigation", "Normalize warm start, cold start, and locked app shares into one Import expense route", "Consume every payload once and prevent a stale image from reopening after Save or Discard"],
    ["Local queue", "Random import identifier, MIME, byte size, checksum, created time, and expiry", "Never synchronize device paths, WhatsApp metadata, or raw OCR text"],
    ["Unsupported input", "Explain that launch supports one receipt image and offer camera or gallery import", "Reject multiple images, text, PDFs, video, oversized images, and malformed data in the MVP"],
]
add_table(doc, ["Layer", "Implementation", "Reliability rule"], share_tech_rows, widths=[1.0, 3.25, 2.6], font_size=8.5)

doc.add_heading("Share import acceptance tests", level=2)
add_bullets(doc, [
    "A single WhatsApp photo opens the same Import expense screen on a recent iPhone and two supported Android devices when the app is closed, backgrounded, and already open.",
    "Sharing does not create an expense, notify a group, or upload an image before the member taps Save expense.",
    "Save remains disabled until a nonblank Event name and valid Event date are confirmed, even when OCR fills other fields.",
    "Discard, successful save without Keep as receipt, timeout, and sign out remove the temporary image and OCR text.",
    "Equal, exact value, and percentage modes always display allocations that sum to the imported total in integer minor units.",
    "A forwarded image cannot expose another group, and a member cannot select people outside the chosen group unless they explicitly create and send a new invitation.",
    "The app behaves clearly when WhatsApp supplies an unreadable image, revokes the temporary URI, or the device has no supported OCR engine.",
])

new_page(doc)
doc.add_heading("Visual system, component library, theme, and splash", level=1)
add_para(doc, "The default theme should be neither a conventional light theme nor a full dark theme. Dusk Blend uses a dark summary layer for orientation and warm light surfaces for data entry and reading. This gives the app a distinctive mixed appearance while keeping dense financial details easy to scan.")

palette_rows = [
    ["Ink", "17212B", "Top bars, summary areas, primary text", "White or warm canvas"],
    ["Warm canvas", "F7F3EA", "Main working background", "Ink"],
    ["Mint", "35C3A5", "Primary actions and confirmed status", "Ink, not white"],
    ["Coral", "FF7A6B", "Amount owed and needs attention accents", "Ink or dark red text"],
    ["Amber", "F5C451", "Reminder and playful tone accents", "Ink"],
    ["Slate", "637083", "Secondary text and inactive icons", "White or warm canvas after contrast testing"],
]
add_table(doc, ["Token", "Hex", "Role", "Text pairing"], palette_rows, widths=[1.15, 0.75, 3.0, 1.95], font_size=9.3)

doc.add_heading("Theme choices", level=2)
theme_rows = [
    ["Dusk Blend", "Default", "Dark summary band plus warm light content surfaces"],
    ["Cloud", "Manual option", "Light surfaces throughout, with Ink navigation and text"],
    ["Midnight", "Manual option", "Dark surfaces with softened white text and the same semantic status labels"],
    ["System", "Manual option", "Follows the operating system light or dark preference"],
]
add_table(doc, ["Theme", "Availability", "Behavior"], theme_rows, widths=[1.25, 1.25, 4.35], font_size=9.0)
add_para(doc, "Group accent is a per-group decorative setting only. It never redefines debt, warning, or success colors.")

doc.add_heading("Reusable React Native component contract", level=2)
add_para(
    doc,
    "Use NativeWind for Tailwind style class utilities in the React Native frontend and map its Tailwind configuration to semantic design tokens such as surface canvas, surface raised, text primary, action primary, status debt, and status confirmed. Screens may combine approved utilities, but they must not introduce raw hex colors, one off spacing values, or lookalike controls. NativeWind supports Expo and depends on Tailwind configuration plus React Native libraries rather than browser CSS at runtime.",
    citations=[39],
)
component_rows = [
    ["Button", "frontend/src/components/ui/Button.tsx", "primary, secondary, ghost, destructive; small, medium, large; icon positions; loading and disabled", "All taps that look like buttons use this export; loading replaces the label safely and prevents a second submission"],
    ["Input", "frontend/src/components/ui/Input.tsx", "text, email, decimal, password, search, multiline; label, hint, error, leading or trailing icon", "All editable text fields use this export; date pickers and member selectors use the same FieldShell but are not fake text inputs"],
    ["Spinner", "frontend/src/components/ui/Spinner.tsx", "small, medium, large; light or dark contrast; inline or centered", "One accessible progress indicator for buttons and delayed content; never build a second loader for a screen"],
    ["TopTabs", "frontend/src/components/navigation/TopTabs.tsx", "fixed or horizontally scrollable; badge; controlled selection", "One keyboard and screen reader aware switcher for My plan, Groups, Reviews, and Activity"],
    ["FieldShell", "frontend/src/components/forms/FieldShell.tsx", "label, requirement, hint, error, disabled", "Keeps text input, date, member, and split controls aligned without duplicating validation presentation"],
]
add_table(doc, ["Primitive", "Single source", "Supported variants", "Reuse rule"], component_rows, widths=[0.85, 1.75, 2.45, 2.2], font_size=8.2)
add_para(doc, "Feature screens compose these primitives; they do not copy their styles. Add a pull request check that rejects imports from private primitive internals, a component gallery covering every state and theme, and unit or interaction tests for focus, validation, disabled, loading, and reduced motion behavior. The backend has no Tailwind dependency because it renders no interface.")

doc.add_heading("Lightweight animated splash", level=2)
add_para(
    doc,
    "Show an immediate native Expo splash using the Ink background and a static LenaDena mark, then cross fade into a short React Native handoff animation after the first application frame. The motion should use only logo opacity, a small scale from 0.96 to 1.00, and at most one mint accent translation. Target 650 to 900 milliseconds and enforce a 1.2 second ceiling. Expo recommends hiding the native splash as soon as the application is ready and testing the final behavior in a release build because Expo Go and development builds do not fully reproduce the installed splash experience.",
    citations=[40],
)
add_para(
    doc,
    "Implement the handoff with React Native Reanimated and animate non layout properties such as transform and opacity. Do not use a video, GIF, particle system, remote asset, or continuous loop. Do not wait for an API response: while the native splash is visible, load only bundled fonts, local theme tokens, and cached session state; fetch My plan data after navigation is interactive. Reanimated recommends non layout properties for smoother updates and can follow the operating system reduced motion setting, in which case the app should use a near instant cross fade.",
    citations=[41, 42],
)
add_bullets(doc, [
    "Performance budget: no more than two animated elements, no layout animation, no image decoding above the device splash asset size, and no JavaScript timer chain.",
    "Quality gate: record cold start on a lower end supported Android device and a recent iPhone in release mode; reject visible stutter, blank frames, double splash, or delayed touch readiness.",
    "Failure behavior: if local preparation exceeds the ceiling, reveal the application shell and use the single Spinner only for the specific content still loading.",
    "Accessibility: honor Reduce Motion, preserve sufficient logo contrast, and never communicate status through motion alone.",
])

add_para(
    doc,
    "Material Design 3 recommends semantic color roles and design tokens rather than assigning raw colors ad hoc, and it supports dynamic color on compatible Android experiences. The React Native theme layer should map the same semantic tokens to iOS and Android. System and manual themes remain the launch commitment; Android dynamic color can be added as an optional platform enhancement.",
    citations=[20, 21],
)
add_para(
    doc,
    "Target WCAG 2.2 AA. Maintain at least 4.5 to 1 contrast for normal text, provide visible keyboard focus, use comfortably sized targets, label all controls, and make authentication usable without memory tests or puzzles. WCAG 2.2 adds guidance for minimum target size and accessible authentication.",
    citations=[20],
)

doc.add_heading("Writing style", level=2)
add_para(doc, "Use short direct labels: Add expense, You owe Sara, I paid, Awaiting review, Money received, and Needs attention. Humor belongs in optional email or celebration copy, not in amounts, error messages, disputes, or privacy controls.")

new_page(doc)
doc.add_heading("Settlement state model", level=1)
add_figure(doc, ASSETS / "settlement_flow.png", 7.0, "Balances change only after recipient confirmation; a problem path returns the settlement to an actionable state")

doc.add_heading("State definitions", level=2)
state_rows = [
    ["Open", "A confirmed expense creates an amount owed", "Debtor can start a full or partial settlement"],
    ["Claimed", "Debtor states that money was sent", "Amount, time, method note, and optional proof are recorded"],
    ["Awaiting review", "Recipient has not decided", "Automatic reminders to the debtor stop; recipient receives a review notification"],
    ["Confirmed", "Recipient says the money arrived", "Settlement is posted to the ledger and the remaining balance is recalculated"],
    ["Needs attention", "Recipient reports missing money, wrong amount, or unclear evidence", "Settlement does not change the balance; both people can add a note or submit corrected proof"],
    ["Reversed", "A confirmed record was entered incorrectly", "A compensating ledger entry restores the amount and preserves the audit history"],
]
add_table(doc, ["State", "Meaning", "System behavior"], state_rows, widths=[1.15, 2.7, 3.0], font_size=9.0)

doc.add_heading("Integrity rules", level=2)
add_bullets(doc, [
    "Only the debtor can create a payment claim for their own balance unless the recipient records a cash payment on their behalf and the activity log names that action.",
    "Only the intended recipient can confirm or reject the claim.",
    "Confirmation and reversal endpoints require idempotency keys so double taps and retries cannot post twice.",
    "A partial settlement cannot exceed the currently open amount without a second explicit confirmation.",
    "Edits to expenses that already have settlements create an adjustment entry and notify affected members.",
    "Debt simplification remains disabled at launch. Traceable pairwise balances are easier to explain when evidence and confirmation matter.",
])

doc.add_heading("Rounding", level=2)
add_para(doc, "Store all money as integer minor units with an ISO 4217 currency code. For an equal split, divide the total minor units, assign the same base share to each participant, and distribute remaining units deterministically in participant order. For percentage splits, store percentages as integer basis points, calculate exact fractional shares, and use the largest remainder method with stable participant order as the tie break. Display every allocated amount before save. Never use binary floating point for persisted money.")

new_page(doc)
doc.add_heading("Technical architecture", level=1)
add_figure(doc, ASSETS / "architecture.png", 7.0, "Two application folders create a clear boundary: the React Native frontend calls the Node.js backend, which applies business rules before using Supabase and the email provider")

doc.add_heading("Repository and runtime boundary", level=2)
add_para(doc, "Start with one repository and exactly two deployable application folders. The separation is architectural from day one, but a single workspace keeps dependency updates, contract generation, and integration tests manageable. Do not add a third shared package at the start; generate the frontend API client from the backend OpenAPI contract into the frontend folder.")
repository_rows = [
    ["frontend/", "React Native and Expo application for iOS, Android, and the small invite or authentication web fallback", "app routes; src/components/ui; src/components/forms; src/components/navigation; src/features; src/lib/api; src/theme; tests"],
    ["backend/", "Node.js and TypeScript API plus a separately started background worker", "src/routes; src/domain; src/services; src/repositories; src/workers; src/lib/supabase; supabase/migrations; tests"],
    ["Repository root", "Workspace coordination only", "package manager workspace file, lockfile, lint and format configuration, README, continuous integration"],
]
add_table(doc, ["Location", "Responsibility", "Planned contents"], repository_rows, widths=[1.15, 2.55, 3.15], font_size=8.8)
secrets_para = add_para(doc, "Keep secrets in environment specific configuration. Commit example environment files with names only, never values. The frontend receives the public Supabase URL and publishable key plus the Node API base URL. The backend receives server credentials, database configuration, email credentials, and allowed application origins. Database migrations live under backend because the Node service owns business persistence.")
secrets_para.paragraph_format.keep_together = True

doc.add_heading("Recommended stack", level=2)
stack_rows = [
    ["Frontend", "React Native, TypeScript, Expo development build, Expo Router, React Navigation top tabs, NativeWind", "One application folder for iOS and Android plus a small universal invite fallback and shared Tailwind style tokens"],
    ["UI primitives", "One Button, one Input, one Spinner, one TopTabs, and one FieldShell", "Variants handle visual states without duplicated screen level components"],
    ["Voice", "expo speech recognition with strict on device capability checks", "No transcription API key; audio stays on the phone when local mode is available"],
    ["Camera and OCR", "React Native Vision Camera plus Apple Vision or Google ML Kit through a local Expo module", "Native capture and recognition with explicit script and device support"],
    ["Inbound sharing", "IncomingShareAdapter with Expo Sharing spike, Android ACTION SEND, and an iOS Share extension fallback", "One reviewed image from WhatsApp or another app without a WhatsApp API or media server"],
    ["Backend API", "Node.js, TypeScript, and Fastify with JSON Schema and OpenAPI", "A low overhead business boundary for authorization, validation, settlements, invitations, and signed file access"],
    ["Background jobs", "A worker process from the backend folder", "Transactional outbox, reminders, retries, locks, and email webhook processing"],
    ["Database", "Supabase Postgres", "Transactions, constraints, audit records, and row level security"],
    ["Authentication", "Supabase email magic link or OTP", "Verified email without passwords; redirect URLs must be allowlisted"],
    ["Files", "Private Supabase Storage bucket", "Receipt and proof objects protected by membership policies and short lived signed URLs"],
    ["Email", "Resend transactional delivery", "Templates, domain authentication, delivery events, bounces, and complaints"],
    ["Deployment", "Containerized Node API and worker near the Supabase project region; local or EAS mobile builds", "Provider remains a deployment decision; voice, OCR, and share intake need no media processing server"],
    ["Operations", "Structured logs, error tracking, uptime checks, database backups", "Enough observability to investigate money state and email delivery"],
]
add_table(doc, ["Layer", "Choice", "Reason"], stack_rows, widths=[1.05, 3.0, 2.8], font_size=8.8)

add_para(
    doc,
    "Expo development builds are required because speech, OCR, camera, and inbound share features include native iOS and Android code. Builds can run locally; EAS is optional. Keep the universal web surface inside frontend and limit it to invite links, authentication callbacks, and essential review rather than duplicating the full native workflow. The native share route is mobile only; it should not be presented as a web feature.",
    citations=[31, 36, 39],
)
fastify_para = add_para(
    doc,
    "Fastify supports TypeScript and request or response validation through JSON Schema, making it suitable for a compact versioned Node API. Publish an OpenAPI document in continuous integration and generate a typed frontend client so the two folders cannot silently disagree on amounts, dates, split payloads, or settlement states.",
    citations=[43],
)
fastify_para.paragraph_format.keep_together = True

doc.add_heading("Frontend to backend connection", level=2)
connection_rows = [
    ["1 Authenticate", "The frontend signs in with Supabase email magic link or OTP and receives a managed access token", "Only the publishable key is present in the shipped application"],
    ["2 Call API", "The generated frontend client sends Authorization Bearer access token, idempotency key for mutations, and a versioned JSON payload to backend v1", "TLS, strict origins, request size limits, and request identifiers are required"],
    ["3 Establish actor", "Fastify verifies the Supabase JWT or resolves it with Supabase Auth, then attaches user id, email verification, and request context", "Never accept a profile or member id from the body as proof of identity"],
    ["4 Authorize and commit", "Domain services check group membership and settlement roles; repositories write one transaction to Supabase Postgres", "Use the user's JWT for RLS protected access where practical; reserve privileged credentials for isolated jobs"],
    ["5 Respond and refresh", "The API returns a documented result and the frontend query cache updates My plan, Groups, Reviews, and Activity", "Retries reuse the same idempotency key and never double post a ledger effect"],
]
add_table(doc, ["Step", "Contract", "Guardrail"], connection_rows, widths=[1.05, 3.7, 2.1], font_size=8.4)
add_para(
    doc,
    "Supabase Auth uses JWTs and accepts them in the Authorization Bearer header. Supabase recommends row level security for frontend accessible data and warns that secret or service role credentials bypass RLS and must never be shipped in a browser or mobile application. For this design, the frontend talks directly to Supabase only for authentication; normal financial reads and writes go through the Node API. The backend should prefer a request scoped Supabase client carrying the member token so RLS remains active, while the outbox worker uses privileged credentials only after selecting jobs through tightly scoped server code.",
    citations=[10, 11, 44, 45, 46],
)

notification_heading = doc.add_heading("Notification execution", level=2)
notification_heading.alignment = WD_ALIGN_PARAGRAPH.LEFT
add_para(doc, "Use a database outbox instead of sending email inside the expense transaction. The transaction writes the expense, shares, activity event, and pending notification job together. A worker claims jobs, sends through Resend, stores the provider message ID, and marks the job sent. Delivery webhooks then update delivered, delayed, bounced, failed, or complained states.", citations=[18])
add_para(doc, "Run the reminder worker as a second process from backend. It must use a database lock and a unique key such as settlement, member, reminder type, and cadence date because scheduled execution and network delivery are at least once behaviors in practice. Failed jobs remain in the outbox with bounded exponential backoff, while idempotency prevents concurrent workers or restarts from sending the same reminder twice.")

new_page(doc)
data_model_heading = doc.add_heading("Data model and application interfaces", level=1)
data_model_heading.paragraph_format.page_break_before = True
entity_rows = [
    ["profiles", "id, auth user id, display name, verified email, theme, timezone, preferred locale", "One row per account"],
    ["input preferences", "profile id, dictation locale, strict local mode, OCR script", "Stores settings only, never audio or raw OCR images"],
    ["groups", "id, name, base currency, accent, created by, archived at", "Any verified profile may create a group and becomes its initial owner"],
    ["group members", "group id, profile id or invited email, role, state, joined at", "Unique active member per group and identity; exactly one or more owners according to transfer rules"],
    ["invites", "group id, email optional, token hash, expires at, max uses, revoked at", "Raw tokens are never stored"],
    ["expenses", "group id, event name, event date, amount minor, currency, merchant or note, paid by, created at, updated at, version, source type", "Event name and date are required; event date is distinct from system timestamps; one expense payer"],
    ["expense shares", "expense id, member id, owed minor, split method, basis value", "Owed minor units sum to the expense; percentage basis points sum to 10000"],
    ["settlements", "group id, from member, to member, amount minor, state, claimed at, confirmed at", "Supports partial settlement and one currency"],
    ["settlement proofs", "settlement id, storage key, mime, size, hash, submitted by", "Private object metadata only"],
    ["ledger entries", "group id, member pair, amount minor, currency, source type, source id, reversed by", "Append only financial effect"],
    ["activity events", "group id, actor, event type, subject, safe metadata, created at", "Human readable audit history"],
    ["notification jobs", "recipient, type, payload reference, due at, state, dedupe key, provider id", "Reliable email outbox"],
    ["notification preferences", "profile, group optional, channel, cadence, quiet hours, tone, muted", "Recipient controls override group defaults"],
]
add_table(doc, ["Entity", "Key fields", "Constraint"], entity_rows, widths=[1.25, 3.7, 1.9], font_size=8.2)
add_para(doc, "Event name and Event date belong to the expense in the MVP, so entering them does not require a separate event creation screen. A later multi expense trip feature may normalize reusable events into their own table. Incoming share payloads remain in a short lived device cache; the server receives only the final confirmed expense and an image only when Keep as receipt is selected.")

doc.add_heading("Core server interfaces", level=2)
api_rows = [
    ["GET /v1/me/plan", "Return the signed in member's owe, owed, review, and recent group summary"],
    ["GET and POST /v1/groups", "List active memberships or create a group with the actor as owner"],
    ["POST /v1/groups/:id/invites", "Issue an email bound or limited use invite token"],
    ["POST /v1/invites/accept", "Validate token, verify email, and join idempotently"],
    ["POST /v1/expenses", "Require Event name and Event date, validate shares, and commit expense ledger entries"],
    ["PATCH /v1/expenses/:id", "Create a versioned adjustment and notifications"],
    ["POST /v1/settlements", "Create a full or partial payment claim"],
    ["POST /v1/settlements/:id/proof", "Validate and attach a private image"],
    ["POST /v1/settlements/:id/confirm", "Authorize recipient and post settlement ledger entry"],
    ["POST /v1/settlements/:id/attention", "Pause closure and record a structured reason"],
    ["POST /v1/notification-preferences", "Set personal cadence, tone, mute, and quiet hours"],
]
add_table(doc, ["Interface", "Responsibility"], api_rows, widths=[2.45, 4.4], font_size=9.3)

doc.add_heading("Authorization policy", level=2)
add_para(doc, "Every group scoped query must require an active membership, including My plan aggregation. A member may read group ledger data but can read a settlement proof only when they are the settlement sender or recipient. File paths should include opaque IDs, and access should use short lived signed URLs. Supabase secret or legacy service role keys stay server side because they bypass row level security; the mobile app receives only a publishable key.", citations=[11, 12, 44])

new_page(doc)
doc.add_heading("Email reminders and friend group tone", level=1)
add_para(doc, "Email is a core workflow channel, not decoration. Every expense or reminder message should identify the group, Event name, Event date, amount, current state, and one safe action. Do not attach or preview payment proof in email. The message should link to an authenticated in app review page.")

doc.add_heading("Email events", level=2)
email_rows = [
    ["Invitation", "Immediately", "Join group", "One reminder after 48 hours; expire after seven days"],
    ["New expense", "Immediately or daily digest", "Review share", "Affected members only"],
    ["Friendly reminder", "Day 3 after amount becomes open", "View and settle", "Skip if muted, disputed, or awaiting review"],
    ["Cheeky reminder", "Day 7", "View and settle", "Recipient selected tone controls the wording"],
    ["Final automatic reminder", "Day 14", "View and settle", "Then weekly only if the recipient explicitly enables it"],
    ["Payment claimed", "Immediately", "Review payment", "Sent to the recipient, not the group"],
    ["Payment confirmed", "Immediately", "View receipt record", "Sent to both people"],
    ["Needs attention", "Immediately", "Resolve issue", "No humor and no automated debtor reminders"],
]
add_table(doc, ["Event", "Default timing", "Primary action", "Guardrail"], email_rows, widths=[1.35, 1.35, 1.45, 2.7], font_size=8.8)

doc.add_heading("Tone controls", level=2)
add_bullets(doc, [
    ("Friendly  ", "Neutral and warm. This is the default for every account."),
    ("Cheeky  ", "Light jokes that never mention a member publicly or question their character."),
    ("Chaos  ", "More playful group language, available only when the recipient opts in."),
    ("Quiet  ", "Important state changes only, with no automatic reminders."),
])
add_para(doc, "The group may choose a default tone pack, but each recipient's own setting wins. Manual nudges require a 24 hour cooldown, automatic reminders stop after three by default, and every message includes a group mute link. Disputed and awaiting review states suppress payment reminders.")

doc.add_heading("Sample message library", level=2)
copy_rows = [
    ["Invitation", "The group chat did the talking. Now let the numbers behave.", "Sara invited you to Weekend Crew. Join to see and add shared expenses."],
    ["Friendly reminder", "A small reminder from Weekend Crew", "You still have Rs 2,400 open with Sara for Dinner at Monal on 12 Sep. If you already paid, mark it and add proof."],
    ["Cheeky reminder", "Your balance is still doing overtime", "Rs 2,400 is waiting for its retirement. Settle it or open the expense if something looks wrong."],
    ["Chaos reminder", "Breaking news your Rs 2,400 has not left the chat", "No panic. Pay outside the app, then tap I paid so Sara can confirm."],
    ["Proof submitted", "Hamza says the money is on its way", "Review the Rs 1,100 payment and confirm only after it appears in your account."],
    ["Confirmed", "Settled and officially out of the group lore", "Sara confirmed Rs 2,400 received. Your balance is now clear."],
    ["Needs attention", "This payment needs a quick check", "Sara could not confirm Rs 1,100. Open the payment to see the reason and respond."],
]
add_table(doc, ["Moment", "Subject", "Body direction"], copy_rows, widths=[1.2, 2.6, 3.25], font_size=8.7)

doc.add_heading("Delivery standards", level=2)
add_para(doc, "Send from a dedicated subdomain and configure SPF, DKIM, and DMARC. Resend recommends verifying SPF and DKIM and optionally adding DMARC; Google requires authentication for Gmail delivery and sets additional rules for high volume senders. Store bounce and complaint events, suppress hard bounces, provide visible controls, and keep spam complaints far below Google's 0.3 percent ceiling.", citations=[17, 18, 19])

new_page(doc)
doc.add_heading("Privacy security and abuse prevention", level=1)
doc.add_heading("On device input privacy", level=2)
privacy_input_para = add_para(doc, "Strict local speech mode must never fall back to a network recognizer without a separate informed choice. The app should not retain microphone audio. OCR temporary files and raw detected text should remain in the application cache and be deleted after the user applies or discards the suggestions. Analytics may record success, failure category, duration band, locale, and device capability, but never transcript text, receipt text, or images.")
privacy_input_para.paragraph_format.keep_together = True
doc.add_heading("Shared image privacy", level=2)
add_para(doc, "A photo shared from WhatsApp may contain chat names, phone numbers, message previews, faces, or unrelated media. Preview it before OCR, make crop and discard actions prominent, and explain that only the selected image was received. Do not store the source application, conversation identity, original device URI, OCR text, or image pixels in analytics. Delete the cache copy after Save or Discard unless the member explicitly chooses Keep as receipt.")
doc.add_heading("Proof handling", level=2)
add_para(doc, "Payment screenshots may reveal account numbers, balances, transaction references, notifications, and contact names. Before upload, tell members to crop sensitive details and offer an in app crop and blur step. Strip image metadata, compress the image, and delete proof automatically after a configurable retention period such as 30 days after confirmation unless both people choose to keep it.")
add_bullets(doc, [
    "Allow JPEG, PNG, and WebP only for the MVP. Do not accept PDFs or videos until there is a demonstrated need.",
    "Verify extension, decoded file signature, and MIME type; do not trust the browser Content Type header.",
    "Generate the stored filename, limit dimensions and file size, re encode images, and scan uploads where practical.",
    "Use private storage, group and settlement authorization, and short lived signed URLs.",
    "Do not expose proof in email, activity feeds, analytics payloads, or support logs.",
], level=0)
add_para(doc, "OWASP recommends allowlisting file types, validating signatures and MIME types, generating filenames, setting size limits, authorizing uploaders, storing files outside public web paths, and scanning when available.", citations=[13])

doc.add_heading("Invitation safety", level=2)
add_para(doc, "Generate at least 128 bits of random token entropy, store only a cryptographic hash, use HTTPS, bind private invitations to the intended email, expire links, support revocation, and rate limit acceptance. Generic group links should have a short lifetime and maximum use count. OWASP guidance for URL tokens recommends cryptographically random values, secure storage, single use, expiry, trusted redirect destinations, HTTPS, and rate limiting.", citations=[14])

doc.add_heading("Group safety", level=2)
add_bullets(doc, [
    "A member can mute reminders without leaving the group or hiding the balance.",
    "A user can report abusive copy or a group, and support can suspend reminder sending independently of financial records.",
    "Names and custom group text require length limits and output encoding. Email templates must escape all user content.",
    "Group admins can remove future access but cannot erase another member's confirmed financial history silently.",
    "Export and deletion behavior must be defined before launch. Account deletion should anonymize activity where complete erasure would corrupt other members' ledgers.",
])

doc.add_heading("Security acceptance tests", level=2)
security_rows = [
    ["Cross group access", "A member cannot query another group's expense, proof, invite, or activity row"],
    ["Proof URL", "An expired signed URL fails and a non participant cannot issue another one"],
    ["Double confirmation", "Repeated requests create one ledger effect"],
    ["Invite replay", "Used, expired, revoked, or email mismatched tokens fail safely"],
    ["Reminder duplication", "Concurrent workers send at most one message per cadence window"],
    ["File disguise", "Renamed executable and malformed image inputs are rejected"],
    ["Shared payload lifetime", "Expired or reused share payloads fail safely and a consumed image cannot reopen a second draft"],
    ["Audit integrity", "Corrections create reversals rather than deleting confirmed history"],
]
add_table(doc, ["Test", "Pass condition"], security_rows, widths=[1.65, 5.2], font_size=9.2)

new_page(doc)
doc.add_heading("Delivery roadmap and success metrics", level=1)
add_para(doc, "A focused private beta with on device voice, OCR, and cross platform share import can be delivered in roughly thirteen weeks by one experienced full stack engineer with part time product design and structured QA support. A solo first time builder should expect a longer schedule. The timeline below is a planning assumption, not a vendor estimate.")

roadmap_rows = [
    ["Week 1", "Validate", "Interview five to eight friend groups; map current chat and spreadsheet behavior; test terminology"],
    ["Week 2", "Prototype", "Clickable My plan, top tabs, create group, typed or shared image expense entry, split selection, settle, review, and lightweight splash"],
    ["Weeks 3 and 4", "Foundation", "Create frontend and backend folders; NativeWind tokens and shared primitives; Node API contract; Auth, profiles, groups, memberships, invitations, and RLS"],
    ["Weeks 5 and 6", "Ledger", "Personal plan query, expenses, exact rounding, balances, activity history, edits, and frontend to backend integration tests"],
    ["Weeks 7 and 8", "Settlement", "Payment claims, private proof, confirmation, attention state, outbox, and emails"],
    ["Weeks 9 and 10", "On device input", "Speech capability gate, camera capture, OCR, equal, exact, and percentage split engine, privacy tests"],
    ["Week 11", "Share import", "Android share intent, iOS share extension path, cold and warm start routing, local queue, WhatsApp device tests"],
    ["Week 12", "Hardening", "Release build splash profiling, reduced motion, component audit, accessibility, security cases, device matrix, email authentication, export and deletion"],
    ["Week 13", "Private beta", "Launch to three to five real groups, watch events, collect interviews, and fix blockers"],
]
add_table(doc, ["Timing", "Focus", "Exit condition"], roadmap_rows, widths=[1.15, 1.25, 4.45], font_size=9.0)

doc.add_heading("Definition of done for private beta", level=2)
add_bullets(doc, [
    "A new member can accept an invite and reach the intended group in under two minutes without a password.",
    "Every verified member can create a group, becomes its owner, can join multiple groups, and sees only authorized group data in My plan.",
    "The sticky top tabs switch among My plan, Groups, Reviews, and Activity, preserve return state, and expose review badges accessibly without a duplicate bottom navigation system.",
    "An equal expense with four members saves with exact shares whose minor units sum to the total.",
    "A debtor can submit a full or partial payment claim and proof; only the recipient can view and decide it.",
    "The confirmed settlement changes the ledger exactly once, including under retries and double taps.",
    "Reminder emails stop during review, respect tone and mute choices, and record delivery failures.",
    "On supported devices, dictation and OCR work without an application API key; unsupported locales fail clearly to manual entry and no media is uploaded.",
    "On iOS and Android, sharing one WhatsApp receipt photo opens a local draft, requires a confirmed Event name and Event date, supports equal, exact value, and percentage splits, and uploads nothing before confirmation.",
    "All screens import the single Button, Input, and Spinner primitives; their states render correctly in every theme and no screen contains a visually duplicated private version.",
    "Frontend business mutations pass through the Node API with a valid Supabase token and idempotency key; expired tokens, unauthorized memberships, and malformed contracts fail predictably.",
    "The native and React Native splash transition has no blank frame or network dependency, completes within the agreed ceiling, remains smooth on the lower end reference Android device, and honors Reduce Motion.",
    "All core screens meet the agreed WCAG 2.2 AA checks and work at common mobile widths.",
])

doc.add_heading("Product metrics", level=2)
metric_rows = [
    ["Activation", "Percentage of invited members who verify email and open the group within 24 hours", "Measures invite friction"],
    ["First value", "Median time from group creation to first correctly shared expense", "Tests entry speed"],
    ["Assisted entry completion", "Percentage of voice, camera OCR, or shared image attempts that produce a confirmed expense without retyping every field", "Measures useful accuracy rather than raw recognition confidence"],
    ["Share import completion", "Percentage of received share images that become a confirmed expense or an intentional discard", "Measures reliability and identifies abandoned or confusing imports"],
    ["Settlement completion", "Percentage of payment claims confirmed within seven days", "Measures the core outcome"],
    ["Review time", "Median time from I paid to Money received", "Measures recipient clarity"],
    ["Dispute rate", "Percentage of claims moved to Needs attention", "Surfaces wrong math, unclear proof, or trust issues"],
    ["Reminder health", "Mute rate, bounce rate, complaint rate, and manual nudge frequency", "Prevents fun email from becoming spam"],
    ["Group retention", "Groups with a new expense in a later month", "Separates trip only use from ongoing value"],
]
add_table(doc, ["Metric", "Definition", "Why it matters"], metric_rows, widths=[1.35, 3.55, 1.95], font_size=8.8)

doc.add_heading("Recommended launch test", level=2)
add_para(doc, "Run the beta with a mix of one trip group, one flat or household group, and one recurring social group. Do not start with a public launch. Observe whether members understand I paid versus Money received, whether proof is actually used, how many reminders are tolerated, and whether the mixed theme remains readable in bright and low light conditions.")

new_page(doc)
doc.add_heading("Naming recommendations", level=1)
add_para(doc, "LenaDena is the selected working name. It feels natural between friends, directly expresses give-and-take, and fits both personal balances and shared group costs. Trademark, company registry, domain, social handle, and app store clearance are still required before release.")

name_rows = [
    ["LenaDena", "Selected", "Friendly, memorable, and directly tied to money moving between people", "May feel regional if global expansion is immediate"],
    ["TabToli", "Strong alternate", "Tab plus a group of friends; playful and group centered", "Meaning of toli may need explanation outside South Asia"],
    ["PaidNa", "Cheeky alternate", "Feels like a real reminder between friends", "Question like name can feel nagging and is less clear in search"],
    ["HisabScene", "Descriptive alternate", "Connects shared accounts with casual plans", "Longer and culturally specific"],
    ["OweHo", "Playful alternate", "Short, rhythmic, works well in reminder subjects", "Less obvious pronunciation and meaning"],
    ["SceneSet", "Brandable alternate", "Positive friend group phrase and good celebration language", "Does not explain expense tracking on its own"],
]
add_table(doc, ["Name", "Role", "Why it works", "Risk"], name_rows, widths=[1.1, 1.2, 2.9, 1.65], font_size=9.0)

doc.add_heading("Names to avoid", level=2)
add_para(doc, "SettleBro is already used by a 2026 bill splitting app that advertises payment confirmation, reminders, and invite links. PingTab is used by at least a driver logistics app and a browser link sharing product. TabMates is already the name of an open source expense application, and Khatakhat is used by active consumer brands. These are poor launch candidates even before formal legal review.", citations=[22, 23, 24, 25])

doc.add_heading("Name clearance checklist", level=2)
add_numbered(doc, [
    "Search exact and similar marks in the launch country's trademark database and relevant financial software classes.",
    "Search Apple App Store, Google Play, GitHub, company registries, and major search engines for exact and phonetic matches.",
    "Check the preferred domain, sensible alternatives, and core social handles on the same day.",
    "Ask ten target users to hear the name once, spell it, and explain what they expect the app to do.",
    "Have counsel clear the final candidate before paying for identity design or publishing stores.",
])

doc.add_heading("Early voice ideas for LenaDena", level=2)
add_bullets(doc, [
    "Product descriptor: Shared expenses with proof and confirmation",
    "Friendly completion line: Settled, yaar",
    "Invite line: Bring the group. Leave the calculator.",
    "Reminder label inside the app: Send a nudge",
    "Confirmation celebration: Balance clear. Friendship untouched.",
])

new_page(doc)
doc.add_heading("Risks and decisions before development", level=1)
risk_rows = [
    ["Weak differentiation", "High", "Closest competitors already confirm payments", "Test the verification inbox and tone controls with prototypes before engineering breadth"],
    ["Reminder fatigue", "High", "People mute or mark mail as spam", "Recipient control, default cap, quiet hours, dispute pause, cooldown, delivery monitoring"],
    ["Sensitive screenshots", "High", "Bank details leak to group members or logs", "Private bilateral access, crop and blur, metadata stripping, short retention, signed URLs"],
    ["Language coverage gaps", "High", "A device lacks an offline speech model or OCR script", "Runtime capability checks, tested device matrix, visible language selector, manual fallback"],
    ["OCR amount or date error", "High", "A subtotal, previous balance, or printing date is mistaken for the final event data", "Rank candidates but require confirmation of Event name, Event date, and total"],
    ["Share extension reliability", "High", "A WhatsApp photo is lost on cold start or the iOS handoff breaks after an update", "IncomingShareAdapter, local expiry queue, exact once consumption, real device upgrade tests, native iOS fallback"],
    ["Wrong split selection", "High", "The imported total is assigned to the wrong group, payer, or people", "No inferred chat members, visible group and payer fields, allocation preview, disabled Save until valid"],
    ["Native module drift", "Medium", "A React Native or operating system update breaks recognition", "Pin versions, use development builds, wrap providers behind local interfaces, test upgrades"],
    ["Component drift", "Medium", "Screens copy Button, Input, or Spinner styles and themes become inconsistent", "One exported primitive per control, component gallery, lint boundaries, and review checklist"],
    ["Splash jank", "Medium", "A heavy animation delays interaction or drops frames on lower end phones", "Static native first frame, two non layout animations at most, release profiling, time ceiling, and reduced motion"],
    ["Contract drift", "High", "Frontend and backend disagree on money, dates, or settlement states", "Versioned JSON schemas, generated client, contract tests, and backward compatible changes"],
    ["Ledger disagreement", "High", "Edits or rounding make balances untrustworthy", "Integer money, database constraints, calculation preview, audit events, reversal entries"],
    ["Invite hijacking", "Medium", "Forwarded or guessed links admit the wrong person", "High entropy hashed tokens, email binding, expiry, use caps, revocation, rate limiting"],
    ["Scope expansion", "High", "Conversational parsing, payments, currencies, and desktop parity delay launch", "Keep the MVP decision log and require beta evidence for every added feature"],
    ["Regional product fit", "Medium", "Payment methods and language differ by market", "Choose one launch country after interviews; keep money movement outside the MVP"],
]
add_table(doc, ["Risk", "Level", "Failure", "Mitigation"], risk_rows, widths=[1.25, 0.55, 2.15, 2.9], font_size=8.5)

doc.add_heading("Decisions still required", level=2)
decision_rows = [
    ["Launch geography", "Currency defaults, wording, payment links, privacy notices, and legal review"],
    ["Launch languages", "Select the first tested speech locales, interface translations, OCR scripts, and any Tesseract packs"],
    ["Invite policy", "Email bound invitations only or controlled generic links for very casual groups"],
    ["Proof requirement", "Optional by default is recommended; groups may request it but should not expose it broadly"],
    ["Retention period", "Recommended starting point is automatic proof deletion 30 days after confirmation"],
    ["Partial payment", "Recommended for MVP because it affects the data model and real payment behavior"],
    ["Expense approval", "Recommended to notify and allow disputes, not require every member to approve every expense"],
    ["Inbound share library", "Run Expo Sharing as a spike, but use a dedicated iOS Share extension if the experimental route fails cold start or store testing"],
    ["Shared image retention", "Delete temporary imports after Save or Discard; upload only when Keep as receipt is selected"],
    ["Node deployment", "Choose a container provider and region only after latency, cost, worker support, backups, and Supabase region are known"],
]
add_table(doc, ["Decision", "Why it matters"], decision_rows, widths=[1.75, 5.1], font_size=9.2)

doc.add_heading("Immediate next step", level=2)
add_para(doc, "Create a clickable prototype of eight views: invite acceptance, My plan with top tabs, Groups with Create group, Import expense from WhatsApp, Add expense with Event name, Event date, and split selection, I paid, Payment review, and profile theme settings. In parallel, build a short architecture spike with the frontend and backend folders: sign in through Supabase, call GET /v1/me/plan through Fastify, verify RLS, generate the typed API client, and profile the release splash on one recent iPhone and two Android devices. The device spike must also enumerate offline speech locales, scan ten real receipts, verify Event date suggestions, exercise cold and warm WhatsApp sharing, check equal, exact, and percentage rounding, and confirm that disabling connectivity does not upload media. Test the prototype with two friend groups before implementing the full ledger.")

new_page(doc)
doc.add_heading("Sources", level=1)
sources = [
    (1, "Splitwise", "Split expenses with friends", "https://www.splitwise.com/", "Official product page. Accessed September 12 2026."),
    (2, "Splitwise Help Center", "How do I use Splitwise", "https://kb.splitwise.com/getting-started/how-do-i-use-splitwise", "Official workflow documentation. Accessed September 12 2026."),
    (3, "Splitwise", "Splitwise Pro", "https://www.splitwise.com/pro", "Official paid feature description. Accessed September 12 2026."),
    (4, "tricount", "Expense Tracker App Features", "https://tricount.com/en-ca/expense-tracker-features", "Official product features. Accessed September 12 2026."),
    (5, "tricount Help Center", "Request links", "https://help.tricount.com/articles/tricount-request-links", "Official request link availability and fee information. Accessed September 12 2026."),
    (6, "Settle Up", "Settle Up", "https://settleup.io/", "Official product page. Accessed September 12 2026."),
    (7, "Splid", "Split expenses the easy way", "https://splid.app/english", "Official product page. Accessed September 12 2026."),
    (8, "KittyPot", "Split the cost Not the friendship", "https://www.kittypot.com/", "Official workflow and feature page. Accessed September 12 2026."),
    (9, "Bexbox", "Private personal ledger with proof", "https://bexbox.com/", "Official product page. Accessed September 12 2026."),
    (10, "Supabase", "Passwordless email logins", "https://supabase.com/docs/guides/auth/auth-email-passwordless", "Official authentication documentation. Accessed September 12 2026."),
    (11, "Supabase", "Row Level Security", "https://supabase.com/docs/guides/database/postgres/row-level-security", "Official authorization documentation. Accessed September 12 2026."),
    (12, "Supabase", "Storage Access Control", "https://supabase.com/docs/guides/storage/security/access-control", "Official private storage access documentation. Accessed September 12 2026."),
    (13, "OWASP", "File Upload Cheat Sheet", "https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html", "Security guidance. Accessed September 12 2026."),
    (14, "OWASP", "Forgot Password Cheat Sheet", "https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html", "URL token security guidance applied to invitations and magic links. Accessed September 12 2026."),
    (15, "Expo", "Introduction to Expo Router", "https://docs.expo.dev/router/introduction/", "Official universal routing and deep link guidance. Accessed September 12 2026."),
    (16, "React Navigation", "Material Top Tabs Navigator", "https://reactnavigation.org/docs/material-top-tab-navigator/", "Official scrollable top tabs, indicators, badges, and swipe integration guidance. Accessed September 12 2026."),
    (17, "Resend", "Managing Domains", "https://resend.com/docs/dashboard/domains/introduction", "Official SPF DKIM and DMARC setup guidance. Accessed September 12 2026."),
    (18, "Resend", "Event Types", "https://resend.com/docs/webhooks/event-types", "Official email delivery event documentation. Accessed September 12 2026."),
    (19, "Google", "Email sender guidelines", "https://support.google.com/mail/answer/81126", "Official Gmail authentication, unsubscribe, and spam rate requirements. Accessed September 12 2026."),
    (20, "W3C", "Web Content Accessibility Guidelines 2.2", "https://www.w3.org/TR/wcag/", "W3C Recommendation, December 12 2024 version."),
    (21, "Android Developers", "Create an accessible and personalized theme and brand with Material Design 3", "https://developer.android.com/codelabs/m3-design-theming", "Official theming guidance. Accessed September 12 2026."),
    (22, "Apple App Store", "SettleBro", "https://apps.apple.com/in/app/settlebro/id6762054428", "Current app listing used for preliminary name screening. Accessed September 12 2026."),
    (23, "Google Play", "PingTab", "https://play.google.com/store/apps/details?id=com.pingtab.track", "Current app listing used for preliminary name screening. Accessed September 12 2026."),
    (24, "GitHub", "TabMates app", "https://github.com/TabMates/app", "Existing open source project name identified during preliminary screening. Accessed September 12 2026."),
    (25, "Khatakhat Logistics", "Khatakhat", "https://khatakhat.in/", "Existing consumer brand identified during preliminary screening. Accessed September 12 2026."),
    (26, "Apple Developer", "On device speech recognition support", "https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition", "Official iOS capability documentation. Accessed September 12 2026."),
    (27, "Android Developers", "SpeechRecognizer", "https://developer.android.com/reference/android/speech/SpeechRecognizer", "Official Android on device recognition and capability API documentation. Accessed September 12 2026."),
    (28, "GitHub", "Expo Speech Recognition", "https://github.com/jamsch/expo-speech-recognition", "React Native bridge for Apple Speech and Android SpeechRecognizer. Accessed September 12 2026."),
    (29, "Google for Developers", "ML Kit Text Recognition v2", "https://developers.google.com/ml-kit/vision/text-recognition/v2", "Official on device OCR capabilities and supported scripts. Accessed September 12 2026."),
    (30, "Apple Developer", "Recognizing text in images", "https://developer.apple.com/documentation/vision/recognizing-text-in-images", "Official Apple Vision on device text recognition guidance. Accessed September 12 2026."),
    (31, "Expo", "Add custom native code", "https://docs.expo.dev/workflow/customizing/", "Official development build and local Expo module guidance. Accessed September 12 2026."),
    (32, "GitHub", "React Native Voice", "https://github.com/react-native-voice/voice", "Archived package notice and migration recommendation. Accessed September 12 2026."),
    (33, "Tesseract OCR", "Installing Tesseract from Git", "https://tesseract-ocr.github.io/tessdoc/Compiling-%E2%80%93-GitInstallation.html", "Official language and script pack coverage documentation. Accessed September 12 2026."),
    (34, "GitHub", "Tesseract.js framework support", "https://github.com/naptha/tesseract.js/blob/master/docs/faq.md", "Official note that React Native is not supported by the WebAssembly implementation. Accessed September 12 2026."),
    (35, "GitHub", "React Native Vision Camera", "https://github.com/mrousavy/react-native-vision-camera", "Current React Native camera library and release history. Accessed September 12 2026."),
    (36, "Expo", "Sharing", "https://docs.expo.dev/versions/latest/sdk/sharing/", "Official send and receive sharing documentation, MIME configuration, and iOS experimental limitation. Accessed September 12 2026."),
    (37, "Android Developers", "Receive simple data from other apps", "https://developer.android.com/develop/ui/compose/sharing/receive", "Official ACTION SEND intent and MIME type guidance. Accessed September 12 2026."),
    (38, "Apple Developer", "Share extensions", "https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html", "Official Share extension purpose, input validation, and host application behavior. Accessed September 12 2026."),
    (39, "NativeWind", "Installation", "https://www.nativewind.dev/docs/getting-started/installation", "Official Expo and Tailwind configuration guidance. Accessed September 12 2026."),
    (40, "Expo", "SplashScreen", "https://docs.expo.dev/versions/latest/sdk/splash-screen/", "Official native splash control and release build testing guidance. Accessed September 12 2026."),
    (41, "Software Mansion", "React Native Reanimated performance", "https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/", "Official animation performance guidance, including preference for non layout properties. Accessed September 12 2026."),
    (42, "Software Mansion", "useReducedMotion", "https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/", "Official reduced motion hook documentation. Accessed September 12 2026."),
    (43, "Fastify", "TypeScript", "https://fastify.dev/docs/latest/Reference/TypeScript/", "Official TypeScript and JSON Schema guidance for the Node.js framework. Accessed September 12 2026."),
    (44, "Supabase", "Securing your data", "https://supabase.com/docs/guides/database/secure-data", "Official frontend key, RLS, and backend secret handling guidance. Accessed September 12 2026."),
    (45, "Supabase", "JSON Web Tokens", "https://supabase.com/docs/guides/auth/jwts", "Official bearer token and JWT verification guidance. Accessed September 12 2026."),
    (46, "Supabase", "Choosing a server package", "https://supabase.com/docs/guides/auth/choosing-a-server-package", "Official guidance for header based server authentication. Accessed September 12 2026."),
]

for number, publisher, title, url, note in sources:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.22)
    p.paragraph_format.first_line_indent = Inches(-0.22)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(f"{number}. {publisher}. ")
    r.bold = True
    r.font.color.rgb = rgb(INK)
    add_hyperlink(p, title, url)
    p.add_run(f". {note}")
    for run in p.runs:
        run.font.size = Pt(8.7)
        if run.font.color.rgb is None:
            run.font.color.rgb = rgb(INK_2)

doc.core_properties.title = "Friend Group Expense App Product Plan and Architecture"
doc.core_properties.subject = "Research backed product plan with personal member dashboards, group creation, top tabs, reusable React Native components, Node.js backend, Supabase, event fields, on device speech, OCR, WhatsApp share import, email, security, roadmap, and naming"
doc.core_properties.author = ""
doc.core_properties.keywords = "expense splitting, personal plan, group creation, top tabs, reusable Button Input Spinner, NativeWind, React Native, Node.js, Fastify, Supabase, event name, event date, payment confirmation, WhatsApp share import, on device speech, OCR, UX, architecture"

doc.save(OUTPUT)
print(OUTPUT)
