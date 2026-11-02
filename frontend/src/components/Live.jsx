import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// The forge's Live desk (forge plan 37), phone first. The forge's tape pushes a
// snapshot every 5 minutes of the US session; this page shows one name at a
// time beside this box's own news and market strip. It draws no direction
// call: no buy or sell words, no score, and lab picks only with their grade.
// Every number carries its age.

const fmt = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgn = (v, d = 2, unit = '%') => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}${unit}`);
const tone = (v) => (v === null || v === undefined ? 'text-slate-500' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');
const ago = (s) => (s === null || s === undefined ? '—' : s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`);
const ageOf = (iso) => (iso ? Math.max(0, Math.round((Date.now() - new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)) / 1000)) : null);

const RANGES = [
    { k: '1D', src: 'intraday', label: '1D · 5m' },
    { k: '5D', src: 'intraday', label: '5D · 5m' },
    { k: '6M', src: 'daily', label: '6M' },
    { k: '1Y', src: 'daily', label: '1Y' },
];
const LINE_COL = { cost: '#a78bfa', stop: '#f43f5e', level: '#f59e0b' };
const SMA_COL = { SMA20: '#38bdf8', SMA50: '#e879f9', SMA200: '#facc15' };
const MARK_COL = { news: '#818cf8', flash: '#f59e0b', lab: '#34d399' };
const OFF_KEY = 'live-off';

const readOff = () => {
    try { return new Set(JSON.parse(localStorage.getItem(OFF_KEY) || '[]')); } catch { return new Set(); }
};
const saveOff = (s) => {
    try { localStorage.setItem(OFF_KEY, JSON.stringify([...s])); } catch { /* private mode: per-visit only */ }
};

// Which bars a range shows, and the SMAs aligned to them (daily only).
function slice(ch, range) {
    const r = RANGES.find((x) => x.k === range) || RANGES[0];
    if (r.src === 'intraday') {
        let bars = ch.intraday || [];
        if (range === '1D' && bars.length) {
            const day = bars[bars.length - 1][0].slice(0, 10);
            bars = bars.filter((b) => b[0].startsWith(day));
        }
        return { bars, sma: {}, intraday: true };
    }
    const n = range === '6M' ? 126 : 260;
    const daily = ch.daily || [];
    const from = Math.max(0, daily.length - n);
    const sma = {};
    for (const [k, v] of Object.entries(ch.sma || {})) sma[k] = (v || []).slice(v.length - daily.length + from);
    return { bars: daily.slice(from), sma, intraday: false };
}

