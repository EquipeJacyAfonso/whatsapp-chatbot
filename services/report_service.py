"""
Serviço de relatórios:
- Gera PDFs com ReportLab
- Extrai texto de PDFs com PyMuPDF (fitz)
"""

import os
import logging
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT

logger = logging.getLogger(__name__)


class ReportService:
    def __init__(self):
        self.reports_dir = os.path.abspath(os.getenv("REPORTS_DIR", "reports"))
        os.makedirs(self.reports_dir, exist_ok=True)

    def generate_pdf(self, titulo: str, conteudo: str, fonte_dados: str = "") -> str:
        """
        Gera um PDF e salva em reports/.
        Retorna o nome do arquivo gerado.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Nome seguro para arquivo
        nome_seguro = "".join(c if c.isalnum() or c in "_ " else "_" for c in titulo)
        nome_seguro = nome_seguro[:40].strip().replace(" ", "_")
        filename = f"{nome_seguro}_{timestamp}.pdf"
        filepath = os.path.join(self.reports_dir, filename)

        try:
            doc = SimpleDocTemplate(
                filepath,
                pagesize=A4,
                rightMargin=2 * cm,
                leftMargin=2 * cm,
                topMargin=2.5 * cm,
                bottomMargin=2 * cm,
            )

            styles = getSampleStyleSheet()
            story = []

            # Estilo do título
            title_style = ParagraphStyle(
                "TitleStyle",
                parent=styles["Title"],
                fontSize=18,
                textColor=colors.HexColor("#1a1a2e"),
                spaceAfter=6,
                alignment=TA_CENTER,
            )

            # Estilo do subtítulo
            sub_style = ParagraphStyle(
                "SubStyle",
                parent=styles["Normal"],
                fontSize=10,
                textColor=colors.grey,
                spaceAfter=16,
                alignment=TA_CENTER,
            )

            # Estilo do corpo
            body_style = ParagraphStyle(
                "BodyStyle",
                parent=styles["Normal"],
                fontSize=11,
                leading=16,
                spaceAfter=8,
                alignment=TA_LEFT,
            )

            # Cabeçalho
            story.append(Paragraph("Administração Jacy Afonso — PT/DF", sub_style))
            story.append(Paragraph(titulo, title_style))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a1a2e")))
            story.append(Spacer(1, 0.3 * cm))

            # Data/hora de geração
            gerado_em = datetime.now().strftime("%d/%m/%Y às %H:%M")
            story.append(Paragraph(f"Gerado em: {gerado_em}" + (f" | Fonte: {fonte_dados}" if fonte_dados else ""), sub_style))
            story.append(Spacer(1, 0.5 * cm))

            # Conteúdo: detecta se tem tabelas (linhas com | )
            linhas = conteudo.split("\n")
            tabela_linhas = []
            texto_buffer = []

            for linha in linhas:
                if "|" in linha and linha.count("|") >= 2:
                    # Flush texto antes da tabela
                    if texto_buffer:
                        texto = "<br/>".join(texto_buffer)
                        story.append(Paragraph(texto, body_style))
                        story.append(Spacer(1, 0.2 * cm))
                        texto_buffer = []
                    tabela_linhas.append(linha)
                else:
                    # Flush tabela antes do texto
                    if tabela_linhas:
                        story.extend(self._build_table(tabela_linhas))
                        story.append(Spacer(1, 0.3 * cm))
                        tabela_linhas = []
                    if linha.startswith("---") or linha.startswith("==="):
                        continue
                    if linha.strip():
                        texto_buffer.append(linha.replace("&", "&amp;").replace("<", "&lt;"))
                    else:
                        if texto_buffer:
                            texto = "<br/>".join(texto_buffer)
                            story.append(Paragraph(texto, body_style))
                            story.append(Spacer(1, 0.2 * cm))
                            texto_buffer = []

            # Flush restantes
            if tabela_linhas:
                story.extend(self._build_table(tabela_linhas))
            if texto_buffer:
                texto = "<br/>".join(texto_buffer)
                story.append(Paragraph(texto, body_style))

            doc.build(story)
            logger.info(f"✅ PDF gerado: {filename}")
            return filename

        except Exception as e:
            logger.error(f"Erro ao gerar PDF: {e}", exc_info=True)
            raise

    def _build_table(self, linhas_com_pipe: list) -> list:
        """Converte linhas com | em uma Table do ReportLab."""
        data = []
        for linha in linhas_com_pipe:
            if set(linha.strip()) <= set("-| "):
                continue  # Pula separadores
            cells = [cell.strip() for cell in linha.split("|")]
            cells = [c for c in cells if c or True]  # Mantém células
            if cells:
                data.append(cells)

        if not data:
            return []

        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4f8")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING", (0, 0), (-1, -1), 5),
        ]))
        return [table]

    def extract_pdf_text(self, filepath: str) -> str:
        """Extrai texto de um PDF usando PyMuPDF."""
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(filepath)
            texto = ""
            for page in doc:
                texto += page.get_text()
            doc.close()
            logger.info(f"✅ PDF lido: {os.path.basename(filepath)} ({len(texto)} chars)")
            return texto.strip()
        except ImportError:
            return "Erro: PyMuPDF não instalado. Execute: pip install pymupdf"
        except Exception as e:
            logger.error(f"Erro ao ler PDF: {e}")
            return f"Erro ao ler o PDF: {str(e)}"
