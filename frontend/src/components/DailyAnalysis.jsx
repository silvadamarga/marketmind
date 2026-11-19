import React, { useState, useEffect, useRef } from 'react';
import {
    AlertTriangle, Activity, TrendingUp, TrendingDown, Gauge, LayoutGrid, CalendarRange,
    Newspaper, Radar, Zap, LineChart, Tags, PieChart, Layers, Landmark, Gem,
    Bitcoin, Sparkles, Clock, Globe2,
} from 'lucide-react';

// The Daily Briefing: one screen of tiles, then detail. Every number sits next
// to what is normal for it. A count alone says nothing (180 events is a quiet
// weekday and a loud Sunday), so news is read against the same 24h window on
// the last 90 days, weekdays against weekdays, and prices against their own
// typical daily move and 90-day range (backend/daily_history.py). Funds are
// always shown by name, never by ticker. Decision support only.

const card = 'bg-[#131b2e] border border-slate-800 rounded-xl';
const signed = (v, d = 1) => {
    if (v === null || v === undefined) return '—';
    const t = Math.abs(v).toFixed(d);
    return Number(t) === 0 ? t : `${v > 0 ? '+' : '-'}${t}`;
};
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const asDate = (iso) => new Date(`${iso}T12:00:00Z`);
const shortDay = (iso) => asDate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
// VIX carries no `at` stamp, so a live read without one is just "today".
const whenOf = (p) => (p.live ? (p.at ? `today ${timeOf(p.at)}` : 'today') : `${shortDay(p.date)} close`);
const upDown = (v) => (v === null || v === undefined ? 'text-slate-500' : v >= 0 ? 'text-emerald-400' : 'text-red-400');
const chg = (v, points) => (v === null || v === undefined ? '—' : points ? `${signed(v, 2)}pt` : `${signed(v, 1)}%`);
const fmtPrice = (v) => (v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(2));
const round = (v) => (v === null || v === undefined ? '—' : Math.round(v));

// rank = {below, of}: how many of the baseline days sat below today.
// kind 'level' reads a value (VIX, news count); 'move' reads the size of a move.
const verdict = (rank, kind = 'level') => {
    if (!rank || !rank.of) return { word: 'no history', cls: 'bg-slate-800 text-slate-400', odd: false };
    const f = rank.below / rank.of;
    const w = kind === 'move'
        ? ['unusually big', 'bigger than usual', 'unusually small', 'smaller than usual', 'normal size']
        : ['well above normal', 'above normal', 'well below normal', 'below normal', 'normal'];
    if (f >= 0.9) return { word: w[0], cls: 'bg-amber-500/15 text-amber-300', odd: true };
    if (f >= 0.75) return { word: w[1], cls: 'bg-amber-500/10 text-amber-400', odd: true };
    if (f <= 0.1) return { word: w[2], cls: 'bg-sky-500/15 text-sky-300', odd: kind !== 'move' };
    if (f <= 0.25) return { word: w[3], cls: 'bg-sky-500/10 text-sky-400', odd: false };
    return { word: w[4], cls: 'bg-slate-800 text-slate-400', odd: false };
};
const Pill = ({ v, rank }) => (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${v.cls}`}
        title={rank ? `higher than ${rank.below} of the last ${rank.of}` : undefined}>{v.word}</span>
);

// The forge's news categories, in plain words.
const TOPIC = {
    OTHER: 'Other', SENTIMENT: 'Market mood', RATING: 'Analyst ratings', MACRO: 'Economy',
    GEOPOLITICS: 'Geopolitics', CENTRAL_BANK: 'Central banks', REGULATION: 'Regulation',
    CRYPTO: 'Crypto', REAL_ESTATE: 'Real estate', UNCATEGORIZED: 'Not sorted',
};
const topicName = (c) => TOPIC[c] || c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ');

const GROUP_ICON = { Indexes: Layers, 'Rates, credit, dollar': Landmark, Commodities: Gem, Crypto: Bitcoin };
const BRIEF_ICON = { 'Fear gauge': Gauge, Sectors: LayoutGrid, '90 days': CalendarRange, News: Newspaper, Attention: Radar };
const TONE = { up: 'bg-emerald-500/15 text-emerald-400', down: 'bg-red-500/15 text-red-400', flat: 'bg-indigo-500/15 text-indigo-300' };

const pathOf = (vals, w, h, lo, hi) => vals
    .map((c, i) => `${(i / Math.max(vals.length - 1, 1)) * w},${hi === lo ? h / 2 : h - ((c - lo) / (hi - lo)) * h}`)
    .join(' ');

// Charts reach back further than the 90 days every verdict uses.
const spanLabel = (dates) => {
    if (!dates || dates.length < 2) return '';
    const days = (asDate(dates[dates.length - 1]) - asDate(dates[0])) / 864e5;
    return days >= 330 ? '1 year' : `${Math.round(days / 30.4)} months`;
};

// Small line with an optional dashed reference level and a dot on the last point.
// With `split`, the line before that index is dimmed: the stretch outside the
// window the numbers are measured on. Literal class names, so Tailwind generates them.
const DOT = { 'stroke-emerald-400': 'bg-emerald-400', 'stroke-red-400': 'bg-red-400', 'stroke-amber-400': 'bg-amber-400' };
const Spark = ({ vals, cls, refLine, split = 0, w = 'w-20', h = 20 }) => {
    if (!vals || vals.length < 2) return null;
    const lo = Math.min(...vals, refLine ?? Infinity), hi = Math.max(...vals, refLine ?? -Infinity);
    const y = (v) => (hi === lo ? h / 2 : h - ((v - lo) / (hi - lo)) * h);
    const pts = pathOf(vals, 100, h, lo, hi).split(' ');
    const cut = Math.min(Math.max(split, 0), pts.length - 2);
    return (
        <div className={`relative ${w}`} style={{ height: h }}>
            <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                {refLine !== undefined && <line x1="0" x2="100" y1={y(refLine)} y2={y(refLine)} vectorEffect="non-scaling-stroke" strokeDasharray="2 2" strokeWidth="1" className="stroke-slate-500" />}
                {cut > 0 && <polyline points={pts.slice(0, cut + 1).join(' ')} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="1.25" className="stroke-slate-500" />}
                <polyline points={pts.slice(cut).join(' ')} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="1.5" className={cls} />
            </svg>
            <span className={`absolute w-1.5 h-1.5 -mr-[3px] -mt-[3px] rounded-full right-0 ${DOT[cls] || 'bg-slate-400'}`} style={{ top: y(vals[vals.length - 1]) }} />
        </div>
    );
};

// Today's value as a dot on the baseline's low-high range, median as a tick.
const RangeBar = ({ low, high, median, today, fmt = (v) => v }) => {
    if (low === null || low === undefined || high === null || today === null || today === undefined) return null;
    const lo = Math.min(low, today), hi = Math.max(high, today);
    const at = (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
    return (
        <div>
            <div className="relative h-2 mt-2">
                <div className="absolute top-[3px] h-[2px] bg-gradient-to-r from-sky-500/40 via-slate-600 to-amber-500/40 rounded" style={{ left: `${at(low)}%`, right: `${100 - at(high)}%` }} />
                <div className="absolute top-0 h-2 w-[2px] bg-slate-300" style={{ left: `${at(median)}%` }} />
                <div className="absolute -top-[2px] h-3 w-3 -ml-1.5 rounded-full bg-indigo-400 ring-2 ring-[#131b2e]" style={{ left: `${at(today)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 mt-1 tabular-nums">
                <span>{fmt(low)}</span><span>{fmt(high)}</span>
            </div>
        </div>
    );
};

