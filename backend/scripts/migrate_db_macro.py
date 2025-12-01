import sqlite3
from config import DB_FILE

def migrate():
    print(f"Migrating database: {DB_FILE}")
    try:
        with sqlite3.connect(DB_FILE) as conn:
            c = conn.cursor()
            
            # List of new columns to add
            new_columns = [
                ("price_spy", "REAL"),
                ("price_qqq", "REAL"),
                ("price_iwm", "REAL"),
                ("yield_10y", "REAL"),
                ("price_dxy", "REAL"),
                ("price_btc", "REAL"),
                ("days_until_fomc", "INTEGER"),
                ("days_until_cpi", "INTEGER"),
                ("days_until_nfp", "INTEGER"),
                ("sector_rel_strength", "TEXT"),
                ("spy_200d_sma_dist", "REAL"),
                ("market_breadth", "INTEGER")
            ]
            
            for col_name, col_type in new_columns:
                try:
                    c.execute(f"ALTER TABLE logs ADD COLUMN {col_name} {col_type}")
                    print(f"✅ Added column: {col_name}")
                except sqlite3.OperationalError as e:
                    if "duplicate column name" in str(e):
                        print(f"⚠️ Column already exists: {col_name}")
                    else:
                        print(f"❌ Error adding {col_name}: {e}")
            
            conn.commit()
            print("Migration complete.")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")

if __name__ == "__main__":
    migrate()
