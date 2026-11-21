import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';

import UniverseBar from './UniverseBar';
import { tabLabel } from '../utils/nav';

// Exchange clocks. Hours are the regular sessions, Mon-Fri; holidays are not
// known here, so on a holiday the dot still reads open.
const MARKETS = [
    { label: 'NY', tz: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 },
    { label: 'FRA', tz: 'Europe/Berlin', open: 9 * 60, close: 17 * 60 + 30 },
];

const zoned = (now, tz) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(p => [p.type, p.value]));
    return { hhmm: `${parts.hour}:${parts.minute}`, mins: +parts.hour * 60 + +parts.minute, weekday: parts.weekday };
};

function MarketClocks() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 15000);
        return () => clearInterval(id);
    }, []);
    return (
        <div className="flex items-center gap-3 font-mono text-[11px]">
            {MARKETS.map(m => {
                const z = zoned(now, m.tz);
                const isOpen = !['Sat', 'Sun'].includes(z.weekday) && z.mins >= m.open && z.mins < m.close;
                return (
                    <span key={m.label} className="flex items-center gap-1.5" title={`${m.tz} · ${isOpen ? 'open' : 'closed'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span className="text-slate-500">{m.label}</span>
                        <span className="text-slate-300">{z.hhmm}</span>
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
                    <Activity className="lg:hidden text-indigo-400 shrink-0" size={20} />
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