// Diverging bar around a centre line, with an optional shaded band (±band).
const Diverging = ({ v, max, last, band }) => {
    if (v === null || v === undefined) return <div className="h-full" />;
    const h = Math.min(Math.abs(v) / (max || 1), 1) * 50;
    const b = band ? Math.min(band / (max || 1), 1) * 50 : 0;
    return (
        <div className="h-full relative">
            {b > 0 && <div className="absolute left-0 right-0 bg-slate-700/40" style={{ top: `${50 - b}%`, bottom: `${50 - b}%` }} />}
            <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-700" />
            <div className={`absolute left-0 right-0 rounded-[1px] ${v >= 0 ? 'bg-emerald-500' : 'bg-red-500'} ${last ? 'ring-1 ring-white/70' : 'opacity-60'}`}
                style={v >= 0 ? { bottom: '50%', height: `${h}%` } : { top: '50%', height: `${h}%` }} />
        </div>
    );
};

// Day strip: one column per item, today last; optional dashed normal level.
const Strip = ({ items, bar, refPct, h = 'h-9', gap = 'gap-px' }) => (
    <div className={`relative ${h}`}>
        <div className={`absolute inset-0 flex items-stretch ${gap}`}>
            {items.map((it, i) => (
                <div key={it.date || i} className="flex-1 min-w-0 relative hover:bg-slate-700/30" title={it.title}>
                    {bar(it, i === items.length - 1)}
                </div>
            ))}
        </div>
        {refPct !== undefined && <div className="absolute left-0 right-0 border-t border-dashed border-slate-400/60 pointer-events-none" style={{ bottom: `${refPct}%` }} />}
    </div>
);

// One headline number: label + verdict, value, what normal is, a small chart.
const Tile = ({ icon, label, value, valueCls = 'text-white', sub, v, rank, children, tip }) => {
    const Icon = icon;
    return (
        <div className={`${card} p-3 flex flex-col min-w-0`} title={tip}>
            <span className="flex items-center gap-1 text-xs text-slate-400 truncate"><Icon size={12} className="shrink-0" />{label}</span>
            <div className="flex flex-wrap items-center justify-between gap-x-1 mt-0.5">
                <span className={`text-2xl font-bold tabular-nums leading-tight ${valueCls}`}>{value}</span>
                {v && <Pill v={v} rank={rank} />}
            </div>
            <div className="text-[10px] text-slate-500 truncate" title={typeof sub === 'string' ? sub : undefined}>{sub}</div>
            <div className="mt-auto pt-2">{children}</div>
        </div>
    );
};

