# -*- coding: utf-8 -*-
"""Construit le manuel : docs/Sijil-Manuel.docx (modifiable) et docs/Sijil-Manuel.pdf (via Chromium). Usage : python3 docs/build/build_manual.py"""
import os, sys, html, subprocess, json
sys.path.insert(0, os.path.dirname(__file__))
from content import M, FEATURES
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
VERSION = '3.32.0'; DATE = 'Octobre 2026'
NAVY = RGBColor(0x0E, 0x43, 0x77); BLUE = RGBColor(0x16, 0x59, 0x8D); TEAL = RGBColor(0x2F, 0xB5, 0xB4); GREY = RGBColor(0x6B, 0x77, 0x85)
LOGO = os.path.join(ROOT, 'brand', 'logo-sijil-complet.png')
COPY = '© 2026 Rayane M. — Tous droits réservés'

def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr(); shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), hexcolor); tcPr.append(shd)

def field(run, code):
    for t, txt in (('begin', None), (None, code), ('end', None)):
        if t:
            e = OxmlElement('w:fldChar'); e.set(qn('w:fldCharType'), t); run._r.append(e)
        else:
            e = OxmlElement('w:instrText'); e.set(qn('xml:space'), 'preserve'); e.text = txt; run._r.append(e)

def build_docx(path):
    d = Document()
    sec = d.sections[0]; sec.page_width = Cm(21); sec.page_height = Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.1); sec.top_margin = Cm(2); sec.bottom_margin = Cm(2)
    st = d.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(10.5); st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri')
    st.paragraph_format.space_after = Pt(6); st.paragraph_format.line_spacing = 1.15
    for name, size, color, before in (('Heading 1', 20, NAVY, 18), ('Heading 2', 14, BLUE, 12)):
        h = d.styles[name]; h.font.name = 'Calibri'; h.font.size = Pt(size); h.font.bold = True; h.font.color.rgb = color
        h.element.rPr.rFonts.set(qn('w:eastAsia'), 'Calibri'); h.paragraph_format.space_before = Pt(before); h.paragraph_format.space_after = Pt(6); h.paragraph_format.keep_with_next = True
    # pied de page
    fp = sec.footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = fp.add_run(COPY + ' · Page '); r.font.size = Pt(8); r.font.color.rgb = GREY
    r2 = fp.add_run(); r2.font.size = Pt(8); r2.font.color.rgb = GREY; field(r2, 'PAGE')
    # couverture
    for _ in range(3): d.add_paragraph()
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.add_run().add_picture(LOGO, width=Cm(7.5))
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = p.add_run("Manuel d'utilisation"); r.font.size = Pt(30); r.bold = True; r.font.color.rgb = NAVY
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = p.add_run('Gestion du temps de travail'); r.font.size = Pt(16); r.font.color.rgb = TEAL; r.bold = True
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = p.add_run(f'Version {VERSION} · {DATE}'); r.font.color.rgb = GREY
    for _ in range(4): d.add_paragraph()
    p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = p.add_run("Toutes les captures d'écran utilisent une entreprise fictive (SARL Horizon Services)."); r.italic = True; r.font.size = Pt(9); r.font.color.rgb = GREY
    d.add_page_break()
    # sommaire statique
    d.add_heading('Sommaire', level=1)
    for kind, *rest in M:
        if kind == 'h1':
            p = d.add_paragraph(); r = p.add_run(rest[0]); r.bold = True; r.font.size = Pt(11.5); r.font.color.rgb = NAVY
        elif kind == 'h2':
            p = d.add_paragraph(); p.paragraph_format.left_indent = Cm(0.8); p.paragraph_format.space_after = Pt(1); r = p.add_run(rest[0]); r.font.size = Pt(10)
    d.add_page_break()
    first = True
    for kind, *rest in M:
        if kind == 'h1':
            if not first: d.add_page_break()
            first = False; d.add_heading(rest[0], level=1)
        elif kind == 'h2': d.add_heading(rest[0], level=2)
        elif kind == 'p': d.add_paragraph(rest[0])
        elif kind == 'ul':
            for it in rest[0]: d.add_paragraph(it, style='List Bullet')
        elif kind == 'note':
            t = d.add_table(rows=1, cols=1); c = t.cell(0, 0); shade(c, 'E4F3F3'); c.paragraphs[0].add_run('ℹ  ' + rest[0]).font.size = Pt(10); d.add_paragraph()
        elif kind == 'img':
            f, cap = rest[0], rest[1]; w = rest[2] if len(rest) > 2 else 15.5
            im = Image.open(os.path.join(ROOT, f)); ratio = im.size[1] / im.size[0]
            if w * ratio > 21: w = 21 / ratio
            p = d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.keep_with_next = True; p.paragraph_format.space_after = Pt(2)
            p.add_run().add_picture(os.path.join(ROOT, f), width=Cm(w))
            c = d.add_paragraph(); c.alignment = WD_ALIGN_PARAGRAPH.CENTER; r = c.add_run(cap); r.italic = True; r.font.size = Pt(9); r.font.color.rgb = GREY
        elif kind == 'table':
            heads, rows = rest
            t = d.add_table(rows=1, cols=len(heads)); t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.CENTER
            for i, hd in enumerate(heads):
                c = t.rows[0].cells[i]; shade(c, '16598D'); r = c.paragraphs[0].add_run(hd); r.bold = True; r.font.color.rgb = RGBColor(255, 255, 255)
            for row in rows:
                cells = t.add_row().cells
                for i, v in enumerate(row):
                    cells[i].paragraphs[0].add_run(v).font.size = Pt(10)
                    if i == 0: cells[i].paragraphs[0].runs[0].bold = True
            for row in t.rows:
                row.cells[0].width = Cm(4.6)
                if len(heads) > 1: row.cells[1].width = Cm(12.2)
            d.add_paragraph()
        elif kind == 'feat':
            t = d.add_table(rows=0, cols=2); t.style = 'Table Grid'
            for i, (a, b) in enumerate(FEATURES):
                cells = t.add_row().cells; shade(cells[0], 'EEF4F6' if i % 2 == 0 else 'FFFFFF'); shade(cells[1], 'EEF4F6' if i % 2 == 0 else 'FFFFFF')
                r = cells[0].paragraphs[0].add_run('✔ ' + a); r.bold = True; r.font.size = Pt(9.5); r.font.color.rgb = NAVY
                cells[1].paragraphs[0].add_run(b).font.size = Pt(9.5)
                cells[0].width = Cm(5.2); cells[1].width = Cm(11.6)
            d.add_paragraph()
    d.core_properties.title = "Sijil — Manuel d'utilisation"; d.core_properties.author = 'Rayane M.'
    d.save(path)

