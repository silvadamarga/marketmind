import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

// The forge's intraday position cards (forge plan 27, F1): one row per held /
// called / shortlisted name that drew news today, latest card wins. Everything
// here was computed on the forge; this only renders it. Until F2 lands there is
// no judged verdict — the chip is the code rule (G6 baseline), and says so.

const pct = (v, digits = 1) => (v === null || v === undefined ? null : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);
const tone = (v) => (v === null || v === undefined ? 'text-slate-500' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');
const hhmm = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

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
                        <Num v={m.day} label="day" />
                        {m.x_normal !== null && m.x_normal !== undefined && <span className="text-slate-500">({m.x_normal}× normal)</span>}
                        <Num v={m.vs_spy} label="vs SPY" />
                        {held && <Num v={held.pl_pct} label="P/L" />}
                        <span className="text-slate-600">{c.stories} stor{c.stories === 1 ? 'y' : 'ies'} · {hhmm(c.created_at)}</span>
                    </div>
                    {head && <div className="text-xs text-slate-400 truncate mt-0.5">{head.headline}</div>}
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
                        {ctx.call && <span>call <span className="text-slate-200">{ctx.call.call}</span> <span className="text-slate-600">{ctx.call.issued_on}, {ctx.call.days_open}d open</span></span>}
                        {ctx.conviction && <span>blend #{ctx.conviction.rank}/{ctx.conviction.of}</span>}
                        {c.cards_today > 1 && <span className="text-slate-600">{c.cards_today} cards today</span>}
                    </div>
                    <ul className="space-y-1">
                        {(c.headlines || []).map((h) => (
                            <li key={`${h.src}-${h.ref_id}`} className="text-slate-300">
                                <span className="text-slate-600 mr-1">{hhmm(h.ts)} {h.src === 'investing' ? 'inv' : 'vps'}{h.rows > 1 ? ` ×${h.rows}` : ''}</span>{h.headline}
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
    return (
        <div className="space-y-1.5 mb-4 sm:mb-6">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Your names today · {cards.length}</div>
            {cards.map(c => <Row key={c.ticker} c={c} />)}
        </div>
    );
}
