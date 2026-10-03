import React, { useState, useEffect, useMemo } from 'react';
import { Activity, History as HistoryIcon, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Gates, Trend } from './Scoreboard';

// The forge's per-day join: what the system saw, called, did, and got.
// Every outcome names its basis (close-entry vs open-entry), every number its n,
// and no aggregate here spans two trader eras — the forge builds it that way.

const pct = (v, digits = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);
const tone = (v) => (v === null || v === undefined ? 'text-slate-500' : v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');
const fmtDay = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, opts);

// {mean, n, pending} → "+1.2% n7" or "pending 7"
const Agg = ({ a, compact = false }) => {
    if (!a || (a.n === 0 && a.pending === 0)) return <span className="text-slate-700">·</span>;
    if (a.n === 0) return <span className="text-slate-600 text-[10px] whitespace-nowrap">{compact ? 'pending' : `pending ${a.pending}`}</span>;
    return (
        <span className="whitespace-nowrap">
            <span className={tone(a.mean)}>{pct(a.mean)}</span>
            <span className="text-slate-600 text-[10px] ml-1">n{a.n}{a.pending ? `+${a.pending}` : ''}</span>
        </span>
    );
};

const CALL_STYLE = {
    BUY_CANDIDATE: 'bg-emerald-500/15 text-emerald-300',
    HOLD: 'bg-sky-500/15 text-sky-300',
    WATCH: 'bg-amber-500/15 text-amber-300',
    PASS: 'bg-slate-700/60 text-slate-300',
};
const CALL_SHORT = { BUY_CANDIDATE: 'BUY', HOLD: 'HOLD', WATCH: 'WATCH', PASS: 'PASS' };

const Chip = ({ className = '', children, title }) => (
    <span title={title} className={`inline-block whitespace-nowrap text-[10px] font-semibold px-1.5 py-0.5 rounded ${className}`}>{children}</span>
);

// Four bars: rank / fund / value / event coverage as a share of the universe.
const Coverage = ({ data, acted }) => {
    if (!data) return acted
        ? <Chip className="bg-rose-500/15 text-rose-300" title="The system called this day, but no data_state row records what it saw">no state</Chip>
        : <span className="text-slate-700 text-[10px]">no run</span>;
    const axes = [['rank', data.n_rank], ['fund', data.n_fund], ['value', data.n_value], ['event', data.n_event]];
    const u = data.n_universe || 1;
    return (
        <span className="inline-flex items-center gap-1.5">
            <svg width="26" height="14" viewBox="0 0 26 14" aria-label="axis coverage">
                <title>{axes.map(([k, n]) => `${k} ${n ?? 0}/${data.n_universe}`).join(' · ')}</title>
                {axes.map(([k, n], i) => {
                    const h = Math.max(1, Math.round(((n || 0) / u) * 14));
                    return <rect key={k} x={i * 7} y={14 - h} width="5" height={h} rx="1" className="fill-indigo-400/70" />;
                })}
            </svg>
            {data.tripwires.length > 0 && (
                <Chip className="bg-amber-500/15 text-amber-300" title={data.tripwires.join('\n')}>⚠ {data.tripwires.length}</Chip>
            )}
            {data.source === 'backfill' && <Chip className="bg-slate-700 text-slate-400" title="Reconstructed after the fact, not recorded live">backfill</Chip>}
        </span>
    );
};

