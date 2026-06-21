import React, { useState, useEffect } from 'react';
import { Layers, RefreshCw, Radio } from 'lucide-react';
import Card, { timeAgo } from './Card';

// A narrative rendered in the unified card grammar. Compact = the gut-read take +
// direction/materiality/conviction at a glance; expand lazy-loads the story arc and
// the developments that back it.
const NarrativeCard = ({ card }) => {
    const [open, setOpen] = useState(false);
    const [full, setFull] = useState(null);
    const [loading, setLoading] = useState(false);

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next && !full) {
            setLoading(true);
            try {
                const r = await fetch(`/api/narratives/${card.entity_type}/${encodeURIComponent(card.entity)}`);
                if (r.ok) setFull(await r.json());
            } finally { setLoading(false); }
        }
    };

    return (
        <Card card={card} open={open} onToggle={toggle}>
            {loading && <div className="text-xs text-slate-500 flex items-center gap-2"><Radio size={12} className="animate-pulse" /> Loading…</div>}

            {full?.synthesis?.arc && (
                <p className="text-sm text-slate-300 leading-relaxed">{full.synthesis.arc}</p>
            )}

            {full?.developments?.length > 0 && (
                <div className="mt-3 space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Developments</span>
                    {full.developments.map((d, i) => (
                        <div key={i} className="text-sm">
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-slate-300 leading-snug">{d.headline}</span>
                                <span className="text-[10px] text-slate-600 whitespace-nowrap mt-0.5">{timeAgo(d.date)}</span>
                            </div>
                            {d.source && <span className="text-[10px] text-slate-600">{d.source}</span>}
                        </div>
                    ))}
                </div>
            )}

            {full?.synthesis?.sources_used && (
                <p className="text-[10px] text-slate-600 mt-3">Grounded in: {full.synthesis.sources_used.join(', ')}</p>
            )}
        </Card>
    );
};

export default function Narratives() {
    const [cards, setCards] = useState(null);
    const [building, setBuilding] = useState(false);

    const load = async () => {
        try {
            const res = await fetch('/api/narratives');
            if (res.ok) setCards(await res.json());
        } catch { setCards([]); }
    };

    const rebuild = async () => {
        setBuilding(true);
        try { await fetch('/api/narratives/build', { method: 'POST' }); await load(); }
        finally { setBuilding(false); }
    };

    useEffect(() => { load(); }, []);

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950 p-6 sm:p-10 scrollbar-thin scrollbar-thumb-slate-800">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Layers size={22} className="text-indigo-400" /> Narratives
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">The story per stock &amp; topic — a trader's gut read at a glance. Click for the arc.</p>
                    </div>
                    <button onClick={rebuild} disabled={building}
                        className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
                        <RefreshCw size={14} className={building ? 'animate-spin' : ''} /> Rebuild
                    </button>
                </div>

                {cards === null && <div className="text-slate-500 text-sm flex items-center gap-2"><Radio size={14} className="animate-pulse" /> Loading…</div>}
                {cards && cards.length === 0 && <div className="text-slate-500 text-sm">No narratives yet — hit Rebuild once enough news has accumulated.</div>}
                <div className="space-y-3">
                    {cards && cards.map((c) => <NarrativeCard key={`${c.entity_type}-${c.entity}`} card={c} />)}
                </div>
            </div>
        </div>
    );
}
