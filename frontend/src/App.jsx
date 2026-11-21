import React, { useState, useEffect } from 'react';
import Sidebar, { BottomNav } from './components/Sidebar';
import { NAV, activeFilterCount } from './utils/nav';
import Header from './components/Header';
import Feed from './components/Feed';
import Filters from './components/Filters';
import UniverseGuide from './components/UniverseGuide';
import WeeklyAnalysis from './components/WeeklyAnalysis';
import History from './components/History';
import DailyAnalysis from './components/DailyAnalysis';
import Inspiration from './components/Inspiration';
import Narratives from './components/Narratives';
import Live from './components/Live';
import ForgeFeed from './components/ForgeFeed';
import { SECTOR_ETFS, BENCHMARK } from './utils/constants';

const API_BASE = "";
// Feed page size: ~100 headlines land per day, so a page is several days.
const FEED_PAGE = 500;
// The 5s poll only needs the newest items to merge on top.
const FEED_POLL = 50;

export default function MarketMindDashboard() {
  const [activeTab, setActiveTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return NAV.some(n => n.id === t) ? t : 'feed';
  });
  // Keep ?tab= in the URL so a reload (or a home-screen bookmark) lands on the same tab.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState(null, '', url);
  }, [activeTab]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters. No default priority floor: the feed shows every item until the
  // reader picks a priority tier in the feed toolbar.
  const [minRelevance, setMinRelevance] = useState(0);
  const [minConfidence, setMinConfidence] = useState(0);
  const [minNovelty, setMinNovelty] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedSource, setSelectedSource] = useState("ALL");
  const [selectedSession, setSelectedSession] = useState("ALL");

  const [searchTerm, setSearchTerm] = useState('');
  const [lastConnection, setLastConnection] = useState("Connecting...");

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Debounced Search. The mount effect below does the first load; after that a
  // search change (including clearing it) replaces the feed with a fresh page.
  const searchMounted = React.useRef(false);
  useEffect(() => {
    if (!searchMounted.current) { searchMounted.current = true; return; }
    const delayDebounceFn = setTimeout(() => {
      fetchData(searchTerm, FEED_PAGE, true);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]); // Removed fetchData from dependency to avoid loop

  const fetchData = async (searchQuery = searchTerm, limit = FEED_PAGE, replace = false) => {
    try {
      let url = `${API_BASE}/api/feed?limit=${limit}`;
      if (searchQuery) {
          url += `&search_term=${encodeURIComponent(searchQuery)}`;
      }
      
      const feedRes = await fetch(url);
      if (feedRes.ok) {
        const newUpdates = await feedRes.json();
        // When searching, we want to Replace the feed, not append, usually.
        // But for "live" updates it complicates things. 
        // Simple approach: If searching, REPLACE. If empty search, reset/append.
        
        if (searchQuery || replace) {
            setUpdates(newUpdates);
            setHasMore(newUpdates.length >= limit);
        } else {
            setUpdates(prev => {
              // Standard merge logic
              const existingIds = new Set(prev.map(u => u.id));
              const uniqueNew = newUpdates.filter(u => !existingIds.has(u.id));
              if (prev.length === 0) return newUpdates;
              return [...uniqueNew, ...prev].sort((a, b) => b.id - a.id);
            });
        }
      }
      
      // Only fetch signals once or on interval, maybe not on every search keystroke
      if (!searchQuery) {
          const sigRes = await fetch(`${API_BASE}/api/signals`);
          if (sigRes.ok) setSignals(await sigRes.json());
          setLastConnection(new Date().toLocaleTimeString('en-GB'));
      }
      setLoading(false);
    } catch (err) {
      console.error("API Error:", err);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || updates.length === 0) return;
    
    setLoadingMore(true);
    try {
      const lastItem = updates[updates.length - 1];
      let url = `${API_BASE}/api/feed?limit=${FEED_PAGE}&before_id=${lastItem.id}&before_time=${encodeURIComponent(lastItem.date)}`;
      if (searchTerm) {
          url += `&search_term=${encodeURIComponent(searchTerm)}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const olderUpdates = await res.json();
        if (olderUpdates.length === 0) {
          setHasMore(false);
        } else {
          setUpdates(prev => {
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

  // Keep track of search term accessibly for the interval
  const searchTermRef = React.useRef(searchTerm);
  useEffect(() => {
      searchTermRef.current = searchTerm;
  }, [searchTerm]);

  useEffect(() => {
    // Initial fetch
    fetchData();
    // Poll only if no search term (optional, or poll with search term)
    const interval = setInterval(() => {
        // Now checks the LIVE value of search term via ref
        if (!searchTermRef.current) fetchData('', FEED_POLL);
    }, 5000);
    return () => clearInterval(interval);
  }, []); // Empty dependency to run once on mount

  const resetFilters = () => {
    setMinRelevance(0);
    setMinConfidence(0);
    setMinNovelty(0);
    setSelectedCategory("ALL");
    setSelectedSource("ALL");
    setSelectedSession("ALL");
    setSearchTerm(""); // This triggers useEffect -> fetchData('')
  };

  const availableCategories = ["ALL", ...new Set(updates.flatMap(u => u.tags || []))].filter(Boolean);
  const availableSources = ["ALL", ...new Set(updates.map(u => u.source))].filter(Boolean);
  const availableSessions = ["ALL", ...new Set(updates.map(u => u.ml_context?.session))].filter(Boolean);

  const filteredUpdates = updates.filter(item => {
    // Search is now Server-Side! 
    // We can still keep client-side check for immediate feedback or highlighting, 
    // but the data in 'updates' is already filtered by the API if searchTerm is present.
    
    const matchesScore = (item.relevanceScore || 0) >= minRelevance;
    const matchesConfidence = (item.ml_context?.confidence || 0) >= minConfidence;
    const matchesNovelty = (item.novelty_score || 0) >= minNovelty;
    const matchesCategory = selectedCategory === "ALL" || (item.tags && item.tags.includes(selectedCategory));
    const matchesSource = selectedSource === "ALL" || item.source === selectedSource;
    const matchesSession = selectedSession === "ALL" || item.ml_context?.session === selectedSession;
    return matchesScore && matchesConfidence && matchesNovelty && matchesCategory && matchesSource && matchesSession;
  });

  const marqueeDuration = Math.max(60, signals.length * 5);

  // SPY change is the benchmark sectors are read against.
  const spyChange = signals.find(s => s.ticker === BENCHMARK)?.daily_change ?? 0;

  // Sort leaders -> laggards so the tape flows strong -> weak even while
  // scrolling. Sectors rank by relative strength vs SPY; the rest by absolute.
  const leadKey = (s) => (SECTOR_ETFS.has(s.ticker)
    ? (s.daily_change ?? 0) - spyChange
    : (s.daily_change ?? 0));
  const sortedSignals = [...signals].sort((a, b) => leadKey(b) - leadKey(a));

  // REPEAT 4x to ensure smooth loop even on 4K/Ultrawide screens
  const marqueeSignals = [...sortedSignals, ...sortedSignals, ...sortedSignals, ...sortedSignals];

  const filterProps = {
    resetFilters, minRelevance, setMinRelevance, minConfidence, setMinConfidence,
    minNovelty, setMinNovelty, selectedSession, setSelectedSession, availableSessions,
    selectedSource, setSelectedSource, availableSources, selectedCategory,
    setSelectedCategory, availableCategories, updates, filteredUpdates,
  };

  // Mobile first: header + content + bottom tab bar in one column. From lg up a
  // fixed left rail replaces the bottom bar. Feed filters open as a sheet.
  return (
    <div className="flex h-[100dvh] w-full bg-[#0B0F19] text-slate-200 font-sans overflow-hidden text-base">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header
          activeTab={activeTab}
          loading={loading}
          lastConnection={lastConnection}
          signals={signals}
          marqueeDuration={marqueeDuration}
          marqueeSignals={marqueeSignals}
          spyChange={spyChange}
        />

        <main className="flex-1 flex flex-col min-h-0 relative bg-[#0B0F19]">
        {activeTab === 'live' ? (
             <Live />
        ) : activeTab === 'forge' ? (
             <ForgeFeed />
        ) : activeTab === 'guide' ? (
             <UniverseGuide />
        ) : activeTab === 'narratives' ? (
            <Narratives />
        ) : activeTab === 'weekly' ? (
            <WeeklyAnalysis />
        ) : activeTab === 'history' ? (
            <History />
        ) : activeTab === 'daily' ? (
            <DailyAnalysis />
        ) : activeTab === 'inspiration' ? (
            <Inspiration />
        ) : (
            <Feed
              setActiveTab={setActiveTab}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              updates={updates}
              filteredUpdates={filteredUpdates}
              loadMore={loadMore}
              hasMore={hasMore}
              loadingMore={loadingMore}
              minRelevance={minRelevance}
              setMinRelevance={setMinRelevance}
              filterCount={activeFilterCount(filterProps)}
              openFilters={() => setFiltersOpen(true)}
            />
        )}
        </main>

        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      <Filters open={filtersOpen} onClose={() => setFiltersOpen(false)} {...filterProps} />
    </div>
  );
}
