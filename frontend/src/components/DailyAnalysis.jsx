import React, { useState, useEffect } from 'react';
import { AlertTriangle, Activity } from 'lucide-react';

// The Daily Briefing: the day in plain words first, then each number next to
// what is normal for it. A count alone says nothing (180 events is a quiet
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
const shortDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const whenOf = (p) => (p.live ? `so far today (${timeOf(p.at)})` : `at the close, ${shortDay(p.date)}`);

// rank = {below, of}: how many of the baseline days sat below today.
// kind 'level' reads a value (VIX, news count); 'move' reads the size of a move.
const verdict = (rank, kind = 'level') => {
    if (!rank || !rank.of) return { word: 'no history yet', cls: 'text-slate-500' };
    const f = rank.below / rank.of;
    const w = kind === 'move'
        ? ['unusually big', 'bigger than usual', 'unusually small', 'smaller than usual', 'normal size']
        : ['well above normal', 'above normal', 'well below normal', 'below normal', 'normal'];
    if (f >= 0.9) return { word: w[0], cls: 'text-amber-300' };
    if (f >= 0.75) return { word: w[1], cls: 'text-amber-400' };
    if (f <= 0.1) return { word: w[2], cls: 'text-sky-300' };
    if (f <= 0.25) return { word: w[3], cls: 'text-sky-400' };
    return { word: w[4], cls: 'text-slate-300' };
};
const rankText = (rank, unit) => (rank ? `higher than ${rank.below} of the last ${rank.of} ${unit}` : '');

// The forge's news categories, in plain words.
const TOPIC = {
    OTHER: 'Other', SENTIMENT: 'Market mood pieces', RATING: 'Analyst ratings', MACRO: 'Economy',
    GEOPOLITICS: 'Geopolitics', CENTRAL_BANK: 'Central banks', REGULATION: 'Regulation',
    CRYPTO: 'Crypto', REAL_ESTATE: 'Real estate', UNCATEGORIZED: 'Not sorted',
};
const topicName = (c) => TOPIC[c] || c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ');

