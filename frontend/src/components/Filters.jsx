import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import { activeFilterCount } from '../utils/nav';

const Section = ({ label, hint, children }) => (
    <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</h3>
            {hint && <span className="text-[10px] font-mono text-slate-500">{hint}</span>}
        </div>
        {children}
    </section>
);

export const Chip = ({ active, onClick, children }) => (
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
    <select value={value} onChange={(e) => onChange(e.target.value)} className="block w-full bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-2 py-2 outline-none focus:border-indigo-500">
        <option value="ALL">{allLabel}</option>
        {options.filter(o => o !== 'ALL').map(o => <option key={o} value={o}>{o}</option>)}
    </select>
);

// The feed's filter sheet: a bottom sheet on the phone, a right-side drawer on desktop.
export default function Filters({
    open,
    onClose,
    resetFilters,
    minRelevance,
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
    filteredUpdates
}) {
    if (!open) return null;
    const active = activeFilterCount({ minRelevance, minConfidence, minNovelty, selectedSession, selectedSource, selectedCategory }) > 0;

    const tagCounts = {};
    updates.forEach(u => (u.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const categories = availableCategories
        .filter(c => c !== 'ALL')
        .sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0));

    return (
        <div className="fixed inset-0 z-50" onClick={onClose}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl lg:inset-x-auto lg:right-0 lg:top-0 lg:bottom-0 lg:max-h-none lg:w-96 lg:rounded-none flex flex-col bg-[#0f1422] border-t lg:border-t-0 lg:border-l border-slate-800 pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-3 border-b border-slate-800 whitespace-nowrap">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Filters</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200"><X size={20} /></button>
                </div>
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

            <div className="p-5 flex-1 flex flex-col space-y-6 overflow-y-auto whitespace-nowrap overflow-x-hidden">

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
                    <div className="flex flex-wrap gap-1.5">
                        {categories.map(cat => (
                            <Chip key={cat} active={selectedCategory === cat} onClick={() => setSelectedCategory(selectedCategory === cat ? 'ALL' : cat)}>
                                {cat} <span className="font-mono opacity-60">{tagCounts[cat] || 0}</span>
                            </Chip>
                        ))}
                    </div>
                </Section>
            </div>
          </div>
        </div>
    );
}
