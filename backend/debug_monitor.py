import yfinance as yf
import pandas as pd
from config import VWAP_WATCHLIST

print(f"Downloading data for {len(VWAP_WATCHLIST)} tickers...")
try:
    df = yf.download(VWAP_WATCHLIST, period='5d', interval='15m', progress=False, group_by='ticker', auto_adjust=True, prepost=True, threads=False)
    print("Download complete.")
    print(f"Shape: {df.shape}")
    print(f"Columns: {df.columns}")
    
    for ticker in VWAP_WATCHLIST:
        try:
            if len(VWAP_WATCHLIST) > 1:
                t_df = df[ticker].copy()
            else:
                t_df = df.copy()
            
            last_idx = t_df['Close'].last_valid_index()
            print(f"Ticker: {ticker}, Last Index: {last_idx}")
            
            if last_idx is None:
                print(f"  -> NO DATA (last_idx is None)")
                continue
                
            t_df_clean = t_df.loc[:last_idx].dropna()
            print(f"  -> Clean Rows: {len(t_df_clean)}")
            
            if len(t_df_clean) < 50:
                print(f"  -> INSUFFICIENT DATA (<50)")
                
        except Exception as e:
            print(f"Error checking {ticker}: {e}")

except Exception as e:
    print(f"Download failed: {e}")