// Today's value as a dot on the baseline's low-high range, median as a tick.
const RangeBar = ({ low, high, median, today }) => {
    if (low === null || high === null || today === null || today === undefined) return null;
    const lo = Math.min(low, today), hi = Math.max(high, today);
    const at = (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
    return (
        <div className="relative h-2 mt-3 mb-1">
            <div className="absolute top-[3px] h-[2px] bg-slate-700 rounded" style={{ left: `${at(low)}%`, right: `${100 - at(high)}%` }} />
            <div className="absolute top-0 h-2 w-[2px] bg-slate-400" style={{ left: `${at(median)}%` }} title={`normal ${median}`} />
            <div className="absolute -top-[2px] h-3 w-3 -ml-1.5 rounded-full bg-indigo-400 ring-2 ring-[#131b2e]" style={{ left: `${at(today)}%` }} />
        </div>
    );
};

const MetricCard = ({ title, m, fmt, unit, note }) => {
    const v = verdict(m?.rank);
    return (
        <div className={`${card} p-4`}>
            <div className="flex items-baseline justify-between">
                <span className="text-slate-400 text-sm font-medium">{title}</span>
                <span className={`text-xs font-semibold uppercase tracking-wide ${v.cls}`}>{v.word}</span>
            </div>
            <div className="text-3xl font-bold text-white mt-1">{fmt(m?.today)}</div>
            {m?.median !== null && m?.median !== undefined && (
                <>
                    <RangeBar low={m.low} high={m.high} median={m.median} today={m.today} />
                    <div className="text-xs text-slate-500 mt-2">
                        normal {fmt(m.median)} · range {fmt(m.low)} to {fmt(m.high)}
                    </div>
                    <div className="text-xs text-slate-500">{rankText(m.rank, unit)}</div>
                </>
            )}
            {note && <div className="text-xs text-slate-600 mt-1">{note}</div>}
        </div>
    );
};

const PriceCard = ({ title, p, isVix }) => {
    if (!p) return <div className={`${card} p-4 text-sm text-slate-500`}>{title}: not enough price history.</div>;
    if (isVix) {
        const v = verdict(p.rank);
        return (
            <div className={`${card} p-4`}>
                <div className="flex items-baseline justify-between">
                    <span className="text-slate-400 text-sm font-medium">{title}</span>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${v.cls}`}>{v.word}</span>
                </div>
                <div className="text-3xl font-bold text-white mt-1">{p.level.toFixed(1)} <span className="text-base font-medium text-slate-400">{signed(p.move)}% on the day</span></div>
                <RangeBar low={p.low} high={p.high} median={p.median} today={p.level} />
                <div className="text-xs text-slate-500 mt-2">How big a swing traders expect. Normal about {p.median}; range {p.low} to {p.high}.</div>
                <div className="text-xs text-slate-500">{rankText(p.rank, 'sessions')} · {whenOf(p)}</div>
            </div>
        );
    }
    const v = verdict(p.rank, 'move');
    return (
        <div className={`${card} p-4`}>
            <div className="flex items-baseline justify-between">
                <span className="text-slate-400 text-sm font-medium">{title}</span>
                <span className={`text-xs font-semibold uppercase tracking-wide ${v.cls}`}>{v.word} move</span>
            </div>
            <div className={`text-3xl font-bold mt-1 ${p.move >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(p.move, 2)}%</div>
            <div className="text-xs text-slate-500 mt-2">A typical day moves about {p.norm}% either way.</div>
            <div className="text-xs text-slate-500">Size {rankText(p.rank, 'sessions')} · {whenOf(p)}</div>
        </div>
    );
};

// Sectors today: one diverging bar per sector, best at the top.
const SectorBars = ({ sectors }) => {
    const max = Math.max(0.5, ...sectors.map((s) => Math.abs(s.move)));
    return (
        <div className={`${card} p-4 space-y-1.5`}>
            {sectors.map((s) => {
                const v = verdict(s.rank, 'move');
                const odd = s.rank && s.rank.below / s.rank.of >= 0.75;
                const w = (Math.abs(s.move) / max) * 50;
                return (
                    <div key={s.ticker} className="grid grid-cols-[10.5rem_1fr_3rem] sm:grid-cols-[11rem_1fr_4rem_9rem] items-center gap-2 text-sm" title={`${s.ticker} · typical day ±${s.norm}%`}>
                        <span className="text-slate-200 truncate">{s.name}</span>
                        <div className="relative h-3">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-700" />
                            <div className={`absolute inset-y-0 rounded-sm ${s.move >= 0 ? 'bg-emerald-500/80' : 'bg-red-500/80'}`}
                                style={s.move >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
                        </div>
                        <span className={`text-right ${s.move >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(s.move, 1)}%</span>
                        <span className={`hidden sm:block text-xs text-right ${odd ? v.cls : 'text-slate-600'}`}>{odd ? v.word : `typical ±${s.norm}%`}</span>
                    </div>
                );
            })}
        </div>
    );
};

// Day strip: one column per item, today last; `bar(item, isLast)` draws a column.
const Strip = ({ title, sub, items, bar }) => (
    <div className={`${card} p-4`}>
        <div className="text-sm font-medium text-slate-300">{title}</div>
        <div className="text-xs text-slate-500 mb-3">{sub}</div>
        <div className="flex items-stretch gap-px h-24">
            {items.map((it, i) => (
                <div key={i} className="flex-1 min-w-0 flex flex-col justify-center relative" title={it.title}>
                    {bar(it, i === items.length - 1)}
                </div>
            ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>{items.length ? shortDay(items[0].date) : ''}</span>
            <span>{items.length ? shortDay(items[items.length - 1].date) : ''}</span>
        </div>
    </div>
);

// Diverging bar around a centre line, for signed values.
const Diverging = ({ v, max, last, posCls, negCls }) => {
    if (v === null || v === undefined) return <div className="h-full" />;
    const h = Math.min(Math.abs(v) / (max || 1), 1) * 50;
    return (
        <div className="h-full relative">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-800" />
            <div
                className={`absolute left-0 right-0 ${v >= 0 ? posCls : negCls} ${last ? 'opacity-100' : 'opacity-60'} rounded-sm`}
                style={v >= 0 ? { bottom: '50%', height: `${h}%` } : { top: '50%', height: `${h}%` }}
            />
        </div>
    );
};

// Price path helpers: yields (points=true) change in points, everything else in %.
const chg = (v, points) => (v === null || v === undefined ? '—' : points ? `${signed(v, 2)} pt` : `${signed(v, 1)}%`);
const chgCls = (v) => (v === null || v === undefined ? 'text-slate-500' : v >= 0 ? 'text-emerald-400' : 'text-red-400');
const fmtPrice = (v) => (v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(2));

const pathOf = (closes, w, h, lo, hi) => closes
    .map((c, i) => `${(i / Math.max(closes.length - 1, 1)) * w},${hi === lo ? h / 2 : h - ((c - lo) / (hi - lo)) * h}`)
    .join(' ');

const Spark = ({ closes, up }) => {
    if (!closes || closes.length < 2) return null;
    const lo = Math.min(...closes), hi = Math.max(...closes);
    return (
        <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-24 h-6">
            <polyline points={pathOf(closes, 100, 24, lo, hi)} fill="none" vectorEffect="non-scaling-stroke"
                strokeWidth="1.5" className={up ? 'stroke-emerald-400' : 'stroke-red-400'} />
        </svg>
    );
};

// 90-day price line with its high, low and 50-session average marked.
const PriceChart = ({ r }) => {
    const lo = r.low, hi = r.high, H = 160;
    const y = (v) => (hi === lo ? H / 2 : H - ((v - lo) / (hi - lo)) * H);
    return (
        <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-slate-300">{r.name}, last {r.spark.length} trading days</span>
                <span className="text-xs text-slate-500">
                    {fmtPrice(r.last)} · <span className={chgCls(r.span)}>{chg(r.span, r.points)}</span> over the period · {chg(r.off_high, r.points)} from the high · {chg(r.vs_avg, r.points)} vs its 50-day average
                </span>
            </div>
            <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="w-full h-40 mt-3">
                <line x1="0" x2="100" y1={y(hi)} y2={y(hi)} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" className="stroke-slate-600" strokeWidth="1" />
                <line x1="0" x2="100" y1={y(lo)} y2={y(lo)} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" className="stroke-slate-600" strokeWidth="1" />
                <line x1="0" x2="100" y1={y(r.avg)} y2={y(r.avg)} vectorEffect="non-scaling-stroke" className="stroke-amber-500/60" strokeWidth="1" />
                <polyline points={pathOf(r.spark, 100, H, lo, hi)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2" className="stroke-indigo-400" />
            </svg>
            <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>{shortDay(r.spark_dates[0])}</span>
                <span>{shortDay(r.spark_dates[1])}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
                dashed lines = the period's high ({fmtPrice(r.high)}) and low ({fmtPrice(r.low)}) · amber line = 50-day average ({fmtPrice(r.avg)})
            </div>
        </div>
    );
};

// Place in the low-high range of the span: 0% = at the low, 100% = at the high.
const RangePos = ({ pos }) => (pos === null || pos === undefined ? <span className="text-slate-600">—</span> : (
    <div className="relative h-2 w-20 bg-slate-800 rounded" title={`${Math.round(pos * 100)}% of the way from the low to the high`}>
        <div className="absolute -top-0.5 h-3 w-1.5 -ml-[3px] rounded-sm bg-indigo-400" style={{ left: `${pos * 100}%` }} />
    </div>
));

const PathTable = ({ groups, days }) => (
    <div className={`${card} overflow-hidden`}>
        <table className="w-full text-sm">
            <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500 text-right">
                    <th className="text-left font-medium px-4 py-2">Market</th>
                    <th className="font-medium px-2 py-2 hidden md:table-cell">Last</th>
                    <th className="font-medium px-2 py-2 hidden sm:table-cell">Day</th>
                    <th className="font-medium px-2 py-2 hidden sm:table-cell">Week</th>
                    <th className="font-medium px-2 py-2">Month</th>
                    <th className="font-medium px-2 py-2">{days} days</th>
                    <th className="font-medium px-2 py-2 hidden md:table-cell">From high</th>
                    <th className="font-medium px-2 py-2 text-left">Low ← → high</th>
                    <th className="font-medium px-4 py-2 text-left hidden lg:table-cell">Chart</th>
                </tr>
            </thead>
            {groups.map((g) => (
                <tbody key={g.group} className="border-t border-slate-800">
                    <tr><td colSpan={9} className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400">{g.group}</td></tr>
                    {g.rows.map((r) => (
                        <tr key={r.ticker} className="text-right">
                            <td className="text-left text-slate-200 px-4 py-1.5" title={r.ticker}>{r.name}</td>
                            <td className="px-2 text-slate-300 hidden md:table-cell">{fmtPrice(r.last)}</td>
                            <td className={`px-2 hidden sm:table-cell ${chgCls(r.d1)}`}>{chg(r.d1, r.points)}</td>
                            <td className={`px-2 hidden sm:table-cell ${chgCls(r.w1)}`}>{chg(r.w1, r.points)}</td>
                            <td className={`px-2 ${chgCls(r.m1)}`}>{chg(r.m1, r.points)}</td>
                            <td className={`px-2 ${chgCls(r.span)}`}>{chg(r.span, r.points)}</td>
                            <td className="px-2 text-slate-400 hidden md:table-cell">{chg(r.off_high, r.points)}</td>
                            <td className="px-2"><RangePos pos={r.pos} /></td>
                            <td className="px-4 hidden lg:table-cell"><Spark closes={r.spark} up={r.span >= 0} /></td>
                        </tr>
                    ))}
                </tbody>
            ))}
        </table>
    </div>
);

const Section = ({ title, sub, children }) => (
    <section>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {sub && <p className="text-xs text-slate-500 mb-3">{sub}</p>}
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

    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="max-w-6xl mx-auto space-y-8">

                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Daily Briefing</h1>
                    <p className="text-slate-400">What happened, and whether it is unusual. Every number is set against its own recent history.</p>
                    {h && <p className="text-xs text-slate-600 mt-1">Updated {timeOf(h.as_of)}</p>}
                    {data.history?.error && <p className="text-xs text-amber-500 mt-1">History unavailable: {data.history.error}</p>}
                </div>

                {/* The day in plain words */}
                {h?.summary?.length > 0 && (
                    <div className={`${card} p-5 border-indigo-500/30`}>
                        <h2 className="text-lg font-bold text-white mb-3">The day in brief</h2>
                        <dl className="space-y-2.5">
                            {h.summary.map((x) => (
                                <div key={x.topic} className="sm:grid sm:grid-cols-[8rem_1fr] sm:gap-3">
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-300 pt-0.5">{x.topic}</dt>
                                    <dd className="text-slate-200 leading-relaxed">{x.text}</dd>
                                </div>
                            ))}
                        </dl>
                        <p className="text-[11px] text-slate-600 mt-3">Built only from the numbers below. "Usual" means the last {h.price_sessions} trading days for prices and the last {news?.like_days ?? '—'} {unit} for news.</p>
                    </div>
                )}

                {/* Market today */}
                {prices && (
                    <Section title="Markets today" sub="Each move is compared with how much that market normally moves in a day.">
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <PriceCard title="S&P 500" p={prices.spy} />
                                <PriceCard title="VIX (expected volatility)" p={prices.vix} isVix />
                            </div>
                            {prices.sectors?.length > 0 && (
                                <div>
                                    <div className="text-sm font-medium text-slate-300 mb-2">
                                        Sectors {whenOf(prices.sectors[0])}, best to worst
                                    </div>
                                    <SectorBars sectors={prices.sectors} />
                                </div>
                            )}
                        </div>
                    </Section>
                )}

                {/* Prices against their own last 90 days */}
                {prices?.paths?.length > 0 && (() => {
                    const spyPath = prices.paths.flatMap((g) => g.rows).find((r) => r.ticker === 'SPY');
                    return (
                        <Section title={`The bigger picture: ${h.baseline_days} days`}
                            sub={`Change over a day, a week, a month and ${h.baseline_days} days. The bar shows where the price sits between its ${h.baseline_days}-day low (left) and high (right). The 10-year yield moves in percentage points.`}>
                            <div className="space-y-4">
                                {spyPath && <PriceChart r={spyPath} />}
                                <PathTable groups={prices.paths} days={h.baseline_days} />
                            </div>
                        </Section>
                    );
                })()}

                {/* News today vs normal */}
                <Section title="News today" sub={news ? `The last 24 hours against the same hours on the last ${news.like_days} ${unit}. Dot = today, tick = normal, line = lowest to highest.` : null}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard title="How much news" m={news?.metrics.count ?? { today: total_events }} fmt={(v) => (v ?? '—')} unit={unit}
                            note="Also rises and falls with how much the site collects." />
                        <MetricCard title="Tone (bullish minus bearish, per 100)" m={news?.metrics.net} fmt={(v) => (v === null || v === undefined ? '—' : signed(v * 100, 0))} unit={unit}
                            note={`${sentiment_counts.BULLISH} bullish · ${sentiment_counts.BEARISH} bearish · ${sentiment_counts.NEUTRAL} neutral`} />
                        <MetricCard title="Economy & politics share" m={news?.metrics.macro} fmt={pct} unit={unit}
                            note="Economy, geopolitics and central bank stories." />
                        <MetricCard title="High-impact stories" m={news?.metrics.priority} fmt={(v) => (v ?? '—')} unit={unit}
                            note={thresholds ? `Impact ≥ ${thresholds.impact} or novelty ≥ ${thresholds.novelty}.` : null} />
                    </div>
                </Section>

                {/* The baseline span, day by day */}
                {news && (
                    <Section title={`Day by day, last ${h.baseline_days} days`} sub="Today is the bright column on the right. Hover a column for its numbers.">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Strip title="How much news" sub="24 hours to this time each day; weekends dimmed"
                                items={strip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${s.count} items` }))}
                                bar={(s, last) => (
                                    <div className="h-full flex items-end">
                                        <div className={`w-full rounded-sm ${last ? 'bg-indigo-400' : s.weekend ? 'bg-slate-700' : 'bg-indigo-400/50'}`}
                                            style={{ height: `${(s.count / maxCount) * 100}%` }} />
                                    </div>
                                )} />
                            <Strip title="News tone" sub="bullish minus bearish, same hours"
                                items={strip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${s.net === null ? '—' : signed(s.net * 100, 0)}` }))}
                                bar={(s, last) => <Diverging v={s.net} max={maxNet} last={last} posCls="bg-emerald-500" negCls="bg-red-500" />} />
                            <Strip title="S&P 500 daily move" sub="one column per trading day"
                                items={spyStrip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${signed(s.move, 2)}%${s.vix ? ` · VIX ${s.vix.toFixed(1)}` : ''}` }))}
                                bar={(s, last) => <Diverging v={s.move} max={maxMove} last={last} posCls="bg-emerald-500" negCls="bg-red-500" />} />
                        </div>
                    </Section>
                )}

                {/* Names and topics against their own norm */}
                {news && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Section title="Stocks in the news" sub={`Stories today against each stock's daily average over the last ${news.like_days} ${unit}. Most above normal first.`}>
                            <div className={`${card} divide-y divide-slate-800`}>
                                {news.names.length === 0 && <div className="p-4 text-sm text-slate-500 italic">No named stocks today.</div>}
                                {news.names.map((n) => (
                                    <div key={n.name} className="flex items-center justify-between px-4 py-2.5">
                                        <span className="font-mono font-semibold text-slate-200">{n.name}</span>
                                        <span className="flex items-center gap-3 text-sm">
                                            <span className="text-slate-300 whitespace-nowrap">{n.today} today</span>
                                            <span className="text-slate-500 text-right whitespace-nowrap">usually {n.avg}/day</span>
                                            <span className={`text-xs px-2 py-0.5 rounded w-16 text-center ${n.new ? 'bg-indigo-500/20 text-indigo-300' : n.unusual ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                                                {n.new ? 'new' : `${n.ratio}×`}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Section>
                        <Section title="What the news is about" sub="Bar = share of today's stories; tick = the usual share.">
                            <div className={`${card} p-4 space-y-3`}>
                                {news.categories.length === 0 && <div className="text-sm text-slate-500 italic">No data.</div>}
                                {news.categories.map((c) => (
                                    <div key={c.name}>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-300">{topicName(c.name)}</span>
                                            <span className="text-slate-500">{pct(c.share)} <span className="text-slate-600">· usually {pct(c.norm_share)}</span></span>
                                        </div>
                                        <div className="relative h-2 bg-slate-800 rounded mt-1">
                                            <div className="absolute inset-y-0 left-0 bg-indigo-400/70 rounded" style={{ width: `${(c.share || 0) * 100}%` }} />
                                            {c.norm_share !== null && <div className="absolute -top-0.5 h-3 w-[2px] bg-slate-300" style={{ left: `${c.norm_share * 100}%` }} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    </div>
                )}

                {/* High-impact stories. The stored title is often the outlet's
                    name, so the headline (body) leads. */}
                <Section title="High-impact stories" sub={thresholds ? `Last 24 hours, impact ≥ ${thresholds.impact} or novelty ≥ ${thresholds.novelty}.` : null}>
                    <div className="space-y-3">
                        {priority_events.length === 0 ? (
                            <div className="text-slate-500 italic">No high-impact stories in the last 24 hours.</div>
                        ) : (
                            priority_events.map((event) => (
                                <div key={event.id} className={`${card} p-4 hover:border-slate-600 transition-colors`}>
                                    <div className="flex justify-between items-start gap-3">
                                        <p className="text-slate-200 font-medium leading-snug">{event.summary || event.title}</p>
                                        <div className="flex space-x-1 shrink-0 pt-1" title={`impact ${event.impact}/10`}>
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
