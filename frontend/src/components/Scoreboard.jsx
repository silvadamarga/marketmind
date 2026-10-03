import React, { useState, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// The top of the History tab: the funnel, gate by gate, kept vs cut — built to
// find where return is lost, not to grade it. The forge computes every number
// (scraper/history.py gates()); this file only draws them.
// Palette validated on #020617: diverging blue/red for the ladder, the
// reference categorical order for trend lines. Text never wears series colors.

const POS = '#3987e5', NEG = '#e66767';
const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%`);
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// --- gates: kept vs cut at each step of the funnel ---------------------------

const nfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
const ppfmt = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}pp`);

const AddsBar = ({ v, max, thin }) => {
    const W = 120, MID = W / 2;
    const has = v !== null && v !== undefined;
    const w = has ? Math.min(MID - 3, (Math.abs(v) / max) * (MID - 3)) : 0;
    return (
        <svg width={W} height="12" viewBox={`0 0 ${W} 12`} className="block">
            <line x1={MID} x2={MID} y1="0" y2="12" stroke="#475569" strokeWidth="1" />
            {has && <rect x={v >= 0 ? MID + 1 : MID - 1 - w} y="2" width={Math.max(1, w)} height="8" rx="3"
                fill={v >= 0 ? POS : NEG} fillOpacity={thin ? 0.45 : 0.9} />}
        </svg>
    );
};

const NameList = ({ title, rows, basis }) => (
    <div className="min-w-0">
        <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{title}</h5>
        <table className="text-xs w-full">
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-800/60 align-top">
                        <td className="py-1 pr-2 text-slate-500 whitespace-nowrap tabular-nums">{r.day.slice(5)}</td>
                        <td className="py-1 pr-2 font-semibold text-slate-200 whitespace-nowrap">{r.ticker}</td>
                        <td className="py-1 pr-2 text-right text-slate-100 tabular-nums whitespace-nowrap">
                            {pct(r.x)}
                            {r.drift && <span className="ml-1 text-amber-400" title={`Ledger label ${pct(r.ret)} disagrees with today's prices (${pct(r.ret_now)}, ${basis}-entry): likely a split re-adjusted after labelling. Not trusted.`}>⚠</span>}
                        </td>
                        <td className="py-1 text-slate-500"><span className="line-clamp-2" title={r.why}>{r.why}</span></td>
                    </tr>
                ))}
                {!rows.length && <tr><td className="py-1 text-slate-600">none labelled</td></tr>}
            </tbody>
        </table>
    </div>
);

