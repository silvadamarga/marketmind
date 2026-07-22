import React, { useState, useEffect } from 'react';
import { Activity, Lightbulb, RefreshCw, Sparkles, AlertTriangle, Eye, Newspaper, TrendingUp, Star } from 'lucide-react';

const pct = (v, d = 1) => (typeof v === 'number' ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%` : '—');
const whole = (v) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '—');

// Opinionated idea-generation page fed by the forge's fundamental ranking,
// narrated by Gemini. Open, like the rest of the app.
const CONVICTION_STYLE = {
    high: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    low: 'bg-slate-500/15 text-slate-400 border-slate-600/40',
};

const IdeaCard = ({ idea }) => {
    const conv = (idea.conviction || 'low').toLowerCase();
    const px = idea.price || {};
    const news = idea.latest_news;
    const ret = (v) => (
        <span className={typeof v === 'number' ? (v >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}>{pct(v)}</span>
    );
    const newsDate = news && news.date ? new Date(news.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between mb-1">
                <div className="min-w-0">
                    <div className="flex items-baseline space-x-2">
                        <h3 className="text-xl font-bold text-white tracking-tight">{idea.ticker}</h3>
                        {idea.name && <span className="text-sm text-slate-400 truncate">{idea.name}</span>}
                    </div>
                    {(idea.sector || idea.industry) && (
                        <p className="text-[11px] text-slate-600 mt-0.5">{[idea.sector, idea.industry].filter(Boolean).join(' · ')}</p>
                    )}
                </div>
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${CONVICTION_STYLE[conv] || CONVICTION_STYLE.low}`}>
                    {conv} conviction
                </span>
            </div>

            {idea.what_it_does && (
                <p className="text-sm text-slate-400 leading-relaxed mb-3 italic">{idea.what_it_does}</p>
            )}

            {/* Recent price history */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-4 bg-slate-950/50 rounded-lg px-3 py-2">
                <span className="flex items-center"><TrendingUp size={13} className="mr-1.5 text-slate-600" /></span>
                <span>1w {ret(px.ret_1w)}</span>
                <span>1m {ret(px.ret_1m)}</span>
                <span>3m {ret(px.ret_3m)}</span>
                <span className="text-slate-600">·</span>
                <span>{whole(px.pct_52wh)} of 52w high</span>
                {idea.fv_label && <span className="text-slate-600">· FV {idea.fv_label} {typeof idea.fv_upside === 'number' ? `(${pct(idea.fv_upside)})` : ''}</span>}
            </div>

            <p className="text-slate-200 text-base leading-relaxed mb-4">{idea.thesis}</p>
            {idea.what_stands_out && (
                <div className="flex items-start space-x-2 mb-2">
                    <Sparkles size={15} className="text-indigo-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-slate-300 leading-relaxed">{idea.what_stands_out}</p>
                </div>
            )}
            {idea.what_to_watch && (
                <div className="flex items-start space-x-2 mb-2">
                    <AlertTriangle size={15} className="text-amber-400/80 mt-0.5 shrink-0" />
                    <p className="text-sm text-slate-400 leading-relaxed">{idea.what_to_watch}</p>
                </div>
            )}

            {/* Latest news indicator */}
            {news && (
                <div className="flex items-start space-x-2 mt-3 pt-3 border-t border-slate-800/80">
                    <Newspaper size={15} className="text-sky-400/80 mt-0.5 shrink-0" />
                    <p className="text-sm text-slate-400 leading-relaxed">
                        <span className="text-slate-300">{news.headline}</span>
                        {news.takeaway && <span className="text-slate-500"> — {news.takeaway}</span>}
                        <span className="text-[11px] text-slate-600">
                            {newsDate ? ` · ${newsDate}` : ''}
                            {news.recent_count > 1 ? ` · ${news.recent_count} stories/21d` : ''}
                        </span>
                    </p>
                </div>
            )}
        </div>
    );
};

