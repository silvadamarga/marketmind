import React, { useState, useEffect, useRef } from 'react';
import {
    AlertTriangle, Activity, TrendingUp, TrendingDown, Gauge, LayoutGrid, CalendarRange,
    Newspaper, Radar, Zap, LineChart, BarChart3, Tags, PieChart, Layers, Landmark, Gem,
    Bitcoin, Sparkles, Clock,
} from 'lucide-react';

// The Daily Briefing: the day in short plain lines first, then each number next
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
const whenOf = (p) => (p.live ? `today, ${timeOf(p.at)}` : `${shortDay(p.date)} close`);
const upDown = (v) => (v === null || v === undefined ? 'text-slate-500' : v >= 0 ? 'text-emerald-400' : 'text-red-400');
const chg = (v, points) => (v === null || v === undefined ? '—' : points ? `${signed(v, 2)}pt` : `${signed(v, 1)}%`);
const fmtPrice = (v) => (v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(2));

// rank = {below, of}: how many of the baseline days sat below today.
// kind 'level' reads a value (VIX, news count); 'move' reads the size of a move.
const verdict = (rank, kind = 'level') => {
    if (!rank || !rank.of) return { word: 'no history', cls: 'bg-slate-800 text-slate-400' };
    const f = rank.below / rank.of;
    const w = kind === 'move'
        ? ['unusually big', 'bigger than usual', 'unusually small', 'smaller than usual', 'normal size']
        : ['well above normal', 'above normal', 'well below normal', 'below normal', 'normal'];
    if (f >= 0.9) return { word: w[0], cls: 'bg-amber-500/15 text-amber-300' };
    if (f >= 0.75) return { word: w[1], cls: 'bg-amber-500/10 text-amber-400' };
    if (f <= 0.1) return { word: w[2], cls: 'bg-sky-500/15 text-sky-300' };
    if (f <= 0.25) return { word: w[3], cls: 'bg-sky-500/10 text-sky-400' };
    return { word: w[4], cls: 'bg-slate-800 text-slate-300' };
};
const Pill = ({ v, rank }) => (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${v.cls}`}
        title={rank ? `higher than ${rank.below} of the last ${rank.of}` : undefined}>{v.word}</span>
);

// The forge's news categories, in plain words.
const TOPIC = {
    OTHER: 'Other', SENTIMENT: 'Market mood', RATING: 'Analyst ratings', MACRO: 'Economy',
    GEOPOLITICS: 'Geopolitics', CENTRAL_BANK: 'Central banks', REGULATION: 'Regulation',
    CRYPTO: 'Crypto', REAL_ESTATE: 'Real estate', UNCATEGORIZED: 'Not sorted',
};
const topicName = (c) => TOPIC[c] || c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ');

const GROUP_ICON = { Indexes: Layers, 'Rates, credit, dollar': Landmark, Commodities: Gem, Crypto: Bitcoin, Sectors: LayoutGrid };
const BRIEF_ICON = { 'Fear gauge': Gauge, Sectors: LayoutGrid, '90 days': CalendarRange, News: Newspaper, Attention: Radar };
const TONE = { up: 'bg-emerald-500/15 text-emerald-400', down: 'bg-red-500/15 text-red-400', flat: 'bg-indigo-500/15 text-indigo-300' };

// Month labels for an x axis: the first index of each new month.
const monthTicks = (dates) => dates.reduce((acc, d, i) => {
    const m = d.slice(0, 7);
    if (i > 0 && m !== dates[i - 1].slice(0, 7)) acc.push({ i, label: asDate(d).toLocaleDateString(undefined, { month: 'short' }) });
    return acc;
}, []);
const Ticks = ({ dates }) => (
    <div className="relative h-4 mt-1 text-[10px] text-slate-600">
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
const Spark = ({ vals, cls, refLine, w = 'w-24', h = 24 }) => {
    if (!vals || vals.length < 2) return null;
    const lo = Math.min(...vals, refLine ?? Infinity), hi = Math.max(...vals, refLine ?? -Infinity);
    const y = (v) => (hi === lo ? h / 2 : h - ((v - lo) / (hi - lo)) * h);
    return (
        <div className={`relative ${w}`} style={{ height: h }}>
            <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                {refLine !== undefined && <line x1="0" x2="100" y1={y(refLine)} y2={y(refLine)} vectorEffect="non-scaling-stroke" strokeDasharray="2 2" strokeWidth="1" className="stroke-slate-600" />}
                <polyline points={pathOf(vals, 100, h, lo, hi)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="1.5" className={cls} />
            </svg>
            <span className={`absolute w-1.5 h-1.5 -mr-[3px] -mt-[3px] rounded-full right-0 ${DOT[cls] || 'bg-slate-400'}`} style={{ top: y(vals[vals.length - 1]) }} />
        </div>
    );
};

// Today's value as a dot on the baseline's low-high range, median as a tick.
const RangeBar = ({ low, high, median, today, fmt = (v) => v }) => {
    if (low === null || high === null || today === null || today === undefined) return null;
    const lo = Math.min(low, today), hi = Math.max(high, today);
    const at = (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
    return (
        <div className="mt-3">
            <div className="relative h-2">
                <div className="absolute top-[3px] h-[2px] bg-gradient-to-r from-sky-500/40 via-slate-600 to-amber-500/40 rounded" style={{ left: `${at(low)}%`, right: `${100 - at(high)}%` }} />
                <div className="absolute top-0 h-2 w-[2px] bg-slate-300" style={{ left: `${at(median)}%` }} />
                <div className="absolute -top-[2px] h-3 w-3 -ml-1.5 rounded-full bg-indigo-400 ring-2 ring-[#131b2e]" style={{ left: `${at(today)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>{fmt(low)}</span><span>normal {fmt(median)}</span><span>{fmt(high)}</span>
            </div>
        </div>
    );
};

