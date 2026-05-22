"""
scheduler.py
────────────
Executa o sync automaticamente em intervalos configuráveis.
Pode rodar junto com o Flask (em thread separada) ou standalone.

Uso standalone:
  python scheduler.py                  # sync a cada 30 min (padrão)
  SYNC_INTERVAL_MINUTES=60 python scheduler.py

Como adicionar ao main.py (opcional):
  from sync.scheduler import start_scheduler
  start_scheduler()   # chame antes de app.run()
"""

import os
import time
import logging
import threading
from datetime import datetime

from sync.sync_sheets_to_postgres import sync

logger = logging.getLogger(__name__)

INTERVAL_MINUTES = int(os.getenv("SYNC_INTERVAL_MINUTES", "30"))


def run_sync_job():
    """Job executado pelo scheduler."""
    try:
        logger.info(f"[SCHEDULER] Iniciando sync automático ({datetime.now().strftime('%H:%M:%S')})")
        result = sync()
        logger.info(f"[SCHEDULER] Sync OK: {result}")
    except Exception as e:
        logger.error(f"[SCHEDULER] Erro no sync: {e}", exc_info=True)


def start_scheduler(interval_minutes: int = None):
    """
    Inicia o scheduler em uma thread daemon.
    Executa imediatamente na primeira vez e depois a cada N minutos.
    """
    interval = interval_minutes or INTERVAL_MINUTES

    def loop():
        logger.info(f"[SCHEDULER] Iniciado — sync a cada {interval} minuto(s)")
        run_sync_job()  # primeira execução imediata
        while True:
            time.sleep(interval * 60)
            run_sync_job()

    thread = threading.Thread(target=loop, daemon=True, name="sync-scheduler")
    thread.start()
    return thread


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler("sync.log", encoding="utf-8"),
        ],
    )
    logger.info("Scheduler standalone iniciado. Pressione Ctrl+C para parar.")
    start_scheduler()
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        logger.info("Scheduler encerrado.")