// The LLM's single favorite from the ideas it generated — hero'd above the read.
const TopPick = ({ pick, ideas }) => {
    if (!pick || !pick.ticker) return null;
    const idea = (ideas || []).find((i) => i.ticker === pick.ticker) || {};
    return (
        <section className="relative overflow-hidden rounded-xl border border-indigo-500/40 bg-gradient-to-br from-indigo-500/15 via-slate-900 to-slate-900 p-5 sm:p-6">
            <div className="flex items-center space-x-2 text-indigo-300 mb-3">
                <Star size={14} className="fill-indigo-400 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-widest">Top Pick</span>
            </div>
            <div className="flex items-baseline space-x-2 mb-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">{pick.ticker}</h2>
                {idea.name && <span className="text-sm text-slate-400 truncate">{idea.name}</span>}
                {idea.conviction && (
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${CONVICTION_STYLE[idea.conviction.toLowerCase()] || CONVICTION_STYLE.low}`}>
                        {idea.conviction} conviction
                    </span>
                )}
            </div>
            <p className="text-slate-200 text-base leading-relaxed">{pick.why}</p>
        </section>
    );
};

export default function Inspiration() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async (refresh = false) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/inspiration${refresh ? '?refresh=1' : ''}`);
            const result = await res.json();
            setData(result);
        } catch (e) {
            console.error('Inspiration fetch failed:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    if (loading && !data) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500 bg-slate-950">
                <div className="flex flex-col items-center">
                    <Activity className="animate-spin mb-4 text-slate-400" size={24} />
                    <span className="text-xs font-medium tracking-widest uppercase">Loading Ideas</span>
                </div>
            </div>
        );
    }

    const narration = data && data.narration;
    const message = data && data.message;

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-12 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            <div className="max-w-4xl mx-auto space-y-7 sm:space-y-10 pb-12">

                {/* Header */}
                <div className="flex justify-between items-start gap-3 border-b border-slate-800 pb-5 sm:pb-6">
                    <div>
                        <div className="flex items-center space-x-2 text-indigo-400 mb-2">
                            <Lightbulb size={14} />
                            <span className="text-xs font-bold uppercase tracking-widest">
                                Forge Inspiration{data && data.as_of ? ` · ${data.as_of}` : ''}
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Trade Ideas</h1>
                        <p className="text-xs text-slate-500 mt-1">
                            Opinionated ideas from your fundamental ranking — research prompts, not instructions.
                            {data && data.freshness ? ` Snapshot ${data.freshness}${data.age_days != null ? ` (${data.age_days}d old)` : ''}.` : ''}
                        </p>
                    </div>
                    <button
                        onClick={() => fetchData(true)}
                        disabled={loading}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        title="Regenerate"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {message && (
                    <div className="text-slate-400 text-sm italic border border-slate-800 rounded-lg p-6">{message}</div>
                )}

                {narration && (
                    <>
                        {/* Top pick — the LLM's single favorite, hero'd */}
                        <TopPick pick={narration.top_pick} ideas={narration.ideas} />

                        {/* Overall read */}
                        {narration.overall_read && (
                            <section>
                                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center">
                                    <Eye size={16} className="mr-2" /> The Read
                                </h2>
                                <p className="text-lg sm:text-2xl text-slate-300 leading-relaxed font-light">
                                    {narration.overall_read}
                                </p>
                            </section>
                        )}

                        {/* Ideas */}
                        <section>
                            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center">
                                <Sparkles size={16} className="mr-2" /> Ideas
                            </h2>
                            <div className="space-y-4">
                                {(narration.ideas || []).map((idea, i) => (
                                    <IdeaCard key={idea.ticker || i} idea={idea} />
                                ))}
                                {(!narration.ideas || narration.ideas.length === 0) && (
                                    <div className="text-slate-500 text-sm italic">No ideas in this snapshot.</div>
                                )}
                            </div>
                        </section>

                        <p className="text-[11px] text-slate-600 border-t border-slate-800 pt-6">
                            Fundamental snapshot, not a timing signal — your call.
                            {data.stale_narration ? ' (Showing last cached narration — regeneration failed.)' : ''}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
