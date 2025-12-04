import React from 'react';
import { Search, Zap, Filter, CheckCircle2 } from 'lucide-react';
import FeedCard from './FeedCard';

export default function Feed({ activeTab, searchTerm, setSearchTerm, handleScan, scanning, filteredUpdates, signals, loadMore, hasMore, loadingMore }) {
    return (
        <div className="flex-1 overflow-hidden flex min-w-0 relative">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent min-w-0">
                {activeTab === 'feed' && (
                    <div className="max-w-5xl mx-auto space-y-4">

                        {/* Search Bar */}
                        <div className="flex items-center space-x-4 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text" placeholder="Search dataset..." value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600 text-sm"
                                />
                            </div>
                            <button onClick={handleScan} disabled={scanning} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-sm font-medium flex items-center space-x-2 transition-all">
                                <Zap size={16} className={scanning ? "text-yellow-400 animate-spin" : "text-yellow-400"} />
                                <span className="hidden sm:inline">{scanning ? 'Syncing...' : 'Force Sync'}</span>
                            </button>
                        </div>

                        {filteredUpdates.length === 0 ? (
                            <div className="text-center py-32 opacity-50">
                                <Filter size={64} className="mx-auto mb-6 text-slate-600" />
                                <p className="text-xl text-slate-400">No updates matched your filters.</p>
                            </div>
                        ) : (
                            filteredUpdates.map((update) => (
                                <FeedCard 
                                    key={update.id} 
                                    update={update} 
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
                    </div>
                )}

                {activeTab === 'sources' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <h2 className="text-2xl font-bold mb-6">System Status</h2>
                        
                        {/* Universe Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-[#131b2e] border border-slate-800 p-5 rounded-xl">
                                <div className="text-slate-400 text-sm font-medium mb-1">Universe Size</div>
                                <div className="text-3xl font-bold text-white">{signals.length}</div>
                                <div className="text-xs text-slate-500 mt-2">Tracked Assets</div>
                            </div>
                            <div className="bg-[#131b2e] border border-slate-800 p-5 rounded-xl">
                                <div className="text-slate-400 text-sm font-medium mb-1">Data Points</div>
                                <div className="text-3xl font-bold text-white">{signals.length * 5}</div>
                                <div className="text-xs text-slate-500 mt-2">Real-time Metrics</div>
                            </div>
                            <div className="bg-[#131b2e] border border-slate-800 p-5 rounded-xl">
                                <div className="text-slate-400 text-sm font-medium mb-1">Update Rate</div>
                                <div className="text-3xl font-bold text-emerald-400">15m</div>
                                <div className="text-xs text-slate-500 mt-2">Candle Interval</div>
                            </div>
                        </div>

                        <h3 className="text-lg font-bold mt-8 mb-4">Active Connectors</h3>
                        <div className="bg-[#131b2e] border border-slate-800 p-6 rounded-xl flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <div className="p-3 bg-slate-800 rounded-lg text-slate-400"><CheckCircle2 size={24} className="text-emerald-500" /></div>
                                <div><h3 className="font-medium text-slate-200 text-lg">Pushbullet Stream</h3><code className="text-sm text-slate-500">wss://stream.pushbullet.com</code></div>
                            </div>
                            <span className="text-emerald-500 text-sm px-3 py-1 bg-emerald-500/10 rounded-full font-medium">Connected</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