function Candles({ ch, range, off, onPick, pick }) {
    const box = useRef(null);
    const { bars, sma, intraday } = slice(ch, range);
    const H = 250, L = 4, R = 46, T = 8, B = 30, n = bars.length;
    const [W, setW] = useState(360);
    useEffect(() => {
        if (!box.current) return undefined;
        const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
        ro.observe(box.current);
        return () => ro.disconnect();
    }, [n > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!n) return <div ref={box} className="w-full h-[250px] flex items-center justify-center text-sm text-slate-500">no bars for this range</div>;

    const hi_ = (b) => b[2] ?? Math.max(b[1] ?? b[4], b[4]);
    const lo_ = (b) => b[3] ?? Math.min(b[1] ?? b[4], b[4]);
    let lo = Math.min(...bars.map(lo_)), hi = Math.max(...bars.map(hi_));
    const lines = (ch.lines || []).filter((l) => !off.has(l.kind));
    for (const l of lines) if (l.y > lo * 0.85 && l.y < hi * 1.15) { lo = Math.min(lo, l.y); hi = Math.max(hi, l.y); }
    for (const k of Object.keys(sma)) if (!off.has(k)) for (const v of sma[k]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = (hi - lo) * 0.05 || 1; lo -= pad; hi += pad;
    const bw = (W - L - R) / n;
    const X = (i) => L + (i + 0.5) * bw;
    const Y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const dec = Math.max(0, Math.min(4, 2 - Math.floor(Math.log10(hi - lo))));

    // markers sit under the first bar at or after their time
    const keyOf = (s) => (intraday ? s : s.slice(0, 10));
    const at = {};
    for (const m of ch.markers || []) {
        if (off.has(m.kind) || !m.at) continue;
        const k = keyOf(intraday && m.at.length === 10 ? `${m.at} 09:30` : m.at);
        if (k < keyOf(bars[0][0])) continue;
        const i = bars.findIndex((b) => keyOf(b[0]) >= k);
        if (i >= 0) (at[i] = at[i] || []).push(m);
    }

    const ticks = [];
    let prev = null;
    bars.forEach((b, i) => {
        const key = intraday ? (range === '1D' ? b[0].slice(11, 13) : b[0].slice(0, 10)) : b[0].slice(0, 7);
        if (key !== prev) { ticks.push([i, intraday ? (range === '1D' ? `${key}:00` : key.slice(5)) : key.slice(2)]); prev = key; }
    });
    const every = Math.ceil(ticks.length / Math.max(1, Math.floor((W - R) / 52)));

    const pickAt = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - L) / bw)));
        onPick({ bar: bars[i], prev: i ? bars[i - 1][4] : null, marks: at[i] || [], i });
    };
    const pi = pick && pick.i < n ? pick.i : null;

    return (
        <div ref={box} className="w-full select-none">
            <svg width={W} height={H} style={{ touchAction: 'pan-y' }} className="block"
                onPointerDown={pickAt} onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons) && pickAt(e)}>
                {[0, 1, 2, 3, 4].map((k) => {
                    const v = lo + ((hi - lo) * k) / 4, y = Y(v);
                    return <g key={k}><line x1={L} x2={W - R} y1={y} y2={y} stroke="#1e293b" />
                        <text x={W - R + 4} y={y + 3} fontSize="10" fill="#64748b">{v.toFixed(dec)}</text></g>;
                })}
                {ticks.filter((_, j) => j % every === 0).map(([i, label]) => (
                    <text key={i} x={Math.max(X(i), L)} y={H - B + 13} fontSize="10" fill="#64748b" textAnchor={X(i) < 20 ? 'start' : 'middle'}>{label}</text>
                ))}
                {bars.map((b, i) => {
                    const [, o, h, l, c] = b, col = c >= (o ?? c) ? '#34d399' : '#f43f5e';
                    const y1 = Y(Math.max(o ?? c, c)), y2 = Y(Math.min(o ?? c, c));
                    return <g key={i}>
                        {h != null && l != null && <line x1={X(i)} x2={X(i)} y1={Y(h)} y2={Y(l)} stroke={col} strokeWidth={Math.min(1, bw * 0.4) || 0.5} />}
                        <rect x={X(i) - bw * 0.35} y={y1} width={Math.max(bw * 0.7, 0.6)} height={Math.max(y2 - y1, 0.6)} fill={col} />
                    </g>;
                })}
                {Object.keys(sma).filter((k) => !off.has(k)).map((k) => {
                    let d = '', pen = false;
                    sma[k].forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
                    return <path key={k} d={d} fill="none" stroke={SMA_COL[k]} strokeWidth="1.2" />;
                })}
                {lines.map((l) => {
                    const col = LINE_COL[l.kind] || '#94a3b8';
                    if (l.y < lo || l.y > hi) return <text key={l.kind} x={L + 4} y={l.y > hi ? T + 10 : H - B - 4} fontSize="10" fill={col}>{l.y > hi ? '↑' : '↓'} {l.label}</text>;
                    return <g key={l.kind}><line x1={L} x2={W - R} y1={Y(l.y)} y2={Y(l.y)} stroke={col} strokeDasharray="6 3" />
                        <text x={L + 4} y={Y(l.y) - 3} fontSize="10" fill={col}>{l.label}</text></g>;
                })}
                {Object.entries(at).map(([i, ms]) => ms.slice(0, 3).map((m, j) => {
                    const x = X(+i), y = H - B + 18 + j * 5;
                    return <path key={`${i}-${j}`} d={`M${x - 4},${y + 5}L${x + 4},${y + 5}L${x},${y - 2}Z`} fill={MARK_COL[m.kind] || '#94a3b8'} />;
                }))}
                {pi !== null && <line x1={X(pi)} x2={X(pi)} y1={T} y2={H - B} stroke="#94a3b8" strokeWidth="0.8" />}
            </svg>
        </div>
    );
}

