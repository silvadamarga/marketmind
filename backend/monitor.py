import threading
import time
import json
import datetime
import math
import yfinance as yf
import pandas as pd
from config import (
    VWAP_WATCHLIST, VWAP_CHECK_INTERVAL, TICKER_MAP, 
    MACRO_TICKERS, SECTOR_TICKERS, CALENDAR_EVENTS, VWAP_BANDS, RSI_PERIOD
)
from database import safe_round, log_market_data
from analysis import calculate_rsi

# --- STATE ---
DATA_LOCK = threading.Lock()
DOWNLOAD_LOCK = threading.Lock()
LATEST_VWAP_DATA = {}
LATEST_MACRO_CONTEXT = {}

# --- HELPERS ---

def get_days_until(event_name):
    today = datetime.date.today()
    dates = CALENDAR_EVENTS.get(event_name, [])
    future_dates = []
    for d_str in dates:
        try:
            d = datetime.datetime.strptime(d_str, "%Y-%m-%d").date()
            if d >= today:
                future_dates.append(d)
        except: pass
    
    if not future_dates: return -1
    future_dates.sort()
    return (future_dates[0] - today).days

def get_session_phase():
    now = datetime.datetime.now(datetime.timezone.utc)
    est_hour = (now.hour - 5) % 24 
    if 4 <= est_hour < 9: return "PRE_MARKET"
    if 9 <= est_hour < 10: return "MARKET_OPEN"
    if 10 <= est_hour < 12: return "MORNING_KR"
    if 12 <= est_hour < 14: return "LUNCH_LULL"
    if 14 <= est_hour < 16: return "POWER_HOUR"
    if 16 <= est_hour < 20: return "AFTER_HOURS"
    return "OVN_FUTURES"

def get_market_regime_from_cache():
    heatmap = {}
    vix_val = 0.0
    with DATA_LOCK:
        for ticker, data in LATEST_VWAP_DATA.items():
            heatmap[ticker] = data.get('daily_change', 0.0)
            if ticker == "^VIX": vix_val = data.get('price', 0.0)
    return vix_val, json.dumps(heatmap)

def get_macro_context():
    """
    Fetches macro data, calculates sector rotation, and calendar risk.
    Returns a dictionary suitable for logging.
    """
    context = {}
    
    # 1. Calendar Risk
    context['days_until_fomc'] = get_days_until("FOMC")
    context['days_until_cpi'] = get_days_until("CPI")
    context['days_until_nfp'] = get_days_until("NFP")
    
    # 2. Fetch Market Data (Batch Download)
    all_tickers = MACRO_TICKERS + SECTOR_TICKERS
    try:
        # Download 1 year of data to calculate 200d SMA
        # yfinance download returns a MultiIndex DataFrame if multiple tickers are requested
        with DOWNLOAD_LOCK:
            df = yf.download(all_tickers, period="1y", interval="1d", progress=False)
        
        # Handle MultiIndex columns if present
        if isinstance(df.columns, pd.MultiIndex):
            # We want 'Close' prices
            try:
                closes = df['Close']
            except KeyError:
                # Fallback if 'Close' is not at top level (sometimes structure varies)
                closes = df.xs('Close', level=0, axis=1)
        else:
            closes = df # Should not happen with multiple tickers but safe to handle
            
        if closes.empty: return context
        
        # Fill missing values to avoid NaNs in calculations
        closes = closes.ffill()

        # Get latest prices (last row)
        latest = closes.iloc[-1]
        
        # 3. Macro Prices & Yields
        context['price_spy'] = latest.get('SPY')
        context['price_qqq'] = latest.get('QQQ')
        context['price_iwm'] = latest.get('IWM')
        context['yield_10y'] = latest.get('^TNX')
        context['price_dxy'] = latest.get('DX-Y.NYB')
        context['price_btc'] = latest.get('BTC-USD')
        context['market_vix'] = latest.get('^VIX')
        
        # 4. Regime Filters: SPY 200d SMA Distance
        if 'SPY' in closes:
            spy_series = closes['SPY'].dropna()
            if len(spy_series) >= 200:
                sma_200 = spy_series.rolling(window=200).mean().iloc[-1]
                current_spy = latest.get('SPY')
                if not math.isnan(sma_200) and current_spy and not math.isnan(current_spy):
                    context['spy_200d_sma_dist'] = (current_spy - sma_200) / sma_200
        
        # 5. Sector Rotation (Relative Strength vs SPY)
        # Calculate daily % change for the latest day
        if len(closes) >= 2:
            # Use iloc[-2] (yesterday) and iloc[-1] (today/latest)
            prev = closes.iloc[-2]
            curr = closes.iloc[-1]
            
            spy_ret = 0.0
            if 'SPY' in closes:
                p_spy = prev.get('SPY')
                c_spy = curr.get('SPY')
                if p_spy and not math.isnan(p_spy) and p_spy != 0:
                    spy_ret = (c_spy - p_spy) / p_spy
            
            sector_rel = {}
            for sec in SECTOR_TICKERS:
                if sec in closes:
                    p_sec = prev.get(sec)
                    c_sec = curr.get(sec)
                    if p_sec and not math.isnan(p_sec) and p_sec != 0:
                        sec_ret = (c_sec - p_sec) / p_sec
                        sector_rel[sec] = round((sec_ret - spy_ret) * 100, 2) # Excess return in %
            
            context['sector_rel_strength'] = json.dumps(sector_rel)
            
        # 6. Market Breadth (Approximation using Sector ETFs)
        # Count how many sectors are positive
        advancing_sectors = 0
        for sec in SECTOR_TICKERS:
            if sec in closes and len(closes) >= 2:
                if closes[sec].iloc[-1] > closes[sec].iloc[-2]:
                    advancing_sectors += 1
        context['market_breadth'] = advancing_sectors
             
    except Exception as e:
        print(f"❌ Macro Fetch Error: {e}")
        
    return context