// The main chart: a year of markets, fear and news on one time axis. Prices
// are indexed to the start of the chosen range (% change), so assets on very
// different scales share one axis; VIX and news get their own panes under it.
// Hues follow the validated categorical order and stay with their asset.
const MAIN_SERIES = [
    { t: 'SPY', label: 'S&P 500', color: '#3987e5' },
    { t: 'GLD', label: 'Gold', color: '#d95926' },
    { t: 'IWM', label: 'Small caps', color: '#199e70' },
    { t: 'TLT', label: 'Long bonds', color: '#c98500' },
    { t: 'USO', label: 'Oil', color: '#d55181' },
    { t: 'DX-Y.NYB', label: 'Dollar', color: '#0ca30c' },
    { t: 'QQQ', label: 'Nasdaq 100', color: '#9085e9' },
    { t: 'BTC-USD', label: 'Bitcoin', color: '#e66767' },
];
const MAIN_DEFAULT = ['SPY', 'GLD', 'IWM', 'TLT', 'DX-Y.NYB'];
const MAIN_KEY = 'dailyBriefing.mainSeries';
const RANGES = [['1Y', 366], ['6M', 183], ['3M', 92]];
const DAY = 864e5;

const MainChart = ({ paths, vix, news, from90Date }) => {
    const [on, setOn] = useState(() => {
        try {
            const v = JSON.parse(localStorage.getItem(MAIN_KEY));
            if (Array.isArray(v) && v.length) return v;
        } catch { /* storage blocked: use the default */ }
        return MAIN_DEFAULT;
    });
    const [range, setRange] = useState('1Y');
    const [hover, setHover] = useState(null);
    const box = useRef(null);

    const rows = Object.fromEntries(paths.flatMap((g) => g.rows).map((r) => [r.ticker, r]));
    const axis = rows.SPY?.dates;
    if (!axis || axis.length < 2) return null;

    const toggle = (t) => setOn((cur) => {
        const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
        try { localStorage.setItem(MAIN_KEY, JSON.stringify(next)); } catch { /* not kept */ }
        return next;
    });

    // Range on the trading-day axis; x is calendar time so weekend news lines up.
    const end = axis[axis.length - 1];
    const days = RANGES.find((r) => r[0] === range)[1];
    const startIso = new Date(asDate(end) - days * DAY).toISOString().slice(0, 10);
    const i0 = Math.max(0, axis.findIndex((d) => d >= startIso));
    const dates = axis.slice(i0);
    const n = dates.length;
    const t0 = asDate(dates[0]).getTime(), t1 = asDate(dates[n - 1]).getTime();
    const xOf = (iso) => ((asDate(iso).getTime() - t0) / Math.max(t1 - t0, 1)) * 100;

    // A series' value on each axis date, carried forward over its gaps.
    const align = (srcDates, vals) => {
        const m = new Map(srcDates.map((d, i) => [d, vals[i]]));
        let last = null;
        return axis.map((d) => { if (m.has(d)) last = m.get(d); return last; }).slice(i0);
    };
    const series = MAIN_SERIES.filter((s) => rows[s.t]).map((s) => {
        const vals = align(rows[s.t].dates, rows[s.t].spark);
        const base = vals.find((v) => v !== null);
        return { ...s, pct: vals.map((v) => (v === null || !base ? null : (v / base - 1) * 100)) };
    });
    const shown = series.filter((s) => on.includes(s.t));
    const all = shown.flatMap((s) => s.pct).filter((v) => v !== null);
    const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const H = 100;
    const y = (v) => (hi === lo ? 50 : H - ((v - lo) / (hi - lo)) * H);
    const line = (pct) => pct.map((v, i) => (v === null ? null : `${xOf(dates[i])},${y(v)}`)).filter(Boolean).join(' ');

    const vixVals = vix?.spark ? align(vix.dates, vix.spark) : [];
    const vixNum = vixVals.filter((v) => v !== null);
    const vLo = Math.min(...vixNum, vix?.median ?? Infinity), vHi = Math.max(...vixNum, vix?.median ?? -Infinity);
    const vy = (v) => (vHi === vLo ? 50 : 100 - ((v - vLo) / (vHi - vLo)) * 100);

    const newsIn = (news || []).filter((d) => d.date >= dates[0] && d.date <= dates[n - 1]);
    const maxCount = Math.max(1, ...newsIn.map((d) => d.count));
    const nets = newsIn.map((d) => d.net).sort((a, b) => a - b);
    const midNet = nets.length ? nets[Math.floor(nets.length / 2)] : 0;
    const barW = 100 / Math.max((t1 - t0) / DAY + 1, 1);

    const idx = hover ?? n - 1;
    const hDate = dates[idx];
    const hNews = (news || []).find((d) => d.date === hDate);
    const onMove = (e) => {
        const rect = box.current.getBoundingClientRect();
        const t = t0 + Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * (t1 - t0);
        let best = 0;
        dates.forEach((d, i) => { if (Math.abs(asDate(d).getTime() - t) < Math.abs(asDate(dates[best]).getTime() - t)) best = i; });
        setHover(best);
    };
    const ticks = dates.reduce((acc, d, i) => {
        if (i > 0 && d.slice(0, 7) !== dates[i - 1].slice(0, 7)) acc.push({ d, label: asDate(d).toLocaleDateString(undefined, { month: 'short' }) });
        return acc;
    }, []);
    // Shade the 90-day window only when the range reaches well past it.
    const shade = from90Date && from90Date > dates[Math.min(10, n - 1)] ? xOf(from90Date) : null;
    const cross = hover !== null ? <div className="absolute inset-y-0 w-px bg-slate-500/70 pointer-events-none" style={{ left: `${xOf(hDate)}%` }} /> : null;
    const paneLabel = 'absolute left-1 top-0.5 text-[10px] text-slate-400 bg-[#131b2e]/80 px-1 rounded pointer-events-none';

    return (
        <Panel icon={LineChart} title="The year at a glance"
            note={<span className="flex gap-1">{RANGES.map(([k]) => (
                <button key={k} onClick={() => setRange(k)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${range === k ? 'bg-indigo-500/30 text-indigo-200' : 'text-slate-500 hover:text-slate-300'}`}>{k}</button>
            ))}</span>}>
            <div className="px-3 pb-3">
                {/* Legend and readout: click to show or hide; values at the hovered day */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className="text-[11px] text-slate-400 tabular-nums mr-1 w-24">{shortDay(hDate)}</span>
                    {series.map((s) => {
                        const v = s.pct[idx];
                        const active = on.includes(s.t);
                        return (
                            <button key={s.t} onClick={() => toggle(s.t)} title={`${rows[s.t].name}: click to ${active ? 'hide' : 'show'}`}
                                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] tabular-nums transition-colors ${active ? 'border-slate-600 bg-slate-800/60 text-slate-200' : 'border-slate-800 text-slate-500'}`}>
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: active ? s.color : 'transparent', boxShadow: `inset 0 0 0 1.5px ${s.color}` }} />
                                {s.label}
                                {active && <span className="text-slate-400">{signed(v, 1)}%</span>}
                            </button>
                        );
                    })}
                </div>

                <div ref={box} className="relative cursor-crosshair select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
                    {/* Prices, % change since the range start */}
                    <div className="flex gap-2">
                        <div className="relative flex-1 h-48">
                            <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                                {shade !== null && <rect x={shade} y="0" width={100 - shade} height={H} className="fill-slate-400/[0.06]" />}
                                <line x1="0" x2="100" y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" strokeWidth="1" className="stroke-slate-600" />
                                {shown.map((s) => (
                                    <polyline key={s.t} points={line(s.pct)} fill="none" stroke={s.color} strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                ))}
                            </svg>
                            {shown.map((s) => s.pct[idx] !== null && (
                                <span key={s.t} className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full ring-2 ring-[#131b2e] pointer-events-none" style={{ left: `${xOf(hDate)}%`, top: `${y(s.pct[idx])}%`, background: s.color }} />
                            ))}
                            {shade !== null && <span className="absolute top-0.5 pl-1 text-[10px] text-slate-500 pointer-events-none" style={{ left: `${shade}%` }}>last 90 days</span>}
                            {cross}
                        </div>
                        <div className="relative w-10 h-48 text-[10px] tabular-nums text-slate-500">
                            <span className="absolute -translate-y-1/2" style={{ top: `${y(hi)}%` }}>{signed(hi, 0)}%</span>
                            {hi > 0 && lo < 0 && <span className="absolute -translate-y-1/2" style={{ top: `${y(0)}%` }}>0%</span>}
                            <span className="absolute -translate-y-1/2" style={{ top: `${y(lo)}%` }}>{signed(lo, 0)}%</span>
                        </div>
                    </div>

                    {/* VIX level, dashed = its normal */}
                    {vixNum.length > 1 && (
                        <div className="flex gap-2 mt-2">
                            <div className="relative flex-1 h-12 border-t border-slate-800">
                                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                                    {vix?.median && <line x1="0" x2="100" y1={vy(vix.median)} y2={vy(vix.median)} vectorEffect="non-scaling-stroke" strokeDasharray="2 2" strokeWidth="1" className="stroke-slate-500" />}
                                    <polyline points={vixVals.map((v, i) => (v === null ? null : `${xOf(dates[i])},${vy(v)}`)).filter(Boolean).join(' ')}
                                        fill="none" vectorEffect="non-scaling-stroke" strokeWidth="1.5" className="stroke-slate-300" />
                                </svg>
                                <span className={paneLabel}>VIX {vixVals[idx] !== null ? vixVals[idx].toFixed(1) : '—'} <span className="text-slate-500">· normal {vix?.median}</span></span>
                                {cross}
                            </div>
                            <div className="w-10" />
                        </div>
                    )}

                    {/* Stories per day; color = tone above or below its usual */}
                    {newsIn.length > 1 && (
                        <div className="flex gap-2 mt-1">
                            <div className="relative flex-1 h-10 border-t border-slate-800">
                                {newsIn.map((d) => (
                                    <div key={d.date} className={`absolute bottom-0 ${d.net >= midNet ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
                                        style={{ left: `${xOf(d.date)}%`, width: `${barW}%`, height: `${(d.count / maxCount) * 100}%` }} />
                                ))}
                                <span className={paneLabel}>Stories {hNews ? hNews.count : '—'} <span className="text-slate-500">· tone {hNews ? signed(hNews.net * 100, 0) : '—'}</span></span>
                                {cross}
                            </div>
                            <div className="w-10" />
                        </div>
                    )}
                </div>

                <div className="relative h-3.5 mt-0.5 mr-12 text-[10px] text-slate-600">
                    {ticks.map((t) => <span key={t.d} className="absolute -translate-x-1/2" style={{ left: `${xOf(t.d)}%` }}>{t.label}</span>)}
                </div>
                <p className="text-[10px] text-slate-600 mt-1">
                    Lines: % change since {shortDay(dates[0])}. Stories: green = tone above its usual for the period, red = below.
                    Story counts follow how much the site collects, which grew over the year.
                </p>
            </div>
        </Panel>
    );
};

// Place in the 90-day low-high range: left = at the low, right = at the high.
const RangePos = ({ pos }) => (pos === null || pos === undefined ? <span className="text-slate-600">—</span> : (
    <div className="relative h-2 w-14 rounded bg-gradient-to-r from-red-500/25 via-slate-800 to-emerald-500/25" title={`${Math.round(pos * 100)}% of the way from the 90-day low to the high`}>
        <div className="absolute -top-0.5 h-3 w-1.5 -ml-[3px] rounded-sm bg-white/90" style={{ left: `${pos * 100}%` }} />
    </div>
));

const Panel = ({ icon, title, note, children, className = '' }) => {
    const Icon = icon;
    return (
        <section className={`${card} overflow-hidden ${className}`}>
            <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-1.5">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide"><Icon size={13} />{title}</h2>
                {note && <span className="text-[10px] text-slate-500 text-right">{note}</span>}
            </div>
            {children}
        </section>
    );
};

const th = 'font-medium px-1.5 py-1';
const td = 'px-1.5 py-[3px]';

// A row's chart: the whole span, grey before the last 90 days, colored by
// the 90-day change.
const MiniChart = ({ r }) => (
    <div title={`${chg(r.chart_change, r.points)} over ${spanLabel(r.dates)} · ${chg(r.span, r.points)} over 90 days`}>
        <Spark vals={r.spark} split={r.from90} cls={r.span >= 0 ? 'stroke-emerald-400' : 'stroke-red-400'} />
    </div>
);

// Cross-asset rows: one line each, groups as thin labels.
const AssetTable = ({ groups, days, chartLabel }) => (
    <table className="w-full text-[13px] tabular-nums">
        <thead>
            <tr className="text-[10px] uppercase tracking-wide text-slate-500 text-right">
                <th className={`${th} pl-3 text-left`} />
                <th className={`${th} hidden sm:table-cell`}>Last</th>
                <th className={th}>Day</th>
                <th className={`${th} hidden sm:table-cell`}>Week</th>
                <th className={th}>Month</th>
                <th className={th}>{days}d</th>
                <th className={`${th} text-left`} title="Where today sits between the 90-day low and high">Range</th>
                <th className={`${th} pr-3 text-left hidden md:table-cell`} title="Grey = before the last 90 days">{chartLabel}</th>
            </tr>
        </thead>
        {groups.map((g) => {
            const Icon = GROUP_ICON[g.group] || Layers;
            return (
                <tbody key={g.group}>
                    <tr><td colSpan={8} className="pl-3 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-t border-slate-800/80"><span className="flex items-center gap-1"><Icon size={11} />{g.group}</span></td></tr>
                    {g.rows.map((r) => (
                        <tr key={r.ticker} className="text-right hover:bg-slate-800/40">
                            <td className={`${td} pl-3 text-left text-slate-200 truncate max-w-[7.5rem] sm:max-w-[11rem]`} title={`${r.name} · ${r.ticker}`}>{r.name}</td>
                            <td className={`${td} text-slate-400 hidden sm:table-cell`}>{fmtPrice(r.last)}</td>
                            <td className={`${td} ${upDown(r.d1)}`}>{chg(r.d1, r.points)}</td>
                            <td className={`${td} hidden sm:table-cell ${upDown(r.w1)}`}>{chg(r.w1, r.points)}</td>
                            <td className={`${td} ${upDown(r.m1)}`}>{chg(r.m1, r.points)}</td>
                            <td className={`${td} font-medium ${upDown(r.span)}`} title={`${chg(r.off_high, r.points)} from the ${days}-day high`}>{chg(r.span, r.points)}</td>
                            <td className={td}><RangePos pos={r.pos} /></td>
                            <td className={`${td} pr-3 hidden md:table-cell`}><MiniChart r={r} /></td>
                        </tr>
                    ))}
                </tbody>
            );
        })}
    </table>
);

// Sectors: today's move over each sector's typical-day band, then the longer
// view. Sector funds without a live read today fall back to their last close.
const SectorTable = ({ rows, days, chartLabel }) => {
    const max = Math.max(0.5, ...rows.map((s) => Math.max(Math.abs(s.move ?? 0), s.norm ?? 0)));
    return (
        <table className="w-full text-[13px] tabular-nums">
            <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-500 text-right">
                    <th className={`${th} pl-3 text-left`} />
                    <th className={`${th} text-left w-[28%] whitespace-nowrap`} title="Shaded band = a typical day for that sector"><span className="sm:hidden">Today</span><span className="hidden sm:inline">Today vs typical</span></th>
                    <th className={th}>Day</th>
                    <th className={`${th} hidden sm:table-cell`}>Month</th>
                    <th className={th}>{days}d</th>
                    <th className={`${th} text-left`}>Range</th>
                    <th className={`${th} pr-3 text-left hidden md:table-cell`} title="Grey = before the last 90 days">{chartLabel}</th>
                </tr>
            </thead>
            <tbody className="border-t border-slate-800/80">
                {rows.map((s) => {
                    const v = verdict(s.rank, 'move');
                    const w = s.move === null || s.move === undefined ? 0 : (Math.abs(s.move) / max) * 50;
                    const band = s.norm ? (s.norm / max) * 50 : 0;
                    return (
                        <tr key={s.ticker} className="text-right hover:bg-slate-800/40">
                            <td className={`${td} pl-3 text-left text-slate-200 truncate max-w-[7.5rem] sm:max-w-[10rem]`} title={`${s.name} · ${s.ticker}${s.norm ? ` · typical day ±${s.norm}%` : ''}`}>{s.name}</td>
                            <td className={td}>
                                <div className="relative h-3.5" title={s.rank ? `${v.word}: bigger than ${s.rank.below} of the last ${s.rank.of} days` : undefined}>
                                    {band > 0 && <div className="absolute inset-y-0 bg-slate-700/50 rounded-sm" style={{ left: `${50 - band}%`, right: `${50 - band}%` }} />}
                                    <div className="absolute inset-y-0 left-1/2 w-px bg-slate-600" />
                                    <div className={`absolute top-[3px] bottom-[3px] rounded-sm ${s.move >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                        style={s.move >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
                                </div>
                            </td>
                            <td className={`${td} whitespace-nowrap ${upDown(s.move)}`}>
                                {v.odd && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" title={v.word} />}
                                {chg(s.move)}
                            </td>
                            <td className={`${td} hidden sm:table-cell ${upDown(s.m1)}`}>{chg(s.m1)}</td>
                            <td className={`${td} font-medium ${upDown(s.span)}`}>{chg(s.span)}</td>
                            <td className={td}><RangePos pos={s.pos} /></td>
                            <td className={`${td} pr-3 hidden md:table-cell`}><MiniChart r={s} /></td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

// The same story often lands from several outlets or twice from one feed.
const dedupe = (events) => {
    const seen = new Set();
    return events.filter((e) => {
        const k = (e.summary || e.title || '').toLowerCase().replace(/\W+/g, ' ').trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
};

export default function DailyAnalysis() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/analysis/daily')
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(setData)
            .catch((e) => { console.error('Failed to fetch daily analysis:', e); setData(null); })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500">
                <Activity className="animate-spin mr-2" /> Loading analysis...
            </div>
        );
    }

    if (!data || !data.sentiment_counts) return (
        <div className="p-8 text-center text-slate-500">
            <AlertTriangle className="mx-auto mb-2 text-amber-500" size={32} />
            <p>Failed to load analysis data.</p>
            <button onClick={() => window.location.reload()} className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm">Retry</button>
        </div>
    );

    const { total_events, sentiment_counts, priority_events, thresholds } = data;
    const h = data.history && !data.history.error ? data.history : null;
    const news = h?.news;
    const prices = h?.prices;
    const m = news?.metrics;
    const unit = news ? news.day_kind : 'day';
    const strip = news?.strip || [];
    const maxCount = Math.max(1, ...strip.map((s) => s.count));
    const maxNet = Math.max(0.05, ...strip.map((s) => Math.abs(s.net || 0)));
    const spy = prices?.spy;
    const vix = prices?.vix;
    const groups = prices?.paths || [];
    const spyPath = groups.flatMap((g) => g.rows).find((r) => r.ticker === 'SPY');
    const chartLabel = spanLabel(spyPath?.dates);
    // S&P 500 daily moves for the tile: the last ~6 months of closes.
    const spyMoves = spyPath
        ? spyPath.spark.slice(1).map((c, i) => ({ date: spyPath.dates[i + 1], move: (c / spyPath.spark[i] - 1) * 100 })).slice(-125)
        : (prices?.strip || []);
    const maxMove = Math.max(0.5, ...spyMoves.map((s) => Math.abs(s.move)));
    const vixVals = vix?.spark || (prices?.strip || []).map((s) => s.vix).filter((v) => v !== null && v !== undefined);
    const assetGroups = groups.filter((g) => g.group !== 'Sectors');
    // Sector rows: the longer view from the paths, today's read and its
    // typical-day band from `sectors`; best to worst today.
    const today = Object.fromEntries((prices?.sectors || []).map((s) => [s.ticker, s]));
    const sectorRows = (groups.find((g) => g.group === 'Sectors')?.rows || [])
        .map((r) => ({ ...r, move: today[r.ticker]?.move ?? r.d1, norm: today[r.ticker]?.norm, rank: today[r.ticker]?.rank }))
        .sort((a, b) => (b.move ?? -99) - (a.move ?? -99));
    const stories = dedupe(priority_events);
    const maxN = Math.max(1, ...(news?.names || []).map((x) => x.today));

    return (
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="max-w-7xl mx-auto space-y-3">

                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h1 className="text-xl font-bold text-white">Daily Briefing <span className="text-sm font-normal text-slate-500">· today against its own last {h?.baseline_days ?? 90} days</span></h1>
                    {h && <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={12} />updated {timeOf(h.as_of)}</span>}
                    {data.history?.error && <p className="w-full text-xs text-amber-500">History unavailable: {data.history.error}</p>}
                </div>

                {/* Headline numbers, each against its normal */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                    <Tile icon={LineChart} label="S&P 500" value={spy ? `${signed(spy.move, 2)}%` : '—'} valueCls={upDown(spy?.move)}
                        v={spy && verdict(spy.rank, 'move')} rank={spy?.rank}
                        sub={spy ? `${whenOf(spy)} · typical ±${spy.norm}%` : 'not enough price history'}>
                        <Strip gap="gap-0" items={spyMoves.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${signed(s.move, 2)}%` }))}
                            bar={(s, last) => <Diverging v={s.move} max={maxMove} last={last} band={spy?.norm} />} />
                    </Tile>
                    <Tile icon={Gauge} label="VIX, fear gauge" value={vix ? vix.level.toFixed(1) : '—'}
                        v={vix && verdict(vix.rank)} rank={vix?.rank}
                        sub={vix ? `${signed(vix.move)}% ${whenOf(vix)} · normal ${vix.median}` : 'not enough price history'}>
                        <div title={`${spanLabel(vix?.dates) || `${vixVals.length} sessions`}; bright = the 60 sessions normal is read from; dashed = normal ${vix?.median}`}>
                            <Spark vals={vixVals} refLine={vix?.median} split={vixVals.length - 61} cls="stroke-amber-400" w="w-full" h={36} />
                        </div>
                    </Tile>
                    <Tile icon={Newspaper} label="Stories, 24h" value={round(m?.count.today ?? total_events)}
                        v={m && verdict(m.count.rank)} rank={m?.count.rank}
                        sub={m ? `normal ${unit} ~${round(m.count.median)}` : null}
                        tip="Story counts also move with how much the site collects.">
                        <Strip refPct={m ? (m.count.median / maxCount) * 100 : undefined}
                            items={strip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${s.count} stories` }))}
                            bar={(s, last) => (
                                <div className={`absolute bottom-0 left-0 right-0 ${last ? 'bg-indigo-300' : s.weekend ? 'bg-slate-700' : 'bg-indigo-400/50'}`}
                                    style={{ height: `${(s.count / maxCount) * 100}%` }} />
                            )} />
                    </Tile>
                    <Tile icon={TrendingUp} label="News tone" value={m ? signed(m.net.today * 100, 0) : '—'} valueCls={upDown(m?.net.today)}
                        v={m && verdict(m.net.rank)} rank={m?.net.rank}
                        sub={`${sentiment_counts.BULLISH} up · ${sentiment_counts.BEARISH} down · normal ${m ? signed(m.net.median * 100, 0) : '—'}`}
                        tip="Bullish minus bearish stories, as a share of all stories.">
                        <Strip items={strip.map((s) => ({ ...s, title: `${shortDay(s.date)}: tone ${s.net === null ? '—' : signed(s.net * 100, 0)}` }))}
                            bar={(s, last) => <Diverging v={s.net} max={maxNet} last={last} />} />
                    </Tile>
                    <Tile icon={Zap} label="High impact" value={round(m?.priority.today)}
                        v={m && verdict(m.priority.rank)} rank={m?.priority.rank}
                        sub={m ? `normal ~${round(m.priority.median)} a ${unit}` : null}>
                        {m && <RangeBar low={m.priority.low} high={m.priority.high} median={m.priority.median} today={m.priority.today} fmt={round} />}
                    </Tile>
                    <Tile icon={Globe2} label="Economy & politics" value={pct(m?.macro.today)}
                        v={m && verdict(m.macro.rank)} rank={m?.macro.rank}
                        sub={m ? `of stories · normal ${pct(m.macro.median)}` : null}>
                        {m && <RangeBar low={m.macro.low} high={m.macro.high} median={m.macro.median} today={m.macro.today} fmt={pct} />}
                    </Tile>
                </div>

                {/* The day in short lines */}
                {h?.summary?.length > 0 && (
                    <Panel icon={Sparkles} title="The day in brief" className="bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/30">
                        <div className="px-3 pb-3 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2">
                            {h.summary.map((x) => {
                                const Icon = x.topic === 'Stocks' ? (x.tone === 'down' ? TrendingDown : TrendingUp) : (BRIEF_ICON[x.topic] || Sparkles);
                                return (
                                    <div key={x.topic} className="flex gap-2.5 items-start">
                                        <span className={`shrink-0 h-6 w-6 rounded-md flex items-center justify-center ${TONE[x.tone] || TONE.flat}`}><Icon size={13} /></span>
                                        <p className="text-sm text-slate-200 leading-snug pt-0.5">
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mr-1.5">{x.topic}</span>{x.text}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </Panel>
                )}

                {/* Markets, fear and news over the year, on one time axis */}
                {spyPath && <MainChart paths={groups} vix={vix} news={h?.news_daily} from90Date={spyPath.dates[spyPath.from90]} />}

                {/* Markets: everything else, then sectors */}
                {groups.length > 0 && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
                        {assetGroups.length > 0 && (
                            <Panel icon={Activity} title="Markets" note={spy ? whenOf(spy) : null}>
                                <div className="pb-2 overflow-x-auto"><AssetTable groups={assetGroups} days={h.baseline_days} chartLabel={chartLabel} /></div>
                            </Panel>
                        )}
                        {sectorRows.length > 0 && (
                            <Panel icon={LayoutGrid} title="Sectors, best to worst today" note={<><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />bigger move than usual</>}>
                                <div className="pb-2 overflow-x-auto"><SectorTable rows={sectorRows} days={h.baseline_days} chartLabel={chartLabel} /></div>
                            </Panel>
                        )}
                    </div>
                )}

                {/* News: what mattered, who was named, what it was about */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                    <Panel icon={Zap} title="High-impact stories" className="lg:col-span-2 lg:row-span-2"
                        note={thresholds ? `last 24h · impact ≥ ${thresholds.impact} or novelty ≥ ${thresholds.novelty}` : null}>
                        {stories.length === 0 ? (
                            <div className="px-3 pb-3 text-sm text-slate-500 italic">None in the last 24 hours.</div>
                        ) : (
                            <ul className="divide-y divide-slate-800/80 border-t border-slate-800/80">
                                {/* The stored title is often the outlet's name, so the headline (body) leads. */}
                                {stories.map((e) => (
                                    <li key={e.id} className="flex gap-3 px-3 py-2 hover:bg-slate-800/40">
                                        <span className="shrink-0 mt-0.5 w-6 h-5 rounded text-[11px] font-bold tabular-nums flex items-center justify-center bg-red-500/15 text-red-300" title={`impact ${e.impact}/10`}>{e.impact}</span>
                                        <div className="min-w-0">
                                            <p className="text-sm text-slate-200 leading-snug">{e.summary || e.title}</p>
                                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                                <span className="font-semibold text-blue-400">{e.source}</span>
                                                {e.title && e.title !== e.summary && e.title !== e.source && <> · {e.title}</>}
                                                {' · '}{new Date(e.date).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>

                    {news && (
                        <Panel icon={Tags} title="Stocks in the news" note="bar = today · tick = usual day">
                            <div className="px-3 pb-2.5 space-y-1">
                                {news.names.length === 0 && <div className="text-sm text-slate-500 italic">No named stocks today.</div>}
                                {news.names.map((n) => (
                                    <div key={n.name} className="grid grid-cols-[3.5rem_1fr_2.75rem] items-center gap-2 text-[13px]">
                                        <span className="font-mono font-semibold text-slate-200">{n.name}</span>
                                        <div className="relative h-2 bg-slate-800 rounded" title={`${n.today} stories today, usually ${n.avg}/day`}>
                                            <div className="absolute inset-y-0 left-0 rounded bg-indigo-400/70" style={{ width: `${(n.today / maxN) * 100}%` }} />
                                            <div className="absolute -top-0.5 h-3 w-[2px] bg-slate-200" style={{ left: `${Math.min(n.avg / maxN, 1) * 100}%` }} />
                                        </div>
                                        <span className={`text-[11px] px-1 rounded text-center tabular-nums ${n.new ? 'bg-indigo-500/20 text-indigo-300' : n.unusual ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}
                                            title={`${n.today} today vs ${n.avg}/day`}>
                                            {n.new ? 'new' : `${n.ratio}×`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Panel>
                    )}

                    {news && (
                        <Panel icon={PieChart} title="What the news is about" note="share · tick = usual">
                            <div className="px-3 pb-2.5 space-y-1.5">
                                {news.categories.length === 0 && <div className="text-sm text-slate-500 italic">No data.</div>}
                                {news.categories.map((c) => {
                                    const diff = c.norm_share !== null && c.share !== null ? c.share - c.norm_share : null;
                                    return (
                                        <div key={c.name} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 text-[13px]">
                                            <span className="text-slate-300 truncate">{topicName(c.name)}</span>
                                            <div className="relative h-2 bg-slate-800 rounded">
                                                <div className="absolute inset-y-0 left-0 bg-indigo-400/70 rounded" style={{ width: `${(c.share || 0) * 100}%` }} />
                                                {c.norm_share !== null && <div className="absolute -top-0.5 h-3 w-[2px] bg-slate-200" style={{ left: `${c.norm_share * 100}%` }} />}
                                            </div>
                                            <span className="tabular-nums text-right text-slate-400">{pct(c.share)}
                                                {diff !== null && Math.abs(diff) >= 0.03 && <span className={`ml-1 text-[11px] ${diff > 0 ? 'text-amber-400' : 'text-sky-400'}`}>{diff > 0 ? '▲' : '▼'}{Math.round(Math.abs(diff) * 100)}</span>}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </Panel>
                    )}
                </div>

                <p className="text-[10px] text-slate-600 pb-2">
                    News is compared with the same 24 hours on the last {news?.like_days ?? '—'} {unit}s; story counts also move with how much the site collects.
                    Prices are compared with each market's own typical day and {h?.baseline_days ?? 90}-day range. Decision support only.
                </p>
            </div>
        </div>
    );
}
