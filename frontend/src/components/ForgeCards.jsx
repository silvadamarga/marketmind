import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

// The forge's intraday position cards (forge plan 27, F1): one row per held /
// called / shortlisted name that drew news today, latest card wins. Everything
// here was computed on the forge; this only renders it. Until F2 lands there is
// no judged verdict — the chip is the code rule (G6 baseline), and says so.
// Read load (plan 27 G5, ≤ 3 rows/day): a name renders in full only when it
// is a hazard now, was one earlier today, or moves ≥ 2× its normal day either
// way. The rest fold into one "checked, no change" line.

const pct = (v, digits = 1) => (v === null || v === undefined ? null : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);
const tone = (v) => (v === null || v === undefined ? 'text-slate-500' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');
const hhmm = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
const BIG_MOVE_X = 2;
const bigMove = (c) => Math.abs(c.context?.move?.x_normal ?? 0) >= BIG_MOVE_X;
const loud = (c) => c.rule_stance === 'hazard_wait' || !!c.hazard_seen || bigMove(c);

const TIER_STYLE = {
    book: 'bg-indigo-500/15 text-indigo-300',
    call: 'bg-sky-500/15 text-sky-300',
    shortlist: 'bg-slate-700/60 text-slate-300',
};

const Chip = ({ className = '', children, title }) => (
    <span title={title} className={`inline-block whitespace-nowrap text-[10px] font-semibold px-1.5 py-0.5 rounded ${className}`}>{children}</span>
);

const Num = ({ v, label, digits }) => {
    const s = pct(v, digits);
    if (s === null) return null;
    return <span className="whitespace-nowrap"><span className="text-slate-500">{label} </span><span className={tone(v)}>{s}</span></span>;
};

function Row({ c }) {
    const [open, setOpen] = useState(false);
    const ctx = c.context || {};
    const m = ctx.move || {};
    const price = ctx.price || {};
    const held = ctx.held;
    const lv = ctx.levels || {};
    const hazard = c.rule_stance === 'hazard_wait';
    const cleared = !hazard && c.hazard_seen;
    const big = !hazard && bigMove(c); // a hazard chip already says the move
    const rs = c.ref_stop;
    const head = (c.headlines || [])[0];
    return (
        <div className={`border rounded-lg ${hazard ? 'border-rose-500/40 bg-rose-500/5' : 'border-slate-800 bg-[#131b2e]'}`}>
            <button onClick={() => setOpen(!open)} className="w-full text-left px-3 py-2 flex items-start gap-2">
                {open ? <ChevronDown size={14} className="mt-0.5 text-slate-500 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 text-slate-500 shrink-0" />}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-bold text-slate-100">{c.ticker}</span>
                        <Chip className={TIER_STYLE[c.tier] || TIER_STYLE.shortlist}>{c.tier}</Chip>
                        {hazard && <Chip className="bg-rose-500/20 text-rose-300" title="Code rule (G6): day move ≤ −2× the name's normal day, or within 3% of a stop. Not a judged verdict.">
                            <AlertTriangle size={10} className="inline -mt-0.5 mr-0.5" />rule: hazard</Chip>}
                        {cleared && <Chip className="bg-amber-500/15 text-amber-300" title={`Code rule fired on ${c.hazard_seen.n} of today's ${c.cards_today} cards; the latest card no longer meets it.`}>
                            hazard {hhmm(c.hazard_seen.first)}{c.hazard_seen.last !== c.hazard_seen.first ? `–${hhmm(c.hazard_seen.last)}` : ''}, cleared</Chip>}
                        {big && <Chip className={m.x_normal > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'} title="Day move at least 2× the name's normal day. Context, not a verdict.">
                            big move {m.x_normal > 0 ? '↑' : '↓'}{Math.abs(m.x_normal)}×</Chip>}
                        <Num v={m.day} label="day" />
                        {!big && m.x_normal !== null && m.x_normal !== undefined && <span className="text-slate-500">({m.x_normal}× normal)</span>}
                        <Num v={m.vs_spy} label="vs SPY" />
                        {held && <Num v={held.pl_pct} label="P/L" />}
                        <span className="text-slate-600">{c.stories} stor{c.stories === 1 ? 'y' : 'ies'} · {hhmm(c.created_at)}</span>
                    </div>
                    {head && <div className="text-xs text-slate-400 truncate mt-0.5">{head.headline}
                        {(head.also_on || []).length > 0 && <span className="text-slate-600"> · also {head.also_on.join(', ')}</span>}</div>}
                </div>
            </button>
            {open && (
                <div className="px-9 pb-3 space-y-2 text-xs">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-400">
                        {price.last !== null && price.last !== undefined && <span>last {price.last.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-slate-600">({price.source === 'daily_close' ? `close ${price.at}` : hhmm(price.at)})</span></span>}
                        <Num v={m.since_first_headline} label="since 1st headline" />
                        {m.normal_day !== null && m.normal_day !== undefined && <span><span className="text-slate-500">normal day </span>±{(m.normal_day * 100).toFixed(1)}%</span>}
                        <Num v={lv.to_stop} label={lv.stop_kind === 'position' ? 'to stop' : 'to sizing stop'} />
                        <Num v={lv.to_entry} label="to entry level" />
                        {rs && <span title="Display only — no stop is set on this holding. The stop the governor would size a fresh entry with: previous close less the regime's stop %. Not used by the hazard rule.">
                            <span className="text-slate-500">ref stop </span>{rs.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            <span className="text-slate-600"> (−{(rs.pct * 100).toFixed(0)}% prev close)</span>{rs.to !== null && <span className={tone(rs.to)}> {pct(rs.to)} away</span>}</span>}
                        {ctx.call && <span>call <span className="text-slate-200">{ctx.call.call}</span> <span className="text-slate-600">{ctx.call.issued_on}, {ctx.call.days_open}d open</span></span>}
                        {ctx.conviction && <span>blend #{ctx.conviction.rank}/{ctx.conviction.of}</span>}
                        {c.cards_today > 1 && <span className="text-slate-600">{c.cards_today} cards today</span>}
                    </div>
                    <ul className="space-y-1">
                        {(c.headlines || []).map((h) => (
                            <li key={`${h.src}-${h.ref_id}`} className="text-slate-300">
                                <span className="text-slate-600 mr-1">{hhmm(h.ts)} {h.src === 'investing' ? 'inv' : 'vps'}{h.rows > 1 ? ` ×${h.rows}` : ''}</span>{h.headline}
                                {(h.also_on || []).length > 0 && <span className="text-slate-600"> · also {h.also_on.join(', ')}</span>}
                            </li>
                        ))}
                    </ul>
                    {(c.notes || []).length > 0 && <div className="text-slate-600">{c.notes.join(' · ')}</div>}
                </div>
            )}
        </div>
    );
}

export default function ForgeCards() {
    const [snap, setSnap] = useState(null);
    const [showQuiet, setShowQuiet] = useState(false);
    useEffect(() => {
        let alive = true;
        const load = () => fetch('/api/forge/cards')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (alive) setSnap(d); })
            .catch(() => {});
        load();
        const t = setInterval(load, 60000);
        return () => { alive = false; clearInterval(t); };
    }, []);
    const cards = snap?.cards || [];
    if (!cards.length) return null;
    const shown = cards.filter(loud);
    const quiet = cards.filter(c => !loud(c));
    // Before 15:15 the selector runs on the previous day's scope file; the
    // newest card says which file the last run read.
    const newest = cards.reduce((a, c) => (c.created_at > a.created_at ? c : a));
    const oldScope = newest.scope_day && newest.scope_day !== snap.run_day ? newest.scope_day : null;
    return (
        <div className="space-y-1.5 mb-4 sm:mb-6">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                Your names today · {cards.length}
                {oldScope && <span className="normal-case tracking-normal text-amber-400/80" title="news_scope.json is rebuilt at 15:15; until then the names in scope are the previous day's."> · scope from {oldScope} until 15:15</span>}
            </div>
            {shown.map(c => <Row key={c.ticker} c={c} />)}
            {quiet.length > 0 && (
                <button onClick={() => setShowQuiet(!showQuiet)} className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300">
                    {showQuiet ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                    <span title="? = rule inputs missing, not measured">{quiet.length} checked, no change: <span className="text-slate-400">{quiet.map(c => c.rule_stance === null ? `${c.ticker}?` : c.ticker).join(' ')}</span></span>
                </button>
            )}
            {showQuiet && quiet.map(c => <Row key={c.ticker} c={c} />)}
        </div>
    );
}
