import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, SlidersHorizontal } from 'lucide-react';
import { Chip } from './Filters';
import { PRIORITY_TIERS } from '../utils/nav';
import FeedCard from './FeedCard';
import ForgeCards from './ForgeCards';

// Stack near-duplicate headlines (same story from many sources / reworded repeats)
// so the glance feed shows one row per story. Greedy single pass over the
// newest-first list. The backend's story_id (headline embeddings, backend/story.py)
// decides when both sides have one; otherwise an item joins the first group with a
// member it's similar enough to (significant-word Jaccard), recent enough to the
// group's head, and not about different companies; else it starts a group.
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at',
    'by', 'with', 'from', 'as', 'is', 'are', 'be', 'its', 'it', 'this', 'that', 'after',
    'over', 'amid', 'says', 'said', 'new', 'will', 'has', 'have', 'out', 'into', 'than', 'but']);
// significant words, simple-stemmed (drop trailing 's') so beat/beats, cut/cuts match
const sigWords = (s) => new Set((s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(w => w.length > 3 && !STOP.has(w))
    .map(w => w.endsWith('s') ? w.slice(0, -1) : w));
// Cluster on Gemini's normalized analysis (consistent across sources) rather than
// raw source text: its concise headline + ml_tags (concept labels). The tagger
// stopped emitting headline 2026-07-02, so fall back to the raw title there —
// two tags alone are too few words, and Gemini tags identical titles differently.
const clusterText = (it) => {
    const fa = it.full_analysis || {};
    const tags = (fa.ml_tags || []).join(' ').replace(/_/g, ' ');
    return `${fa.headline || it.title || ''} ${tags}`.trim() || it.headline || '';
};
// Company identity, for company news only. Macro/geo stories carry proxy tickers
// Gemini picks inconsistently (gold as GLD on one repost, XAU/USD on the next), so
// they get none and never trip the different-companies check below.
const MACRO_CATS = new Set(['MACRO', 'GEOPOLITICS', 'CENTRAL_BANK']);
const companyTickers = (it) => {
    const fa = it.full_analysis || {};
    return new Set(MACRO_CATS.has(fa.category) ? [] : (fa.tickers || []));
};
const overlap = (a, b) => {
    let n = 0;
    for (const w of a) if (b.has(w)) n++;
    return n;
};
// same story = several shared key words and decent overlap
const similar = (a, b) => {
    const inter = overlap(a, b);
    const uni = a.size + b.size - inter;
    return inter >= 2 && uni > 0 && inter / uni >= 0.34;
};
const groupSimilar = (items) => {
    const groups = [];
    for (const it of items) {
        const w = sigWords(clusterText(it));
        const tk = companyTickers(it);
        let placed = false;
        for (const g of groups) {
            // within 2 days of the head
            if (Math.abs(new Date(it.date) - new Date(g.primary.date)) >= 2 * 86400000) continue;
            const match = (it.story_id != null && g._sids.size)
                // embeddings already judged it: same story id or not this group
                ? g._sids.has(it.story_id)
                // both name companies and none in common -> different stories,
                // however alike the template wording ("X is rising 5% after
                // market open"); else any member, not just the head, so a
                // reworded repost can join via the version it's closest to
                : !(tk.size && g._tk.size && !overlap(tk, g._tk)) && g._ws.some(m => similar(w, m));
            if (match) {
                g.others.push(it);
                g._ws.push(w);
                for (const t of tk) g._tk.add(t);
                if (it.story_id != null) g._sids.add(it.story_id);
                placed = true;
                break;
            }
        }
        if (!placed) groups.push({ primary: it, others: [], _ws: [w], _tk: tk,
            _sids: new Set(it.story_id != null ? [it.story_id] : []) });
    }
    return groups;
};

export default function Feed({ searchTerm, setSearchTerm, updates, filteredUpdates, loadMore, hasMore, loadingMore, setActiveTab, minRelevance, setMinRelevance, filterCount, openFilters }) {
    // Infinite scroll: load the next page when the bottom sentinel scrolls into
    // view. The observer is built once per hasMore, so it fires on scroll
    // transitions only; a narrow filter can't chain-load the whole history.
    const sentinel = useRef(null);
    const loadMoreRef = useRef(loadMore);
    useEffect(() => { loadMoreRef.current = loadMore; });
    useEffect(() => {
        const el = sentinel.current;
        if (!el || !hasMore) return;
        const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMoreRef.current();
        }, { rootMargin: '600px' });
        io.observe(el);
        return () => io.disconnect();
    }, [hasMore]);

    // Narratives are embedded inline on the news cards (no separate strip): index
    // the light cards by entity so a FeedCard can find its story by ticker/category tag.
    const [narrativeIndex, setNarrativeIndex] = useState({});
    useEffect(() => {
        let alive = true;
        fetch('/api/narratives')
            .then(r => r.ok ? r.json() : [])
            .then(cards => {
                if (!alive) return;
                const idx = {};
                for (const c of cards) idx[c.entity] = c;
                setNarrativeIndex(idx);
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    return (
        <div className="flex-1 overflow-y-auto min-w-0 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {/* Sticky toolbar: search, filter sheet, priority tiers */}
            <div className="sticky top-0 z-20 bg-[#0B0F19]/95 backdrop-blur border-b border-slate-800">
                <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input
                                type="search" placeholder="Search news, tickers, topics" value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-500 text-base sm:text-sm"
                            />
                        </div>
                        <button onClick={openFilters} className="relative shrink-0 p-2.5 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:text-white" title="Filters">
                            <SlidersHorizontal size={18} />
                            {filterCount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">{filterCount}</span>
                            )}
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
                        {PRIORITY_TIERS.map(t => (
                            <Chip key={t.min} active={minRelevance === t.min} onClick={() => setMinRelevance(t.min)}>
                                <span className="whitespace-nowrap">{t.label} <span className="font-mono opacity-60">{updates.filter(u => (u.relevanceScore || 0) >= t.min).length}</span></span>
                            </Chip>
                        ))}
                        <span className="hidden sm:inline ml-auto pl-2 text-[11px] text-slate-500 font-mono whitespace-nowrap">{filteredUpdates.length} shown</span>
                    </div>
                </div>
            </div>

            <div className="p-3 sm:p-6">
                    <div className="max-w-5xl mx-auto space-y-1 sm:space-y-1.5">

                        {/* The forge's per-name cards (plan 27 F1) sit above the headlines */}
                        <ForgeCards />

                        {filteredUpdates.length === 0 ? (
                            <div className="text-center py-32 opacity-50">
                                <Filter size={64} className="mx-auto mb-6 text-slate-600" />
                                <p className="text-xl text-slate-400">No updates matched your filters.</p>
                                {hasMore && (
                                    <button 
                                        onClick={loadMore} 
                                        disabled={loadingMore}
                                        className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full text-slate-300 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
                                    >
                                        {loadingMore ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                                                <span>Searching History...</span>
                                            </>
                                        ) : (
                                            <span>Load More History</span>
                                        )}
                                    </button>
                                )}
                            </div>
                        ) : (
                            groupSimilar(filteredUpdates).map((g) => (
                                <FeedCard
                                    key={g.primary.id}
                                    update={g.primary}
                                    siblings={g.others}
                                    narrativeIndex={narrativeIndex}
                                    onOpenNarratives={() => setActiveTab && setActiveTab('narratives')}
                                />
                            ))
                        )}

                        {/* Load More Button */}
                        {filteredUpdates.length > 0 && hasMore && (
                            <div className="flex justify-center pt-4 pb-8">
                                <button 
                                    onClick={loadMore} 
                                    disabled={loadingMore}
                                    className="px-6 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full text-slate-300 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                                >
                                    {loadingMore ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                                            <span>Loading...</span>
                                        </>
                                    ) : (
                                        <span>Load More History</span>
                                    )}
                                </button>
                            </div>
                        )}
                        {hasMore && <div ref={sentinel} />}
                    </div>
            </div>
        </div>
    );
}