const MetricCard = ({ icon, title, m, fmt, note }) => {
    const Icon = icon;
    return (
    <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-slate-400 text-sm"><Icon size={14} />{title}</span>
            <Pill v={verdict(m?.rank)} rank={m?.rank} />
        </div>
        <div className="text-3xl font-bold text-white mt-1 tabular-nums">{fmt(m?.today)}</div>
        {m?.median !== null && m?.median !== undefined && <RangeBar low={m.low} high={m.high} median={m.median} today={m.today} fmt={fmt} />}
        {note && <div className="text-[11px] text-slate-600 mt-1">{note}</div>}
    </div>
);
};

const SpyCard = ({ p, moves }) => {
    if (!p) return <div className={`${card} p-4 text-sm text-slate-500`}>S&P 500: not enough price history.</div>;
    const last = moves.slice(-20);
    const max = Math.max(p.norm * 2, ...last.map((s) => Math.abs(s.move)));
    return (
        <div className={`${card} p-4`}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-slate-400 text-sm"><LineChart size={14} />S&P 500</span>
                <Pill v={verdict(p.rank, 'move')} rank={p.rank} />
            </div>
            <div className="flex items-end justify-between gap-4 mt-1">
                <div>
                    <div className={`text-3xl font-bold tabular-nums ${upDown(p.move)}`}>{signed(p.move, 2)}%</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1"><Clock size={11} />{whenOf(p)} · typical ±{p.norm}%</div>
                </div>
                {/* last 20 daily moves; the band is a typical day */}
                <div className="relative w-24 sm:w-40 h-14 shrink-0" title="Last 20 trading days; shaded band = a typical day">
                    <div className="absolute left-0 right-0 bg-slate-700/40" style={{ top: `${50 - (p.norm / max) * 50}%`, bottom: `${50 - (p.norm / max) * 50}%` }} />
                    <div className="absolute inset-0 flex items-stretch gap-px">
                        {last.map((s, i) => {
                            const hgt = (Math.abs(s.move) / max) * 50;
                            return (
                                <div key={s.date} className="flex-1 relative" title={`${shortDay(s.date)}: ${signed(s.move, 2)}%`}>
                                    <div className={`absolute left-0 right-0 rounded-[1px] ${s.move >= 0 ? 'bg-emerald-500' : 'bg-red-500'} ${i === last.length - 1 ? '' : 'opacity-60'}`}
                                        style={s.move >= 0 ? { bottom: '50%', height: `${hgt}%` } : { top: '50%', height: `${hgt}%` }} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const VixCard = ({ p, strip }) => {
    if (!p) return <div className={`${card} p-4 text-sm text-slate-500`}>VIX: not enough price history.</div>;
    const vals = strip.map((s) => s.vix).filter((v) => v !== null && v !== undefined);
    return (
        <div className={`${card} p-4`}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-slate-400 text-sm"><Gauge size={14} />VIX · expected swings</span>
                <Pill v={verdict(p.rank)} rank={p.rank} />
            </div>
            <div className="flex items-end justify-between gap-4 mt-1">
                <div>
                    <div className="text-3xl font-bold text-white tabular-nums">{p.level.toFixed(1)}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1"><Clock size={11} />{whenOf(p)} · {signed(p.move)}% on the day</div>
                </div>
                <div title={`Last ${vals.length} trading days; dashed = normal ${p.median}`}>
                    <Spark vals={vals} refLine={p.median} cls="stroke-amber-400" w="w-24 sm:w-40" h={56} />
                </div>
            </div>
            <RangeBar low={p.low} high={p.high} median={p.median} today={p.level} fmt={(v) => Number(v).toFixed(1)} />
        </div>
    );
};

// Sectors today: one diverging bar per sector over a shaded "typical day" band.
const SectorBars = ({ sectors }) => {
    const max = Math.max(0.5, ...sectors.map((s) => Math.max(Math.abs(s.move), s.norm)));
    return (
        <div className={`${card} p-4 space-y-1`}>
            {sectors.map((s) => {
                const v = verdict(s.rank, 'move');
                const odd = s.rank && s.rank.below / s.rank.of >= 0.75;
                const w = (Math.abs(s.move) / max) * 50;
                const band = (s.norm / max) * 50;
                return (
                    <div key={s.ticker} className="grid grid-cols-[10.5rem_1fr_3rem] sm:grid-cols-[11rem_1fr_3.5rem_8rem] items-center gap-2 text-sm" title={`${s.ticker} · typical day ±${s.norm}%`}>
                        <span className="text-slate-200 truncate">{s.name}</span>
                        <div className="relative h-4">
                            <div className="absolute inset-y-0 bg-slate-700/40 rounded-sm" style={{ left: `${50 - band}%`, right: `${50 - band}%` }} />
                            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-600" />
                            <div className={`absolute top-1 bottom-1 rounded-sm ${s.move >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                style={s.move >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
                        </div>
                        <span className={`text-right tabular-nums ${upDown(s.move)}`}>{signed(s.move, 1)}%</span>
                        <span className="hidden sm:flex justify-end">{odd && <Pill v={v} rank={s.rank} />}</span>
                    </div>
                );
            })}
            <div className="text-[10px] text-slate-600 pt-1">Shaded band = a typical day for that sector.</div>
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
        <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5 text-sm text-slate-300"><LineChart size={14} />{r.name}</span>
                <span className="text-sm tabular-nums">
                    <span className="text-white font-semibold">{fmtPrice(r.spark[idx])}</span>
                    <span className={`ml-2 ${upDown(fromFirst)}`}>{signed(fromFirst, 1)}%</span>
                    <span className="text-slate-500 ml-2">{shortDay(r.dates[idx])}</span>
                </span>
            </div>
            <div className="flex gap-2 mt-3">
                <div ref={box} className="relative flex-1 h-48 cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
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
                <div className="relative w-14 h-48 text-[10px] tabular-nums">
                    <span className="absolute -translate-y-1/2 text-slate-500" style={{ top: `${y(hi)}%` }}>{fmtPrice(hi)}</span>
                    <span className="absolute -translate-y-1/2 text-amber-500/80" style={{ top: `${y(r.avg)}%` }}>{fmtPrice(r.avg)}</span>
                    <span className="absolute -translate-y-1/2 text-slate-500" style={{ top: `${y(lo)}%` }}>{fmtPrice(lo)}</span>
                </div>
            </div>
            <div className="mr-16"><Ticks dates={r.dates} /></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mt-1">
                <span><span className={upDown(r.span)}>{chg(r.span, r.points)}</span> over {n} days</span>
                <span>{chg(r.off_high, r.points)} from high</span>
                <span><span className="inline-block w-3 h-px bg-amber-500 align-middle mr-1" />{chg(r.vs_avg, r.points)} vs 50-day avg</span>
            </div>
        </div>
    );
};

// Place in the low-high range: left = at the low, right = at the high.
const RangePos = ({ pos }) => (pos === null || pos === undefined ? <span className="text-slate-600">—</span> : (
    <div className="relative h-2 w-20 rounded bg-gradient-to-r from-red-500/25 via-slate-800 to-emerald-500/25" title={`${Math.round(pos * 100)}% of the way from the low to the high`}>
        <div className="absolute -top-0.5 h-3 w-1.5 -ml-[3px] rounded-sm bg-white/90" style={{ left: `${pos * 100}%` }} />
    </div>
));

const PathTable = ({ groups, days }) => (
    <div className={`${card} overflow-hidden`}>
        <table className="w-full text-sm tabular-nums">
            <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500 text-right">
                    <th className="text-left font-medium px-4 py-2" />
                    <th className="font-medium px-2 py-2 hidden md:table-cell">Last</th>
                    <th className="font-medium px-2 py-2 hidden sm:table-cell">Day</th>
                    <th className="font-medium px-2 py-2 hidden sm:table-cell">Week</th>
                    <th className="font-medium px-2 py-2">Month</th>
                    <th className="font-medium px-2 py-2">{days}d</th>
                    <th className="font-medium px-2 py-2 hidden md:table-cell">Off high</th>
                    <th className="font-medium px-2 py-2 text-left">Low – high</th>
                    <th className="font-medium px-4 py-2 text-left hidden lg:table-cell">{days}d chart</th>
                </tr>
            </thead>
            {groups.map((g) => {
                const Icon = GROUP_ICON[g.group] || Layers;
                return (
                    <tbody key={g.group} className="border-t border-slate-800">
                        <tr><td colSpan={9} className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400"><span className="flex items-center gap-1.5"><Icon size={13} />{g.group}</span></td></tr>
                        {g.rows.map((r) => (
                            <tr key={r.ticker} className="text-right hover:bg-slate-800/40">
                                <td className="text-left text-slate-200 px-4 py-1.5" title={r.ticker}>{r.name}</td>
                                <td className="px-2 text-slate-300 hidden md:table-cell">{fmtPrice(r.last)}</td>
                                <td className={`px-2 hidden sm:table-cell ${upDown(r.d1)}`}>{chg(r.d1, r.points)}</td>
                                <td className={`px-2 hidden sm:table-cell ${upDown(r.w1)}`}>{chg(r.w1, r.points)}</td>
                                <td className={`px-2 ${upDown(r.m1)}`}>{chg(r.m1, r.points)}</td>
                                <td className={`px-2 font-medium ${upDown(r.span)}`}>{chg(r.span, r.points)}</td>
                                <td className="px-2 text-slate-400 hidden md:table-cell">{chg(r.off_high, r.points)}</td>
                                <td className="px-2"><RangePos pos={r.pos} /></td>
                                <td className="px-4 hidden lg:table-cell"><Spark vals={r.spark} cls={r.span >= 0 ? 'stroke-emerald-400' : 'stroke-red-400'} /></td>
                            </tr>
                        ))}
                    </tbody>
                );
            })}
        </table>
    </div>
);

// Day strip: one column per item, today last. Optional dashed normal level
// (`refPct`, % of the strip's height) and month ticks under it.
const Strip = ({ icon, title, items, bar, refPct, refLabel }) => {
    const Icon = icon;
    return (
    <div className={`${card} p-4`}>
        <div className="flex items-center justify-between text-sm text-slate-300 mb-3">
            <span className="flex items-center gap-1.5"><Icon size={14} />{title}</span>
            {refLabel && <span className="text-[10px] text-slate-500">{refLabel}</span>}
        </div>
        <div className="relative h-24">
            <div className="absolute inset-0 flex items-stretch gap-px">
                {items.map((it, i) => (
                    <div key={i} className="flex-1 min-w-0 relative hover:bg-slate-700/30" title={it.title}>
                        {bar(it, i === items.length - 1)}
                    </div>
                ))}
            </div>
            {refPct !== undefined && <div className="absolute left-0 right-0 border-t border-dashed border-slate-400/60 pointer-events-none" style={{ bottom: `${refPct}%` }} />}
        </div>
        <Ticks dates={items.map((it) => it.date)} />
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
            {b > 0 && <div className="absolute left-0 right-0 bg-slate-700/30" style={{ top: `${50 - b}%`, bottom: `${50 - b}%` }} />}
            <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-700" />
            <div className={`absolute left-0 right-0 rounded-[1px] ${v >= 0 ? 'bg-emerald-500' : 'bg-red-500'} ${last ? 'ring-1 ring-white/60' : 'opacity-60'}`}
                style={v >= 0 ? { bottom: '50%', height: `${h}%` } : { top: '50%', height: `${h}%` }} />
        </div>
    );
};

const Section = ({ icon: Icon, title, sub, children }) => (
    <section>
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            {Icon && <span className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-300"><Icon size={16} /></span>}
            {title}
        </h2>
        {sub && <p className="text-xs text-slate-500 mt-1 mb-3">{sub}</p>}
        {!sub && <div className="mb-3" />}
        {children}
    </section>
);

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
    const unit = news ? `${news.day_kind}s` : 'days';
    const strip = news?.strip || [];
    const maxCount = Math.max(1, ...strip.map((s) => s.count));
    const maxNet = Math.max(0.05, ...strip.map((s) => Math.abs(s.net || 0)));
    const spyStrip = prices?.strip || [];
    const maxMove = Math.max(0.5, ...spyStrip.map((s) => Math.abs(s.move)));
    const normCount = news?.metrics.count.median;
    const spyPath = prices?.paths?.flatMap((g) => g.rows).find((r) => r.ticker === 'SPY');

    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="max-w-6xl mx-auto space-y-10">

                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Daily Briefing</h1>
                        <p className="text-slate-400 text-sm mt-1">Today, set against its own recent history.</p>
                    </div>
                    {h && <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={12} />updated {timeOf(h.as_of)}</span>}
                    {data.history?.error && <p className="w-full text-xs text-amber-500">History unavailable: {data.history.error}</p>}
                </div>

                {/* The day in short lines */}
                {h?.summary?.length > 0 && (
                    <div className={`${card} p-5 bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/30`}>
                        <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4"><Sparkles size={18} className="text-indigo-300" />The day in brief</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
                            {h.summary.map((x) => {
                                const Icon = x.topic === 'Stocks' ? (x.tone === 'down' ? TrendingDown : TrendingUp) : (BRIEF_ICON[x.topic] || Sparkles);
                                return (
                                    <div key={x.topic} className="flex gap-3">
                                        <span className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${TONE[x.tone] || TONE.flat}`}><Icon size={16} /></span>
                                        <div>
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{x.topic}</div>
                                            <div className="text-slate-200 text-sm leading-snug">{x.text}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Market today */}
                {prices && (
                    <Section icon={Activity} title="Markets today" sub="Moves against what is normal for each market.">
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <SpyCard p={prices.spy} moves={spyStrip} />
                                <VixCard p={prices.vix} strip={spyStrip} />
                            </div>
                            {prices.sectors?.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1.5 text-sm text-slate-300 mb-2">
                                        <LayoutGrid size={14} />Sectors, best to worst <span className="text-slate-500 text-xs">· {whenOf(prices.sectors[0])}</span>
                                    </div>
                                    <SectorBars sectors={prices.sectors} />
                                </div>
                            )}
                        </div>
                    </Section>
                )}

                {/* Prices against their own last 90 days */}
                {prices?.paths?.length > 0 && (
                    <Section icon={CalendarRange} title={`The last ${h.baseline_days} days`} sub="Hover the chart for any day. Bar = where each price sits between its low and high.">
                        <div className="space-y-4">
                            {spyPath && <PriceChart r={spyPath} />}
                            <PathTable groups={prices.paths} days={h.baseline_days} />
                        </div>
                    </Section>
                )}

                {/* News today vs normal */}
                <Section icon={Newspaper} title="News today" sub={news ? `Last 24 hours vs the same hours on the last ${news.like_days} ${unit}.` : null}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard icon={Newspaper} title="Stories" m={news?.metrics.count ?? { today: total_events }} fmt={(v) => (v === null || v === undefined ? '—' : Math.round(v))}
                            note="Also moves with how much the site collects." />
                        <MetricCard icon={TrendingUp} title="Tone" m={news?.metrics.net} fmt={(v) => (v === null || v === undefined ? '—' : signed(v * 100, 0))}
                            note={`${sentiment_counts.BULLISH} bullish · ${sentiment_counts.BEARISH} bearish · ${sentiment_counts.NEUTRAL} neutral`} />
                        <MetricCard icon={Landmark} title="Economy & politics" m={news?.metrics.macro} fmt={pct} />
                        <MetricCard icon={Zap} title="High impact" m={news?.metrics.priority} fmt={(v) => (v === null || v === undefined ? '—' : Math.round(v))} />
                    </div>
                </Section>

                {/* The baseline span, day by day */}
                {news && (
                    <Section icon={BarChart3} title="Day by day" sub="Today is the outlined column on the right. Hover any column.">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Strip icon={Newspaper} title="Stories" refLabel={normCount ? `- - normal weekday ${Math.round(normCount)}` : null}
                                refPct={normCount ? (normCount / maxCount) * 100 : undefined}
                                items={strip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${s.count} stories` }))}
                                bar={(s, last) => (
                                    <div className={`absolute bottom-0 left-0 right-0 rounded-t-[1px] ${last ? 'bg-indigo-300' : s.weekend ? 'bg-slate-700' : 'bg-indigo-400/60'}`}
                                        style={{ height: `${(s.count / maxCount) * 100}%` }} />
                                )} />
                            <Strip icon={TrendingUp} title="Tone"
                                items={strip.map((s) => ({ ...s, title: `${shortDay(s.date)}: tone ${s.net === null ? '—' : signed(s.net * 100, 0)}` }))}
                                bar={(s, last) => <Diverging v={s.net} max={maxNet} last={last} />} />
                            <Strip icon={LineChart} title="S&P 500 daily move" refLabel={prices?.spy ? `band = typical ±${prices.spy.norm}%` : null}
                                items={spyStrip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${signed(s.move, 2)}%${s.vix ? ` · VIX ${s.vix.toFixed(1)}` : ''}` }))}
                                bar={(s, last) => <Diverging v={s.move} max={maxMove} last={last} band={prices?.spy?.norm} />} />
                        </div>
                    </Section>
                )}

                {/* Names and topics against their own norm */}
                {news && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Section icon={Tags} title="Stocks in the news" sub="Stories today vs each stock's daily average.">
                            <div className={`${card} divide-y divide-slate-800`}>
                                {news.names.length === 0 && <div className="p-4 text-sm text-slate-500 italic">No named stocks today.</div>}
                                {news.names.map((n) => {
                                    const maxN = Math.max(...news.names.map((x) => x.today));
                                    return (
                                        <div key={n.name} className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-3 px-4 py-2">
                                            <span className="font-mono font-semibold text-slate-200">{n.name}</span>
                                            <div className="relative h-2.5 bg-slate-800 rounded" title={`${n.today} today, usually ${n.avg}/day`}>
                                                <div className="absolute inset-y-0 left-0 rounded bg-indigo-400/70" style={{ width: `${(n.today / maxN) * 100}%` }} />
                                                <div className="absolute -top-0.5 h-3.5 w-[2px] bg-slate-200" style={{ left: `${Math.min(n.avg / maxN, 1) * 100}%` }} />
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded text-center ${n.new ? 'bg-indigo-500/20 text-indigo-300' : n.unusual ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                                                {n.new ? 'new' : `${n.ratio}×`}
                                            </span>
                                        </div>
                                    );
                                })}
                                <div className="px-4 py-2 text-[10px] text-slate-600">Bar = stories today · tick = usual day</div>
                            </div>
                        </Section>
                        <Section icon={PieChart} title="What the news is about" sub="Share of today's stories · tick = usual share.">
                            <div className={`${card} p-4 space-y-3`}>
                                {news.categories.length === 0 && <div className="text-sm text-slate-500 italic">No data.</div>}
                                {news.categories.map((c) => {
                                    const diff = c.norm_share !== null && c.share !== null ? c.share - c.norm_share : null;
                                    return (
                                        <div key={c.name}>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-300">{topicName(c.name)}</span>
                                                <span className="tabular-nums text-slate-400">{pct(c.share)}
                                                    {diff !== null && Math.abs(diff) >= 0.03 && <span className={`ml-2 text-xs ${diff > 0 ? 'text-amber-400' : 'text-sky-400'}`}>{diff > 0 ? '▲' : '▼'} {Math.round(Math.abs(diff) * 100)}pt</span>}
                                                </span>
                                            </div>
                                            <div className="relative h-2 bg-slate-800 rounded mt-1">
                                                <div className="absolute inset-y-0 left-0 bg-indigo-400/70 rounded" style={{ width: `${(c.share || 0) * 100}%` }} />
                                                {c.norm_share !== null && <div className="absolute -top-0.5 h-3 w-[2px] bg-slate-200" style={{ left: `${c.norm_share * 100}%` }} />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>
                    </div>
                )}

                {/* High-impact stories. The stored title is often the outlet's
                    name, so the headline (body) leads. */}
                <Section icon={Zap} title="High-impact stories" sub={thresholds ? `Last 24h · impact ≥ ${thresholds.impact} or novelty ≥ ${thresholds.novelty}` : null}>
                    <div className="space-y-2">
                        {priority_events.length === 0 ? (
                            <div className="text-slate-500 italic">None in the last 24 hours.</div>
                        ) : (
                            priority_events.map((event) => (
                                <div key={event.id} className={`${card} p-4 hover:border-slate-600 transition-colors`}>
                                    <div className="flex justify-between items-start gap-3">
                                        <p className="text-slate-200 font-medium leading-snug">{event.summary || event.title}</p>
                                        <div className="flex space-x-0.5 shrink-0 pt-1" title={`impact ${event.impact}/10`}>
                                            {[...Array(5)].map((_, i) => (
                                                <div key={i} className={`w-1 h-3 rounded-sm ${i < (event.impact / 2) ? 'bg-red-500' : 'bg-slate-800'}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1.5">
                                        <span className="font-semibold text-blue-400 uppercase tracking-wider">{event.source}</span>
                                        {event.title && event.title !== event.summary && <> · {event.title}</>}
                                        {' · '}{new Date(event.date).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Section>

            </div>
        </div>
    );
}
