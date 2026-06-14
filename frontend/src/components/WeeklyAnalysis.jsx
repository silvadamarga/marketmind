import React, { useState, useEffect } from 'react';
import { BarChart, PieChart, TrendingUp, AlertTriangle, Calendar, Activity } from 'lucide-react';

const StatCard = ({ title, value, subtext, icon: Icon, colorClass }) => (
    <div className="bg-[#131b2e] border border-slate-800 p-5 rounded-xl flex items-start justify-between">
        <div>
            <div className="text-slate-400 text-sm font-medium mb-1">{title}</div>
            <div className="text-3xl font-bold text-white">{value}</div>
            {subtext && <div className="text-xs text-slate-500 mt-2">{subtext}</div>}
        </div>
        <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
            <Icon size={24} className={colorClass.replace('bg-', 'text-')} />
        </div>
    </div>
);

const ListCard = ({ title, items, icon: Icon }) => (
    <div className="bg-[#131b2e] border border-slate-800 p-6 rounded-xl h-full">
        <div className="flex items-center space-x-3 mb-6">
            <Icon size={20} className="text-indigo-400" />
            <h3 className="text-lg font-bold text-slate-200">{title}</h3>
        </div>
        <div className="space-y-4">
            {items.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium">{item.name}</span>
                    <span className="text-slate-500 text-sm bg-slate-800 px-2 py-1 rounded-md">{item.count}</span>
                </div>
            ))}
            {items.length === 0 && <div className="text-slate-500 text-sm italic">No data available</div>}
        </div>
    </div>
);

export default function WeeklyAnalysis() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch('/api/analysis/weekly');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const result = await response.json();
                setData(result);
            } catch (error) {
                console.error("Failed to fetch weekly analysis:", error);
                setData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-500">
                <Activity className="animate-spin mr-2" /> Loading analysis...
            </div>
        );
    }

    if (!data || !data.sentiment_counts) return (
        <div className="p-8 text-center text-slate-500">
            <AlertTriangle className="mx-auto mb-2 text-amber-500" size={32} />
            <p>Failed to load analysis data.</p>
            <button onClick={() => window.location.reload()} className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm">Retry</button>
        </div>
    );

    const { total_events, sentiment_counts, top_tickers, top_categories, critical_events } = data;
    const bullishPct = total_events > 0 ? Math.round((sentiment_counts?.BULLISH || 0) / total_events * 100) : 0;
    const bearishPct = total_events > 0 ? Math.round((sentiment_counts?.BEARISH || 0) / total_events * 100) : 0;

    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="max-w-6xl mx-auto space-y-8">
                
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Weekly Market Pulse</h1>
                    <p className="text-slate-400">AI-driven analysis of the past 7 days of market intelligence.</p>
                </div>

                {/* Key Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard 
                        title="Total Insights" 
                        value={total_events} 
                        subtext="Processed events" 
                        icon={Activity} 
                        colorClass="text-blue-400" 
                    />
                    <StatCard 
                        title="Bullish Sentiment" 
                        value={`${bullishPct}%`} 
                        subtext={`${sentiment_counts.BULLISH} events`} 
                        icon={TrendingUp} 
                        colorClass="text-emerald-400" 
                    />
                    <StatCard 
                        title="Bearish Sentiment" 
                        value={`${bearishPct}%`} 
                        subtext={`${sentiment_counts.BEARISH} events`} 
                        icon={TrendingUp} 
                        colorClass="text-red-400" 
                    />
                </div>

                {/* Lists Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ListCard title="Top Tickers" items={top_tickers} icon={BarChart} />
                    <ListCard title="Top Categories" items={top_categories} icon={PieChart} />
                </div>

                {/* Week in Review Section */}
                <div>
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                        <AlertTriangle className="mr-2 text-amber-400" size={20} />
                        Critical Events Review
                    </h2>
                    <div className="space-y-4">
                        {critical_events.length === 0 ? (
                            <div className="text-slate-500 italic">No critical events recorded this week.</div>
                        ) : (
                            critical_events.map((event) => (
                                <div key={event.id} className="bg-[#131b2e] border border-slate-800 p-5 rounded-xl hover:border-slate-600 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">{event.source}</span>
                                            <span className="text-slate-600">•</span>
                                            <span className="text-xs text-slate-500">{new Date(event.date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex space-x-1">
                                            {[...Array(5)].map((_, i) => (
                                                <div key={i} className={`w-1 h-3 rounded-sm ${i < (event.impact / 2) ? 'bg-red-500' : 'bg-slate-800'}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-200 mb-2">{event.title}</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed">{event.summary}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
