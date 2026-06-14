import React from 'react';
import { RotateCcw, ChevronDown } from 'lucide-react';

const FilterGroup = ({ label, children }) => (
    <div className="bg-slate-800/20 border border-slate-800/50 rounded-lg p-3 space-y-3">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            {label}
            <ChevronDown size={12} className="opacity-50" />
        </h3>
        {children}
    </div>
);

export default function Filters({
    rightOpen,
    resetFilters,
    selectedSentiment,
    setSelectedSentiment,
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

    return (
        <Container className={containerClasses}>
            {!mobile && (
                <div className="p-6 flex items-center justify-between whitespace-nowrap overflow-hidden">
                    <h2 className="text-base font-bold text-slate-400 uppercase tracking-wider">Dataset Controls</h2>
                    <button onClick={resetFilters} title="Reset" className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 transition-colors"><RotateCcw size={16} /></button>
                </div>
            )}

            <div className={`p-6 ${mobile ? 'pt-6' : 'pt-0'} flex-1 flex flex-col space-y-6 overflow-y-auto whitespace-nowrap overflow-hidden`}>

                <FilterGroup label="Sentiment">
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'BULLISH', label: 'Bull', color: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10' },
                            { id: 'NEUTRAL', label: 'Neut', color: 'text-slate-400 border-slate-600 bg-slate-700/30' },
                            { id: 'BEARISH', label: 'Bear', color: 'text-red-400 border-red-500/50 bg-red-500/10' }
                        ].map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setSelectedSentiment(selectedSentiment === opt.id ? 'ALL' : opt.id)}
                                className={`text-xs py-2 rounded border transition-all ${selectedSentiment === opt.id
                                        ? `${opt.color} font-bold ring-1 ring-inset`
                                        : 'border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-700'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </FilterGroup>

                <FilterGroup label="Quality Thresholds">
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-medium text-slate-400">Impact Score</label>
                                <span className="text-xs font-mono text-indigo-400">≥ {minRelevance}/10</span>
                            </div>
                            <input type="range" min="0" max="10" value={minRelevance} onChange={(e) => setMinRelevance(Number(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-medium text-slate-400">AI Confidence</label>
                                <span className="text-xs font-mono text-blue-400">≥ {minConfidence}/10</span>
                            </div>
                            <input type="range" min="0" max="10" value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-medium text-slate-400">Novelty Score</label>
                                <span className="text-xs font-mono text-purple-400">≥ {minNovelty}/10</span>
                            </div>
                            <input type="range" min="0" max="10" value={minNovelty} onChange={(e) => setMinNovelty(Number(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                        </div>
                    </div>
                </FilterGroup>

                <FilterGroup label="Context">
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Session</label>
                            <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-2.5 outline-none focus:border-indigo-500">
                                <option value="ALL">All Sessions</option>
                                {availableSessions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Source</label>
                            <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-2.5 outline-none focus:border-indigo-500">
                                <option value="ALL">All Sources</option>
                                {availableSources.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                </FilterGroup>

                <FilterGroup label="Categories">
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                        {availableCategories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(selectedCategory === cat ? "ALL" : cat)}
                                className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${selectedCategory === cat
                                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </FilterGroup>

                <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-800 mt-auto">
                    <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Dataset Stats</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center"><span className="text-slate-400">Total Rows</span><span className="text-slate-200 font-mono">{updates.length}</span></div>
                        <div className="flex justify-between items-center"><span className="text-slate-400">Visible</span><span className="text-indigo-400 font-mono">{filteredUpdates.length}</span></div>
                    </div>
                </div>
            </div>
        </Container>
    );
}
