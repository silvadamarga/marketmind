import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Feed from './components/Feed';
import Filters from './components/Filters';
import UniverseGuide from './components/UniverseGuide';
import WeeklyAnalysis from './components/WeeklyAnalysis';
import DailyAnalysis from './components/DailyAnalysis';

const API_BASE = "";

export default function MarketMindDashboard() {
  const [activeTab, setActiveTab] = useState('feed');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [minRelevance, setMinRelevance] = useState(0);
  const [minConfidence, setMinConfidence] = useState(0);
  const [minNovelty, setMinNovelty] = useState(0);
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

  const fetchData = React.useCallback(async () => {
    try {
      const feedRes = await fetch(`${API_BASE}/api/feed`);
      if (feedRes.ok) {
        const newUpdates = await feedRes.json();
        setUpdates(prev => {
          const existingIds = new Set(prev.map(u => u.id));
          const uniqueNew = newUpdates.filter(u => !existingIds.has(u.id));
          // If we have no previous updates, just set the new ones
          if (prev.length === 0) return newUpdates;
          // Otherwise prepend new ones and keep the rest
          // We re-sort just in case, though usually prepending is enough if newUpdates are sorted
          return [...uniqueNew, ...prev].sort((a, b) => b.id - a.id);
        });
      }
      const sigRes = await fetch(`${API_BASE}/api/signals`);
      if (sigRes.ok) setSignals(await sigRes.json());
      setLastConnection(new Date().toLocaleTimeString());
      setLoading(false);
    } catch (err) {
      console.error("API Error:", err);
    }
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore || updates.length === 0) return;
    
    setLoadingMore(true);
    try {
      const lastId = updates[updates.length - 1].id;
      const res = await fetch(`${API_BASE}/api/feed?before_id=${lastId}`);
      if (res.ok) {
        const olderUpdates = await res.json();
        if (olderUpdates.length === 0) {
          setHasMore(false);
        } else {
          setUpdates(prev => {
             // Append older updates
             // Filter duplicates just in case
             const existingIds = new Set(prev.map(u => u.id));
             const uniqueOlder = olderUpdates.filter(u => !existingIds.has(u.id));
             return [...prev, ...uniqueOlder].sort((a, b) => b.id - a.id);
          });
        }
      }
    } catch (err) {
      console.error("Load More Error:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
    setMinNovelty(0);
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
    const matchesNovelty = (item.novelty_score || 0) >= minNovelty;
    const matchesCategory = selectedCategory === "ALL" || (item.tags && item.tags.includes(selectedCategory));
    const matchesSentiment = selectedSentiment === "ALL" || item.sentiment === selectedSentiment;
    const matchesSource = selectedSource === "ALL" || item.source === selectedSource;
    const matchesSession = selectedSession === "ALL" || item.ml_context?.session === selectedSession;
    return matchesSearch && matchesScore && matchesConfidence && matchesNovelty && matchesCategory && matchesSentiment && matchesSource && matchesSession;
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
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          loading={loading} 
          lastConnection={lastConnection}
          mobile={true}
          onClose={() => setMobileMenuOpen(false)}
        />
      </aside>

      <div className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity ${mobileConfigOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setMobileConfigOpen(false)} />
      <aside className={`fixed inset-y-0 right-0 w-80 bg-[#0f1422] border-l border-slate-800 z-50 transform transition-transform duration-300 lg:hidden ${mobileConfigOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between">
          <h2 className="text-white text-lg font-bold">Filters</h2>
          <button onClick={() => setMobileConfigOpen(false)}><X size={24} /></button>
        </div>
        <Filters
          resetFilters={resetFilters}
          selectedSentiment={selectedSentiment}
          setSelectedSentiment={setSelectedSentiment}
          minRelevance={minRelevance}
          setMinRelevance={setMinRelevance}
          minConfidence={minConfidence}
          setMinConfidence={setMinConfidence}
          minNovelty={minNovelty}
          setMinNovelty={setMinNovelty}
          selectedSession={selectedSession}
          setSelectedSession={setSelectedSession}
          availableSessions={availableSessions}
          selectedSource={selectedSource}
          setSelectedSource={setSelectedSource}
          availableSources={availableSources}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          availableCategories={availableCategories}
          updates={updates}
          filteredUpdates={filteredUpdates}
          mobile={true}
        />
      </aside>

      {/* --- DESKTOP LEFT SIDEBAR --- */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        leftOpen={leftOpen}
        loading={loading}
        lastConnection={lastConnection}
      />

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-[#0B0F19]">

        {/* Header */}
        <Header
          activeTab={activeTab}
          setMobileMenuOpen={setMobileMenuOpen}
          leftOpen={leftOpen}
          setLeftOpen={setLeftOpen}
          rightOpen={rightOpen}
          setRightOpen={setRightOpen}
          setMobileConfigOpen={setMobileConfigOpen}
          handleExport={handleExport}
          signals={signals}
          marqueeDuration={marqueeDuration}
          marqueeSignals={marqueeSignals}
        />

        {/* Content Body */}
        {activeTab === 'guide' ? (
             <UniverseGuide />
        ) : activeTab === 'weekly' ? (
            <WeeklyAnalysis />
        ) : activeTab === 'daily' ? (
            <DailyAnalysis />
        ) : (
            <Feed
              activeTab={activeTab}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              handleScan={handleScan}
              scanning={scanning}
              filteredUpdates={filteredUpdates}
              signals={signals}
              loadMore={loadMore}
              hasMore={hasMore}
              loadingMore={loadingMore}
            />
        )}
      </main>

      {/* --- DESKTOP RIGHT SIDEBAR --- */}
      <Filters
        rightOpen={rightOpen}
        resetFilters={resetFilters}
        selectedSentiment={selectedSentiment}
        setSelectedSentiment={setSelectedSentiment}
        minRelevance={minRelevance}
        setMinRelevance={setMinRelevance}
        minConfidence={minConfidence}
        setMinConfidence={setMinConfidence}
        minNovelty={minNovelty}
        setMinNovelty={setMinNovelty}
        selectedSession={selectedSession}
        setSelectedSession={setSelectedSession}
        availableSessions={availableSessions}
        selectedSource={selectedSource}
        setSelectedSource={setSelectedSource}
        availableSources={availableSources}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        availableCategories={availableCategories}
        updates={updates}
        filteredUpdates={filteredUpdates}
      />

    </div>
  );
}