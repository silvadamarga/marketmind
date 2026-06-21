import React from 'react';
import { ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

// One visual grammar for every card kind (narrative now; news / topic / forge-signal
// later). Only the KIND chip and the DIRECTION color change between kinds — every
// other slot is fixed, so the trader learns the layout once. Presentational: the
// parent owns open-state + lazy body loading and passes the body as children.

export const timeAgo = (iso) => {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

// direction → left bar color + arrow (pre-attentive: green up, red down, grey flat)
const DIR = {
    bull: { bar: 'border-l-emerald-500', text: 'text-emerald-400', Arrow: ArrowUpRight },
    bear: { bar: 'border-l-red-500', text: 'text-red-400', Arrow: ArrowDownRight },
    neutral: { bar: 'border-l-slate-600', text: 'text-slate-400', Arrow: Minus },
};

const KIND = {
    narrative: { label: 'narrative', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
    news: { label: 'news', cls: 'bg-slate-700/40 text-slate-300 border-slate-600' },
    topic: { label: 'topic', cls: 'bg-slate-700/40 text-slate-300 border-slate-600' },
    signal: { label: 'forge signal', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
};

// materiality → filled dots (high=3 amber, notable=2 slate). 'routine' stays silent.
const MAT = {
    high: { n: 3, dot: 'bg-amber-400', text: 'text-amber-300' },
    notable: { n: 2, dot: 'bg-slate-400', text: 'text-slate-400' },
};
const Materiality = ({ level }) => {
    const m = MAT[String(level || '').toLowerCase()];
    if (!m) return null;
    return (
        <span className={`flex items-center gap-1 ${m.text}`} title={`materiality: ${level}`}>
            {[0, 1, 2].map((i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < m.n ? m.dot : 'bg-slate-700'}`} />
            ))}
            <span className="font-semibold uppercase tracking-wide">{level}</span>
        </span>
    );
};

export default function Card({ card, open, onToggle, children }) {
    const dir = DIR[card.direction] || DIR.neutral;
    const kind = KIND[card.kind] || KIND.news;
    const subj = card.subject || { label: card.label };

    return (
        <div onClick={onToggle}
            className={`bg-[#0f1422] border border-slate-800 border-l-4 ${dir.bar} rounded-xl p-4 hover:border-slate-700 transition-colors cursor-pointer`}>
            {/* top line: subject + kind chip (direction + time moved to bottom row for title room) */}
            <div className="flex items-center gap-2 mb-2 min-w-0">
                <span className="text-base font-bold text-white truncate">{subj.label}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border whitespace-nowrap ${kind.cls}`}>
                    {kind.label}
                </span>
            </div>

            {/* the take — the hero gut-read */}
            {card.take
                ? <p className="text-[15px] text-slate-100 font-medium leading-snug">{card.take}</p>
                : <p className="text-sm text-slate-500 italic">No read yet — building.</p>}

            {/* trust row: direction · materiality · conviction · provenance · time · toggle */}
            <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
                {card.direction && (
                    <span className={`flex items-center gap-0.5 font-semibold ${dir.text}`}>
                        <dir.Arrow size={12} /> {card.direction}
                    </span>
                )}
                <Materiality level={card.materiality} />
                {card.confidence != null && <span>conf {card.confidence}/10</span>}
                {card.provenance?.label && <span>{card.provenance.label}</span>}
                <span className="ml-auto flex items-center gap-2 text-slate-600">
                    <span className="whitespace-nowrap">{timeAgo(card.as_of)}</span>
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
            </div>

            {/* kind-specific body (lazy, parent-supplied) */}
            {open && (
                <div className="mt-3 pt-3 border-t border-slate-800 animate-in fade-in slide-in-from-top-1 duration-200"
                    onClick={(e) => e.stopPropagation()}>
                    {children}
                </div>
            )}
        </div>
    );
}
