import React, { useState, useEffect, useMemo } from 'react';
import { Layers, RefreshCw, Radio, ArrowUpRight, ArrowDownRight, Minus, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { timeAgo } from './Card';

// The bull/bear board. Every number here is a COUNT of headlines by the
// sentiment label Gemini gave each one at ingest, so any tilt can be recounted
// from the feed. The model's own read (one_liner + direction) sits beside the
// count, dated, and is flagged when the two disagree. Mood, not a measured
// price edge: the year's data shows no direction edge in news.

const tiltCls = (t) => t == null ? 'text-slate-500' : t >= 20 ? 'text-emerald-400' : t <= -20 ? 'text-rose-400' : 'text-slate-300';
const signed = (t) => t == null ? '—' : t > 0 ? `+${t}` : `${t}`;
const DIR = {
    bull: { Arrow: ArrowUpRight, cls: 'text-emerald-400' },
    bear: { Arrow: ArrowDownRight, cls: 'text-rose-400' },
    neutral: { Arrow: Minus, cls: 'text-slate-400' },
};
const DOT = { bull: 'bg-emerald-500', bear: 'bg-rose-500', flat: 'bg-slate-600' };

// Tug of war: bear share grows left from the centre, bull share grows right.
const Tug = ({ m, tall }) => {
    if (!m || !m.n) return <div className={`${tall ? 'h-3' : 'h-2'} rounded-full bg-slate-800`} />;
    const bear = (m.bear / m.n) * 50, bull = (m.bull / m.n) * 50;
    return (
        <div className={`relative ${tall ? 'h-3' : 'h-2'} rounded-full bg-slate-800 overflow-hidden`}>
            <div className="absolute top-0 bottom-0 bg-rose-500/80" style={{ right: '50%', width: `${bear}%` }} />
            <div className="absolute top-0 bottom-0 bg-emerald-500/80" style={{ left: '50%', width: `${bull}%` }} />
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-500" />
        </div>
    );
};

// 14 days, one column each: bull bars up, bear bars down, scaled to the busiest day.
const Days = ({ daily, h = 28 }) => {
    if (!daily?.length) return null;
    const max = Math.max(1, ...daily.map(d => Math.max(d.bull, d.bear)));
    const half = h / 2;
    return (
        <div className="flex items-center gap-[2px]" style={{ height: h }}
            title="last 14 days: bullish headlines up, bearish down">
            {daily.map(d => (
                <div key={d.d} className="flex flex-col items-center justify-center w-[5px]" style={{ height: h }}
                    title={`${d.d}: ${d.bull} bull · ${d.bear} bear · ${d.flat} neutral`}>
                    <div className="w-full flex items-end" style={{ height: half }}>
                        <div className="w-full bg-emerald-500/80 rounded-t-sm" style={{ height: (d.bull / max) * half }} />
                    </div>
                    <div className="w-full" style={{ height: half }}>
                        <div className="w-full bg-rose-500/80 rounded-b-sm" style={{ height: (d.bear / max) * half }} />
                    </div>
                </div>
            ))}
        </div>
    );
};

const Swing = ({ m, days }) => {
    if (!m?.recent?.n) return null;
    const s = m.swing;
    return (
        <span className="text-[11px] text-slate-500">
            last {days}d <span className={`font-semibold ${tiltCls(m.recent.tilt)}`}>{signed(m.recent.tilt)}</span>
            {' '}over {m.recent.n}
            {s != null && <> · was <span className={tiltCls(m.prior.tilt)}>{signed(m.prior.tilt)}</span>
                {' '}<span className={`font-semibold ${s > 0 ? 'text-emerald-400' : s < 0 ? 'text-rose-400' : ''}`}>
                    {s > 0 ? '▲' : s < 0 ? '▼' : ''}{Math.abs(s)}</span></>}
        </span>
    );
};

// Model and headlines disagree when the model leans one way and the count leans
// clearly the other: the last few days' count when it has enough headlines to
// mean anything, else the whole window's.
const SWING_MIN = 5;   // narrative.SWING_MIN_EVENTS
const disagrees = (c) => {
    const t = (c.mood?.recent?.n ?? 0) >= SWING_MIN ? c.mood.recent.tilt : c.mood?.tilt;
    if (t == null) return false;
    return (c.direction === 'bull' && t <= -20) || (c.direction === 'bear' && t >= 20);
};

const Heat = ({ heat }) => {
    if (!heat || !heat.week) return null;
    if (heat.x == null) return <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wide">new</span>;
    if (heat.x < 1.5) return null;
    return (
        <span className={`flex items-center gap-0.5 text-[10px] font-bold ${heat.x >= 3 ? 'text-orange-400' : 'text-amber-300'}`}
            title={`${heat.week} headlines this week vs ${heat.norm} in a normal week (the 4 before)`}>
            <Flame size={11} /> {heat.x}× usual
        </span>
    );
};

// A model read older than the recent window was written about a different
// stretch of the story: shown dimmed and labelled, never as the current read.
const STALE_DAYS = 3;
const staleRead = (c) => !c.model_as_of || (Date.now() - new Date(c.model_as_of)) / 864e5 > STALE_DAYS + 1;

const LANE = { stock: 'stock', market: 'market', theme: 'theme' };

const StoryRow = ({ card, days }) => {
    const [open, setOpen] = useState(false);
    const [full, setFull] = useState(null);
    const m = card.mood;
    const dir = DIR[card.direction];
    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next && !full) {
            try {
                const r = await fetch(`/api/narratives/${card.entity_type}/${encodeURIComponent(card.entity)}`);
                if (r.ok) setFull(await r.json());
            } catch { /* body stays empty */ }
        }
    };
    const lu = card.latest_update;
    const stale = staleRead(card);
    return (
        <div onClick={toggle} className="bg-[#0f1422] border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-base font-bold text-white truncate">{card.label}</span>
                {card.mine === 'held' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">HELD</span>}
                {card.mine === 'watch' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-300 border border-slate-600">WATCH</span>}
                <span className="text-[10px] text-slate-600 uppercase tracking-wider">{LANE[card.lane]}</span>
                <Heat heat={card.heat} />
                <span className={`ml-auto text-xl font-bold tabular-nums ${tiltCls(m?.tilt)}`}
                    title="(bullish - bearish) / all headlines in the window, -100..+100">{signed(m?.tilt)}</span>
            </div>

            <div className="mt-2 flex items-center gap-3">
                <div className="flex-1"><Tug m={m} /></div>
                <Days daily={m?.daily} h={22} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {m && <span className="text-slate-500">
                    <span className="text-rose-400">{m.bear} bear</span> · <span className="text-emerald-400">{m.bull} bull</span> · {m.flat} neutral
                </span>}
                <Swing m={m} days={days} />
            </div>

            {card.take && (
                <div className="mt-3 flex items-start gap-1.5">
                    {dir && <dir.Arrow size={16} className={`${dir.cls} mt-0.5 shrink-0`} />}
                    <p className={`text-[14px] leading-snug ${stale ? 'text-slate-500' : 'text-slate-200'}`}>{card.take}</p>
                </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
                {card.direction && <span>model: <span className={dir?.cls}>{card.direction}</span>
                    {card.confidence != null && ` · conf ${card.confidence}/10`}
                    {card.model_as_of && ` · read ${card.model_as_of.slice(5)}`}</span>}
                {card.direction && stale && <span className="font-bold text-slate-500 uppercase tracking-wide">old read</span>}
                {!stale && disagrees(card) && <span className="font-bold text-amber-300 uppercase tracking-wide">model ≠ headlines</span>}
                <span className="ml-auto flex items-center gap-1">{timeAgo(card.last_seen)} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
            </div>

            {lu && !open && (
                <div className="mt-2 flex items-start gap-2 text-[12px] text-slate-400">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${DOT[lu.sentiment] || DOT.flat}`} />
                    <span className="leading-snug line-clamp-2">{lu.headline}</span>
                </div>
            )}

            {open && (
                <div className="mt-3 pt-3 border-t border-slate-800" onClick={(e) => e.stopPropagation()}>
                    {!full && <div className="text-xs text-slate-500 flex items-center gap-2"><Radio size={12} className="animate-pulse" /> Loading…</div>}
                    {full?.synthesis?.arc && <p className="text-sm text-slate-300 leading-relaxed mb-3">{full.synthesis.arc}</p>}
                    {full?.developments?.length > 0 && (
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Developments</span>
                            {full.developments.map((d, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm">
                                    <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${DOT[d.sentiment] || DOT.flat}`} />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-slate-300 leading-snug">{d.headline}</span>
                                        <div className="text-[10px] text-slate-600">{d.source} · {timeAgo(d.date)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {full?.themes?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                            {full.themes.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{t.replace(/_/g, ' ')}</span>)}
                        </div>
                    )}
                    {full && <p className="text-[10px] text-slate-600 mt-3">{full.summary}</p>}
                </div>
            )}
        </div>
    );
};

// The whole tape's tilt, then one gauge per catch-all news category.
const TapePanel = ({ tape, gauges, days }) => {
    if (!tape) return null;
    return (
        <div className="bg-[#0f1422] border border-slate-800 rounded-xl p-4 mb-4">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">All news · mood</div>
                    <div className={`text-3xl font-bold tabular-nums ${tiltCls(tape.recent?.tilt)}`}>{signed(tape.recent?.tilt)}</div>
                    <div className="text-[11px] text-slate-500">last {days}d over {tape.recent?.n} headlines
                        {tape.swing != null && <> · prior <span className={tiltCls(tape.prior?.tilt)}>{signed(tape.prior?.tilt)}</span></>}</div>
                </div>
                <Days daily={tape.daily} h={44} />
            </div>
            <div className="mt-3"><Tug m={tape} tall /></div>
            <div className="mt-1 flex justify-between text-[10px]">
                <span className="text-rose-400">{tape.bear} bear</span>
                <span className="text-slate-500">{tape.flat} neutral</span>
                <span className="text-emerald-400">{tape.bull} bull</span>
            </div>
            {gauges?.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                    {gauges.map(g => (
                        <div key={g.entity} title={g.take || g.summary}>
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400 truncate">{g.label.replace(/_/g, ' ')}</span>
                                <span className={`font-bold tabular-nums ${tiltCls(g.mood?.tilt)}`}>{signed(g.mood?.tilt)}</span>
                            </div>
                            <div className="mt-1"><Tug m={g.mood} /></div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const TURN_MIN = 40;   // a swing this large earns a place in the "Turning" strip

const Turning = ({ cards, onPick }) => {
    const turning = cards.filter(c => Math.abs(c.mood?.swing ?? 0) >= TURN_MIN)
        .sort((a, b) => Math.abs(b.mood.swing) - Math.abs(a.mood.swing)).slice(0, 8);
    if (!turning.length) return null;
    return (
        <div className="mb-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Turning</div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
                {turning.map(c => {
                    const up = c.mood.swing > 0;
                    return (
                        <button key={`${c.entity_type}-${c.entity}`} onClick={() => onPick(c.entity)}
                            className={`shrink-0 text-left px-3 py-2 rounded-lg border ${up ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
                            <div className="text-xs font-bold text-white whitespace-nowrap">{c.label}</div>
                            <div className="text-[11px] tabular-nums whitespace-nowrap">
                                <span className={tiltCls(c.mood.prior.tilt)}>{signed(c.mood.prior.tilt)}</span>
                                <span className="text-slate-600"> → </span>
                                <span className={`font-bold ${tiltCls(c.mood.recent.tilt)}`}>{signed(c.mood.recent.tilt)}</span>
                                <span className={`ml-1 ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{up ? '▲' : '▼'}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const LANES = [
    { id: 'all', label: 'All' }, { id: 'stock', label: 'Stocks' }, { id: 'market', label: 'Markets' },
    { id: 'theme', label: 'Themes' }, { id: 'mine', label: 'Mine' },
];
const SORTS = {
    turning: { label: 'Turning', key: c => -Math.abs(c.mood?.swing ?? 0) },
    hot: { label: 'Busier than usual', key: c => -(c.heat?.x ?? (c.heat?.week ? 99 : 0)) },
    bull: { label: 'Most bullish', key: c => -(c.mood?.tilt ?? -999) },
    bear: { label: 'Most bearish', key: c => (c.mood?.tilt ?? 999) },
    big: { label: 'Most headlines', key: c => -(c.mood?.n ?? 0) },
};

export default function Narratives() {
    const [board, setBoard] = useState(null);
    const [building, setBuilding] = useState(false);
    const [lane, setLane] = useState('all');
    const [sort, setSort] = useState('turning');
    const [pick, setPick] = useState(null);

    const load = async () => {
        try {
            const res = await fetch('/api/narratives/board');
            setBoard(res.ok ? await res.json() : { cards: [], gauges: [] });
        } catch { setBoard({ cards: [], gauges: [] }); }
    };
    const rebuild = async () => {
        setBuilding(true);
        try { await fetch('/api/narratives/build', { method: 'POST' }); await load(); }
        finally { setBuilding(false); }
    };
    useEffect(() => { load(); }, []);

    const cards = useMemo(() => board?.cards || [], [board]);
    const shown = useMemo(() => {
        let xs = cards.filter(c => c.mood);   // cards from before the board have no tally
        if (pick) xs = xs.filter(c => c.entity === pick);
        else if (lane === 'mine') xs = xs.filter(c => c.mine);
        else if (lane !== 'all') xs = xs.filter(c => c.lane === lane);
        const k = SORTS[sort].key;
        return [...xs].sort((a, b) => k(a) - k(b));
    }, [cards, lane, sort, pick]);
    const days = board?.recent_days || 3;

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-10 scrollbar-thin scrollbar-thumb-slate-800">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Layers size={22} className="text-indigo-400" /> Narratives
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">
                            Bull vs bear per story, counted from every headline's sentiment
                            {board?.built_at && <> · built {timeAgo(board.built_at)}</>}
                        </p>
                    </div>
                    <button onClick={rebuild} disabled={building}
                        className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
                        <RefreshCw size={14} className={building ? 'animate-spin' : ''} /> Rebuild
                    </button>
                </div>

                {board === null && <div className="text-slate-500 text-sm flex items-center gap-2"><Radio size={14} className="animate-pulse" /> Loading…</div>}
                {board && (
                    <>
                        <TapePanel tape={board.tape} gauges={board.gauges} days={days} />
                        <Turning cards={cards.filter(c => c.mood)} onPick={(e) => setPick(pick === e ? null : e)} />

                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            {LANES.map(l => (
                                <button key={l.id} onClick={() => { setLane(l.id); setPick(null); }}
                                    className={`text-xs px-3 py-1.5 rounded-full border ${lane === l.id && !pick ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>
                                    {l.label}
                                </button>
                            ))}
                            {pick && <button onClick={() => setPick(null)} className="text-xs px-3 py-1.5 rounded-full border border-indigo-500/50 bg-indigo-500/15 text-indigo-200">{pick} ✕</button>}
                            <select value={sort} onChange={e => setSort(e.target.value)}
                                className="ml-auto text-xs bg-slate-900 border border-slate-700 text-slate-300 rounded-lg px-2 py-1.5">
                                {Object.entries(SORTS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
                            </select>
                        </div>

                        {shown.length === 0 && (
                            <div className="text-slate-500 text-sm">
                                {cards.length === 0 ? 'No stories yet. Hit Rebuild once enough news has come in.'
                                    : lane === 'mine' ? (board.book_at ? 'None of your names has a story this window.' : 'No book snapshot on this box yet (live.json).')
                                        : 'No stories in this view. Hit Rebuild to count the latest news.'}
                            </div>
                        )}
                        <div className="space-y-3">
                            {shown.map(c => <StoryRow key={`${c.entity_type}-${c.entity}`} card={c} days={days} />)}
                        </div>
                        <p className="text-[10px] text-slate-600 mt-6">
                            Tilt = (bullish − bearish) ÷ all headlines, −100 to +100. Mood, not a forecast: the year's data
                            shows no price-direction edge in news. Each day's tilts are kept in narrative_tilt_history so this can be scored.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
