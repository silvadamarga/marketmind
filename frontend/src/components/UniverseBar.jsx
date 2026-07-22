import React, { useState, useMemo } from 'react';
import { Zap, Droplets } from 'lucide-react';
import { TICKER_NAMES, BIAS_THRESHOLDS, SECTOR_ETFS, computeBias } from '../utils/constants';

const FlagIcon = ({ flag, size = 11 }) => {
    if (!flag) return null;
    const Icon = flag.icon === 'zap' ? Zap : Droplets;
    return <Icon size={size} className={flag.text} />;
};

const UniverseBar = ({ signals, marqueeDuration, marqueeSignals, spyChange = 0 }) => {
    const [hoveredSignal, setHoveredSignal] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        setTooltipPos({ x: e.clientX, y: e.clientY + 20 });
    };

    const handleMouseEnter = (e, sig) => {
        setHoveredSignal(sig);
        setTooltipPos({ x: e.clientX, y: e.clientY + 20 });
    };

    const handleMouseLeave = () => {
        setHoveredSignal(null);
    };

    // Leadership rank among sectors only (#1 = today's strongest vs SPY).
    // Must run before any early return — hooks can't be conditional.
    const sectorRanks = useMemo(() => {
        const ranks = {};
        signals
            .filter(s => SECTOR_ETFS.has(s.ticker))
            .map(s => ({ t: s.ticker, rs: (s.daily_change ?? 0) - spyChange }))
            .sort((a, b) => b.rs - a.rs)
            .forEach((s, i) => { ranks[s.t] = i + 1; });
        return ranks;
    }, [signals, spyChange]);
    const sectorCount = Object.keys(sectorRanks).length;

    if (signals.length === 0) {
        return (
            <div className="h-12 bg-[#0f1422] flex items-center justify-center border-t border-slate-800 w-full">
                <span className="text-[10px] text-slate-500 animate-pulse font-mono tracking-wider">INITIALIZING...</span>
            </div>
        );
    }

    const hoveredBias = hoveredSignal ? computeBias(hoveredSignal, { spyChange }) : null;

    return (
        <>
            <div className="h-12 bg-[#0f1422] flex items-center px-0 overflow-hidden whitespace-nowrap border-t border-slate-800 w-full group relative">
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0f1422] to-transparent z-10 pointer-events-none"></div>
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0f1422] to-transparent z-10 pointer-events-none"></div>

                <div className="flex items-center animate-marquee group-hover:paused" style={{ animationDuration: `${marqueeDuration * 0.8}s` }}>
                    {marqueeSignals.map((sig, idx) => {
                        const { state, flag } = computeBias(sig, { spyChange });
                        const strong = state.key === 'STRONG_BULL' || state.key === 'STRONG_BEAR';
                        const notableVol = sig.rvol >= BIAS_THRESHOLDS.NOTABLE_RVOL;
                        const rank = sectorRanks[sig.ticker];

                        return (
                            <div
                                key={`${sig.ticker}-${idx}`}
                                className={`relative flex items-center h-12 shrink-0 min-w-[168px] cursor-default border-r border-slate-800/60 transition-colors ${strong ? 'bg-slate-800/40' : 'hover:bg-slate-800/30'}`}
                                onMouseEnter={(e) => handleMouseEnter(e, sig)}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={handleMouseLeave}
                            >
                                {/* Left rail: bias direction + conviction at a glance */}
                                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${state.accent}`}></div>

                                <div className="flex flex-col justify-center gap-1 w-full pl-3.5 pr-3">
                                    {/* Row 1: identity (rank · glyph · symbol) | headline change% */}
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className="flex items-baseline gap-1.5 min-w-0">
                                            {rank && <span className="font-mono text-[9px] font-bold leading-none text-slate-500">#{rank}</span>}
                                            <span className={`text-[11px] font-bold leading-none ${state.text}`}>{state.glyph}</span>
                                            <span className="font-bold text-[13px] leading-none tracking-tight text-slate-100">{sig.ticker}</span>
                                        </div>
                                        <span className={`font-mono text-xs font-bold leading-none tabular-nums ${state.text}`}>
                                            {sig.daily_change > 0 ? '+' : ''}{sig.daily_change}%
                                        </span>
                                    </div>

                                    {/* Row 2: plain-english name | support (price · rvol · flag) */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] leading-none text-slate-500 truncate">{TICKER_NAMES[sig.ticker] || 'Asset'}</span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="font-mono text-[10px] text-slate-400 leading-none tabular-nums">${sig.price}</span>
                                            {notableVol && (
                                                <span className="font-mono text-[9px] font-bold text-amber-400/90 leading-none tabular-nums">{sig.rvol}x</span>
                                            )}
                                            <FlagIcon flag={flag} size={10} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Tooltip Portal/Overlay — full drill-down on hover */}
            {hoveredSignal && (
                <div
                    className="fixed z-50 pointer-events-none"
                    style={{
                        left: tooltipPos.x,
                        top: tooltipPos.y,
                        transform: 'translateX(-50%)'
                    }}
                >
                    <div className="bg-[#0f1422]/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-3 min-w-[180px] animate-in fade-in zoom-in-95 duration-75">
                        <div className="flex justify-between items-start mb-3 border-b border-slate-800 pb-2">
                            <div>
                                <h4 className="font-bold text-white text-sm">{hoveredSignal.ticker}</h4>
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">{TICKER_NAMES[hoveredSignal.ticker] || "ASSET"}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className={`flex items-center gap-1 text-xs font-bold ${hoveredBias.state.text}`}>
                                    <span>{hoveredBias.state.glyph}</span>
                                    <span>{hoveredBias.state.label}</span>
                                </div>
                                <span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">
                                    {hoveredBias.isSector
                                        ? `vs SPY · #${sectorRanks[hoveredSignal.ticker]} of ${sectorCount}`
                                        : 'intraday'}
                                </span>
                                {hoveredBias.flag && (
                                    <div className={`flex items-center gap-1 text-[9px] font-bold mt-1 ${hoveredBias.flag.text}`}>
                                        <FlagIcon flag={hoveredBias.flag} size={10} />
                                        <span>{hoveredBias.flag.label}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            {hoveredBias.isSector && (
                                <>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">RS vs SPY</span>
                                        <span className={`font-mono font-bold ${hoveredBias.rs >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {hoveredBias.rs > 0 ? '+' : ''}{hoveredBias.rs.toFixed(2)}%
                                        </span>
                                    </div>
                                    {/* Sophisticated absolute intraday read — kept for the decision */}
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Intraday</span>
                                        <span className={`flex items-center gap-1 font-bold ${hoveredBias.abs.state.text}`}>
                                            <span>{hoveredBias.abs.state.glyph}</span>
                                            <span>{hoveredBias.abs.state.label}</span>
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Change</span>
                                <span className={`font-mono font-bold ${hoveredSignal.daily_change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {hoveredSignal.daily_change > 0 ? '+' : ''}{hoveredSignal.daily_change}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Price</span>
                                <span className="font-mono text-slate-200">${hoveredSignal.price}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">VWAP</span>
                                <span className="font-mono text-amber-400/80">${hoveredSignal.vwap}</span>
                            </div>
                             <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Range</span>
                                <span className="font-mono text-slate-400">${hoveredSignal.low} - ${hoveredSignal.high}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">RSI (14)</span>
                                <span className={`font-mono font-bold ${hoveredSignal.rsi > 70 ? 'text-rose-400' : hoveredSignal.rsi < 30 ? 'text-emerald-400' : 'text-blue-400'}`}>
                                    {hoveredSignal.rsi}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">RVOL</span>
                                <span className={`font-mono font-bold ${hoveredSignal.rvol >= BIAS_THRESHOLDS.NOTABLE_RVOL ? 'text-amber-400' : 'text-slate-400'}`}>
                                    {hoveredSignal.rvol}x
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Volume</span>
                                <span className="font-mono text-slate-400">{(hoveredSignal.volume / 1000000).toFixed(2)}M</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default UniverseBar;
