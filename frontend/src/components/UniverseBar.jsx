import React, { useState } from 'react';
import { Zap, Droplets, Activity, TrendingUp, Check } from 'lucide-react';
import { TICKER_NAMES } from '../utils/constants';

const UniverseBar = ({ signals, marqueeDuration, marqueeSignals }) => {
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

    if (signals.length === 0) {
        return (
            <div className="h-12 bg-[#0f1422] flex items-center justify-center border-t border-slate-800 w-full">
                <span className="text-[10px] text-slate-500 animate-pulse font-mono tracking-wider">INITIALIZING...</span>
            </div>
        );
    }

    return (
        <>
            <div className="h-12 bg-[#0f1422] flex items-center px-0 overflow-hidden whitespace-nowrap border-t border-slate-800 w-full group relative">
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0f1422] to-transparent z-10 pointer-events-none"></div>
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0f1422] to-transparent z-10 pointer-events-none"></div>

                <div className="flex items-center animate-marquee group-hover:paused" style={{ animationDuration: `${marqueeDuration * 0.8}s` }}>
                    {marqueeSignals.map((sig, idx) => {
                        const isInteresting = sig.rvol > 1.2 || Math.abs(sig.daily_change) > 2.0;
                        
                        return (
                            <div 
                                key={`${sig.ticker}-${idx}`} 
                                className={`flex items-center px-4 border-r border-slate-800/50 h-12 shrink-0 transition-colors group/item min-w-[140px] cursor-default relative ${isInteresting ? 'bg-slate-800/30' : 'hover:bg-slate-800/40'}`}
                                onMouseEnter={(e) => handleMouseEnter(e, sig)}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={handleMouseLeave}
                            >
                                {isInteresting && <div className="absolute top-0 left-0 w-full h-[2px] bg-amber-400/50"></div>}

                                {/* Left: Ticker Only */}
                                <div className="flex flex-col justify-center mr-3">
                                    <span className={`font-bold text-xs leading-none ${isInteresting ? 'text-white' : 'text-slate-300'}`}>{sig.ticker}</span>
                                </div>

                                {/* Center: Price & Change */}
                                <div className="flex flex-col items-end justify-center mr-3 min-w-[60px]">
                                    <span className={`font-mono font-bold text-xs leading-none mb-0.5 ${sig.price > sig.vwap ? 'text-emerald-300' : 'text-rose-300'}`}>
                                        ${sig.price}
                                    </span>
                                    <div className="flex items-center space-x-1">
                                        <span className={`${sig.daily_change >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono text-[9px] font-bold leading-none`}>
                                            {sig.daily_change > 0 ? '+' : ''}{sig.daily_change}%
                                        </span>
                                        {sig.rvol > 1.2 && (
                                            <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 px-0.5 rounded border border-amber-400/20">
                                                {sig.rvol}x
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Status Icon */}
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/30">
                                    {(() => {
                                        if (sig.status === 'OVERBOUGHT') return <Zap size={12} className="text-rose-400" />;
                                        if (sig.status === 'OVERSOLD') return <Droplets size={12} className="text-emerald-400" />;
                                        if (sig.rvol > 3.0) return <Activity size={12} className="text-amber-400 animate-pulse" />;
                                        if (sig.price > sig.vwap && sig.rvol > 1.5) return <TrendingUp size={12} className="text-emerald-400" />;
                                        if (sig.price < sig.vwap && sig.rvol > 1.5) return <TrendingUp size={12} className="text-rose-400 rotate-180" />;
                                        return <Check size={10} className="text-slate-600 opacity-50" />;
                                    })()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Tooltip Portal/Overlay */}
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
                                <div className={`text-xs font-mono font-bold ${hoveredSignal.daily_change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {hoveredSignal.daily_change > 0 ? '+' : ''}{hoveredSignal.daily_change}%
                                </div>
                                {Math.abs(hoveredSignal.daily_change) > 2.0 && (
                                    <span className="text-[9px] font-bold text-blue-400 bg-blue-400/10 px-1 rounded border border-blue-400/20 mt-1">
                                        {hoveredSignal.daily_change > 0 ? 'GAP UP' : 'GAP DOWN'}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
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