// SPY over the window, one point per trading day, trader eras as bands, tripwires as ticks.
const Strip = ({ days, eras }) => {
    const pts = useMemo(() => {
        const seen = new Set();
        const out = [];
        [...days].reverse().forEach((d) => {
            const s = d.spy;
            if (!s || !s.anchor || s.close === null || seen.has(s.anchor)) return;
            seen.add(s.anchor);
            out.push({ day: s.anchor, close: s.close });
        });
        return out;
    }, [days]);
    if (pts.length < 2) return null;

    const W = 1000, H = 120, PAD = 6;
    const t0 = new Date(pts[0].day).getTime(), t1 = new Date(pts[pts.length - 1].day).getTime();
    const x = (d) => PAD + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * PAD);
    const lo = Math.min(...pts.map((p) => p.close)), hi = Math.max(...pts.map((p) => p.close));
    const y = (c) => H - 18 - ((c - lo) / Math.max(1e-9, hi - lo)) * (H - 36);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
    const trips = days.filter((d) => d.data && d.data.tripwires.length && d.date >= pts[0].day && d.date <= pts[pts.length - 1].day);
    const missing = days.filter((d) => !d.data && d.trader.n > 0);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none" role="img" aria-label="SPY with trader eras">
            {eras.map((e, i) => {
                const a = x(e.from < pts[0].day ? pts[0].day : e.from);
                const b = x(e.to > pts[pts.length - 1].day ? pts[pts.length - 1].day : e.to);
                return (
                    <g key={e.prompt + e.from}>
                        <rect x={a} y="0" width={Math.max(2, b - a)} height={H - 14} className={i % 2 ? 'fill-indigo-500/10' : 'fill-violet-500/10'}>
                            <title>{`trader era ${e.prompt} · ${e.from} → ${e.to} · ${e.n_days} days, ${e.n_calls} calls\n${e.models.join('\n')}`}</title>
                        </rect>
                        {b - a > 40 && <text x={a + 3} y="11" className="fill-slate-500" fontSize="10">{e.prompt}</text>}
                    </g>
                );
            })}
            <path d={path} fill="none" strokeWidth="1.5" className="stroke-slate-200" vectorEffect="non-scaling-stroke" />
            {trips.map((d) => (
                <line key={d.date} x1={x(d.date)} x2={x(d.date)} y1={H - 12} y2={H - 4} strokeWidth="2" className="stroke-amber-400/80">
                    <title>{`${d.date}: ${d.data.tripwires.join(', ')}`}</title>
                </line>
            ))}
            {missing.map((d) => (
                <circle key={d.date} cx={x(d.date)} cy={H - 8} r="2.5" className="fill-rose-400">
                    <title>{`${d.date}: trader called with no data_state row`}</title>
                </circle>
            ))}
        </svg>
    );
};

const Section = ({ title, basis, children }) => (
    <div className="mb-4">
        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            {title}{basis && <span className="normal-case font-normal text-slate-600 ml-2">{basis}</span>}
        </h4>
        {children}
    </div>
);

