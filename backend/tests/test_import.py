try:
    from database import DB_FILE
    print(f"DB_FILE found: {DB_FILE}")
except ImportError as e:
    print(f"ImportError: {e}")
except Exception as e:
    print(f"Error: {e}")
