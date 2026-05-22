"""
Serviço de geração de relatórios PDF com ReportLab.
"""

import logging
import os
import uuid
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable
)

logger = logging.getLogger(__name__)

OUTPUT_DIR = os.getenv("REPORTS_DIR", "reports")
BASE_URL = os.getenv("BASE_URL", "http://localhost:5000")


class ReportService:
    def __init__(self):
        os.makedirs(OUTPUT_DIR, exist_ok=True)

    def gerar(self, tipo: str, dados: list, titulo: str = None) -> str:
        """Gera um PDF e retorna a URL pública de download."""
        filename = f"relatorio_{uuid.uuid4().hex[:8]}.pdf"
        filepath = os.path.join(OUTPUT_DIR, filename)

        titulos = {
            "pessoas_por_cidade": "Relatório de Pessoas por Cidade",
            "listagem_geral": "Listagem Geral de Pessoas",
            "personalizado": "Relatório Personalizado",
        }
        titulo = titulo or titulos.get(tipo, "Relatório")

        self._build_pdf(filepath, titulo, dados, tipo)
        logger.info(f"Relatório gerado: {filepath} ({len(dados)} registros)")

        return f"{BASE_URL}/reports/{filename}"

    def _build_pdf(self, filepath: str, titulo: str, dados: list, tipo: str):
        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "Title",
            parent=styles["Title"],
            fontSize=16,
            textColor=colors.HexColor("#1a237e"),
            spaceAfter=6,
        )
        sub_style = ParagraphStyle(
            "Sub",
            parent=styles["Normal"],
            fontSize=9,
            textColor=colors.grey,
            spaceAfter=12,
        )

        elements = []

        # Cabeçalho
        elements.append(Paragraph(titulo, title_style))
        elements.append(
            Paragraph(
                f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')} | Total: {len(dados)} registros",
                sub_style,
            )
        )
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a237e")))
        elements.append(Spacer(1, 0.4 * cm))

        if not dados:
            elements.append(Paragraph("Nenhum dado encontrado para os filtros informados.", styles["Normal"]))
        else:
            table_data = self._build_table_data(dados, tipo)
            col_widths = self._get_col_widths(tipo)
            table = Table(table_data, colWidths=col_widths, repeatRows=1)
            table.setStyle(self._table_style())
            elements.append(table)

        # Rodapé simples
        elements.append(Spacer(1, 0.5 * cm))
        elements.append(
            Paragraph(
                "Documento gerado automaticamente pelo ChatBot.",
                ParagraphStyle("footer", parent=styles["Normal"], fontSize=7, textColor=colors.grey),
            )
        )

        doc.build(elements)

    def _build_table_data(self, dados: list, tipo: str) -> list:
        if tipo == "pessoas_por_cidade":
            header = ["Cidade", "Estado", "Total de Pessoas"]
            rows = [[d.get("cidade", ""), d.get("estado", ""), str(d.get("total", 0))] for d in dados]
        elif tipo == "listagem_geral":
            header = ["Nome", "CPF", "Cidade", "Estado", "Bairro", "Telefone"]
            rows = [
                [
                    d.get("nome", ""),
                    self._format_cpf(d.get("cpf", "")),
                    d.get("cidade", ""),
                    d.get("estado", ""),
                    d.get("bairro", ""),
                    d.get("telefone", ""),
                ]
                for d in dados
            ]
        else:
            if not dados:
                return [["Sem dados"]]
            header = list(dados[0].keys())
            rows = [[str(d.get(k, "")) for k in header] for d in dados]

        return [header] + rows

    def _get_col_widths(self, tipo: str):
        avail = 17 * cm
        if tipo == "pessoas_por_cidade":
            return [avail * 0.5, avail * 0.2, avail * 0.3]
        elif tipo == "listagem_geral":
            return [avail * 0.25, avail * 0.15, avail * 0.15, avail * 0.1, avail * 0.15, avail * 0.2]
        return None  # auto

    def _table_style(self):
        return TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a237e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#e8eaf6")]),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9fa8da")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ])

    @staticmethod
    def _format_cpf(cpf: str) -> str:
        cpf = "".join(filter(str.isdigit, str(cpf)))
        if len(cpf) == 11:
            return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
        return cpf