const MiniTable = ({ cols, rows }) => (
    <div className="overflow-x-auto">
        <table className="text-xs">
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-800/60 align-top">
                        {cols.map(([key, render]) => <td key={key} className="py-1 pr-3">{render(r)}</td>)}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const DayDetail = ({ day, detail }) => {
    const [openRationale, setOpenRationale] = useState(null);
    if (!detail) return null;
    const s = day.spy || {};
    return (
        <div className="px-3 sm:px-6 py-4 bg-slate-900/60 border-t border-slate-800">
            <p className="text-[11px] text-slate-500 mb-3">
                SPY on the ledgers' anchor ({s.anchor || '—'}): 5d close-entry <span className={tone(s.ret5_close)}>{pct(s.ret5_close)}</span>
                {' · '}5d open-entry <span className={tone(s.ret5_open)}>{pct(s.ret5_open)}</span>
                {day.era.eval_report && <> · evaluator verdict read: <span className="text-slate-400">{day.era.eval_report}</span></>}
            </p>

            {detail.trader.length > 0 && (
                <Section title={`Trader · era ${day.era.trader || 'unrecorded'}${day.trader.saw ? ` · shown the blend of ${day.trader.saw.slice(5)}` : ''}`} basis="5d open-entry · 5d / 20d close-entry">
                    <MiniTable rows={detail.trader} cols={[
                        ['t', (r) => <span className="font-semibold text-slate-200">{r.ticker}</span>],
                        ['c', (r) => <Chip className={CALL_STYLE[r.call] || 'bg-slate-700 text-slate-300'}>{CALL_SHORT[r.call] || r.call}</Chip>],
                        ['k', (r) => <span className="text-slate-500">conf {r.confidence ?? '—'}</span>],
                        ['o', (r) => <span className={tone(r.ret5_open)}>{pct(r.ret5_open)}</span>],
                        ['5', (r) => <span className={tone(r.ret5_close)}>{pct(r.ret5_close)}</span>],
                        ['20', (r) => <span className={tone(r.ret20_close)}>{pct(r.ret20_close)}</span>],
                        ['why', (r) => r.rationale ? (
                            <button onClick={() => setOpenRationale(openRationale === r.ticker ? null : r.ticker)} className="text-left text-slate-400 hover:text-slate-200 max-w-md">
                                {openRationale === r.ticker ? r.rationale : `${r.rationale.slice(0, 70)}…`}
                            </button>
                        ) : null],
                    ]} />
                </Section>
            )}

            {detail.cohort.length > 0 && (
                <Section title="Cohort admits (why each name was added to deep tracking)" basis="5d / 20d close-entry">
                    <MiniTable rows={detail.cohort} cols={[
                        ['t', (r) => <span className="font-semibold text-slate-200">{r.ticker}</span>],
                        ['r', (r) => <span className="text-slate-400">{r.route}</span>],
                        ['5', (r) => <span className={tone(r.ret5_close)}>{pct(r.ret5_close)}</span>],
                        ['20', (r) => <span className={tone(r.ret20_close)}>{pct(r.ret20_close)}</span>],
                    ]} />
                </Section>
            )}

            {detail.blend_top.length > 0 && (
                <Section title="Blend · top by conviction" basis="5d / 20d close-entry">
                    <MiniTable rows={detail.blend_top} cols={[
                        ['t', (r) => <span className="font-semibold text-slate-200">{r.ticker}</span>],
                        ['c', (r) => <span className="text-slate-400">{r.conviction}</span>],
                        ['e', (r) => r.endorsed ? <Chip className="bg-indigo-500/15 text-indigo-300">endorsed</Chip> : null],
                        ['5', (r) => <span className={tone(r.ret5_close)}>{pct(r.ret5_close)}</span>],
                        ['20', (r) => <span className={tone(r.ret20_close)}>{pct(r.ret20_close)}</span>],
                    ]} />
                </Section>
            )}

            {detail.alerts.length > 0 && (
                <Section title="Entry alerts">
                    <MiniTable rows={detail.alerts} cols={[
                        ['t', (r) => <span className="font-semibold text-slate-200">{r.ticker}</span>],
                        ['s', (r) => <span className="text-slate-400">{r.state}</span>],
                        ['p', (r) => <span className="text-slate-500">@ {r.target ?? '—'}</span>],
                        ['v', (r) => <span className="text-slate-500">{r.vetoes.join(' · ') || (r.triggered ? `triggered ${r.triggered}` : '')}</span>],
                    ]} />
                </Section>
            )}

            {detail.news.length > 0 && (
                <Section title="News flags" basis="5d close-entry (tickers only)">
                    <MiniTable rows={detail.news} cols={[
                        ['k', (r) => <span className="font-semibold text-slate-200">{r.key}</span>],
                        ['d', (r) => <span className="text-slate-400">{r.kind}{r.alerted ? ' · alerted' : ''}</span>],
                        ['c', (r) => <span className="text-slate-500">{r.call_at_flag || ''}</span>],
                        ['5', (r) => <span className={tone(r.ret5_close)}>{pct(r.ret5_close)}</span>],
                    ]} />
                </Section>
            )}

            {detail.weekly.length > 0 && (
                <Section title="Weekly ideas" basis="5d / 20d open-entry">
                    <MiniTable rows={detail.weekly} cols={[
                        ['t', (r) => <span className="font-semibold text-slate-200">{r.ticker}</span>],
                        ['s', (r) => <span className="text-slate-400">{r.stance} {r.horizon}d</span>],
                        ['5', (r) => <span className={tone(r.ret5_open)}>{pct(r.ret5_open)}</span>],
                        ['20', (r) => <span className={tone(r.ret20_open)}>{pct(r.ret20_open)}</span>],
                        ['th', (r) => <span className="text-slate-500">{r.thesis}</span>],
                    ]} />
                </Section>
            )}

            {detail.paper.length > 0 && (
                <Section title="Paper trades opened" basis="realized return to exit">
                    <MiniTable rows={detail.paper} cols={[
                        ['t', (r) => <span className="font-semibold text-slate-200">{r.ticker}</span>],
                        ['a', (r) => <span className="text-slate-400">{r.arm}</span>],
                        ['x', (r) => <span className="text-slate-500">{r.closed ? `${r.exit_reason} ${r.closed}` : 'open'}</span>],
                        ['r', (r) => <span className={tone(r.return)}>{pct(r.return)}</span>],
                    ]} />
                </Section>
            )}

            {(detail.fills.length > 0 || detail.book.length > 0) && (
                <Section title="You">
                    <MiniTable rows={detail.fills} cols={[
                        ['t', (r) => <span className="font-semibold text-slate-200">{r.ticker || '—'}</span>],
                        ['s', (r) => <span className="text-slate-400">{r.side || r.type}</span>],
                        ['q', (r) => <span className="text-slate-500">{r.qty ?? ''} @ {r.price ?? '—'} {r.ccy || ''}</span>],
                    ]} />
                    {detail.book.length > 0 && (
                        <MiniTable rows={detail.book} cols={[
                            ['t', (r) => <span className="font-semibold text-slate-200">{r.ticker}</span>],
                            ['e', (r) => <span className="text-slate-400">book {r.event}</span>],
                            ['p', (r) => r.realized_pnl !== null ? <span className={tone(r.realized_pnl)}>{r.realized_pnl > 0 ? '+' : ''}{r.realized_pnl}</span> : null],
                        ]} />
                    )}
                </Section>
            )}

            {detail.lens.length > 0 && (
                <Section title="Lens spotlight" basis="5d close-entry">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {detail.lens.map((r, i) => (
                            <span key={i}><span className="text-slate-300">{r.ticker}</span> <span className="text-slate-600">{r.lens}</span> <span className={tone(r.ret5_close)}>{pct(r.ret5_close)}</span></span>
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
};

const DayRow = ({ day, prevEra, open, onToggle }) => {
    const newEra = day.era.trader && prevEra && day.era.trader !== prevEra;
    const counts = (obj) => Object.entries(obj).map(([k, n]) => `${n} ${k}`).join(' · ');
    const quiet = !day.trader.n && !day.cohort.n && !day.alerts.n && !day.fills.n && !day.blend.n;
    return (
        <tr onClick={onToggle} className={`border-t border-slate-800 cursor-pointer hover:bg-slate-900/70 ${open ? 'bg-slate-900/70' : ''} ${quiet ? 'opacity-60' : ''}`}>
            <td className="py-2 pl-3 pr-2 sticky left-0 bg-slate-950 whitespace-nowrap">
                <span className="inline-flex items-center gap-1 text-slate-300">
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{fmtDay(day.date)}
                </span>
            </td>
            <td className="py-2 px-2"><Coverage data={day.data} acted={day.trader.n > 0 || day.cohort.n > 0 || day.blend.n > 0} /></td>
            <td className="py-2 px-2 whitespace-nowrap text-xs hidden sm:table-cell">
                {day.era.trader ? <span className="text-slate-400 font-mono">{day.era.trader}</span> : <span className="text-slate-700">·</span>}
                {newEra && <Chip className="ml-1 bg-violet-500/20 text-violet-300" title={`era changed from ${prevEra}`}>new</Chip>}
            </td>
            <td className="py-2 px-2">
                <div className="flex flex-wrap gap-x-2 gap-y-1 min-w-[11rem]">
                    {Object.entries(day.trader.calls).map(([c, v]) => (
                        <span key={c} className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
                            <Chip className={CALL_STYLE[c] || 'bg-slate-700 text-slate-300'}>{CALL_SHORT[c] || c} {v.n}</Chip>
                            <Agg a={v.ret5_open} compact />
                        </span>
                    ))}
                    {!day.trader.n && <span className="text-slate-700">·</span>}
                </div>
            </td>
            <td className="py-2 px-2 text-xs"><Agg a={day.cohort.ret5_close} /></td>
            <td className="py-2 px-2 text-xs"><Agg a={day.blend.endorsed_ret5_close} /></td>
            <td className="py-2 px-2 text-xs"><Agg a={day.blend.all_ret5_close} /></td>
            <td className={`py-2 px-2 text-xs whitespace-nowrap ${tone(day.spy.ret5_close)}`}>{pct(day.spy.ret5_close)}</td>
            <td className="py-2 px-2 text-xs text-slate-400 whitespace-nowrap">{day.alerts.n ? counts(day.alerts.states) : <span className="text-slate-700">·</span>}</td>
            <td className="py-2 px-2 text-xs text-slate-400 whitespace-nowrap">
                {day.fills.n ? `${day.fills.buy}B ${day.fills.sell}S${day.fills.other ? ` +${day.fills.other}` : ''}` : <span className="text-slate-700">·</span>}
                {day.book.realized_pnl ? <span className={`ml-1 ${tone(day.book.realized_pnl)}`}>{day.book.realized_pnl > 0 ? '+' : ''}{day.book.realized_pnl}</span> : null}
            </td>
        </tr>
    );
};

export default function History() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [openDay, setOpenDay] = useState(null);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const response = await fetch('/api/history');
                const result = await response.json();
                setData(response.ok && result.days ? result : null);
            } catch (error) {
                console.error('Failed to fetch history:', error);
                setData(null);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500 bg-slate-950">
                <div className="flex flex-col items-center">
                    <Activity className="animate-spin mb-4 text-slate-400" size={24} />
                    <span className="text-xs font-medium tracking-widest uppercase">Loading History</span>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 bg-slate-950">
                <div className="text-center max-w-md">
                    <HistoryIcon className="mx-auto mb-6 text-slate-600" size={48} />
                    <h2 className="text-xl font-bold text-slate-200 mb-3">History Unavailable</h2>
                    <p className="text-slate-400 text-sm leading-relaxed">The forge builds the history after each pre-open run. None has been pushed yet.</p>
                </div>
            </div>
        );
    }

    const { days, detail, eras, first_day, last_day, age_days, stale } = data;
    const trader = eras.trader;

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950 px-4 py-6 sm:p-10 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            <div className="max-w-6xl mx-auto space-y-8 pb-12">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">History</h1>
                    <p className="text-sm text-slate-400 mt-1">Where the system loses return, read from its own ledgers.</p>
                    {stale && (
                        <p className="text-xs text-amber-400 mt-2 flex items-center">
                            <AlertTriangle size={12} className="mr-1" /> Built {age_days ?? '?'} days ago — the forge has not pushed a newer history.
                        </p>
                    )}
                </div>

                {data.gates && data.gates.length > 0 && <Gates eras={data.gates} />}

                <button onClick={() => setShowDetails(!showDetails)}
                    className="w-full flex items-center justify-between border-t border-slate-800 pt-5 text-left text-sm text-slate-400 hover:text-slate-200">
                    <span className="inline-flex items-center gap-2">{showDetails ? <ChevronDown size={16} /> : <ChevronRight size={16} />}Details</span>
                    <span className="text-xs text-slate-600">trend · {days.length} days, {trader.length} eras, every call and fill</span>
                </button>

                {showDetails && <>
                {data.trend && (
                    <section>
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Trend by stage</h3>
                        <Trend series={data.trend} eras={trader} first={first_day} last={last_day} />
                    </section>
                )}

                <section>
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">SPY across trader eras</h3>
                    <Strip days={days} eras={trader} />
                    <p className="text-[11px] text-slate-600 mt-1">
                        Bands are trader prompt eras (hover for days, calls and models). <span className="text-amber-400">Amber</span> ticks: tripwires fired.{' '}
                        <span className="text-rose-400">Red</span> dots: the trader called with no data state recorded.
                    </p>
                </section>

                <section>
                    <div className="overflow-x-auto border border-slate-800 rounded-lg">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left">
                                    <th className="py-2 pl-3 pr-2 sticky left-0 bg-slate-950">Day</th>
                                    <th className="py-2 px-2" title="Axis coverage rank/fund/value/event, tripwires, backfill">Data</th>
                                    <th className="py-2 px-2 hidden sm:table-cell">Era</th>
                                    <th className="py-2 px-2" title="Mean 5d open-entry return per call type">Trader · 5d open</th>
                                    <th className="py-2 px-2" title="Mean 5d close-entry return of the names admitted to the deep-tracked cohort that day">Cohort · 5d</th>
                                    <th className="py-2 px-2" title="Mean 5d close-entry return of the blend's endorsed set">Endorsed · 5d</th>
                                    <th className="py-2 px-2" title="Mean 5d close-entry return of the whole blend slate — the baseline">Slate · 5d</th>
                                    <th className="py-2 px-2" title="SPY 5d close-entry on the same anchor">SPY · 5d</th>
                                    <th className="py-2 px-2">Alerts</th>
                                    <th className="py-2 px-2" title="Your broker fills (Buy/Sell) and realized book P&L">You</th>
                                </tr>
                            </thead>
                            <tbody>
                                {days.map((d, i) => {
                                    const older = days.slice(i + 1).find((x) => x.era.trader);
                                    const open = openDay === d.date;
                                    return (
                                        <React.Fragment key={d.date}>
                                            <DayRow day={d} prevEra={older ? older.era.trader : null} open={open} onToggle={() => setOpenDay(open ? null : d.date)} />
                                            {open && (
                                                <tr><td colSpan={10} className="p-0"><DayDetail day={d} detail={detail[d.date]} /></td></tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-2">
                        Returns are each ledger's own label: close-entry enters at the first close on/after the day, open-entry at that day's open; both exit 5 trading days later.
                        "n7+2" = 7 labelled, 2 pending. A pending row is never counted as zero.
                    </p>
                </section>
                </>}
            </div>
        </div>
    );
}
