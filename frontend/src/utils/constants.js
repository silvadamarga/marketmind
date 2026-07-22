export const TICKER_NAMES = {
    'SPY': 'S&P 500', 'QQQ': 'Nasdaq 100', 'IWM': 'Russell 2000',
    'DIA': 'Dow Jones', 'VTI': 'Total Market',
    '^TNX': '10Y Yield', 'DX-Y.NYB': 'US Dollar', 'BTC-USD': 'Bitcoin',
    'ETH-USD': 'Ethereum', '^VIX': 'Volatility', 'XLE': 'Energy',
    'XLF': 'Financials', 'XLK': 'Technology', 'XLV': 'Healthcare',
    'XLP': 'Staples', 'XLU': 'Utilities', 'XLY': 'Discretionary',
    'XLI': 'Industrials', 'XLB': 'Materials', 'XLRE': 'Real Estate',
    'XLC': 'Comm Svcs', 'SMH': 'Semiconductors', 'XBI': 'Biotech',
    'XRT': 'Retail', 'ITB': 'Homebuilders', 'JNK': 'Junk Bonds',
    'GLD': 'Gold', 'SLV': 'Silver', 'USO': 'Crude Oil', 'TLT': '20Y Treasury'
};

// --- Intraday Bias Read -------------------------------------------------
// Fuses VWAP side (control), change (direction/size), rvol (conviction) and
// RSI (exhaustion) into one glanceable bull/bear state. Tuned for regular
// trading hours, where VWAP and rvol are live and meaningful.
export const BIAS_THRESHOLDS = {
    NOTABLE_RVOL: 1.5,   // rvol at/above this = volume-confirmed
    BIG_MOVE: 1.0,       // |daily_change| % considered a meaningful move
    RSI_HOT: 70,         // overbought — extended
    RSI_COLD: 30,        // oversold — washed out
    RS_FLAT: 0.15,       // |sector − SPY| % below this = in-line with market
    RS_STRONG: 0.5,      // |sector − SPY| % at/above = strong leadership / lag
};

// The 11 sector ETFs read RELATIVE to SPY (leadership). Everything else
// (SPY, QQQ, IWM, VIX, yields, dollar, BTC) reads absolute — it sets the regime.
export const SECTOR_ETFS = new Set([
    'XLE', 'XLF', 'XLK', 'XLV', 'XLP', 'XLU', 'XLY', 'XLI', 'XLB', 'XLRE', 'XLC',
]);
export const BENCHMARK = 'SPY';

// Bias states, most bullish -> most bearish. `accent` = left rail, `text` =
// glyph + change colour. One source of truth so the guide always matches.
export const BIAS = {
    STRONG_BULL: { key: 'STRONG_BULL', label: 'Strong Bull', glyph: '▲▲', tone: 'bull',
        text: 'text-emerald-400', accent: 'bg-emerald-400',
        desc: 'Above VWAP and up on the day, confirmed by heavy volume.' },
    BULL: { key: 'BULL', label: 'Bull', glyph: '▲', tone: 'bull',
        text: 'text-emerald-400', accent: 'bg-emerald-500/50',
        desc: 'Above VWAP and up, but light volume or a small move.' },
    NEUTRAL: { key: 'NEUTRAL', label: 'Neutral', glyph: '●', tone: 'flat',
        text: 'text-slate-400', accent: 'bg-slate-600',
        desc: 'VWAP and change disagree, or flat — no clear edge.' },
    BEAR: { key: 'BEAR', label: 'Bear', glyph: '▼', tone: 'bear',
        text: 'text-rose-400', accent: 'bg-rose-500/50',
        desc: 'Below VWAP and down, but light volume or a small move.' },
    STRONG_BEAR: { key: 'STRONG_BEAR', label: 'Strong Bear', glyph: '▼▼', tone: 'bear',
        text: 'text-rose-400', accent: 'bg-rose-400',
        desc: 'Below VWAP and down on the day, confirmed by heavy volume.' },
};

