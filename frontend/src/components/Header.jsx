import React, { useState, useEffect } from 'react';

import UniverseBar from './UniverseBar';
import { tabLabel } from '../utils/nav';
import { MARKETS, marketStatus } from '../utils/markets';

function MarketClocks() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 15000);
        return () => clearInterval(id);
    }, []);
    return (
        <div className="flex items-center gap-2.5 sm:gap-3 font-mono text-[11px]">
            {MARKETS.map(m => {
                const z = marketStatus(m, now);
                const isOpen = z.open;
                return (
                    <span key={m.label} className="flex items-center gap-1.5" title={`${m.name} · ${z.why}`}>
                        <span className="text-slate-500">{m.label}</span>
                        <span className="text-slate-300">{z.hhmm}</span>
                        <span className={`text-[9px] font-bold tracking-wide px-1 rounded ${isOpen ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/40 text-slate-500'}`}>{isOpen ? 'OPEN' : 'CLOSED'}</span>
                    </span>
                );
            })}
        </div>
    );
}

export default function Header({
    activeTab,
    loading,
    lastConnection,
    signals,
    marqueeDuration,
    marqueeSignals,
    spyChange
}) {
    return (
        <header className="flex flex-col border-b border-slate-800 bg-[#0f1422] w-full z-30 shrink-0">
            <div className="h-12 lg:h-14 flex items-center justify-between px-4 lg:px-6 border-b border-slate-800/50 w-full">
                <div className="flex items-center gap-2.5 min-w-0">
                    <h1 className="text-base lg:text-xl font-semibold text-white truncate">{tabLabel(activeTab)}</h1>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                    <MarketClocks />
                    {/* Heartbeat: green when the last poll landed, amber while syncing. */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono" title={`Last sync ${lastConnection}`}>
                        <span className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                        <span className="hidden sm:inline">{lastConnection}</span>
                    </div>
                </div>
            </div>

            {/* Ticker Tape */}
            <UniverseBar signals={signals} marqueeDuration={marqueeDuration} marqueeSignals={marqueeSignals} spyChange={spyChange} />
        </header>
    );
}
