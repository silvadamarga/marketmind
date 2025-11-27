import React, { useState, useEffect } from 'react';
import { 
  Radio, Activity, Filter, Settings, ShieldCheck, 
  ExternalLink, Zap, Bell, Search, CheckCircle2, Cpu,
  Clock, Tag, TrendingUp, BrainCircuit, BarChart,
  Menu, X, SlidersHorizontal, RotateCcw,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  ChevronDown
} from 'lucide-react';

const API_BASE = ""; 

// --- HELPER FUNCTIONS ---

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

// --- HELPER COMPONENTS ---

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-lg transition-all duration-200 ${
      active ? 'bg-indigo-500/10 text-indigo-400 border-r-2 border-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium text-sm whitespace-nowrap">{label}</span>
  </button>
);

const AIBadge = ({ icon: Icon, label, value, colorClass }) => (
  <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border bg-opacity-10 ${colorClass}`}>
    <Icon size={14} />
    <div className="flex flex-col leading-none">
      <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider">{label}</span>
      <span className="text-xs font-mono font-bold">{value}</span>
    </div>
  </div>
);

const ImpactTag = ({ impact }) => {
  const styles = {
    CRITICAL: "bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]",
    HIGH: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    MEDIUM: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    LOW: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-md border font-medium tracking-wide ${styles[impact] || styles.LOW}`}>
      {impact}
    </span>
  );
};

const FilterGroup = ({ label, children }) => (
  <div className="bg-slate-800/20 border border-slate-800/50 rounded-lg p-3 space-y-3">
    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
      {label}
      <ChevronDown size={12} className="opacity-50" />
    </h3>
    {children}
  </div>
);