const GateDetail = ({ g }) => {
    const subMax = Math.max(0.01, ...g.subs.map((x) => Math.abs(x.mean || 0)));
    return (
        <div className="px-3 sm:px-4 py-4 bg-slate-900/60 border-t border-slate-800 space-y-4">
            <p className="text-xs text-slate-400">{g.question} Returns are 5 days vs SPY, {g.basis}-entry.</p>
            {g.subs.length > 0 && (
                <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Split by reason</h5>
                    <table className="text-xs">
                        <tbody>
                            {g.subs.map((x) => (
                                <tr key={x.label}>
                                    <td className="py-0.5 pr-3 text-slate-300 whitespace-nowrap">{x.label}</td>
                                    <td className="py-0.5 pr-3 text-right text-slate-100 tabular-nums">{pct(x.mean)}</td>
                                    <td className="py-0.5 pr-3"><AddsBar v={x.mean} max={subMax} thin={x.n < 10} /></td>
                                    <td className="py-0.5 text-slate-600 tabular-nums">n{x.n}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
                <NameList title="Kept — worst outcomes" rows={g.kept_worst} basis={g.basis} />
                <NameList title="Cut — best outcomes" rows={g.cut_best} basis={g.basis} />
            </div>
        </div>
    );
};

export function Gates({ eras }) {
    const [eraIdx, setEraIdx] = useState(eras.length - 1);
    const era = eras[eraIdx];
    const worst = useMemo(() => {
        // Open the worst gate that has enough names on both sides to mean something.
        const scored = era.gates.filter((g) => g.adds.mean !== null && g.kept.n >= 10 && g.cut.n >= 10);
        return scored.length ? scored.reduce((a, b) => (b.adds.mean < a.adds.mean ? b : a)).key : null;
    }, [era]);
    const [open, setOpen] = useState(undefined);
    const openKey = open === undefined ? worst : open;
    const max = Math.max(0.01, ...era.gates.map((g) => Math.abs(g.adds.mean || 0)));

    return (
        <section>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                <div>
                    <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Kept vs cut, gate by gate</h2>
                    <p className="text-xs text-slate-500 mt-0.5">A gate earns its place when what it keeps beats what it cuts. Open a gate to see the names behind the number.</p>
                </div>
                <select value={eraIdx} onChange={(e) => { setEraIdx(Number(e.target.value)); setOpen(undefined); }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono">
                    {eras.map((e, i) => <option key={e.era + e.from} value={i}>era {e.era} · {e.from.slice(5)} → {e.to.slice(5)}</option>).reverse()}
                </select>
            </div>
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left">
                            <th className="py-2 pl-3 pr-2">Gate</th>
                            <th className="py-2 px-2 text-right">Gate adds</th>
                            <th className="py-2 px-2 hidden sm:table-cell"></th>
                            <th className="py-2 px-2 text-right">Kept</th>
                            <th className="py-2 px-2 text-right">Cut</th>
                            <th className="py-2 px-2 text-right hidden sm:table-cell" title="Days the gate added return · days compared · independent 5-day windows">Evidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        {era.gates.map((g, i) => {
                            const isOpen = openKey === g.key;
                            const newBasis = i > 0 && g.basis !== era.gates[i - 1].basis;
                            return (
                                <React.Fragment key={g.key}>
                                    <tr onClick={() => setOpen(isOpen ? null : g.key)}
                                        className={`cursor-pointer hover:bg-slate-900/70 ${newBasis ? 'border-t-2 border-slate-700' : 'border-t border-slate-800'} ${isOpen ? 'bg-slate-900/70' : ''}`}>
                                        <td className="py-2 pl-3 pr-2 whitespace-nowrap text-slate-200">
                                            <span className="inline-flex items-center gap-1">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{g.label}</span>
                                        </td>
                                        <td className={`py-2 px-2 text-right tabular-nums font-semibold whitespace-nowrap ${g.adds.thin ? 'text-slate-500' : 'text-slate-100'}`}>{ppfmt(g.adds.mean)}</td>
                                        <td className="py-2 px-2 hidden sm:table-cell"><AddsBar v={g.adds.mean} max={max} thin={g.adds.thin} /></td>
                                        <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-slate-300">{pct(g.kept.mean)} <span className="text-[10px] text-slate-600 hidden sm:inline">n{nfmt(g.kept.n)}</span></td>
                                        <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-slate-300">{pct(g.cut.mean)} <span className="text-[10px] text-slate-600 hidden sm:inline">n{nfmt(g.cut.n)}</span></td>
                                        <td className="py-2 px-2 text-right text-[11px] text-slate-500 whitespace-nowrap tabular-nums hidden sm:table-cell">
                                            {g.adds.hit !== null ? `won ${Math.round(g.adds.hit * 100)}% · ` : ''}{g.adds.n_days}d · {g.adds.indep}w{g.adds.thin ? ' · thin' : ''}
                                        </td>
                                    </tr>
                                    {isOpen && <tr><td colSpan={6} className="p-0"><GateDetail g={g} /></td></tr>}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-[11px] text-slate-600 mt-2">
                Kept and cut: average 5-day return vs SPY. Gate adds: kept minus cut, averaged per day. Blend gates use close-entry labels,
                trader and alert gates open-entry (below the thick line), so compare within a group. "thin" = under 4 independent 5-day windows.
            </p>
        </section>
    );
}

// --- trend (in Details) -----------------------------------------------------

const LINES = [
    { key: 'slate', label: 'Whole slate', color: '#94a3b8', dash: '4 3', on: true },
    { key: 'shortlist', label: 'Shortlist', color: '#3987e5', on: true },
    { key: 'trader:BUY_CANDIDATE', label: 'Trader BUY', color: '#d95926', on: true },
    { key: 'trader:HOLD', label: 'Trader HOLD', color: '#199e70', on: true },
    { key: 'endorsed', label: 'Endorsed', color: '#c98500', on: false },
    { key: 'trader:PASS', label: 'Trader PASS', color: '#d55181', on: false },
];
const ROLL = 10, ROLL_MIN = 5;

const rolling = (pts) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
        const win = pts.slice(Math.max(0, i - ROLL + 1), i + 1);
        if (win.length >= ROLL_MIN) out.push([pts[i][0], win.reduce((a, p) => a + p[1], 0) / win.length]);
    }
    return out;
};

export function Trend({ series, eras, first, last }) {
    const [on, setOn] = useState(() => Object.fromEntries(LINES.map((l) => [l.key, l.on])));
    const [hover, setHover] = useState(null);
    const ref = useRef(null);

    // Trader lines get one segment per era, so a rolling mean never crosses an era.
    const lines = useMemo(() => LINES.map((l) => {
        const raw = series[l.key];
        const segs = Array.isArray(raw) && raw.length && raw[0].points
            ? raw.map((s) => rolling(s.points)).filter((s) => s.length)
            : [rolling(raw || [])].filter((s) => s.length);
        return { ...l, segs };
    }), [series]);

    const visible = lines.filter((l) => on[l.key]);
    const all = visible.flatMap((l) => l.segs.flat().map((p) => p[1]));
    const lim = Math.max(0.01, ...all.map(Math.abs)) * 1.1;
    const W = 1000, H = 220, L = 70, R = 8, T = 10, B = 22;
    const t0 = new Date(first).getTime(), t1 = new Date(last).getTime();
    const x = (d) => L + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R);
    const y = (v) => T + ((lim - v) / (2 * lim)) * (H - T - B);
    const ticks = [-lim, -lim / 2, 0, lim / 2, lim].map((v) => Math.round(v * 1000) / 1000);
    const dates = [...new Set(visible.flatMap((l) => l.segs.flat().map((p) => p[0])))].sort();

    const onMove = (e) => {
        const box = ref.current.getBoundingClientRect();
        const px = ((e.clientX - box.left) / box.width) * W;
        let best = null, bd = Infinity;
        for (const d of dates) { const dd = Math.abs(x(d) - px); if (dd < bd) { bd = dd; best = d; } }
        setHover(best);
    };
    // Ledgers stamp some days differently, so match each line's nearest point within 2 days.
    const valueAt = (l, d) => {
        const t = new Date(d).getTime();
        let best = null, bd = 2.5 * 864e5;
        for (const s of l.segs) for (const p of s) { const dd = Math.abs(new Date(p[0]).getTime() - t); if (dd <= bd) { bd = dd; best = p[1]; } }
        return best;
    };

    return (
        <div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-2">
                {lines.map((l) => (
                    <button key={l.key} onClick={() => setOn({ ...on, [l.key]: !on[l.key] })}
                        className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${on[l.key] ? 'border-slate-700 text-slate-200' : 'border-slate-800 text-slate-600'}`}>
                        <svg width="16" height="6"><line x1="0" x2="16" y1="3" y2="3" stroke={on[l.key] ? l.color : '#334155'} strokeWidth="2" strokeDasharray={l.dash} /></svg>
                        {l.label}
                    </button>
                ))}
            </div>
            <div className="relative">
                <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-56 sm:h-64" preserveAspectRatio="none"
                    onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Rolling 10-day excess return vs SPY by stage">
                    {eras.map((e, i) => (
                        <rect key={e.prompt + e.from} x={x(e.from)} y={T} width={Math.max(1, x(e.to) - x(e.from))} height={H - T - B}
                            fill={i % 2 ? '#6366f1' : '#8b5cf6'} fillOpacity="0.06" />
                    ))}
                    {ticks.map((v) => (
                        <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#64748b' : '#1e293b'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))}
                    {visible.map((l) => l.segs.map((s, i) => (
                        <path key={l.key + i} d={s.map((p, j) => `${j ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}
                            fill="none" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    )))}
                    {hover && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
                </svg>
                {ticks.map((v) => (
                    <span key={v} className="absolute left-0 -translate-y-1/2 text-[10px] text-slate-500 tabular-nums pointer-events-none"
                        style={{ top: `${(y(v) / H) * 100}%` }}>{pct(v, 0)}</span>
                ))}
                <span className="absolute bottom-0 text-[10px] text-slate-500 pointer-events-none" style={{ left: `${(L / W) * 100}%` }}>{fmtDay(first)}</span>
                <span className="absolute bottom-0 right-0 text-[10px] text-slate-500 pointer-events-none">{fmtDay(last)}</span>
                {hover && (
                    <div className="absolute top-2 pointer-events-none bg-slate-900/95 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs shadow-lg"
                        style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }}>
                        <div className="text-slate-400 mb-1">{fmtDay(hover)} · 10-day avg vs SPY</div>
                        {visible.map((l) => {
                            const v = valueAt(l, hover);
                            return v === null ? null : (
                                <div key={l.key} className="flex items-center gap-2 tabular-nums">
                                    <svg width="10" height="4"><line x1="0" x2="10" y1="2" y2="2" stroke={l.color} strokeWidth="2" /></svg>
                                    <span className="text-slate-300 w-24">{l.label}</span><span className="text-slate-100">{pct(v)}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
                Rolling {ROLL}-day average of each stage's 5-day return vs SPY. Above zero = beating SPY. Trader lines restart at each era (shaded bands).
            </p>
        </div>
    );
}