# --- LOOPS ---

def macro_monitor_loop():
    print("🌍 Macro Monitor Started")
    while True:
        try:
            context = get_macro_context()
            if context:
                with DATA_LOCK:
                    LATEST_MACRO_CONTEXT.update(context)
                # print(f"✅ Macro Data Updated: SPY={context.get('price_spy')}")
        except Exception as e:
            print(f"⚠️ Macro Monitor Error: {e}")
        time.sleep(900) # 15 minutes

from database import safe_round, log_market_data
from analysis import calculate_rsi

# ... (Previous code remains same until vwap_monitor_loop)

def vwap_monitor_loop():
    print(f"📈 Monitor Started: Tracking {len(VWAP_WATCHLIST)} Assets")
    while True:
        try:
            # Batch Download with Fallback
            # Period='5d' to ensure enough data for RSI/VWAP calculation
            try:
                with DOWNLOAD_LOCK:
                    df = yf.download(VWAP_WATCHLIST, period='5d', interval='15m', progress=False, group_by='ticker', auto_adjust=True, prepost=True, threads=False)
            except Exception as e:
                print(f"⚠️ Batch download failed: {e}. Switching to individual downloads.")
                df = pd.DataFrame()

            timestamp = datetime.datetime.now().isoformat()
            batch_data = []

            for ticker in VWAP_WATCHLIST:
                try:
                    t_df = None
                    
                    # 1. Try to get data from batch
                    if not df.empty:
                        if len(VWAP_WATCHLIST) > 1:
                            if ticker in df:
                                t_df = df[ticker].copy()
                        else:
                            t_df = df.copy()

                    # 2. Fallback: Individual Download if missing or empty
                    if t_df is None or t_df.empty:
                        # print(f"⚠️ Fetching {ticker} individually...")
                        try:
                            with DOWNLOAD_LOCK:
                                t_df = yf.download(ticker, period='5d', interval='15m', progress=False, auto_adjust=True, prepost=True)
                        except Exception as e:
                            print(f"❌ Failed to download {ticker}: {e}")
                            continue

                    # FIX: Use last_valid_index to find the latest data point
                    # This handles mixed asset classes (Crypto vs Stocks) where indices might not align
                    # Find the latest VALID candle (with volume for stocks)
                    # Iterate backwards from the last available data point
                    latest = None
                    valid_idx = None
                    
                    # Check if it's an index (starts with ^) or known index like DX-Y
                    is_index = ticker.startswith('^') or ticker == 'DX-Y.NYB'
                    
                    # Iterate backwards through the dataframe
                    for idx in reversed(t_df.index):
                        row = t_df.loc[idx]
                        
                        # Check for valid price first
                        if pd.isna(row['Close']) or row['Close'] == 0:
                            continue

                        # For indices, any data is valid. For stocks/ETFs, we need Volume > 0
                        if is_index or (row['Volume'] > 0):
                            latest = row
                            valid_idx = idx
                            break
                    
                    if latest is None:
                        print(f"⚠️ {ticker} has no valid data (Price > 0 and Volume > 0) in the fetched period")
                        continue

                    # Clean data for technicals up to the valid index
                    t_df_clean = t_df.loc[:valid_idx].dropna()

                    if len(t_df_clean) < 50: 
                        print(f"⚠️ {ticker} skipped due to insufficient data points ({len(t_df_clean)})")
                        continue
                    
                    # Calculate Technicals on clean data
                    t_df_clean['Typical_Price'] = (t_df_clean['High'] + t_df_clean['Low'] + t_df_clean['Close']) / 3
                    t_df_clean['VWAP'] = (t_df_clean['Typical_Price'] * t_df_clean['Volume']).cumsum() / t_df_clean['Volume'].cumsum()
                    
                    # RSI
                    delta = t_df_clean['Close'].diff()
                    gain = (delta.where(delta > 0, 0)).rolling(window=RSI_PERIOD).mean()
                    loss = (-delta.where(delta < 0, 0)).rolling(window=RSI_PERIOD).mean()
                    rs = gain / loss
                    t_df_clean['RSI'] = 100 - (100 / (1 + rs))
                    
                    # RVOL
                    t_df_clean['RVOL'] = t_df_clean['Volume'] / t_df_clean['Volume'].rolling(window=20).mean()

                    # VWAP Bands
                    rolling_std = t_df_clean['Close'].rolling(window=26).std()
                    t_df_clean['Upper_Band'] = t_df_clean['VWAP'] + (rolling_std * VWAP_BANDS)
                    t_df_clean['Lower_Band'] = t_df_clean['VWAP'] - (rolling_std * VWAP_BANDS)

                    # Re-assign latest from the calculated dataframe to get technicals
                    latest = t_df_clean.iloc[-1]
                    price = latest['Close']
                    status = "NEUTRAL"
                    if price > latest['Upper_Band']: status = "OVERBOUGHT"
                    elif price < latest['Lower_Band']: status = "OVERSOLD"

                    # Calculate Daily Change
                    # FIX: Use t_df_clean to ensure we use valid data and correct date
                    current_date = t_df_clean.index[-1].date()
                    day_data = t_df_clean[t_df_clean.index.date == current_date]
                    daily_change = 0.0
                    if not day_data.empty:
                        open_price = float(day_data['Open'].iloc[0])
                        if open_price != 0:
                            daily_change = ((price - open_price) / open_price) * 100

                    # Prepare Data Object
                    data_obj = {
                        "ticker": ticker,
                        "open": safe_round(latest['Open']),
                        "high": safe_round(latest['High']),
                        "low": safe_round(latest['Low']),
                        "close": safe_round(latest['Close']),
                        "volume": int(latest['Volume']),
                        "vwap": safe_round(latest['VWAP']),
                        "rsi": safe_round(latest['RSI'], 1),
                        "rvol": safe_round(latest['RVOL'], 1)
                    }
                    batch_data.append(data_obj)

                    # Update State
                    with DATA_LOCK:
                        LATEST_VWAP_DATA[ticker] = {
                            "ticker": ticker,
                            "name": TICKER_MAP.get(ticker, ticker),
                            "price": data_obj['close'],
                            "high": data_obj['high'],
                            "low": data_obj['low'],
                            "volume": data_obj['volume'],
                            "vwap": data_obj['vwap'],
                            "rsi": data_obj['rsi'],
                            "rvol": data_obj['rvol'],
                            "daily_change": safe_round(daily_change, 2),
                            "status": status,
                        }

                except Exception as e:
                    print(f"⚠️ Error processing {ticker}: {e}")
                    continue
            
            # Log Batch to DB
            if batch_data:
                log_market_data(timestamp, batch_data)

        except Exception as e:
            print(f"⚠️ Monitor Loop Error: {e}")
            
        time.sleep(VWAP_CHECK_INTERVAL)
