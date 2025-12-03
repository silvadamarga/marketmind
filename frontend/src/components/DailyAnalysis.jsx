import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, Zap, Calendar, RefreshCw, ArrowRight, Layers, BarChart3 } from 'lucide-react';

const SentimentIndicator = ({ score, sentiment }) => {
    let color = "text-yellow-400";
    let barColor = "bg-yellow-400";
    
    if (sentiment === "BULLISH") {
        color = "text-emerald-400";
        barColor = "bg-emerald-500";
    }
    if (sentiment === "BEARISH") {
        color = "text-rose-400";
        barColor = "bg-rose-500";
    }

    return (
        <div className="flex items-center space-x-4 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="flex-1">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">Market Sentiment</span>
                    <span className={`text-xl font-bold ${color}`}>{sentiment}</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className={`h-full ${barColor} transition-all duration-1000 ease-out`} 
                        style={{ width: `${(score / 10) * 100}%` }}
                    ></div>
                </div>
            </div>
            <div className={`text-3xl font-black ${color} w-12 text-center`}>
                {score}
            </div>
        </div>
    );
};

const EventCard = ({ event, index }) => (
    <div className="bg-slate-900 border-l-4 border-indigo-500 rounded-r-xl p-6 mb-4 hover:bg-slate-800/50 transition-colors shadow-sm">
        <div className="flex justify-between items-start mb-3">
            <h3 className="text-xl font-bold text-white leading-tight">{event.headline}</h3>
        </div>
        
        <p className="text-slate-300 text-base leading-relaxed mb-4 font-light">
            {event.context}
        </p>
        
        <div className="flex items-center">
            <div className="bg-indigo-500/10 px-3 py-1.5 rounded-full flex items-center border border-indigo-500/20">
                <Activity size={14} className="text-indigo-400 mr-2" />
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider mr-2">Impact:</span>
                <span className="text-sm font-semibold text-white">{event.impact}</span>
            </div>
        </div>
    </div>
);

const ThesisColumn = ({ type, content }) => {
    const isBullish = type === 'bullish';
    const Icon = isBullish ? TrendingUp : TrendingDown;
    const colorClass = isBullish ? 'text-emerald-400' : 'text-rose-400';

    return (
        <div className="flex-1">
            <h3 className={`text-sm font-bold ${colorClass} uppercase tracking-wider mb-3 flex items-center`}>
                <Icon size={16} className="mr-2" /> {type} Case
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed border-l-2 border-slate-800 pl-4">
                {content || `No ${type} thesis available.`}
            </p>
        </div>
    );
};

export default function DailyAnalysis() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/analysis/daily');
            const result = await response.json();
            if (response.ok && !result.message) {
                setData(result);
            } else {
                setData(null);
            }
        } catch (error) {
            console.error("Failed to fetch daily analysis:", error);
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    const generateReport = async () => {
        setGenerating(true);
        try {
            const response = await fetch('/api/analysis/daily/generate', { method: 'POST' });
            const result = await response.json();
            if (result.status === 'success') {
                setData({
                    date: result.date,
                    report: result.report,
                    created_at: new Date().toISOString()
                });
            } else if (result.status === 'cooldown' || result.status === 'market_open' || result.status === 'exists') {
                alert(result.message);
            } else {
                alert(`Generation failed: ${result.message}`);
            }
        } catch (error) {
            console.error("Failed to generate report:", error);
            alert("Failed to generate report. See console for details.");
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500 bg-slate-950">
                <div className="flex flex-col items-center">
                    <Activity className="animate-spin mb-4 text-slate-400" size={24} />
                    <span className="text-xs font-medium tracking-widest uppercase">Loading Intelligence</span>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 bg-slate-950">
                <div className="text-center max-w-md">
                    <Zap className="mx-auto mb-6 text-slate-600" size={48} />
                    <h2 className="text-xl font-bold text-slate-200 mb-3">Daily Briefing Unavailable</h2>
                    <p className="text-slate-400 mb-8 text-sm leading-relaxed">
                        Generate a new report based on the latest market data.
                    </p>
                    <button 
                        onClick={generateReport} 
                        disabled={generating}
                        className="bg-slate-100 hover:bg-white text-slate-900 px-6 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mx-auto"
                    >
                        {generating ? 'Analyzing...' : 'Generate Report'}
                    </button>
                </div>
            </div>
        );
    }

    const { report, date } = data;

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950 p-6 sm:p-12 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            <div className="max-w-4xl mx-auto space-y-12 pb-12">
                
                {/* Header */}
                <div className="flex justify-between items-start border-b border-slate-800 pb-6">
                    <div>
                        <div className="flex items-center space-x-2 text-indigo-400 mb-2">
                            <Calendar size={14} />
                            <span className="text-xs font-bold uppercase tracking-widest">
                                {new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Daily Market Briefing</h1>
                    </div>
                    <button 
                        onClick={generateReport} 
                        disabled={generating}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        title="Regenerate"
                    >
                        <RefreshCw size={18} className={generating ? 'animate-spin' : ''} /> 
                    </button>
                </div>

                {/* Main Narrative */}
                <div className="space-y-8">
                    <section>
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Executive Summary</h2>
                        <p className="text-xl md:text-2xl text-slate-300 leading-relaxed font-light">
                            {report.summary}
                        </p>
                        <div className="mt-6 flex items-start space-x-2 text-indigo-400">
                            <ArrowRight size={16} className="mt-1 flex-shrink-0" />
                            <p className="text-base font-medium italic">"{report.outlook}"</p>
                        </div>
                    </section>

                    <SentimentIndicator score={report.sentiment_score} sentiment={report.market_sentiment} />
                </div>

                {/* Critical Events */}
                <section>
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center">
                        <Layers size={16} className="mr-2" /> Critical Market Events
                    </h2>
                    <div className="space-y-4">
                        {report.critical_events && report.critical_events.map((event, idx) => (
                            <EventCard key={idx} event={event} index={idx} />
                        ))}
                         {/* Fallback for old reports or if critical_events is missing */}
                        {!report.critical_events && report.key_themes && (
                             <div className="text-slate-500 text-sm italic">
                                 Legacy report format detected. Please regenerate for new event-based analysis.
                             </div>
                        )}
                    </div>
                </section>

                {/* Theses */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 py-8 border-t border-slate-800">
                    <ThesisColumn type="bullish" content={report.bullish_thesis} />
                    <ThesisColumn type="bearish" content={report.bearish_thesis} />
                </div>

            </div>
        </div>
    );
}
