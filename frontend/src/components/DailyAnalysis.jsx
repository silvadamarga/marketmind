import React, { useState, useEffect } from 'react';
import { AlertTriangle, Activity } from 'lucide-react';

// The Daily Briefing: the last 24h, each number next to what is normal for it.
// A count alone says nothing (180 events is a quiet weekday and a loud Sunday),
// so news is read against the same 24h window on the last 90 days, weekdays
// against weekdays, and prices against each ticker's typical daily move
// (backend/daily_history.py). Decision support only.

const card = 'bg-[#131b2e] border border-slate-800 rounded-xl';
const signed = (v, d = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`);
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const shortDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// rank = {below, of}: how many of the baseline days sat below today.
const verdict = (rank) => {
    if (!rank || !rank.of) return { word: 'no baseline', cls: 'text-slate-500' };
    const f = rank.below / rank.of;
    if (f >= 0.9) return { word: 'very high', cls: 'text-amber-300' };
    if (f >= 0.75) return { word: 'high', cls: 'text-amber-400' };
    if (f <= 0.1) return { word: 'very low', cls: 'text-sky-300' };
    if (f <= 0.25) return { word: 'low', cls: 'text-sky-400' };
    return { word: 'normal', cls: 'text-slate-300' };
};
const rankText = (rank, unit) => (rank ? `above ${rank.below} of the last ${rank.of} ${unit}` : '');

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
    const when = p.live ? `today so far, ${timeOf(p.at)}` : `last session, ${shortDay(p.date)}`;
    if (isVix) {
        const v = verdict(p.rank);
        return (
            <div className={`${card} p-4`}>
                <div className="flex items-baseline justify-between">
                    <span className="text-slate-400 text-sm font-medium">{title}</span>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${v.cls}`}>{v.word}</span>
                </div>
                <div className="text-3xl font-bold text-white mt-1">{p.level.toFixed(1)} <span className="text-base font-medium text-slate-400">{signed(p.move)}%</span></div>
                <RangeBar low={p.low} high={p.high} median={p.median} today={p.level} />
                <div className="text-xs text-slate-500 mt-2">normal {p.median} · range {p.low} to {p.high}</div>
                <div className="text-xs text-slate-500">{rankText(p.rank, 'sessions')} · {when}</div>
            </div>
        );
    }
    const v = verdict(p.rank);
    return (
        <div className={`${card} p-4`}>
            <div className="flex items-baseline justify-between">
                <span className="text-slate-400 text-sm font-medium">{title}</span>
                <span className={`text-xs font-semibold uppercase tracking-wide ${v.cls}`}>{v.word} move</span>
            </div>
            <div className={`text-3xl font-bold mt-1 ${p.move >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(p.move, 2)}%</div>
            <div className="text-xs text-slate-500 mt-2">typical day ±{p.norm}% · this one {p.ratio}× that</div>
            <div className="text-xs text-slate-500">size {rankText(p.rank, 'sessions')} · {when}</div>
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
                    <p className="text-slate-400">
                        The last 24 hours, each number next to what is normal for it.
                        {news && <> News is compared with the same 24 hours on the last {news.like_days} {unit}; prices with each ticker's typical daily move.</>}
                    </p>
                    {h && <p className="text-xs text-slate-600 mt-1">as of {timeOf(h.as_of)}</p>}
                    {data.history?.error && <p className="text-xs text-amber-500 mt-1">History unavailable: {data.history.error}</p>}
                </div>

                {/* News today vs normal */}
                <Section title="News today vs normal" sub={news ? `Dot = today, tick = normal (median), line = range over the last ${news.like_days} ${unit}.` : null}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard title="News volume" m={news?.metrics.count ?? { today: total_events }} fmt={(v) => (v ?? '—')} unit={unit}
                            note="Follows how much the site collects, not only the market." />
                        <MetricCard title="Mood (bull − bear per 100)" m={news?.metrics.net} fmt={(v) => (v === null || v === undefined ? '—' : signed(v * 100, 0))} unit={unit}
                            note={`${sentiment_counts.BULLISH} bullish · ${sentiment_counts.BEARISH} bearish · ${sentiment_counts.NEUTRAL} neutral`} />
                        <MetricCard title="Macro & geopolitics share" m={news?.metrics.macro} fmt={pct} unit={unit} />
                        <MetricCard title="Priority events" m={news?.metrics.priority} fmt={(v) => (v ?? '—')} unit={unit}
                            note={thresholds ? `impact ≥ ${thresholds.impact} or novelty ≥ ${thresholds.novelty}` : null} />
                    </div>
                </Section>

                {/* Market today vs normal */}
                {prices && (
                    <Section title="Market vs its normal" sub={`A move is read against that ticker's median daily move over the last ${h.price_sessions} sessions.`}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <PriceCard title="S&P 500 (SPY)" p={prices.spy} />
                            <PriceCard title="VIX" p={prices.vix} isVix />
                        </div>
                    </Section>
                )}

                {/* The baseline span, day by day */}
                {news && (
                    <Section title={`The last ${h.baseline_days} days`} sub="Today is the bright column on the right. Hover a column for its numbers.">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Strip title="News volume" sub="24h windows ending at this time of day; weekends dimmed"
                                items={strip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${s.count} items` }))}
                                bar={(s, last) => (
                                    <div className="h-full flex items-end">
                                        <div className={`w-full rounded-sm ${last ? 'bg-indigo-400' : s.weekend ? 'bg-slate-700' : 'bg-indigo-400/50'}`}
                                            style={{ height: `${(s.count / maxCount) * 100}%` }} />
                                    </div>
                                )} />
                            <Strip title="Mood" sub="bull minus bear share, same windows"
                                items={strip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${s.net === null ? '—' : signed(s.net * 100, 0)}` }))}
                                bar={(s, last) => <Diverging v={s.net} max={maxNet} last={last} posCls="bg-emerald-500" negCls="bg-red-500" />} />
                            <Strip title="SPY daily move" sub="one column per trading session"
                                items={spyStrip.map((s) => ({ ...s, title: `${shortDay(s.date)}: ${signed(s.move, 2)}%${s.vix ? ` · VIX ${s.vix.toFixed(1)}` : ''}` }))}
                                bar={(s, last) => <Diverging v={s.move} max={maxMove} last={last} posCls="bg-emerald-500" negCls="bg-red-500" />} />
                        </div>
                    </Section>
                )}

                {/* Names and categories against their own norm */}
                {news && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Section title="Names in the news vs their normal" sub={`Mentions today vs their daily average over the last ${news.like_days} ${unit}. Sorted by how far above normal.`}>
                            <div className={`${card} divide-y divide-slate-800`}>
                                {news.names.length === 0 && <div className="p-4 text-sm text-slate-500 italic">No named stocks today.</div>}
                                {news.names.map((n) => (
                                    <div key={n.name} className="flex items-center justify-between px-4 py-2.5">
                                        <span className="font-mono font-semibold text-slate-200">{n.name}</span>
                                        <span className="flex items-center gap-3 text-sm">
                                            <span className="text-slate-300 whitespace-nowrap">{n.today} today</span>
                                            <span className="text-slate-500 text-right whitespace-nowrap">norm {n.avg}/d</span>
                                            <span className={`text-xs px-2 py-0.5 rounded w-16 text-center ${n.new ? 'bg-indigo-500/20 text-indigo-300' : n.unusual ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                                                {n.new ? 'new' : `${n.ratio}×`}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Section>
                        <Section title="Topics vs their normal share" sub="Bar = share of today's news; tick = normal share.">
                            <div className={`${card} p-4 space-y-3`}>
                                {news.categories.length === 0 && <div className="text-sm text-slate-500 italic">No data.</div>}
                                {news.categories.map((c) => (
                                    <div key={c.name}>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-300">{c.name}</span>
                                            <span className="text-slate-500">{pct(c.share)} <span className="text-slate-600">· normal {pct(c.norm_share)}</span></span>
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

                {/* Sectors */}
                {prices?.sectors?.length > 0 && (
                    <Section title="Sectors vs their normal move" sub={`Each sector ETF's ${prices.sectors[0].live ? 'move so far today' : `last session (${shortDay(prices.sectors[0].date)})`} against its own typical day (±). Sorted by how unusual.`}>
                        <div className={`${card} divide-y divide-slate-800`}>
                            {prices.sectors.map((s) => {
                                const v = verdict(s.rank);
                                return (
                                    <div key={s.ticker} className="flex items-center justify-between px-4 py-2 text-sm">
                                        <span className="font-mono font-semibold text-slate-200 w-14">{s.ticker}</span>
                                        <span className={`w-16 text-right ${s.move >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(s.move, 2)}%</span>
                                        <span className="text-slate-500 w-20 text-right whitespace-nowrap">±{s.norm}%</span>
                                        <span className="text-slate-400 w-12 text-right hidden sm:inline">{s.ratio}×</span>
                                        <span className={`w-20 text-right text-xs uppercase ${v.cls}`}>{v.word}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>
                )}

                {/* Priority events */}
                <Section title="Priority events" sub={thresholds ? `Impact ≥ ${thresholds.impact} or novelty ≥ ${thresholds.novelty}, last 24 hours.` : null}>
                    <div className="space-y-4">
                        {priority_events.length === 0 ? (
                            <div className="text-slate-500 italic">No priority events in the last 24 hours.</div>
                        ) : (
                            priority_events.map((event) => (
                                <div key={event.id} className={`${card} p-5 hover:border-slate-600 transition-colors`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">{event.source}</span>
                                            <span className="text-slate-600">•</span>
                                            <span className="text-xs text-slate-500">{new Date(event.date).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="flex space-x-1">
                                            {[...Array(5)].map((_, i) => (
                                                <div key={i} className={`w-1 h-3 rounded-sm ${i < (event.impact / 2) ? 'bg-red-500' : 'bg-slate-800'}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-200 mb-2">{event.title}</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed">{event.summary}</p>
                                </div>
                            ))
                        )}
                    </div>
                </Section>

            </div>
        </div>
    );
}
