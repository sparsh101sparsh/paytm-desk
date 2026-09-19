import os
import sys
import shutil
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

# If DATABASE_URL is set (Supabase Postgres), no local /tmp file copying is needed.
# If running without DATABASE_URL, fall back to /tmp/desk.db
if not os.getenv("DATABASE_URL"):
    tmp_db = Path("/tmp/desk.db")
    os.environ["RESOLVEOS_DB_PATH"] = str(tmp_db)
    os.environ["DESK_DB_PATH"] = str(tmp_db)
    if not tmp_db.exists():
        src_db = root_dir / "backend" / "desk.db"
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

os.environ["COGNEE_OPTIONAL"] = os.getenv("COGNEE_OPTIONAL", "1")

from backend.app.main import app