// Caution overlays — never flip the bias, only warn it may be stretched.
export const BIAS_FLAG = {
    EXTENDED: { key: 'EXTENDED', label: 'Extended', icon: 'zap', text: 'text-amber-400',
        desc: 'Bullish but RSI > 70 — running hot, chase / fade risk.' },
    WASHED: { key: 'WASHED', label: 'Washed Out', icon: 'droplets', text: 'text-cyan-400',
        desc: 'Bearish but RSI < 30 — oversold, bounce risk.' },
};

function dirToState(dir, strong) {
    if (dir > 0) return strong ? BIAS.STRONG_BULL : BIAS.BULL;
    if (dir < 0) return strong ? BIAS.STRONG_BEAR : BIAS.BEAR;
    return BIAS.NEUTRAL;
}

function rsiFlag(dir, rsi) {
    if (dir > 0 && rsi != null && rsi > BIAS_THRESHOLDS.RSI_HOT) return BIAS_FLAG.EXTENDED;
    if (dir < 0 && rsi != null && rsi < BIAS_THRESHOLDS.RSI_COLD) return BIAS_FLAG.WASHED;
    return null;
}

// Absolute intraday fusion: VWAP side (control) + change (direction) must agree,
// rvol confirms strength, RSI flags exhaustion. The sophisticated per-name read
// kept for the drill-down. Null-safe for volume/VWAP-less instruments (VIX etc).
export function absoluteBias(sig) {
    const { price, vwap, daily_change, rvol, rsi } = sig;
    const chg = daily_change ?? 0;
    const hasVwap = vwap != null && vwap > 0;
    const hasVol = rvol != null && rvol > 0;

    const structure = hasVwap ? (price > vwap ? 1 : -1) : 0;
    const momentum = chg > 0 ? 1 : chg < 0 ? -1 : 0;
    const conflict = structure !== 0 && momentum !== 0 && structure !== momentum;
    const dir = (momentum === 0 || conflict) ? 0 : momentum;

    const volConf = (rvol ?? 0) >= BIAS_THRESHOLDS.NOTABLE_RVOL;
    const bigMove = Math.abs(chg) >= BIAS_THRESHOLDS.BIG_MOVE;
    const strong = dir !== 0 && bigMove && (hasVol ? volConf : true);

    return { state: dirToState(dir, strong), flag: rsiFlag(dir, rsi) };
}

// Relative read for sectors: leadership vs SPY. Direction = sign of RS
// (sector change − SPY change); rvol still confirms strength. This is the
// headline "is this sector bullish/bearish vs the market" the tape answers.
export function relativeBias(sig, spyChange) {
    const rs = (sig.daily_change ?? 0) - spyChange;
    const hasVol = sig.rvol != null && sig.rvol > 0;
    const volConf = (sig.rvol ?? 0) >= BIAS_THRESHOLDS.NOTABLE_RVOL;

    const dir = Math.abs(rs) < BIAS_THRESHOLDS.RS_FLAT ? 0 : (rs > 0 ? 1 : -1);
    const strong = dir !== 0 && Math.abs(rs) >= BIAS_THRESHOLDS.RS_STRONG && (hasVol ? volConf : true);

    return { state: dirToState(dir, strong), flag: rsiFlag(dir, sig.rsi), rs };
}

// Headline bias for the tape. Sectors → relative-to-SPY leadership; everything
// else → absolute. Always carries the absolute fusion in `abs` for the tooltip,
// so the sophisticated per-name read stays available for decisions.
export function computeBias(sig, ctx = {}) {
    const abs = absoluteBias(sig);
    const isSector = SECTOR_ETFS.has(sig.ticker);
    if (isSector && ctx.spyChange != null) {
        const rel = relativeBias(sig, ctx.spyChange);
        return { ...rel, isSector: true, abs };
    }
    return { ...abs, rs: null, isSector: false, abs };
}
