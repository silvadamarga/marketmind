import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "market_mind.db")

def migrate():
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        
        columns_to_add = [
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
        
        for col_name, col_type in columns_to_add:
            try:
                print(f"Adding column {col_name}...")
                c.execute(f"ALTER TABLE logs ADD COLUMN {col_name} {col_type}")
                print(f"✅ Added {col_name}")
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e):
                    print(f"⚠️ Column {col_name} already exists.")
                else:
                    print(f"❌ Error adding {col_name}: {e}")
                    
        conn.commit()
        conn.close()
        print("Migration complete.")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
