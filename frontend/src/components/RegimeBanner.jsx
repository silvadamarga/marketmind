import React, { useState, useEffect } from 'react';

// Market-regime state strip (the forge's P1 substrate, /api/regime). VIX is a
// volatility/sizing signal — NOT a direction call. Renders a thin strip under the
// header; degrades silently to nothing if the snapshot is missing.

const STYLE = {
    CALM:     { dot: 'bg-sky-400',    text: 'text-sky-300',    bar: 'border-sky-500/30',    label: 'Calm' },
    NORMAL:   { dot: 'bg-slate-400',  text: 'text-slate-300',  bar: 'border-slate-700',     label: 'Normal' },
    ELEVATED: { dot: 'bg-orange-400', text: 'text-orange-300', bar: 'border-orange-500/40', label: 'Elevated' },
    HIGH:     { dot: 'bg-red-500',    text: 'text-red-300',    bar: 'border-red-500/50',    label: 'High' },
    UNKNOWN:  { dot: 'bg-slate-600',  text: 'text-slate-500',  bar: 'border-slate-800',     label: 'Unknown' },
};

export default function RegimeBanner() {
    const [r, setR] = useState(null);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const res = await fetch('/api/regime');
                const data = await res.json();
                if (alive) setR(data);
            } catch { /* degrade silently */ }
        };
        load();
        const id = setInterval(load, 60000);
        return () => { alive = false; clearInterval(id); };
    }, []);

    if (!r) return null;
    const unknown = r.status === 'UNKNOWN' || !r.vix_state;
    const s = STYLE[r.vix_state] || STYLE.UNKNOWN;

    return (
        <div className={`flex items-center gap-3 px-4 py-1.5 text-xs border-b ${s.bar} bg-[#0B0F19] overflow-x-auto whitespace-nowrap`}>
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className={s.text}>Regime: {unknown ? 'Unknown' : s.label}</span>
            </span>

            {unknown ? (
                <span className="text-slate-600">{r.note || r.reason || 'market data stale'}</span>
            ) : (
                <>
                    <span className="text-slate-500">VIX <span className="text-slate-300 font-mono">{r.vix}</span></span>
                    {r.max_deployed != null && (
                        <span className="text-slate-500">Max deploy <span className="text-slate-300 font-mono">{Math.round(r.max_deployed * 100)}%</span></span>
                    )}
                    {r.satellite && (
                        <span className="text-slate-500">Satellite <span className="text-slate-300">{r.satellite}</span></span>
                    )}
                    {r.trend && <span className="text-slate-500">{r.trend}</span>}
                    {r.backwardation != null && (
                        <span className="text-slate-500">{r.backwardation ? 'backwardation' : 'contango'}</span>
                    )}
                    {r.status === 'stale' && (
                        <span className="text-amber-500/80">⚠ stale ({r.age_days}d)</span>
                    )}
                    <span className="text-slate-700 ml-auto hidden sm:inline">sizing signal, not a direction call</span>
                </>
            )}
        </div>
    );
}
