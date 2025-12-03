import yfinance as yf
import pandas as pd
import sys
import os

# Add parent dir to path to import config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import VWAP_WATCHLIST

print(f"🔍 Starting Market Data Diagnostic for {len(VWAP_WATCHLIST)} tickers...")
print("-" * 50)

success_count = 0
fail_count = 0
skipped_count = 0

# 1. Test Batch Download
print("\n1️⃣ Testing Batch Download...")
try:
    df = yf.download(VWAP_WATCHLIST, period='5d', interval='15m', progress=True, group_by='ticker', auto_adjust=True, prepost=True, threads=False)
    print(f"✅ Batch Download Complete. Shape: {df.shape}")
except Exception as e:
    print(f"❌ Batch Download Failed: {e}")
    df = pd.DataFrame()

print("\n2️⃣ Checking Individual Ticker Data...")
for ticker in VWAP_WATCHLIST:
    status = "UNKNOWN"
    details = ""
    
    try:
        t_df = None
        source = "BATCH"
        
        # Try batch first
        if not df.empty:
            if len(VWAP_WATCHLIST) > 1:
                if ticker in df:
                    t_df = df[ticker].copy()
            else:
                t_df = df.copy()
        
        # Fallback
        if t_df is None or t_df.empty:
            source = "INDIVIDUAL"
            # print(f"   ⚠️ Fetching {ticker} individually...")
            t_df = yf.download(ticker, period='5d', interval='15m', progress=False, auto_adjust=True, prepost=True)

        # Validate
        if t_df is None or t_df.empty:
            status = "FAILED"
            details = "No data returned"
            fail_count += 1
        else:
            last_idx = t_df['Close'].last_valid_index()
            if last_idx is None:
                status = "FAILED"
                details = "Last index is None"
                fail_count += 1
            else:
                t_df_clean = t_df.loc[:last_idx].dropna()
                count = len(t_df_clean)
                if count < 50:
                    status = "SKIPPED"
                    details = f"Insufficient data ({count} rows)"
                    skipped_count += 1
                else:
                    status = "SUCCESS"
                    details = f"{count} rows | Last: {last_idx} | Source: {source}"
                    success_count += 1
                    
    except Exception as e:
        status = "ERROR"
        details = str(e)
        fail_count += 1
        
    # Print Status
    icon = "✅" if status == "SUCCESS" else "⚠️" if status == "SKIPPED" else "❌"
    print(f"{icon} {ticker:<10} : {status:<10} | {details}")

print("-" * 50)
print(f"SUMMARY: Success: {success_count} | Skipped: {skipped_count} | Failed: {fail_count}")
print("-" * 50)
