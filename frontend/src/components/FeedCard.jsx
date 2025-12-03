import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Zap, TrendingUp, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

const AIBadge = ({ icon: Icon, label, value, colorClass }) => {
    return (
        <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border bg-opacity-10 ${colorClass}`}>
            {Icon && <Icon size={14} />}
            <div className="flex flex-col leading-none">
                <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider">{label}</span>
                <span className="text-xs font-mono font-bold">{value}</span>
            </div>
        </div>
    );
};

const FeedCard = ({ update }) => {
    const isHighImpact = update.impact === 'CRITICAL' || update.impact === 'HIGH' || (update.novelty_score || 0) >= 6;
    // Default to expanded if high impact, compact otherwise
    const [isExpanded, setIsExpanded] = useState(isHighImpact);

    const isNoise = (update.relevanceScore || 0) < 3;
    const { confidence } = update.ml_context || {};

    // Impact Styling
    const impactStyles = {
        CRITICAL: "bg-gradient-to-br from-red-900/20 to-[#131b2e] border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]",
        HIGH: "bg-gradient-to-br from-amber-900/10 to-[#131b2e] border-amber-500/30",
        MEDIUM: "bg-[#0f1422] border-slate-800/30 opacity-90 hover:opacity-100",
        LOW: "bg-[#0f1422] border-slate-800/30 opacity-80 hover:opacity-100"
    };
    const cardStyle = impactStyles[update.impact] || impactStyles.LOW;

    const handleToggle = (e) => {
        // Prevent toggling if clicking on interactive elements if any (none for now)
        setIsExpanded(!isExpanded);
    };

    return (
        <div 
            onClick={handleToggle}
            className={`border rounded-lg transition-all duration-300 hover:border-slate-600 cursor-pointer ${cardStyle} ${isNoise ? 'opacity-50 grayscale' : ''} ${isExpanded ? 'p-5' : 'p-3'}`}
        >
            <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                    {/* Meta Row */}
                    <div className="flex items-center space-x-2 mb-1.5 opacity-75 text-[10px]">
                        <span className={`font-bold tracking-wider uppercase text-blue-400`}>
                            {update.headline || update.source || "UNKNOWN"}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500">{formatTimeAgo(update.date)}</span>
                        {/* Show small sentiment dot in compact mode if not expanded */}
                        {!isExpanded && update.sentiment && update.sentiment !== 'NEUTRAL' && (
                             <span className={`w-2 h-2 rounded-full ${update.sentiment === 'BULLISH' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        )}
                    </div>

                    {/* Headline */}
                    <h3 className={`font-bold leading-snug ${isExpanded ? 'text-lg mb-3 text-slate-100' : 'text-sm mb-0 text-slate-300'}`}>
                        {update.title || update.headline}
                    </h3>

                    {/* Expanded Content */}
                    {isExpanded && (
                        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">


                            {/* Gemini Thesis */}
                            {update.thesis && (
                                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                    <div className="flex items-center gap-2 mb-1 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                                        <Zap size={12} /> AI Thesis
                                    </div>
                                    <p className="text-slate-300 text-sm italic">
                                        "{update.thesis}"
                                    </p>
                                </div>
                            )}

                            {/* Tags Row */}
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                {/* Sentiment */}
                                {update.sentiment && update.sentiment !== 'NEUTRAL' && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${update.sentiment === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                            'bg-red-500/10 border-red-500/30 text-red-400'
                                        }`}>
                                        {update.sentiment}
                                    </span>
                                )}
                                
                                {/* Action */}
                                {update.action && update.action !== 'WATCH' && (
                                     <span className="text-[10px] px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 font-medium">
                                        {update.action}
                                     </span>
                                )}

                                {/* Tags (Tickers/Categories) */}
                                {update.tags && update.tags.map(tag => (
                                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 font-medium">
                                        {tag}
                                    </span>
                                ))}

                                {/* Timeframe */}
                                {update.timeframe && (
                                     <span className="text-[10px] px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-400 font-medium">
                                        {update.timeframe}
                                     </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Side: AI Scores & Expand Icon */}
                <div className="flex flex-col gap-2 shrink-0 items-end">
                    {/* Impact Visual */}
                    <div className="flex flex-col items-end">
                        {isExpanded && <span className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Impact</span>}
                        <div className="flex space-x-0.5">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className={`rounded-sm ${isExpanded ? 'w-1.5 h-4' : 'w-1 h-2'} ${i < (update.relevanceScore / 2) ? 
                                    (update.relevanceScore >= 8 ? 'bg-red-500' : update.relevanceScore >= 5 ? 'bg-amber-500' : 'bg-blue-500') 
                                    : 'bg-slate-800'}`} 
                                />
                            ))}
                        </div>
                    </div>

                    {/* Confidence & Novelty (Only in expanded) */}
                    {isExpanded && (
                        <div className="flex flex-col items-end mt-1 space-y-2">
                            {/* Novelty Visual */}
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Novelty</span>
                                <div className="flex space-x-0.5">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className={`rounded-sm w-1.5 h-4 ${i < ((update.novelty_score || 0) / 2) ? 
                                            'bg-purple-500' : 'bg-slate-800'}`} 
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Confidence */}
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">Conf</span>
                                <span className="text-xs font-mono font-bold text-blue-400">{confidence || "-"}</span>
                            </div>
                        </div>
                    )}
                    
                    {/* Expand/Collapse Indicator */}
                    {!isHighImpact && (
                        <div className="mt-1 text-slate-600">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FeedCard;
