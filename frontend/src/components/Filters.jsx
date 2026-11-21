import React from 'react';
import { RotateCcw } from 'lucide-react';

// Priority tiers mirror the backend's impact labels (main.py format_news_event).
const PRIORITY_TIERS = [
    { label: 'Any', min: 0 },
    { label: 'Medium+', min: 5 },
    { label: 'High+', min: 7 },
    { label: 'Critical', min: 9 },
];

const Section = ({ label, hint, children }) => (
    <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</h3>
            {hint && <span className="text-[10px] font-mono text-slate-500">{hint}</span>}
        </div>
        {children}
    </section>
);

const Chip = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${active
            ? 'bg-indigo-500/20 border-indigo-500 text-indigo-200'
            : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
            }`}
    >
        {children}
    </button>
);

const Threshold = ({ label, value, onChange, accent }) => (
    <div>
        <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs text-slate-400">{label}</label>
            <span className={`text-xs font-mono ${value > 0 ? accent.text : 'text-slate-500'}`}>{value > 0 ? `≥ ${value}/10` : 'any'}</span>
        </div>
        <input type="range" min="0" max="10" value={value} onChange={(e) => onChange(Number(e.target.value))} className={`w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer ${accent.range}`} />
    </div>
);

const Select = ({ value, onChange, allLabel, options }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-2 outline-none focus:border-indigo-500">
        <option value="ALL">{allLabel}</option>
        {options.filter(o => o !== 'ALL').map(o => <option key={o} value={o}>{o}</option>)}
    </select>
);

export default function Filters({
    rightOpen,
    resetFilters,
    minRelevance,
    setMinRelevance,
    minConfidence,
    setMinConfidence,
    minNovelty,
    setMinNovelty,
    selectedSession,
    setSelectedSession,
    availableSessions,
    selectedSource,
    setSelectedSource,
    availableSources,
    selectedCategory,
    setSelectedCategory,
    availableCategories,
    updates,
    filteredUpdates,
    mobile
}) {
    const Container = mobile ? 'div' : 'aside';
    const containerClasses = mobile
        ? 'h-full flex flex-col bg-[#0f1422]'
        : `hidden lg:flex flex-col border-l border-slate-800 bg-[#0f1422] transition-all duration-300 ${rightOpen ? 'w-80' : 'w-0 overflow-hidden opacity-0'}`;

    const active = minRelevance > 0 || minConfidence > 0 || minNovelty > 0
        || selectedSession !== 'ALL' || selectedSource !== 'ALL' || selectedCategory !== 'ALL';

    const tierCount = (min) => updates.filter(u => (u.relevanceScore || 0) >= min).length;

    const tagCounts = {};
    updates.forEach(u => (u.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const categories = availableCategories
        .filter(c => c !== 'ALL')
        .sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0));

    return (
        <Container className={containerClasses}>
            <div className={`px-6 ${mobile ? 'pt-0' : 'pt-6'} pb-4 border-b border-slate-800 whitespace-nowrap overflow-hidden`}>
                {!mobile && <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Feed Filters</h2>}
                <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">
                        <span className="font-mono text-indigo-300">{filteredUpdates.length}</span> of <span className="font-mono text-slate-300">{updates.length}</span> shown
                    </span>
                    {active && (
                        <button onClick={resetFilters} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors">
                            <RotateCcw size={12} /> Reset
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 flex-1 flex flex-col space-y-6 overflow-y-auto whitespace-nowrap overflow-x-hidden">

                <Section label="Priority">
                    <div className="grid grid-cols-2 gap-1.5">
                        {PRIORITY_TIERS.map(t => (
                            <Chip key={t.min} active={minRelevance === t.min} onClick={() => setMinRelevance(t.min)}>
                                {t.label} <span className="font-mono opacity-60">{tierCount(t.min)}</span>
                            </Chip>
                        ))}
                    </div>
                </Section>

                <Section label="Thresholds">
                    <div className="space-y-4">
                        <Threshold label="AI Confidence" value={minConfidence} onChange={setMinConfidence} accent={{ text: 'text-blue-400', range: 'accent-blue-500' }} />
                        <Threshold label="Novelty" value={minNovelty} onChange={setMinNovelty} accent={{ text: 'text-purple-400', range: 'accent-purple-500' }} />
                    </div>
                </Section>

                <Section label="Context">
                    <div className="space-y-2">
                        <Select value={selectedSession} onChange={setSelectedSession} allLabel="All sessions" options={availableSessions} />
                        <Select value={selectedSource} onChange={setSelectedSource} allLabel="All sources" options={availableSources} />
                    </div>
                </Section>

                <Section label="Tags" hint={selectedCategory !== 'ALL' ? selectedCategory : null}>
                    <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                        {categories.map(cat => (
                            <Chip key={cat} active={selectedCategory === cat} onClick={() => setSelectedCategory(selectedCategory === cat ? 'ALL' : cat)}>
                                {cat} <span className="font-mono opacity-60">{tagCounts[cat] || 0}</span>
                            </Chip>
                        ))}
                    </div>
                </Section>
            </div>
        </Container>
    );
}
