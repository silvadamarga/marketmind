import React from 'react';
import { Zap, Droplets, Compass } from 'lucide-react';
import { BIAS, BIAS_FLAG, BIAS_THRESHOLDS } from '../utils/constants';

const STATES = [BIAS.STRONG_BULL, BIAS.BULL, BIAS.NEUTRAL, BIAS.BEAR, BIAS.STRONG_BEAR];
const FLAGS = [BIAS_FLAG.EXTENDED, BIAS_FLAG.WASHED];

export default function UniverseGuide() {
    return (
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="max-w-3xl mx-auto space-y-8">

                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold text-white mb-2">The Bias Read</h1>
                    <p className="text-slate-400">Grasp the market at a glance — which sectors lead, which lag.</p>
                </div>

                {/* The logic, in one line */}
                <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <Compass className="text-indigo-400" size={22} />
                        <h2 className="text-lg font-bold text-white">How it's built</h2>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed mb-3">
                        <span className="text-white font-semibold">Sectors</span> (the XL* ETFs) are read{' '}
                        <span className="text-white font-semibold">relative to SPY</span>: bullish when they{' '}
                        <span className="text-emerald-400 font-semibold">lead</span> the market, bearish when
                        they <span className="text-rose-400 font-semibold">lag</span> — so leadership shows even
                        on all-red or all-green days. The tape is sorted leaders → laggards.
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed mb-3">
                        <span className="text-white font-semibold">SPY, indices and macro</span> (VIX, yields,
                        dollar, BTC) are read <span className="text-white font-semibold">absolute</span> — they
                        set the regime, not a sector call.
                    </p>
                    <p className="text-sm text-slate-300 leading-relaxed">
                        <span className="text-white font-semibold">Volume (RVOL)</span> upgrades a move to{' '}
                        <span className="text-emerald-400 font-semibold">Strong</span> when confirmed;{' '}
                        <span className="text-white font-semibold">RSI</span> only adds a caution flag when
                        stretched. Hover any ticker for the full intraday read (VWAP structure, RS, RSI) behind
                        the decision.
                    </p>
                </div>

                {/* Bias states — driven off the same source as the tape */}
                <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4">The five states</h2>
                    <div className="space-y-2">
                        {STATES.map((s) => (
                            <div key={s.key} className="flex items-center gap-4 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
                                <div className="flex items-center gap-2 w-32 shrink-0">
                                    <div className={`w-[3px] h-8 rounded-full ${s.accent}`}></div>
                                    <span className={`text-sm font-bold ${s.text}`}>{s.glyph}</span>
                                    <span className={`text-sm font-bold ${s.text}`}>{s.label}</span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Caution flags */}
                <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4">Caution flags</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {FLAGS.map((f) => {
                            const Icon = f.icon === 'zap' ? Zap : Droplets;
                            return (
                                <div key={f.key} className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/40">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon size={16} className={f.text} />
                                        <span className={`text-sm font-bold ${f.text}`}>{f.label}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Thresholds + reading a cell */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Thresholds</h3>
                        <ul className="space-y-3 text-sm">
                            <li className="flex justify-between"><span className="text-slate-400">Sector leads / lags</span><span className="font-mono text-slate-200">|vs SPY| ≥ {BIAS_THRESHOLDS.RS_FLAT}%</span></li>
                            <li className="flex justify-between"><span className="text-slate-400">Strong lead / lag</span><span className="font-mono text-slate-200">|vs SPY| ≥ {BIAS_THRESHOLDS.RS_STRONG}%</span></li>
                            <li className="flex justify-between"><span className="text-slate-400">Volume-confirmed</span><span className="font-mono text-amber-400">RVOL ≥ {BIAS_THRESHOLDS.NOTABLE_RVOL}x</span></li>
                            <li className="flex justify-between"><span className="text-slate-400">Meaningful move</span><span className="font-mono text-slate-200">|change| ≥ {BIAS_THRESHOLDS.BIG_MOVE}%</span></li>
                            <li className="flex justify-between"><span className="text-slate-400">Extended (hot)</span><span className="font-mono text-rose-400">RSI &gt; {BIAS_THRESHOLDS.RSI_HOT}</span></li>
                            <li className="flex justify-between"><span className="text-slate-400">Washed (cold)</span><span className="font-mono text-emerald-400">RSI &lt; {BIAS_THRESHOLDS.RSI_COLD}</span></li>
                        </ul>
                        <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
                            Tuned for regular trading hours. Index-type tickers with no volume (VIX, yields,
                            dollar) fall back to a change-driven read.
                        </p>
                    </div>

                    <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Reading a cell</h3>
                        <div className="p-3 bg-black/30 rounded-lg border border-slate-800 flex items-stretch gap-3">
                            <div className="w-[3px] rounded-full bg-emerald-400"></div>
                            <div className="flex flex-col justify-center gap-1 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="font-mono text-[9px] font-bold text-slate-500">#1</span>
                                        <span className="text-[11px] font-bold text-emerald-400">▲▲</span>
                                        <span className="font-bold text-[13px] tracking-tight text-slate-100">XLE</span>
                                    </div>
                                    <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums">+1.4%</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-slate-500">Energy</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-[10px] text-slate-400 tabular-nums">$88.40</span>
                                        <span className="font-mono text-[9px] font-bold text-amber-400/90 tabular-nums">2.5x</span>
                                        <Zap size={10} className="text-amber-400" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <ul className="text-xs text-slate-400 mt-4 space-y-1.5">
                            <li><span className="text-slate-200 font-semibold">#1</span> — leadership rank vs SPY (#1 = today's strongest sector).</li>
                            <li><span className="text-slate-200 font-semibold">▲▲ + symbol</span> — direction, conviction &amp; the ticker.</li>
                            <li><span className="text-slate-200 font-semibold">Change %</span> — the move, coloured by bias.</li>
                            <li><span className="text-slate-200 font-semibold">Name</span> — plain-english what it is (Energy = XLE).</li>
                            <li><span className="text-slate-200 font-semibold">Price · RVOL · ⚡/💧</span> — support &amp; caution; hover for the rest.</li>
                        </ul>
                    </div>
                </div>

            </div>
        </div>
    );
}
