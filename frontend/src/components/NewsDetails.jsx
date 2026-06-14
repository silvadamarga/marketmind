import React, { useState, useEffect } from 'react';
import { ArrowLeft, Share2, ExternalLink, Activity, BarChart2, TrendingUp, TrendingDown, AlertTriangle, Zap } from 'lucide-react';

const API_BASE = "";

export default function NewsDetails({ itemId, onBack }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/feed/${itemId}`);
        if (!res.ok) throw new Error("Failed to fetch details");
        const data = await res.json();
        setItem(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (itemId) fetchDetails();
  }, [itemId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
        Loading analysis...
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <AlertTriangle size={48} className="mb-4 text-red-500" />
        <p className="text-lg">Failed to load intelligence data.</p>
        <button onClick={onBack} className="mt-4 text-blue-400 hover:underline">Return to Feed</button>
      </div>
    );
  }

  const isBullish = item.sentiment === "BULLISH";
  const isBearish = item.sentiment === "BEARISH";
  const sentimentColor = isBullish ? "text-green-400" : isBearish ? "text-red-400" : "text-slate-400";
  const impactColor = item.impact === "CRITICAL" ? "text-purple-400" : item.impact === "HIGH" ? "text-red-400" : "text-blue-400";

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0B0F19] text-slate-200 p-6">
      
      {/* Header / Nav */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={onBack}
          className="flex items-center text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Feed
        </button>
        <div className="flex space-x-3">
            <button className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                <Share2 size={18} />
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto w-full space-y-8">
        
        {/* Title Section */}
        <div className="border-b border-slate-800 pb-6">
            <div className="flex items-center space-x-3 mb-3 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-bold bg-slate-800 ${impactColor}`}>
                    {item.impact} IMPACT
                </span>
                <span className="text-slate-500">{new Date(item.date).toLocaleString()}</span>
                <span className="text-slate-500">•</span>
                <span className="text-blue-400 font-medium">{item.source}</span>
            </div>
            <h1 className="text-3xl font-bold text-white leading-tight mb-4">{item.headline}</h1>
            
            {/* Quick Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#0f1422] p-4 rounded-lg border border-slate-800/50">
                <div>
                    <div className="text-xs text-slate-500 mb-1">SENTIMENT</div>
                    <div className={`font-bold flex items-center ${sentimentColor}`}>
                        {isBullish ? <TrendingUp size={16} className="mr-1"/> : isBearish ? <TrendingDown size={16} className="mr-1"/> : <Activity size={16} className="mr-1"/>}
                        {item.sentiment}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-slate-500 mb-1">RELEVANCE</div>
                    <div className="font-bold text-white">{item.relevanceScore}/10</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500 mb-1">CONFIDENCE</div>
                    <div className="font-bold text-blue-300">{item.ml_context?.confidence || "?"}/10</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500 mb-1">NOVELTY</div>
                    <div className="font-bold text-purple-300">{item.novelty_score || "?"}/10</div>
                </div>
            </div>
        </div>

        {/* AI Analysis Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Analysis */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* Thesis */}
                <div className="bg-[#0f1422] p-6 rounded-xl border border-slate-800">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <Zap className="mr-2 text-yellow-400" size={20} />
                        AI Thesis
                    </h3>
                    <p className="text-slate-300 leading-relaxed text-lg">
                        {item.thesis || item.summary || "No detailed thesis available."}
                    </p>
                </div>

                {/* Full Body / Context */}
                <div>
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Full Context</h3>
                    <div className="prose prose-invert max-w-none text-slate-300">
                        <p className="whitespace-pre-wrap">{item.title}</p> {/* Using 'title' from logs which is usually the body/summary if 'body' is short */}
                    </div>
                </div>

                {/* Trading Advice (if available) */}
                {item.full_analysis?.trading_advice && (
                    <div className="bg-blue-900/20 p-5 rounded-lg border border-blue-800/50">
                        <h4 className="text-blue-400 font-bold mb-2">Trading Action</h4>
                        <p className="text-blue-100">{item.full_analysis.trading_advice}</p>
                    </div>
                )}
            </div>

            {/* Right Column: Market Context */}
            <div className="space-y-6">
                
                {/* Tickers */}
                {item.tags && item.tags.length > 0 && (
                    <div className="bg-[#0f1422] p-5 rounded-lg border border-slate-800">
                        <h4 className="text-sm font-bold text-slate-500 mb-3">RELATED ASSETS</h4>
                        <div className="flex flex-wrap gap-2">
                            {item.tags.map(tag => (
                                <span key={tag} className="px-3 py-1 bg-slate-800 rounded text-sm font-mono text-blue-300 border border-slate-700">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Technicals */}
                <div className="bg-[#0f1422] p-5 rounded-lg border border-slate-800">
                    <h4 className="text-sm font-bold text-slate-500 mb-3 flex items-center">
                        <BarChart2 size={16} className="mr-2"/> MARKET CONTEXT
                    </h4>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Market VIX</span>
                            <span className="font-mono text-white">{item.ml_context?.vix || "N/A"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">RSI (14)</span>
                            <span className={`font-mono ${item.ml_context?.rsi > 70 ? 'text-red-400' : item.ml_context?.rsi < 30 ? 'text-green-400' : 'text-white'}`}>
                                {item.ml_context?.rsi ? item.ml_context.rsi.toFixed(2) : "N/A"}
                            </span>
                        </div>
                         <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">RVOL</span>
                            <span className="font-mono text-white">{item.ml_context?.rvol ? item.ml_context.rvol.toFixed(2) : "N/A"}</span>
                        </div>
                    </div>
                </div>

                {/* Sector Data */}
                {item.ml_context?.sectors && Object.keys(item.ml_context.sectors).length > 0 && (
                     <div className="bg-[#0f1422] p-5 rounded-lg border border-slate-800">
                        <h4 className="text-sm font-bold text-slate-500 mb-3">SECTOR IMPACT</h4>
                        <div className="space-y-2">
                            {Object.entries(item.ml_context.sectors).map(([sector, change]) => (
                                <div key={sector} className="flex justify-between text-sm">
                                    <span className="text-slate-400">{sector}</span>
                                    <span className={parseFloat(change) >= 0 ? "text-green-400" : "text-red-400"}>
                                        {change}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
      </div>
    </div>
  );
}
