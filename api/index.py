import os
import sys
import shutil
from pathlib import Path

# CRITICAL: Set RESOLVEOS_DB_PATH BEFORE importing any backend modules.
# db.py reads this env var at module import time (module-level DB_PATH assignment).
# If we set it after the import, db.py will have already resolved to the wrong path.
tmp_db = Path("/tmp/desk.db")
os.environ["RESOLVEOS_DB_PATH"] = str(tmp_db)
os.environ["DESK_DB_PATH"] = str(tmp_db)
os.environ["COGNEE_OPTIONAL"] = os.getenv("COGNEE_OPTIONAL", "1")

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

# Seed / initialize in /tmp
src_db = root_dir / "backend" / "desk.db"
if not tmp_db.exists():
    if src_db.exists():
        try:
            shutil.copy(src_db, tmp_db)
        except Exception:
            pass
    if not tmp_db.exists():
        try:
            from backend.app.seed import seed_database
            seed_database()
        except Exception as e:
            print("Seed error on cold start:", e)

from backend.app.main import app
