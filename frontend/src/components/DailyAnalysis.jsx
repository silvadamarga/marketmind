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

// Month labels for an x axis: the first index of each new month.
const monthTicks = (dates) => dates.reduce((acc, d, i) => {
    const m = d.slice(0, 7);
    if (i > 0 && m !== dates[i - 1].slice(0, 7)) acc.push({ i, label: asDate(d).toLocaleDateString(undefined, { month: 'short' }) });
    return acc;
}, []);
const Ticks = ({ dates }) => (
    <div className="relative h-3.5 mt-0.5 text-[10px] text-slate-600">
        {monthTicks(dates).map((t) => (
            <span key={t.i} className="absolute -translate-x-1/2" style={{ left: `${(t.i / Math.max(dates.length - 1, 1)) * 100}%` }}>{t.label}</span>
        ))}
    </div>
);

const pathOf = (vals, w, h, lo, hi) => vals
    .map((c, i) => `${(i / Math.max(vals.length - 1, 1)) * w},${hi === lo ? h / 2 : h - ((c - lo) / (hi - lo)) * h}`)
    .join(' ');

// Small line with an optional dashed reference level and a dot on the last point.
// Literal class names, so Tailwind generates them.
const DOT = { 'stroke-emerald-400': 'bg-emerald-400', 'stroke-red-400': 'bg-red-400', 'stroke-amber-400': 'bg-amber-400' };
const Spark = ({ vals, cls, refLine, w = 'w-20', h = 20 }) => {
    if (!vals || vals.length < 2) return null;
    const lo = Math.min(...vals, refLine ?? Infinity), hi = Math.max(...vals, refLine ?? -Infinity);
    const y = (v) => (hi === lo ? h / 2 : h - ((v - lo) / (hi - lo)) * h);
    return (
        <div className={`relative ${w}`} style={{ height: h }}>
            <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                {refLine !== undefined && <line x1="0" x2="100" y1={y(refLine)} y2={y(refLine)} vectorEffect="non-scaling-stroke" strokeDasharray="2 2" strokeWidth="1" className="stroke-slate-500" />}
                <polyline points={pathOf(vals, 100, h, lo, hi)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="1.5" className={cls} />
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
const Strip = ({ items, bar, refPct, h = 'h-9' }) => (
    <div className={`relative ${h}`}>
        <div className="absolute inset-0 flex items-stretch gap-px">
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

// 90-day price line: area, high/low/average guides, month ticks, hover readout.
const PriceChart = ({ r }) => {
    const [hover, setHover] = useState(null);
    const box = useRef(null);
    const lo = r.low, hi = r.high, H = 100, n = r.spark.length;
    const y = (v) => (hi === lo ? 50 : H - ((v - lo) / (hi - lo)) * H);
    const x = (i) => (i / Math.max(n - 1, 1)) * 100;
    const line = pathOf(r.spark, 100, H, lo, hi);
    const idx = hover ?? n - 1;
    const onMove = (e) => {
        const rect = box.current.getBoundingClientRect();
        const f = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        setHover(Math.round(f * (n - 1)));
    };
    const fromFirst = (r.spark[idx] / r.spark[0] - 1) * 100;
    return (
        <div className={`${card} p-3 flex flex-col`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide"><LineChart size={13} />{r.name}, {n} days</span>
                <span className="text-sm tabular-nums">
                    <span className="text-white font-semibold">{fmtPrice(r.spark[idx])}</span>
                    <span className={`ml-2 ${upDown(fromFirst)}`}>{signed(fromFirst, 1)}%</span>
                    <span className="text-slate-500 ml-2">{shortDay(r.dates[idx])}</span>
                </span>
            </div>
            <div className="flex gap-2 mt-2 flex-1 min-h-[9rem]">
                <div ref={box} className="relative flex-1 cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
                    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                        <defs>
                            <linearGradient id="spyFill" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <polygon points={`0,${H} ${line} 100,${H}`} fill="url(#spyFill)" />
                        {[hi, lo].map((v) => <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" strokeWidth="1" className="stroke-slate-600" />)}
                        <line x1="0" x2="100" y1={y(r.avg)} y2={y(r.avg)} vectorEffect="non-scaling-stroke" strokeWidth="1" className="stroke-amber-500/70" />
                        <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2" className="stroke-indigo-400" />
                        {hover !== null && <line x1={x(idx)} x2={x(idx)} y1="0" y2={H} vectorEffect="non-scaling-stroke" strokeWidth="1" className="stroke-slate-500" />}
                    </svg>
                    <span className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-indigo-400 ring-2 ring-[#131b2e]" style={{ left: `${x(idx)}%`, top: `${y(r.spark[idx])}%` }} />
                </div>
                {/* y axis: high, 50-day average, low */}
                <div className="relative w-12 text-[10px] tabular-nums">
                    <span className="absolute -translate-y-1/2 text-slate-500" style={{ top: `${y(hi)}%` }}>{fmtPrice(hi)}</span>
                    <span className="absolute -translate-y-1/2 text-amber-500/80" style={{ top: `${y(r.avg)}%` }}>{fmtPrice(r.avg)}</span>
                    <span className="absolute -translate-y-1/2 text-slate-500" style={{ top: `${y(lo)}%` }}>{fmtPrice(lo)}</span>
                </div>
            </div>
            <div className="mr-14"><Ticks dates={r.dates} /></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span><span className={upDown(r.span)}>{chg(r.span, r.points)}</span> over {n} days</span>
                <span>{chg(r.off_high, r.points)} from high</span>
                <span><span className="inline-block w-3 h-px bg-amber-500 align-middle mr-1" />{chg(r.vs_avg, r.points)} vs 50-day avg</span>
            </div>
        </div>
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

// Cross-asset rows: one line each, groups as thin labels.
const AssetTable = ({ groups, days }) => (
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
                <th className={`${th} pr-3 text-left hidden 2xl:table-cell`}>Chart</th>
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
                            <td className={`${td} pr-3 hidden 2xl:table-cell`}><Spark vals={r.spark} cls={r.span >= 0 ? 'stroke-emerald-400' : 'stroke-red-400'} /></td>
                        </tr>
                    ))}
                </tbody>
            );
        })}
    </table>
);

// Sectors: today's move over each sector's typical-day band, then the longer
// view. Sector funds without a live read today fall back to their last close.
const SectorTable = ({ rows, days }) => {
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
                    <th className={`${th} pr-3 text-left`}>Range</th>
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
                            <td className={`${td} pr-3`}><RangePos pos={s.pos} /></td>
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
    const spyStrip = prices?.strip || [];
    const spyLast = spyStrip.slice(-30);
    const maxMove = Math.max(0.5, ...spyLast.map((s) => Math.abs(s.move)));
    const vixVals = spyStrip.map((s) => s.vix).filter((v) => v !== null && v !== undefined);
    const spy = prices?.spy;
    const vix = prices?.vix;
    const groups = prices?.paths || [];
    const spyPath = groups.flatMap((g) => g.rows).find((r) => r.ticker === 'SPY');
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
                        <Strip items={spyLast.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${signed(s.move, 2)}%` }))}
                            bar={(s, last) => <Diverging v={s.move} max={maxMove} last={last} band={spy?.norm} />} />
                    </Tile>
                    <Tile icon={Gauge} label="VIX, fear gauge" value={vix ? vix.level.toFixed(1) : '—'}
                        v={vix && verdict(vix.rank)} rank={vix?.rank}
                        sub={vix ? `${signed(vix.move)}% ${whenOf(vix)} · normal ${vix.median}` : 'not enough price history'}>
                        <div title={`Last ${vixVals.length} sessions; dashed = normal ${vix?.median}`}>
                            <Spark vals={vixVals} refLine={vix?.median} cls="stroke-amber-400" w="w-full" h={36} />
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

                {/* The day in short lines, next to the S&P 500's last 90 days */}
                {(h?.summary?.length > 0 || spyPath) && (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                        {h?.summary?.length > 0 && (
                            <Panel icon={Sparkles} title="The day in brief" className={`${spyPath ? 'lg:col-span-3' : 'lg:col-span-5'} bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/30`}>
                                <div className="px-3 pb-3 space-y-2">
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
                        {spyPath && <div className={h?.summary?.length > 0 ? 'lg:col-span-2 flex' : 'lg:col-span-5 flex'}><div className="flex-1 min-w-0 flex flex-col [&>div]:flex-1"><PriceChart r={spyPath} /></div></div>}
                    </div>
                )}

                {/* Markets: everything else, then sectors */}
                {groups.length > 0 && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
                        {assetGroups.length > 0 && (
                            <Panel icon={Activity} title="Markets" note={spy ? whenOf(spy) : null}>
                                <div className="pb-2 overflow-x-auto"><AssetTable groups={assetGroups} days={h.baseline_days} /></div>
                            </Panel>
                        )}
                        {sectorRows.length > 0 && (
                            <Panel icon={LayoutGrid} title="Sectors, best to worst today" note={<><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 align-middle" />bigger move than usual</>}>
                                <div className="pb-2 overflow-x-auto"><SectorTable rows={sectorRows} days={h.baseline_days} /></div>
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
