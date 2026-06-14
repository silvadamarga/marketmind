import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';

// News-volatility posture nowcast (shadow / decision-support — predicts move
// SIZE, not direction; never gates anything). Self-contained: fetches /api/posture
// and polls. Renders a thin strip under the header.

const STYLE = {
    CALM:     { dot: 'bg-sky-400',    text: 'text-sky-300',    bar: 'border-sky-500/30',    label: 'Calm' },
    NORMAL:   { dot: 'bg-slate-400',  text: 'text-slate-300',  bar: 'border-slate-700',     label: 'Normal' },
    ELEVATED: { dot: 'bg-orange-400', text: 'text-orange-300', bar: 'border-orange-500/40', label: 'Elevated' },
    HIGH:     { dot: 'bg-red-500',    text: 'text-red-300',    bar: 'border-red-500/50',    label: 'High' },
    UNKNOWN:  { dot: 'bg-slate-600',  text: 'text-slate-500',  bar: 'border-slate-800',     label: 'Unknown' },
};

export default function PostureBanner() {
    const [p, setP] = useState(null);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const res = await fetch('/api/posture');
                const data = await res.json();
                if (alive) setP(data);
            } catch { /* degrade silently */ }
        };
        load();
        const id = setInterval(load, 60000);
        return () => { alive = false; clearInterval(id); };
    }, []);

    if (!p) return null;
    const s = STYLE[p.label] || STYLE.UNKNOWN;

    // top component drivers (oriented z), biggest absolute first
    const comp = p.components || {};
    const drivers = Object.entries(comp)
        .filter(([, c]) => c && c.oriented_z != null)
        .sort((a, b) => Math.abs(b[1].oriented_z) - Math.abs(a[1].oriented_z))
        .slice(0, 3)
        .map(([k, c]) => `${k} ${c.oriented_z >= 0 ? '+' : ''}${c.oriented_z}σ`);

    return (
        <div
            title={p.note || ''}
            className={`flex items-center gap-3 px-4 sm:px-8 py-1.5 text-xs border-b ${s.bar} bg-[#0f1422]/40 w-full`}
        >
            <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
                <Activity size={13} />
                <span className="hidden sm:inline">News-vol regime</span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className={`font-semibold ${s.text}`}>{s.label}</span>
                {p.score != null && <span className="text-slate-500">({p.score})</span>}
            </span>
            {p.high_vix && (
                <span className="flex items-center gap-1 text-amber-400 shrink-0" title="VIX elevated — posture most reliable here">
                    <AlertTriangle size={12} /> VIX {p.vix}
                </span>
            )}
            {drivers.length > 0 && (
                <span className="text-slate-500 truncate hidden md:inline">· {drivers.join(' · ')}</span>
            )}
            {p.n_events != null && (
                <span className="text-slate-600 ml-auto shrink-0 hidden sm:inline">{p.n_events} events / 24h · size-not-direction</span>
            )}
        </div>
    );
}
