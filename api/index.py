import os
import sys
import shutil
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

# Configure SQLite DB in /tmp for Vercel serverless environment
tmp_db = Path("/tmp/desk.db")
src_db = root_dir / "backend" / "desk.db"

# Seed / initialize in /tmp
if not tmp_db.exists():
    if src_db.exists():
        try:
            shutil.copy(src_db, tmp_db)
        except Exception:
            pass
    if not tmp_db.exists():
        os.environ["DESK_DB_PATH"] = str(tmp_db)
        os.environ["COGNEE_OPTIONAL"] = "1"
        try:
            from backend.app.seed import seed_database
            seed_database()
        except Exception as e:
            print("Seed error on cold start:", e)

os.environ["DESK_DB_PATH"] = str(tmp_db)
os.environ["COGNEE_OPTIONAL"] = os.getenv("COGNEE_OPTIONAL", "1")

from backend.app.main import app
