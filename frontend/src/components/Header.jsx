import React from 'react';
import { Activity } from 'lucide-react';

import UniverseBar from './UniverseBar';
import { tabLabel } from '../utils/nav';

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
                {/* Heartbeat: green when the last poll landed, amber while syncing. */}
                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono shrink-0" title={`Last sync ${lastConnection}`}>
                    <span className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                    <span className="hidden sm:inline">{lastConnection}</span>
                </div>
            </div>

            {/* Ticker Tape */}
            <UniverseBar signals={signals} marqueeDuration={marqueeDuration} marqueeSignals={marqueeSignals} spyChange={spyChange} />
        </header>
    );
}