export default function MarketMindDashboard() {
  const [activeTab, setActiveTab] = useState('feed');
  const [updates, setUpdates] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [minRelevance, setMinRelevance] = useState(0);
  const [minConfidence, setMinConfidence] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedSentiment, setSelectedSentiment] = useState("ALL");
  const [selectedSource, setSelectedSource] = useState("ALL");
  const [selectedSession, setSelectedSession] = useState("ALL");
  
  const [searchTerm, setSearchTerm] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastConnection, setLastConnection] = useState("Connecting...");
  
  // Layout
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);  
  const [rightOpen, setRightOpen] = useState(true); 

  const fetchData = async () => {
    try {
      const feedRes = await fetch(`${API_BASE}/api/feed`);
      if (feedRes.ok) setUpdates(await feedRes.json());
      const sigRes = await fetch(`${API_BASE}/api/signals`);
      if (sigRes.ok) setSignals(await sigRes.json());
      setLastConnection(new Date().toLocaleTimeString());
      setLoading(false);
    } catch (err) {
      console.error("API Error:", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); 
    return () => clearInterval(interval);
  }, []);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => { fetchData(); setScanning(false); }, 1000);
  };

  const handleExport = () => {
    window.location.href = `${API_BASE}/api/export`;
  };

  const resetFilters = () => {
    setMinRelevance(0);
    setMinConfidence(0);
    setSelectedCategory("ALL");
    setSelectedSentiment("ALL");
    setSelectedSource("ALL");
    setSelectedSession("ALL");
    setSearchTerm("");
  };

  const availableCategories = ["ALL", ...new Set(updates.flatMap(u => u.tags || []))].filter(Boolean);
  const availableSources = ["ALL", ...new Set(updates.map(u => u.source))].filter(Boolean);
  const availableSessions = ["ALL", ...new Set(updates.map(u => u.ml_context?.session))].filter(Boolean);

  const filteredUpdates = updates.filter(item => {
    const matchesSearch = item.headline?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (item.summary && item.summary.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesScore = (item.relevanceScore || 0) >= minRelevance;
    const matchesConfidence = (item.ml_context?.confidence || 0) >= minConfidence;
    const matchesCategory = selectedCategory === "ALL" || (item.tags && item.tags.includes(selectedCategory));
    const matchesSentiment = selectedSentiment === "ALL" || item.sentiment === selectedSentiment;
    const matchesSource = selectedSource === "ALL" || item.source === selectedSource;
    const matchesSession = selectedSession === "ALL" || item.ml_context?.session === selectedSession;
    return matchesSearch && matchesScore && matchesConfidence && matchesCategory && matchesSentiment && matchesSource && matchesSession;
  });

  const marqueeDuration = Math.max(60, signals.length * 5); 
  
  // REPEAT 4x to ensure smooth loop even on 4K/Ultrawide screens
  const marqueeSignals = [...signals, ...signals, ...signals, ...signals];

  return (
    <div className="flex h-screen w-full bg-[#0B0F19] text-slate-200 font-sans overflow-hidden text-base">
      
      {/* --- MOBILE OVERLAYS --- */}
      <div className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity ${mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setMobileMenuOpen(false)} />
      <aside className={`fixed inset-y-0 left-0 w-72 bg-[#0f1422] border-r border-slate-800 z-50 transform transition-transform duration-300 lg:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between">
          <span className="text-xl font-bold text-white">MarketMind</span>
          <button onClick={() => setMobileMenuOpen(false)}><X size={24} /></button>
        </div>
        <nav className="px-4 space-y-2">
          <SidebarItem icon={Radio} label="Feed" active={activeTab === 'feed'} onClick={() => {setActiveTab('feed'); setMobileMenuOpen(false);}} />
          <SidebarItem icon={ShieldCheck} label="Sources" active={activeTab === 'sources'} onClick={() => {setActiveTab('sources'); setMobileMenuOpen(false);}} />
        </nav>
      </aside>

      <div className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity ${mobileConfigOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setMobileConfigOpen(false)} />
      <aside className={`fixed inset-y-0 right-0 w-80 bg-[#0f1422] border-l border-slate-800 z-50 transform transition-transform duration-300 lg:hidden ${mobileConfigOpen ? 'translate-x-0' : 'translate-x-full'}`}>
         <div className="p-6"><h2 className="text-white text-lg font-bold">Filters</h2></div>
      </aside>

      {/* --- DESKTOP LEFT SIDEBAR --- */}
      <aside className={`hidden lg:flex flex-col border-r border-slate-800 bg-[#0f1422] transition-all duration-300 ${leftOpen ? 'w-72' : 'w-0 overflow-hidden opacity-0'}`}>
        <div className="p-6 flex items-center space-x-3 whitespace-nowrap overflow-hidden">
          <Activity className="text-indigo-400 shrink-0" size={28} />
          <span className="text-xl font-bold tracking-tight text-white">Market<span className="text-indigo-400">Mind</span></span>
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-hidden">
          <SidebarItem icon={Radio} label="Live Intelligence" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
          <SidebarItem icon={ShieldCheck} label="Verified Sources" active={activeTab === 'sources'} onClick={() => setActiveTab('sources')} />
          <SidebarItem icon={Settings} label="System Config" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>
        <div className="p-6 border-t border-slate-800 whitespace-nowrap overflow-hidden">
          <div className="bg-slate-800/50 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400 font-medium">SYSTEM HEARTBEAT</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${loading ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{loading ? 'SYNCING' : 'ONLINE'}</span>
            </div>
            <div className="text-xs text-slate-500 text-right">{lastConnection}</div>
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-[#0B0F19]">
        
        {/* Header */}
        <header className="flex flex-col border-b border-slate-800 bg-[#0f1422]/50 backdrop-blur-md w-full z-30 sticky top-0">
            <div className="h-16 flex items-center justify-between px-4 sm:px-8 border-b border-slate-800/50 w-full">
                <div className="flex items-center space-x-4">
                    <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-white"><Menu size={24} /></button>
                    <button onClick={() => setLeftOpen(!leftOpen)} className="hidden lg:block p-2 text-slate-400 hover:text-white transition-colors">
                      {leftOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
                    </button>
                    <h1 className="text-xl sm:text-2xl font-semibold text-white truncate">
                      {activeTab === 'feed' ? 'Intelligence Feed' : 'Configuration'}
                    </h1>
                </div>
                
                <div className="flex items-center space-x-4">
                    <button onClick={handleExport} className="hidden sm:flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-indigo-500/20">
                        <ExternalLink size={16} />
                        <span>Export</span>
                    </button>
                    
                    <button onClick={() => setRightOpen(!rightOpen)} className="hidden lg:block p-2 text-slate-400 hover:text-white transition-colors">
                      {rightOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
                    </button>
                    <button onClick={() => setMobileConfigOpen(true)} className="lg:hidden p-2 text-slate-400"><SlidersHorizontal size={24} /></button>
                </div>
            </div>

            {/* Ticker Tape */}
            <div className="h-12 bg-[#0f1422] flex items-center px-4 overflow-hidden whitespace-nowrap border-t border-slate-800 w-full group">
                {signals.length === 0 ? (
                    <div className="w-full flex justify-center"><span className="text-sm text-slate-500 animate-pulse">Initializing Neural Engine...</span></div>
                ) : (
                    <div className="flex items-center space-x-12 animate-marquee group-hover:paused" style={{ animationDuration: `${marqueeDuration}s` }}>
                        {marqueeSignals.map((sig, idx) => (
                            <div key={`${sig.ticker}-${idx}`} className="flex items-center space-x-4 text-sm border-r border-slate-800 pr-8 last:border-0 shrink-0">
                                <span className="font-bold text-slate-200">{sig.name}</span>
                                <span className={`${sig.price > sig.vwap ? 'text-green-400' : 'text-red-400'} font-mono`}>${sig.price}</span>
                                <span className={`${sig.daily_change >= 0 ? 'text-green-500' : 'text-red-500'} font-mono text-xs`}>
                                  {sig.daily_change > 0 ? '+' : ''}{sig.daily_change}%
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex min-w-0 relative">
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent min-w-0">
            {activeTab === 'feed' && (
              <div className="max-w-7xl mx-auto space-y-6"> 
                
                {/* Search Bar */}
                <div className="flex items-center space-x-4 mb-8">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input 
                      type="text" placeholder="Search dataset..." value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600 text-base"
                    />
                  </div>
                  <button onClick={handleScan} disabled={scanning} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 text-base font-medium flex items-center space-x-2 transition-all">
                    <Zap size={18} className={scanning ? "text-yellow-400 animate-spin" : "text-yellow-400"} />
                    <span className="hidden sm:inline">{scanning ? 'Syncing...' : 'Force Sync'}</span>
                  </button>
                </div>

                {filteredUpdates.length === 0 ? (
                  <div className="text-center py-32 opacity-50">
                    <Filter size={64} className="mx-auto mb-6 text-slate-600" />
                    <p className="text-xl text-slate-400">No updates matched your filters.</p>
                  </div>
                ) : (
                  filteredUpdates.map((update) => {
                    const isNoise = (update.relevanceScore || 0) < 3;
                    const { session, confidence } = update.ml_context || {};

                    // Impact Styling for Badge (Footer)
                    let impactColor = "text-slate-400 border-slate-500/30 bg-slate-500/10";
                    if (update.impact === "CRITICAL") impactColor = "text-red-400 border-red-500/30 bg-red-500/10";
                    else if (update.impact === "HIGH") impactColor = "text-amber-400 border-amber-500/30 bg-amber-500/10";
                    else if (update.impact === "MEDIUM") impactColor = "text-blue-400 border-blue-500/30 bg-blue-500/10";

                    return (
                      <div key={update.id} className={`bg-[#131b2e] border border-slate-800 rounded-2xl p-6 transition-all duration-300 ${isNoise ? 'opacity-60 grayscale' : ''}`}>
                        
                        {/* --- HEADER --- */}
                        <div className="mb-3">
                          <div className="flex items-center space-x-3 mb-2 opacity-75">
                            <span className="text-xs font-bold tracking-wider uppercase text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
                              {update.source || "UNKNOWN"}
                            </span>
                            {update.source_pkg && (
                                <span className="text-[10px] text-slate-500 font-mono hidden group-hover:inline">
                                    {update.source_pkg.split('.').pop()}
                                </span>
                            )}
                            <span className="text-slate-500 text-xs">• {formatTimeAgo(update.date)}</span>
                          </div>
                          
                          <h3 className="text-lg sm:text-xl font-medium text-slate-100 leading-snug">
                            {update.title || update.headline}
                          </h3>
                        </div>
                        
                        {/* --- BODY (QUOTE) --- */}
                        <div className="relative pl-4 mb-5 border-l-4 border-indigo-500/30">
                          <p className="text-slate-300 text-sm sm:text-base italic leading-relaxed">
                            {update.summary}
                          </p>
                        </div>
                        
                        {/* --- TAGS ROW --- */}
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          {/* 1. Tickers */}
                          {update.tags && update.tags.map((tag, i) => {
                             const isTicker = tag === tag.toUpperCase() && tag.length < 6 && !tag.includes('_');
                             return (
                              <span key={i} className={`text-xs px-2.5 py-1 rounded-md border flex items-center space-x-1.5 ${
                                isTicker 
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 font-bold' 
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                              }`}>
                                {isTicker && <TrendingUp size={12} />}
                                <span>{tag}</span>
                              </span>
                             );
                          })}
                          
                          {/* 2. Sentiment */}
                          <span className={`text-xs px-2.5 py-1 rounded-md border font-medium ${
                              update.sentiment === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 
                              update.sentiment === 'BEARISH' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 
                              'bg-slate-800 border-slate-700 text-slate-400'
                          }`}>
                              {update.sentiment}
                          </span>
                          
                          {/* 3. Impact Label (Next to Sentiment) */}
                          <ImpactTag impact={update.impact} />

                          {/* 4. Session (Now treated as a tag) */}
                          {session && (
                             <span className="text-xs px-2.5 py-1 rounded-md border border-slate-700 text-slate-400 bg-slate-800 flex items-center gap-1.5">
                                <Clock size={12} />
                                {session}
                             </span>
                          )}
                        </div>

                        {/* --- RATINGS ROW (Under Tags) --- */}
                        <div className="flex items-center gap-3">
                           <AIBadge 
                             icon={BarChart} 
                             label="Impact" 
                             value={`${update.relevanceScore}/10`} 
                             colorClass={impactColor}
                           />
                           <AIBadge 
                             icon={BrainCircuit} 
                             label="Confidence" 
                             value={confidence ? `${confidence}/10` : "-"} 
                             colorClass="bg-blue-500/10 text-blue-400 border-blue-500/30"
                           />
                        </div>

                      </div>
                    );
                  })
                )}
              </div>
            )}
            
            {activeTab === 'sources' && (
              <div className="max-w-3xl mx-auto space-y-4">
                 <h2 className="text-2xl font-bold mb-6">Active Monitors</h2>
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
      </main>

      {/* --- DESKTOP RIGHT SIDEBAR --- */}
      <aside className={`hidden lg:flex flex-col border-l border-slate-800 bg-[#0f1422] transition-all duration-300 ${rightOpen ? 'w-80' : 'w-0 overflow-hidden opacity-0'}`}>
        <div className="p-6 flex items-center justify-between whitespace-nowrap overflow-hidden">
          <h2 className="text-base font-bold text-slate-400 uppercase tracking-wider">Dataset Controls</h2>
          <button onClick={resetFilters} title="Reset" className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 transition-colors"><RotateCcw size={16} /></button>
        </div>
        
        <div className="p-6 pt-0 flex-1 flex flex-col space-y-6 overflow-y-auto whitespace-nowrap overflow-hidden">
          
          <FilterGroup label="Sentiment">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'BULLISH', label: 'Bull', color: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10' },
                { id: 'NEUTRAL', label: 'Neut', color: 'text-slate-400 border-slate-600 bg-slate-700/30' },
                { id: 'BEARISH', label: 'Bear', color: 'text-red-400 border-red-500/50 bg-red-500/10' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedSentiment(selectedSentiment === opt.id ? 'ALL' : opt.id)}
                  className={`text-xs py-2 rounded border transition-all ${
                    selectedSentiment === opt.id 
                    ? `${opt.color} font-bold ring-1 ring-inset` 
                    : 'border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup label="Quality Thresholds">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-400">Impact Score</label>
                  <span className="text-xs font-mono text-indigo-400">≥ {minRelevance}/10</span>
                </div>
                <input type="range" min="0" max="10" value={minRelevance} onChange={(e) => setMinRelevance(Number(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-400">AI Confidence</label>
                  <span className="text-xs font-mono text-blue-400">≥ {minConfidence}/10</span>
                </div>
                <input type="range" min="0" max="10" value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              </div>
            </div>
          </FilterGroup>

          <FilterGroup label="Context">
             <div className="space-y-3">
               <div>
                 <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Session</label>
                 <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-2.5 outline-none focus:border-indigo-500">
                   <option value="ALL">All Sessions</option>
                   {availableSessions.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
               </div>
               <div>
                 <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Source</label>
                 <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-2.5 outline-none focus:border-indigo-500">
                   <option value="ALL">All Sources</option>
                   {availableSources.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
               </div>
             </div>
          </FilterGroup>

          <FilterGroup label="Categories">
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? "ALL" : cat)}
                  className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${
                    selectedCategory === cat 
                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' 
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </FilterGroup>

          <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-800 mt-auto">
             <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Dataset Stats</h3>
             <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center"><span className="text-slate-400">Total Rows</span><span className="text-slate-200 font-mono">{updates.length}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-400">Visible</span><span className="text-indigo-400 font-mono">{filteredUpdates.length}</span></div>
             </div>
          </div>
        </div>
      </aside>

    </div>
  );
}