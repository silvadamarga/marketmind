import React from 'react';
import { BookOpen, Activity, Zap, Droplets, TrendingUp, AlertTriangle } from 'lucide-react';

export default function UniverseGuide() {
    return (
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="max-w-4xl mx-auto space-y-8">
                
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold text-white mb-2">Universe Guide</h1>
                    <p className="text-slate-400">Understanding the metrics and signals in the MarketMind Universe Bar.</p>
                </div>

                {/* Market Conditions Section */}
                <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                    <div className="flex items-center space-x-3 mb-6">
                        <Activity className="text-indigo-400" size={24} />
                        <h2 className="text-xl font-bold text-white">Market Conditions</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                            <div className="flex items-center space-x-2 mb-2">
                                <Zap className="text-rose-400" size={18} />
                                <h3 className="font-bold text-rose-400">Overbought</h3>
                            </div>
                            <p className="text-sm text-slate-300 mb-2">RSI &gt; 70</p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                The asset may be overvalued and due for a pullback. Price has risen too fast relative to recent history.
                            </p>
                        </div>

                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                            <div className="flex items-center space-x-2 mb-2">
                                <Droplets className="text-emerald-400" size={18} />
                                <h3 className="font-bold text-emerald-400">Oversold</h3>
                            </div>
                            <p className="text-sm text-slate-300 mb-2">RSI &lt; 30</p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                The asset may be undervalued and due for a bounce. Price has fallen too fast relative to recent history.
                            </p>
                        </div>

                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                            <div className="flex items-center space-x-2 mb-2">
                                <AlertTriangle className="text-amber-400" size={18} />
                                <h3 className="font-bold text-amber-400">High Volatility</h3>
                            </div>
                            <p className="text-sm text-slate-300 mb-2">RVOL &gt; 2.0</p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Volume is at least 2x the average. Expect larger price swings and potential breakout moves.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Intraday Signals Section */}
                <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                    <div className="flex items-center space-x-3 mb-6">
                        <TrendingUp className="text-amber-400" size={24} />
                        <h2 className="text-xl font-bold text-white">Intraday Signals</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                            <div className="flex items-center space-x-2 mb-2">
                                <Activity className="text-amber-400" size={18} />
                                <h3 className="font-bold text-amber-400">High RVOL</h3>
                            </div>
                            <p className="text-sm text-slate-300 mb-2">Relative Volume &gt; 1.5x</p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Heavy trading activity. Institutional interest is likely present.
                            </p>
                        </div>

                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                            <div className="flex items-center space-x-2 mb-2">
                                <TrendingUp className="text-emerald-400" size={18} />
                                <h3 className="font-bold text-emerald-400">Momentum</h3>
                            </div>
                            <p className="text-sm text-slate-300 mb-2">Price &gt; VWAP + High Vol</p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Bulls are in control. Price is holding above the average weighted price.
                            </p>
                        </div>

                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                            <div className="flex items-center space-x-2 mb-2">
                                <TrendingUp className="text-rose-400 rotate-180" size={18} />
                                <h3 className="font-bold text-rose-400">Heavy</h3>
                            </div>
                            <p className="text-sm text-slate-300 mb-2">Price &lt; VWAP + High Vol</p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Bears are in control. Price is failing to reclaim the average weighted price.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Metrics Explanation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Key Metrics</h3>
                        <ul className="space-y-4">
                            <li className="flex items-start space-x-3">
                                <div className="mt-1 min-w-[4px] h-4 bg-blue-500 rounded-full"></div>
                                <div>
                                    <span className="block font-bold text-slate-200 text-sm">RSI (Relative Strength Index)</span>
                                    <span className="text-xs text-slate-400">Momentum oscillator measuring speed and change of price movements. Range 0-100.</span>
                                </div>
                            </li>
                            <li className="flex items-start space-x-3">
                                <div className="mt-1 min-w-[4px] h-4 bg-amber-500 rounded-full"></div>
                                <div>
                                    <span className="block font-bold text-slate-200 text-sm">RVOL (Relative Volume)</span>
                                    <span className="text-xs text-slate-400">Ratio of current volume to average volume. RVOL &gt; 1 indicates higher than normal activity.</span>
                                </div>
                            </li>
                            <li className="flex items-start space-x-3">
                                <div className="mt-1 min-w-[4px] h-4 bg-purple-500 rounded-full"></div>
                                <div>
                                    <span className="block font-bold text-slate-200 text-sm">VWAP (Volume Weighted Avg Price)</span>
                                    <span className="text-xs text-slate-400">The average price a security has traded at throughout the day, based on both volume and price.</span>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="bg-[#131b2e] border border-slate-800 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Reading the Tape</h3>
                        <div className="space-y-4">
                            <div className="p-3 bg-black/30 rounded border border-slate-800 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="font-bold text-white">SPY</span>
                                    <span className="text-[10px] text-slate-500 uppercase">S&P 500</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="font-mono text-emerald-300">$450.20</span>
                                    <div className="flex items-center space-x-1">
                                        <span className="text-emerald-400 text-xs">+1.2%</span>
                                        <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1 rounded border border-amber-400/20">2.5x</span>
                                    </div>
                                </div>
                                <div className="bg-rose-500/20 text-rose-400 px-2 py-1 rounded text-[10px] font-bold border border-rose-500/30">
                                    OB
                                </div>
                            </div>
                            <p className="text-xs text-slate-400">
                                The ticker tape shows real-time data. 
                                <br/><br/>
                                1. <strong>Price Color</strong>: Green if Price &gt; VWAP, Red if Price &lt; VWAP.
                                <br/>
                                2. <strong>RVOL Badge</strong>: Appears in amber (e.g., 2.5x) if volume is unusually high.
                                <br/>
                                3. <strong>Status Badge</strong>: Quick indicator of market condition (OB=Overbought, OS=Oversold, Momentum Icons).
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
