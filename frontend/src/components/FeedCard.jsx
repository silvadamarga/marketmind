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

// snake_case topic/tag -> "Title Case Words". Empty string in -> null.
const humanize = (s) => {
    if (!s) return null;
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

    // Left SPINE: a uniform 3px rail flush to the card's left edge — same width on
    // every tier so the rail (and the text beside it) line up straight down the feed.
    // Colour reads the story DIRECTION by default (bull/neutral/bear from the attached
    // narrative); the loud priority tiers keep their impact colour + faint tint so
    // criticals still jump out of the tape.
    const dirSpine = narrative && narrative.direction === 'bull' ? 'border-l-emerald-500'
        : narrative && narrative.direction === 'bear' ? 'border-l-rose-500'
        : 'border-l-slate-600';
    const spine = update.impact === 'CRITICAL' ? 'border-l-red-500 bg-red-950/20'
        : update.impact === 'HIGH' ? 'border-l-amber-500 bg-amber-950/10'
        : dirSpine;
    const cardStyle = `border-l-[3px] ${spine}`;

    // Factual metadata Gemini attached to the event (direction/sentiment already
    // stripped server-side). These enrich the tape without implying a trade call.
    const fa = update.full_analysis || {};
    // Ticker chip pinned left of the headline — the one datum that makes this a
    // trading tape and not a generic news feed. tickers[] from the analysis is the
    // reliable source; related_ticker is a legacy fallback.
    const ticker = (fa.tickers && fa.tickers[0]) || update.related_ticker || null;
    const category = fa.category && fa.category !== 'OTHER' ? fa.category : null;
    const topicWords = humanize(fa.topic);
    const mlTags = (fa.ml_tags || []).slice(0, 6);
    const { vix, rsi, rvol, session } = update.ml_context || {};
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
            className={`group rounded-r-lg transition-colors duration-150 hover:bg-slate-800/25 cursor-pointer ${cardStyle} ${isNoise ? 'opacity-50' : ''} pl-3.5 pr-3.5 py-2.5`}
        >
            {/* META LINE — plain-text identity (ticker · category) left, time right.
                No chips: the headline carries the weight. */}
            <div className="flex items-baseline gap-2 text-[10px] font-mono tracking-wide">
                {ticker && (
                    <span className="shrink-0 font-semibold text-slate-300">{ticker}</span>
                )}
                {category && (
                    <span className="shrink-0 uppercase tracking-wider text-slate-500">{category}</span>
                )}
                {isHighImpact && (update.novelty_score || 0) >= 8 && (
                    <span className="shrink-0 font-semibold uppercase tracking-wider text-amber-400/90">NEW</span>
                )}
                <span className="ml-auto shrink-0 flex items-center gap-1.5 tabular-nums text-slate-500">
                    {narrative && narrative.direction && (
                        <span title={`story ${narrative.direction}`}
                            className={`w-1.5 h-1.5 rounded-full ${narrative.direction === 'bull' ? 'bg-emerald-500'
                                : narrative.direction === 'bear' ? 'bg-rose-500' : 'bg-slate-500'}`} />
                    )}
                    {formatTimeAgo(update.date)}
                </span>
            </div>

            {/* HEADLINE — the focus. Left-aligned, tight, prominent. */}
            <h3 className="mt-1 text-[15px] font-semibold leading-snug tracking-tight text-slate-50">
                {update.title || update.headline}
            </h3>
            {(topicWords || (update.source && update.source !== 'Unknown')) && (
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                    {topicWords && <span className="text-slate-400">{topicWords}</span>}
                    {topicWords && update.source && update.source !== 'Unknown' && (
                        <span className="text-slate-700">•</span>
                    )}
                    {update.source && update.source !== 'Unknown' && <span>{update.source}</span>}
                </div>
            )}

            {/* ACTIONS — minimal inline text links, no border, no button chrome. */}
            <div onClick={(e) => e.stopPropagation()}>
                <div className="mt-1.5 flex items-center gap-4">
                    {narrative && (
                        <button onClick={toggleStory}
                            className="flex items-center gap-1 text-[11px] text-indigo-300/90 hover:text-indigo-200 transition-colors">
                            <BookOpen size={11} /> Story · {narrative.label}
                            {narrative.has_synthesis && <Sparkles size={9} className="text-indigo-400" />}
                            {storyOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </button>
                    )}
                    {siblings.length > 0 && (
                        <button onClick={() => setStackOpen(!stackOpen)}
                            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                            <Layers size={11} /> +{siblings.length} similar
                            {stackOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/search?q=${encodeURIComponent(update.title || update.headline)}`, '_blank'); }}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-200 transition-colors"
                        title="Search the web for this headline"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        Search
                    </button>
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
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200" onClick={(e) => e.stopPropagation()}>
                    {(update.headline || update.source) && (
                        <p className="text-[11px] text-slate-500">via {update.headline || update.source}</p>
                    )}
                    {update.thesis && (
                        <p className="text-slate-300 text-sm italic border-l-2 border-indigo-500/50 pl-3">"{update.thesis}"</p>
                    )}

                    {/* Tags: the concept labels Gemini attached — what this event IS about */}
                    {mlTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {mlTags.map((t, i) => (
                                <span key={i} className="font-mono text-[10px] text-slate-300 bg-slate-800/70 border border-slate-700/50 px-1.5 py-0.5 rounded">
                                    #{t}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Market context at the time of the event — regime the headline landed in */}
                    {(vix || rsi || rvol || session) && (
                        <div className="grid grid-cols-4 gap-2">
                            {[['VIX', vix], ['RSI', rsi], ['RVOL', rvol ? `${rvol}x` : null], ['SESSION', session]]
                                .filter(([, v]) => v)
                                .map(([label, v]) => (
                                    <div key={label} className="bg-[#0c1120] border border-slate-800 rounded px-2 py-1.5">
                                        <div className="text-[9px] uppercase tracking-wider text-slate-600 leading-none mb-1">{label}</div>
                                        <div className="font-mono text-[12px] text-slate-300 leading-none tabular-nums truncate">{v}</div>
                                    </div>
                                ))}
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-500 flex items-center gap-3">
                            <span title="Priority">P{update.relevanceScore ?? '-'}</span>
                            <span className="text-purple-400/80" title="Novelty">N{update.novelty_score ?? '-'}</span>
                            {confidence ? <span className="text-blue-400/80" title="Confidence">C{confidence}</span> : null}
                            <span className="text-slate-600" title="Impact tier">{update.impact}</span>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FeedCard;
