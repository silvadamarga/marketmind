import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, Sparkles, Layers } from 'lucide-react';

const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};


const FeedCard = (props) => {
    const { update } = props;
    const isHighImpact = update.impact === 'CRITICAL' || update.impact === 'HIGH' || (update.novelty_score || 0) >= 8;
    // Default to compact for all cards
    const [isExpanded, setIsExpanded] = useState(false);
    const [deepDiveContent, setDeepDiveContent] = useState(update.deep_dive || null);
    const [isDeepDiveLoading, setIsDeepDiveLoading] = useState(false);

    const isNoise = (update.relevanceScore || 0) < 3;
    const { confidence } = update.ml_context || {};

    // Similar headlines stacked under this one (grouped in Feed.jsx).
    const siblings = props.siblings || [];
    const [stackOpen, setStackOpen] = useState(false);

    // Embedded narrative: if this item's ticker/category has a "story so far", surface
    // it inline. tags are [related_ticker, category] — ticker first = most specific match.
    const { narrativeIndex = {}, onOpenNarratives } = props;
    const narrative = (update.tags || []).map(t => narrativeIndex[t]).find(Boolean) || null;
    const [storyOpen, setStoryOpen] = useState(false);
    const [storyData, setStoryData] = useState(null);
    const [storyLoading, setStoryLoading] = useState(false);

    const toggleStory = async (e) => {
        e.stopPropagation();
        const next = !storyOpen;
        setStoryOpen(next);
        if (next && !storyData && narrative) {
            setStoryLoading(true);
            try {
                const r = await fetch(`/api/narratives/${narrative.entity_type}/${encodeURIComponent(narrative.entity)}`);
                if (r.ok) setStoryData(await r.json());
            } catch (err) {
                console.error("Narrative fetch failed", err);
            } finally {
                setStoryLoading(false);
            }
        }
    };

    // Impact styling: a colored LEFT accent bar = impact tier (scannable on mobile),
    // with a faint surface tint for the loud tiers. The rest of the card stays calm.
    const impactAccent = {
        CRITICAL: "border-l-red-500 bg-red-950/10",
        HIGH: "border-l-amber-500 bg-amber-950/[0.07]",
        MEDIUM: "border-l-slate-600",
        LOW: "border-l-slate-700",
    };
    const cardStyle = impactAccent[update.impact] || impactAccent.LOW;
    const priorityColor = update.relevanceScore >= 8 ? 'bg-red-500 text-red-300'
        : update.relevanceScore >= 7 ? 'bg-amber-500 text-amber-300'
        : 'bg-slate-600 text-slate-400';

    const handleToggle = (e) => {
        // If onClick prop is provided (for navigation), use it
        if (props.onClick) {
            props.onClick();
            return;
        }
        // Otherwise toggle expansion
        setIsExpanded(!isExpanded);
    };

    const handleDeepDive = async (e) => {
        e.stopPropagation();
        if (!update.tags || update.tags.length === 0) return;
        
        const ticker = update.tags.find(t => t === update.related_ticker) || update.tags[0];
        if (!ticker) return;

        setIsDeepDiveLoading(true);
        try {
            const res = await fetch(`http://localhost:8000/api/analysis/context/${ticker}`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.analysis) {
                setDeepDiveContent(data.analysis);
            }
        } catch (err) {
            console.error("Deep Dive Failed", err);
        } finally {
            setIsDeepDiveLoading(false);
        }
    };

    const renderDeepDive = (content) => {
        if (!content) return null;
        // Handle both JSON object and legacy string/markdown
        if (typeof content === 'string') {
             return (
                <div className="prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-wrap">
                    {content}
                </div>
             );
        }

        return (
            <div className="space-y-3">
                {/* Executive Summary */}
                {content.executive_summary && (
                    <div className="text-slate-300 text-sm italic border-l-2 border-indigo-500 pl-3">
                        {content.executive_summary}
                    </div>
                )}

                {/* Drivers */}
                {content.key_drivers && content.key_drivers.length > 0 && (
                    <div>
                        <div className="text-xs font-bold text-slate-500 uppercase mb-1">Key Drivers</div>
                        <ul className="list-disc list-inside text-xs text-slate-400 space-y-0.5">
                            {content.key_drivers.map((driver, i) => (
                                <li key={i}>{driver}</li>
                            ))}
                        </ul>
                    </div>
                )}
                
                 {/* Technicals */}
                 {content.technical_outlook && content.technical_outlook !== "Insufficient data" && (
                    <div>
                        <div className="text-xs font-bold text-slate-500 uppercase mb-1">Technicals</div>
                        <p className="text-xs text-slate-400">{content.technical_outlook}</p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            onClick={handleToggle}
            className={`border border-slate-800/50 border-l-[3px] rounded-md transition-colors hover:bg-slate-800/20 cursor-pointer ${cardStyle} ${isNoise ? 'opacity-50' : ''} px-3.5 py-2.5`}
        >
            {/* GLANCE: headline + search (top-right) */}
            <div className="flex items-start gap-3">
                <h3 className="flex-1 min-w-0 leading-snug text-[15px] text-slate-100">
                    {update.title || update.headline}
                </h3>
                <button
                    onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/search?q=${encodeURIComponent(update.title || update.headline)}`, '_blank'); }}
                    className="shrink-0 text-slate-500 hover:text-slate-200 transition-colors pt-0.5"
                    title="Search"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </button>
            </div>

            {/* Footer: story / similar (left) · bull-bear dot + time (bottom-right) */}
                <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-x-4">
                        {narrative && (
                            <button onClick={toggleStory}
                                className="flex items-center gap-1 text-[11px] font-medium text-indigo-300/90 hover:text-indigo-200 transition-colors">
                                <BookOpen size={12} /> Story · {narrative.label}
                                {narrative.has_synthesis && <Sparkles size={10} className="text-indigo-400" />}
                                {storyOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
                        )}
                        {siblings.length > 0 && (
                            <button onClick={() => setStackOpen(!stackOpen)}
                                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                                <Layers size={12} /> +{siblings.length} similar
                                {stackOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
                        )}
                        <span className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] text-slate-500">
                            {narrative && narrative.direction && (
                                <span title={`story ${narrative.direction}`}
                                    className={`w-2 h-2 rounded-full ${narrative.direction === 'bull' ? 'bg-emerald-500'
                                        : narrative.direction === 'bear' ? 'bg-red-500' : 'bg-slate-500'}`} />
                            )}
                            {formatTimeAgo(update.date)}
                        </span>
                    </div>

                    {storyOpen && narrative && storyData && (() => {
                        const arc = storyData.synthesis && storyData.synthesis.arc;
                        const devs = storyData.developments || [];
                        return (
                            <div className="mt-2 bg-[#0c1120] border border-indigo-500/20 rounded-lg p-3 space-y-2">
                                {arc && <p className="text-xs text-slate-300 leading-relaxed">{arc}</p>}
                                {devs.length > 0 && (
                                    <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
                                        {devs.slice(0, 3).map((d, i) => <li key={i}>{d.headline}</li>)}
                                    </ul>
                                )}
                            </div>
                        );
                    })()}

                    {stackOpen && siblings.length > 0 && (
                        <div className="mt-1.5 pl-3 border-l border-slate-800 space-y-1.5">
                            {siblings.map(s => (
                                <div key={s.id} className="flex items-baseline justify-between gap-2 text-xs">
                                    <span className="text-slate-400 line-clamp-1">{s.title || s.headline}</span>
                                    <span className="text-slate-600 shrink-0 whitespace-nowrap">{formatTimeAgo(s.date)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            {/* DETAILS on tap — source, thesis, scores, search */}
            {isExpanded && (
                <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200" onClick={(e) => e.stopPropagation()}>
                    {(update.headline || update.source) && (
                        <p className="text-[11px] text-slate-500">via {update.headline || update.source}</p>
                    )}
                    {update.thesis && (
                        <p className="text-slate-300 text-sm italic border-l-2 border-indigo-500/50 pl-3">"{update.thesis}"</p>
                    )}
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-500 flex items-center gap-3">
                            <span>P{update.relevanceScore ?? '-'}</span>
                            <span className="text-purple-400/80">N{update.novelty_score ?? '-'}</span>
                            {confidence ? <span className="text-blue-400/80">C{confidence}</span> : null}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FeedCard;
