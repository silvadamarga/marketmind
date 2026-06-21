import React, { useState, useEffect } from 'react';
import { Activity, Zap, Calendar, RefreshCw, Layers, Eye, Tag } from 'lucide-react';

// Factual recap card — what happened + why it matters. No direction, no forecast.
const DevelopmentCard = ({ dev }) => (
    <div className="bg-slate-900 border-l-4 border-indigo-500 rounded-r-xl p-6 mb-4 hover:bg-slate-800/50 transition-colors shadow-sm">
        <h3 className="text-xl font-bold text-white leading-tight mb-3">{dev.headline}</h3>
        {dev.what_happened && (
            <p className="text-slate-200 text-base leading-relaxed mb-3">{dev.what_happened}</p>
        )}
        {dev.context && (
            <p className="text-slate-400 text-sm leading-relaxed border-l-2 border-slate-800 pl-4">
                {dev.context}
            </p>
        )}
    </div>
);

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
                    <span className="text-xs font-medium tracking-widest uppercase">Loading Recap</span>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 bg-slate-950">
                <div className="text-center max-w-md">
                    <Zap className="mx-auto mb-6 text-slate-600" size={48} />
                    <h2 className="text-xl font-bold text-slate-200 mb-3">Daily Recap Unavailable</h2>
                    <p className="text-slate-400 mb-8 text-sm leading-relaxed">
                        Generate a factual recap of the day's developments.
                    </p>
                    <button
                        onClick={generateReport}
                        disabled={generating}
                        className="bg-slate-100 hover:bg-white text-slate-900 px-6 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mx-auto"
                    >
                        {generating ? 'Writing...' : 'Generate Recap'}
                    </button>
                </div>
            </div>
        );
    }

    const { report, date } = data;
    // Tolerate older report payloads (pre direction-retirement) that used
    // critical_events; the recap fields fall back gracefully.
    const developments = report.key_developments || report.critical_events || [];

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
                        <h1 className="text-3xl font-bold text-white tracking-tight">Daily Recap</h1>
                        <p className="text-xs text-slate-500 mt-1">What happened today — facts and context, not a market call.</p>
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

                {/* Summary */}
                <section>
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Summary</h2>
                    <p className="text-xl md:text-2xl text-slate-300 leading-relaxed font-light">
                        {report.summary}
                    </p>
                </section>

                {/* Themes */}
                {report.themes && report.themes.length > 0 && (
                    <section>
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                            <Tag size={16} className="mr-2" /> Themes
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {report.themes.map((t, i) => (
                                <span key={i} className="text-xs px-3 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
                                    {t}
                                </span>
                            ))}
                        </div>
                    </section>
                )}

                {/* Key Developments */}
                <section>
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center">
                        <Layers size={16} className="mr-2" /> Key Developments
                    </h2>
                    <div className="space-y-4">
                        {developments.map((dev, idx) => (
                            <DevelopmentCard key={idx} dev={dev} />
                        ))}
                        {developments.length === 0 && (
                            <div className="text-slate-500 text-sm italic">No developments captured.</div>
                        )}
                    </div>
                </section>

                {/* On the radar — factual scheduled items, not a prediction */}
                {report.on_the_radar && (
                    <section className="border-t border-slate-800 pt-8">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                            <Eye size={16} className="mr-2" /> On the Radar
                        </h2>
                        <p className="text-slate-300 text-base leading-relaxed">{report.on_the_radar}</p>
                        <p className="text-[11px] text-slate-600 mt-2">Scheduled/known items only — not a forecast of direction.</p>
                    </section>
                )}

            </div>
        </div>
    );
}
