import sqlite3
import os

# Use absolute path to match your server setup
DB_FILE = "/var/www/market-mind/backend/market_mind.db"

def migrate():
    if not os.path.exists(DB_FILE):
        print(f"❌ Database {DB_FILE} not found.")
        return

    print(f"🔧 Migrating {DB_FILE}...")

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # List of ALL new columns we added recently
    new_columns = [
        ("source_package", "TEXT"),
        ("source_icon", "TEXT"),
        ("event_category", "TEXT"),
        ("novelty_score", "INTEGER"),
        ("ai_confidence", "INTEGER")
    ]

    c.execute("PRAGMA table_info(logs)")
    existing_cols = [row[1] for row in c.fetchall()]

    try:
        for col_name, col_type in new_columns:
            if col_name not in existing_cols:
                print(f"   ➕ Adding column: {col_name}...")
                c.execute(f"ALTER TABLE logs ADD COLUMN {col_name} {col_type}")
            else:
                print(f"   -- Skipping {col_name} (exists)")

        conn.commit()
        print("✅ Migration Complete!")

    except Exception as e:
        print(f"❌ Migration Failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()