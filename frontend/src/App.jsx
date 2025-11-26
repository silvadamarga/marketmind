import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Activity, 
  Filter, 
  Settings, 
  ShieldCheck, 
  ExternalLink, 
  Zap, 
  Bell, 
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Cpu,
  X
} from 'lucide-react';

// --- CONFIGURATION ---
// In production (with Nginx), leave this empty to use relative paths.
// In local dev (without Nginx), change to 'http://localhost:8000'.
const API_BASE = ""; 

// --- HELPER COMPONENTS ---

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      active ? 'bg-indigo-500/10 text-indigo-400 border-r-2 border-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium text-sm">{label}</span>
  </button>
);

const ImpactBadge = ({ impact }) => {
  const styles = {
    CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
    HIGH: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    MEDIUM: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    LOW: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[impact] || styles.LOW}`}>
      {impact}
    </span>
  );
};

const RelevanceMeter = ({ score }) => {
  // Color gradient based on score
  let color = "bg-slate-600";
  if (score > 80) color = "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]";
  else if (score > 50) color = "bg-amber-500";
  else color = "bg-red-500";

  return (
    <div className="flex items-center space-x-2 group relative">
      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-500`} 
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-bold ${score > 80 ? 'text-emerald-400' : score > 50 ? 'text-amber-400' : 'text-red-400'}`}>
        {score}%
      </span>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 border border-slate-700 p-2 rounded text-xs text-slate-300 z-10 shadow-xl">
        AI Signal Confidence.
      </div>
    </div>
  );
};

// --- MAIN DASHBOARD COMPONENT ---

export default function MarketMindDashboard() {
  const [activeTab, setActiveTab] = useState('feed');
  const [updates, setUpdates] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [minRelevance, setMinRelevance] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastConnection, setLastConnection] = useState("Connecting...");

  // --- DATA FETCHING ---
  const fetchData = async () => {
    try {
      // 1. Fetch News Feed
      const feedRes = await fetch(`${API_BASE}/api/feed`);
      if (feedRes.ok) {
        const feedData = await feedRes.json();
        setUpdates(feedData);
      }

      // 2. Fetch Technical Signals
      const sigRes = await fetch(`${API_BASE}/api/signals`);
      if (sigRes.ok) {
        const sigData = await sigRes.json();
        setSignals(sigData);
      }
      
      setLastConnection(new Date().toLocaleTimeString());
      setLoading(false);
    } catch (err) {
      console.error("API Error:", err);
      // Optional: set error state here to show UI feedback
    }
  };

  // Initial Load + Polling
  useEffect(() => {
    fetchData();
    // Poll every 5 seconds
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, []);

  const handleScan = () => {
    setScanning(true);
    // Simulate manual refresh visually before actual fetch
    setTimeout(() => {
        fetchData();
        setScanning(false);
    }, 1000);
  };

  // --- FILTERING LOGIC ---
  const filteredUpdates = updates.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (item.summary && item.summary.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesScore = (item.relevanceScore || 0) >= minRelevance;
    return matchesSearch && matchesScore;
  });

  return (
    <div className="flex h-screen w-full bg-[#0B0F19] text-slate-200 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 flex flex-col bg-[#0f1422]">
        <div className="p-6 flex items-center space-x-2">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 blur-sm opacity-50 animate-pulse"></div>
            <Activity className="text-indigo-400 relative z-10" size={24} />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">Market<span className="text-indigo-400">Mind</span></span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <SidebarItem 
            icon={Radio} 
            label="Live Intelligence" 
            active={activeTab === 'feed'} 
            onClick={() => setActiveTab('feed')} 
          />
          <SidebarItem 
            icon={ShieldCheck} 
            label="Verified Sources" 
            active={activeTab === 'sources'} 
            onClick={() => setActiveTab('sources')} 
          />
          <SidebarItem 
            icon={Settings} 
            label="System Config" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400 font-medium">SYSTEM HEARTBEAT</span>
              <div className="flex items-center space-x-1">
                <span className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                <span className="text-xs text-emerald-400">{loading ? 'SYNCING' : 'ONLINE'}</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 flex justify-between">
              <span>Last Sync:</span>
              <span>{lastConnection}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative">
        
        {/* Header with Live Ticker */}
        <header className="flex flex-col border-b border-slate-800 bg-[#0B0F19]">
            <div className="h-14 flex items-center justify-between px-8 border-b border-slate-800/50">
                <div className="flex items-center space-x-4">
                    <h1 className="text-xl font-semibold text-white">
                    {activeTab === 'feed' ? 'Intelligence Feed' : activeTab === 'sources' ? 'Source Management' : 'Configuration'}
                    </h1>
                    {activeTab === 'feed' && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">
                            {filteredUpdates.length} Updates Live
                        </span>
                    )}
                </div>
                
                <div className="flex items-center space-x-4">
                    <button 
                        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                        className={`p-2 rounded-full transition-colors ${notificationsEnabled ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Bell size={20} />
                    </button>
                    <div className="h-8 w-px bg-slate-800 mx-2"></div>
                    <button className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-all shadow-lg shadow-indigo-500/20">
                        <ExternalLink size={14} />
                        <span>Export Report</span>
                    </button>
                </div>
            </div>

            {/* LIVE TICKER BAR */}
            <div className="h-10 bg-[#0f1422] flex items-center px-4 overflow-hidden whitespace-nowrap">
                <div className="flex items-center space-x-6 animate-marquee">
                    {signals.length === 0 ? (
                         <span className="text-xs text-slate-500">Waiting for VWAP Data...</span>
                    ) : (
                        signals.map((sig, idx) => (
                            <div key={`${sig.ticker}-${idx}`} className="flex items-center space-x-2 text-xs">
                                <span className="font-bold text-indigo-400">{sig.ticker}</span>
                                <span className="text-slate-200">${sig.price}</span>
                                <span className={`px-1 rounded font-bold ${
                                    sig.status === 'OVERBOUGHT' ? 'bg-red-900/50 text-red-400' : 
                                    sig.status === 'OVERSOLD' ? 'bg-green-900/50 text-green-400' : 
                                    'text-slate-600'
                                }`}>
                                    {sig.status}
                                </span>
                                <span className="text-slate-500">RSI {sig.rsi}</span>
                                <span className="text-slate-600">|</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex">
          
          {/* Feed Column */}
          <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            
            {activeTab === 'feed' && (
              <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Search & Status Bar */}
                <div className="flex items-center space-x-4 mb-8">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search updates (e.g., 'NVDA', 'Rate Hike')..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                    />
                  </div>
                  <button 
                    onClick={handleScan}
                    disabled={scanning}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-sm font-medium flex items-center space-x-2 transition-all"
                  >
                    <Zap size={16} className={scanning ? "text-yellow-400 animate-spin" : "text-yellow-400"} />
                    <span>{scanning ? 'Syncing...' : 'Force Sync'}</span>
                  </button>
                </div>

                {loading && updates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4">
                     <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                     <p className="text-slate-500">Connecting to Neural Engine...</p>
                  </div>
                ) : filteredUpdates.length === 0 ? (
                  <div className="text-center py-20 opacity-50">
                    <Filter size={48} className="mx-auto mb-4 text-slate-600" />
                    <p className="text-lg text-slate-400">No updates meet your criteria.</p>
                    <p className="text-sm text-slate-600">Try lowering the signal threshold or waiting for news.</p>
                  </div>
                ) : (
                  filteredUpdates.map((update) => {
                    const isNoise = (update.relevanceScore || 0) < 50;
                    
                    return (
                      <div key={update.id} className={`group relative bg-[#131b2e] border border-slate-800 hover:border-indigo-500/30 rounded-xl p-5 transition-all duration-300 ${isNoise ? 'opacity-50 grayscale' : ''}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-lg bg-blue-400/10`}>
                              <Cpu size={18} className="text-blue-400" />
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className={`text-xs font-bold tracking-wider uppercase text-blue-400`}>
                                  {update.source || "UNKNOWN"}
                                </span>
                                <span className="text-slate-600 text-[10px]">• {new Date(update.date).toLocaleTimeString()}</span>
                              </div>
                              <h3 className="text-lg font-medium text-slate-100 group-hover:text-indigo-400 transition-colors">
                                {update.title}
                              </h3>
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <RelevanceMeter score={update.relevanceScore || 0} />
                            <ImpactBadge impact={update.impact || "LOW"} />
                          </div>
                        </div>
                        
                        <p className="text-slate-400 text-sm leading-relaxed mb-4 pl-[52px]">
                          {update.summary}
                        </p>
                        
                        <div className="pl-[52px] flex items-center justify-between">
                          <div className="flex space-x-2">
                            {update.tags && update.tags.map(tag => (
                              <span key={tag} className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                                #{tag}
                              </span>
                            ))}
                            <span className={`text-[10px] px-2 py-1 rounded border ${
                                update.sentiment === 'BULLISH' ? 'border-green-500/30 text-green-400' : 
                                update.sentiment === 'BEARISH' ? 'border-red-500/30 text-red-400' : 
                                'border-slate-500/30 text-slate-400'
                            }`}>
                                {update.sentiment}
                            </span>
                          </div>
                        </div>

                        {/* Noise Overlay Logic */}
                        {isNoise && (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-full flex items-center space-x-2">
                              <span className="text-xs font-medium text-slate-400">Low Signal Event</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'sources' && (
              <div className="max-w-3xl mx-auto">
                 <h2 className="text-xl font-bold mb-6">Monitored Endpoints</h2>
                 <div className="space-y-4">
                    <div className="bg-[#131b2e] border border-slate-800 p-4 rounded-lg flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="p-2 bg-slate-800 rounded text-slate-400">
                             <CheckCircle2 size={20} className="text-emerald-500" />
                          </div>
                          <div>
                            <h3 className="font-medium text-slate-200">Pushbullet Listener</h3>
                            <code className="text-xs text-slate-500">wss://stream.pushbullet.com</code>
                          </div>
                        </div>
                        <div className="flex items-center space-x-6 text-sm text-slate-400">
                          <span>Realtime</span>
                          <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded text-xs">Active</span>
                        </div>
                    </div>
                    
                    <div className="bg-[#131b2e] border border-slate-800 p-4 rounded-lg flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="p-2 bg-slate-800 rounded text-slate-400">
                             <CheckCircle2 size={20} className="text-emerald-500" />
                          </div>
                          <div>
                            <h3 className="font-medium text-slate-200">Yahoo Finance (VWAP)</h3>
                            <code className="text-xs text-slate-500">yfinance API</code>
                          </div>
                        </div>
                        <div className="flex items-center space-x-6 text-sm text-slate-400">
                          <span>5m Interval</span>
                          <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded text-xs">Active</span>
                        </div>
                    </div>
                 </div>
              </div>
            )}
          </div>

          {/* Filters Column (Right Side) */}
          <aside className="w-80 border-l border-slate-800 bg-[#0f1422] p-6 flex flex-col">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">Signal Calibration</h2>
            
            <div className="space-y-8">
              {/* Threshold Slider */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-300">Min. Relevance Score</label>
                  <span className="text-xs font-mono text-indigo-400">{minRelevance}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={minRelevance} 
                  onChange={(e) => setMinRelevance(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <p className="text-xs text-slate-500 leading-tight">
                  Updates scoring below {minRelevance}% will be filtered out as noise.
                </p>
              </div>

              {/* Stats Box */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800 mt-auto">
                 <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase">Session Stats</h3>
                 <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                       <span className="text-slate-400">Total Events</span>
                       <span className="text-slate-200">{updates.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                       <span className="text-slate-400">Filtered Out</span>
                       <span className="text-red-400">{updates.length - filteredUpdates.length}</span>
                    </div>
                 </div>
              </div>

            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}