const Spark = ({ series, up }) => {
    if (!series || series.length < 2) return null;
    const lo = Math.min(...series), hi = Math.max(...series), w = 56, h = 18;
    const d = series.map((v, i) => `${i ? 'L' : 'M'}${((i / (series.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo || 1)) * h).toFixed(1)}`).join('');
    return <svg width={w} height={h} className="block"><path d={d} fill="none" stroke={up ? '#34d399' : '#f43f5e'} strokeWidth="1.2" /></svg>;
};

const Toggle = ({ on, label, color, onClick }) => (
    <button onClick={onClick}
        className={`min-h-[36px] px-3 rounded-full text-xs font-medium border transition-colors ${on ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-800 text-slate-500'}`}>
        {color && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: on ? color : '#334155' }} />}{label}
    </button>
);

export default function Live() {
    const params = new URLSearchParams(window.location.search);
    const [sel, setSel] = useState((params.get('t') || '').toUpperCase() || null);
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [range, setRange] = useState('1D');
    const [off, setOff] = useState(readOff);
    const [pick, setPick] = useState(null);
    const [, tick] = useState(0);
    const [busy, setBusy] = useState(false);
    const chips = useRef(null);

    const load = useCallback(async (poll) => {
        setBusy(true);
        try {
            const q = new URLSearchParams();
            if (sel) q.set('t', sel);
            if (poll) q.set('poll', '1');
            const res = await fetch(`/api/live?${q}`);
            const j = await res.json();
            if (j.error) throw new Error(j.error);
            setData(j); setErr(null);
        } catch (e) {
            setErr(String(e.message || e));
        } finally {
            setBusy(false);
        }
    }, [sel]);

    useEffect(() => { setPick(null); load(false); }, [load]);
    useEffect(() => {   // the page's own refresh: only while the US session is open
        if (!data || !data.poll_s) return undefined;
        const id = setInterval(() => load(true), data.poll_s * 1000);
        return () => clearInterval(id);
    }, [data && data.poll_s, load]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {   // ages tick between polls
        const id = setInterval(() => tick((x) => x + 1), 15000);
        return () => clearInterval(id);
    }, []);
    useEffect(() => {
        const t = sel || (data && data.sel);
        if (!t) return;
        const q = new URLSearchParams(window.location.search);
        q.set('tab', 'live'); q.set('t', t);
        window.history.replaceState(null, '', `?${q}`);
    }, [sel, data]);

    useEffect(() => {   // a linked name (?t=) may sit past the phone's edge
        const el = chips.current && chips.current.querySelector('[data-sel="1"]');
        if (el) el.scrollIntoView({ block: 'nearest', inline: 'center' });
    }, [data && data.sel]); // eslint-disable-line react-hooks/exhaustive-deps

    const flip = (k) => { const s = new Set(off); s.has(k) ? s.delete(k) : s.add(k); setOff(s); saveOff(s); };

    if (!data) {
        return <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">{err ? `Live desk unreadable: ${err}` : 'Loading the live desk…'}</div>;
    }
    if (data.message) {
        return <div className="flex-1 flex items-center justify-center text-slate-500 text-sm px-6 text-center">{data.message}</div>;
    }

    const rows = data.rows || [];
    const cur = data.sel;
    const row = rows.find((r) => r.ticker === cur) || {};
    const ch = data.chart;
    const snapAge = ageOf(data.built_at);
    const stale = data.rth && (snapAge === null || snapAge > 600);
    const stopped = data.tape && data.tape.stopped_today;
    const run = (data.tape && data.tape.last_run) || {};
    const bookAge = ageOf(data.book_at);
    const intraOk = ch && ch.intraday && ch.intraday.length;
    const rng = !intraOk && RANGES.find((r) => r.k === range).src === 'intraday' ? '6M' : range;
    const toggles = [
        ...(['6M', '1Y'].includes(rng) ? Object.keys((ch && ch.sma) || {}).map((k) => [k, SMA_COL[k]]) : []),
        ...((ch && ch.lines) || []).map((l) => [l.kind, LINE_COL[l.kind]]),
        ['news', MARK_COL.news], ['flash', MARK_COL.flash], ['lab', MARK_COL.lab],
    ];
    const pb = pick && pick.bar;

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950">
            <div className="max-w-2xl mx-auto px-4 pb-16">

                {/* freshness: every number with its age */}
                <div className={`sticky top-0 z-10 -mx-4 px-4 py-2 text-xs border-b backdrop-blur-md ${stopped ? 'bg-rose-950/80 border-rose-900' : stale ? 'bg-amber-950/80 border-amber-900' : 'bg-slate-950/90 border-slate-800'}`}>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300">{data.now_et.slice(11)} ET · <span className={data.rth ? 'text-emerald-400' : 'text-slate-500'}>{data.rth ? 'session open' : 'market closed'}</span></span>
                        <button onClick={() => load(false)} className="p-1.5 -m-1.5 text-slate-400" aria-label="refresh"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></button>
                    </div>
                    <div className="mt-0.5 text-slate-400">
                        {stopped ? <span className="text-rose-300 font-semibold">tape STOPPED today (Yahoo rate limit) · </span> : null}
                        snapshot <span className={stale ? 'text-amber-300 font-semibold' : 'text-slate-200'}>{ago(snapAge)} ago</span>
                        {' · '}tape {run.status || '—'}{run.requests != null ? ` ${run.requests} req` : ''}
                        {' · '}book <span className={bookAge > 3 * 86400 ? 'text-amber-300' : ''}>{(data.book_at || '—').slice(5, 10)}</span>
                        {' · '}daily {(data.prices_date || '—').slice(5)}
                    </div>
                    {err && <div className="mt-0.5 text-rose-300"><AlertTriangle size={11} className="inline mr-1" />last refresh failed: {err}</div>}
                </div>

                {/* focus chips: biggest move against the name's own range first */}
                <div ref={chips} className="-mx-4 px-4 py-3 flex gap-2 overflow-x-auto scrollbar-thin">
                    {rows.map((r) => (
                        <button key={r.ticker} data-sel={r.ticker === cur ? '1' : '0'} onClick={() => setSel(r.ticker)}
                            className={`shrink-0 min-h-[44px] px-3 py-1.5 rounded-lg border text-left ${r.ticker === cur ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-900'} ${r.tape === 'daily only' ? 'opacity-70' : ''}`}>
                            <div className="text-sm font-semibold text-white leading-tight">{r.ticker}{/held/.test(r.sets) ? <span className="ml-1 text-[9px] text-violet-300 align-top">held</span> : null}</div>
                            <div className="text-[11px] leading-tight whitespace-nowrap"><span className={tone(r.day_pct)}>{sgn(r.day_pct, 1)}</span>
                                <span className="text-slate-500 ml-1">{r.move_atr != null ? `${Math.abs(r.move_atr).toFixed(1)}×` : ''}</span></div>
                        </button>
                    ))}
                </div>

                {/* the name */}
                <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                        <span className="text-2xl font-bold text-white">{cur}</span>
                        <span className="ml-2 text-xl text-slate-100">{fmt(row.last)}</span>
                        <span className={`ml-2 text-base ${tone(row.day_pct)}`}>{sgn(row.day_pct)}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">{row.as_of || ''}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>move {row.move_atr != null ? `${row.move_atr > 0 ? '+' : ''}${row.move_atr.toFixed(2)}× ATR` : '—'}</span>
                    <span>ATR {row.atr_pct != null ? `${row.atr_pct}%` : '—'}</span>
                    {row.stop != null && <span className="text-rose-300">stop {fmt(row.stop)}</span>}
                    {row.level != null && <span className="text-amber-300">level {fmt(row.level)}</span>}
                    {row.to_level_pct != null && <span>to {row.level != null ? 'level' : 'stop'} {sgn(row.to_level_pct)}</span>}
                    {row.earnings && <span className="text-amber-300">earnings {row.earnings.slice(5)} ({row.earn_days}d)</span>}
                    <span className="text-slate-500">{row.sets}{row.tape ? ` · ${row.tape}` : ''}</span>
                </div>

                {/* chart */}
                <div className="mt-3 flex gap-1.5">
                    {RANGES.map((r) => (
                        <button key={r.k} disabled={r.src === 'intraday' && !intraOk} onClick={() => { setRange(r.k); setPick(null); }}
                            className={`flex-1 min-h-[36px] rounded-md text-xs font-medium ${rng === r.k ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 disabled:opacity-30'}`}>{r.label}</button>
                    ))}
                </div>
                <div className="mt-2 min-h-[34px] text-[11px] text-slate-300 font-mono">
                    {pb ? <>
                        <div>{pb[0]}{rng === '1D' || rng === '5D' ? ' ET' : ''} · O {fmt(pb[1])} H {fmt(pb[2])} L {fmt(pb[3])} C {fmt(pb[4])}
                            {pick.prev ? <span className={tone(pb[4] - pick.prev)}> {sgn((pb[4] / pick.prev - 1) * 100)}</span> : null}</div>
                        {pick.marks.map((m, j) => <div key={j} className="truncate font-sans text-slate-400"><span style={{ color: MARK_COL[m.kind] }}>▲</span> {m.text}</div>)}
                    </> : <span className="text-slate-600 font-sans">touch the chart for a bar's OHLC and its news</span>}
                </div>
                {ch ? <Candles ch={ch} range={rng} off={off} onPick={setPick} pick={pick} />
                    : <div className="h-[250px] flex items-center justify-center text-sm text-slate-500">no chart for {cur} in the snapshot</div>}
                {ch && !intraOk && <p className="text-[11px] text-slate-500 mt-1">{ch.quotable ? 'No 5-minute bars yet: the tape runs Mon–Fri 09:30–16:00 ET.' : "Daily only: Yahoo can't quote this name, so it has no tape."}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {toggles.map(([k, c]) => <Toggle key={k} label={k} color={c} on={!off.has(k)} onClick={() => flip(k)} />)}
                </div>

                {/* market strip: this box's own 15-min feed */}
                {data.strip && data.strip.items.length > 0 && (
                    <div className="mt-5">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Market {data.strip.day} · 15-min, from the pre-open quote</div>
                        <div className="grid grid-cols-2 gap-2">
                            {data.strip.items.map((s) => {
                                const v = s.ticker === '^VIX' ? s.chg : s.pct;
                                return (
                                    <div key={s.ticker} className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-xs text-slate-300 font-semibold">{s.ticker}{data.sector && data.sector.etf === s.ticker ? <span className="ml-1 font-normal text-slate-500">sector</span> : null}</div>
                                            <div className="text-[11px]"><span className={tone(s.ticker === '^VIX' ? -v : v)}>{s.ticker === '^VIX' ? `${fmt(s.last)} (${sgn(v, 2, '')})` : sgn(v)}</span>
                                                <span className="text-slate-600 ml-1">{s.at_et}</span></div>
                                        </div>
                                        <Spark series={s.series} up={s.ticker === '^VIX' ? v <= 0 : v >= 0} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* news for the name */}
                <div className="mt-5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">{cur} news · 7 days · times ET</div>
                    {(data.news || []).length === 0 && <div className="text-sm text-slate-500">No news for {cur} on this box in 7 days.</div>}
                    <ul className="divide-y divide-slate-800/70">
                        {(data.news || []).map((n, i) => (
                            <li key={i} className="py-2">
                                <div className="text-[11px] text-slate-500">{n.at_et} · {n.source}{n.impact != null ? ` · impact ${n.impact}` : ''}</div>
                                <div className="text-sm text-slate-200 leading-snug">{n.headline}</div>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="mt-6 text-[11px] text-slate-600 leading-relaxed">
                    Sorted by today's move against the name's own 20-day range (a size reading, not a direction).
                    Lines: avg cost and stop as of the book read ({(data.book_at || '—').slice(0, 10)}), entry level.
                    Markers: news, flash card, lab pick ({(data.lab && data.lab.grade_note) || 'unproven'}).
                    Prices from the forge's tape, about 5 minutes behind.
                </p>
            </div>
        </div>
    );
}