def build_html(path):
    esc = html.escape
    out = ['<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Sijil — Manuel d\'utilisation</title><style>',
      '@page{size:A4;margin:18mm 17mm 20mm}*{box-sizing:border-box}body{font:10.4pt/1.5 "Liberation Sans","DejaVu Sans",Arial,sans-serif;color:#12263A;margin:0}',
      'h1{font-size:21pt;color:#0E4377;margin:0 0 8mm;padding-bottom:3mm;border-bottom:3px solid #2FB5B4;page-break-before:always}h1.first{page-break-before:avoid}',
      'h2{font-size:14pt;color:#16598D;margin:7mm 0 2.5mm;page-break-after:avoid}p{margin:0 0 3mm;text-align:left}',
      'figure{margin:3mm 0 5mm;text-align:center;page-break-inside:avoid}figure img{max-width:100%;border:1px solid #D9DFE5;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.12)}figcaption{font-size:8.6pt;color:#6B7785;font-style:italic;margin-top:1.5mm}',
      '.note{background:#E4F3F3;border-left:4px solid #2FB5B4;padding:3mm 4mm;border-radius:2px;margin:3mm 0 5mm}',
      'table{border-collapse:collapse;width:100%;margin:2mm 0 5mm;page-break-inside:auto}th{background:#16598D;color:#fff;text-align:left;padding:2mm 3mm}td{padding:2mm 3mm;border:1px solid #D9DFE5;vertical-align:top}tr{page-break-inside:avoid}td:first-child{font-weight:700;width:34%}',
      '.feat td:first-child{color:#0E4377;width:36%}.feat tr:nth-child(odd) td{background:#F2F7F8}',
      '.cover{height:250mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.cover img{width:62mm;margin-bottom:14mm}.cover h1{border:0;font-size:32pt;margin:0 0 4mm;page-break-before:avoid}',
      '.cover .sub{font-size:17pt;color:#2FB5B4;font-weight:700;margin-bottom:5mm}.cover .ver{color:#6B7785}.cover .fict{margin-top:30mm;font-size:9pt;color:#6B7785;font-style:italic}',
      '.toc{page-break-before:always}.toc h1{page-break-before:avoid}.toc .l1{font-weight:700;color:#0E4377;margin-top:3.2mm;font-size:11.5pt}.toc .l2{margin-left:8mm;font-size:10pt}',
      '</style></head><body>']
    out.append(f'<div class="cover"><img src="file://{LOGO}"><h1>Manuel d\'utilisation</h1><div class="sub">Gestion du temps de travail</div><div class="ver">Version {VERSION} · {DATE}</div><div class="fict">Toutes les captures d\'écran utilisent une entreprise fictive (SARL Horizon Services).</div></div>')
    out.append('<div class="toc"><h1>Sommaire</h1>')
    for kind, *rest in M:
        if kind == 'h1': out.append(f'<div class="l1">{esc(rest[0])}</div>')
        elif kind == 'h2': out.append(f'<div class="l2">{esc(rest[0])}</div>')
    out.append('</div>')
    for kind, *rest in M:
        if kind == 'h1': out.append(f'<h1>{esc(rest[0])}</h1>')
        elif kind == 'h2': out.append(f'<h2>{esc(rest[0])}</h2>')
        elif kind == 'p': out.append(f'<p>{esc(rest[0])}</p>')
        elif kind == 'ul': out.append('<ul>' + ''.join(f'<li>{esc(x)}</li>' for x in rest[0]) + '</ul>')
        elif kind == 'note': out.append(f'<div class="note">ℹ&nbsp; {esc(rest[0])}</div>')
        elif kind == 'img':
            f, cap = rest[0], rest[1]; w = rest[2] if len(rest) > 2 else 15.5
            out.append(f'<figure><img src="file://{os.path.join(ROOT, f)}" style="width:{w * 0.97}cm"><figcaption>{esc(cap)}</figcaption></figure>')
        elif kind == 'table':
            heads, rows = rest
            out.append('<table><tr>' + ''.join(f'<th>{esc(x)}</th>' for x in heads) + '</tr>' + ''.join('<tr>' + ''.join(f'<td>{esc(v)}</td>' for v in r) + '</tr>' for r in rows) + '</table>')
        elif kind == 'feat':
            out.append('<table class="feat">' + ''.join(f'<tr><td>✔ {esc(a)}</td><td>{esc(b)}</td></tr>' for a, b in FEATURES) + '</table>')
    out.append('</body></html>')
    open(path, 'w', encoding='utf-8').write('\n'.join(out))

if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
    build_docx(os.path.join(ROOT, 'docs', 'Sijil-Manuel.docx'))
    tmp = os.environ.get('MANUAL_TMP', '/tmp/manuel.html'); build_html(tmp)
    print('docx ok ; html :', tmp)
