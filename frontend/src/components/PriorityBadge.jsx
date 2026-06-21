import React from 'react';
import { Flame, Zap } from 'lucide-react';

// Materiality of an entity's latest development — priority/impact, NOT direction.
// Only high/notable render; 'routine' (incremental, likely priced-in) stays silent
// so the indicator is loud only when the development actually matters.
const MAP = {
    high: { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', Icon: Flame, label: 'High impact' },
    notable: { cls: 'bg-slate-600/20 text-slate-400 border-slate-600/30', Icon: Zap, label: 'Notable' },
};

export default function PriorityBadge({ priority, size = 'sm' }) {
    const s = MAP[String(priority || '').toLowerCase()];
    if (!s) return null;
    const px = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5';
    return (
        <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide rounded border ${s.cls} ${px}`}>
            <s.Icon size={size === 'sm' ? 10 : 12} /> {s.label}
        </span>
    );
}
