"""Synthetic public QA fixture; never reads private documents or calls AI."""
from pathlib import Path
from tempfile import mkdtemp
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont

folder = Path(mkdtemp(prefix="lic-document-qa-"))
path = folder / "documento-ficticio.pdf"
pdf = canvas.Canvas(str(path), pagesize=(595, 842))
pdf.setTitle("LIC - Documento ficticio para verificacao")
pdf.setFont("Helvetica-Bold", 18)
pdf.drawString(50, 775, "Documento ficticio - verificacao local")
pdf.setFont("Helvetica", 12)
pdf.drawString(50, 735, "Clausula 1. O prazo depende da notificacao.")
pdf.drawString(50, 710, "Exemplo de tabela:")
for x in (50, 285, 545):
    pdf.line(x, 590, x, 690)
for y in (590, 640, 690):
    pdf.line(50, y, 545, y)
pdf.drawString(65, 660, "Documento")
pdf.drawString(300, 660, "Data ficticia")
pdf.drawString(65, 610, "Prova A")
pdf.drawString(300, 610, "26/09/2026")
pdf.setFont("Helvetica", 10)
pdf.drawString(50, 90, "Nota 1: Sem valor juridico. Nenhum dado pessoal.")
pdf.showPage()
image = Image.new("RGB", (1500, 1900), "white")
draw = ImageDraw.Draw(image)
font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
font = ImageFont.truetype(font_path, 40)
for y, text in [(140, "PAGINA DIGITALIZADA - TESTE FICTICIO"),
                (240, "O pagamento ocorre depois da entrega."),
                (320, "Prazo: dez dias a confirmar pelas partes."),
                (440, "Prova B - documento sem dados pessoais.")]:
    draw.text((80, y), text, font=font, fill="black")
pdf.drawImage(ImageReader(image), 35, 80, width=525, height=665)
pdf.save()
image.save(folder / "scan-original.png")
print(path)
