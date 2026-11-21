import { BookOpen, LayoutGrid, BarChart3, Calendar, Layers, Lightbulb, History, CandlestickChart, Inbox } from 'lucide-react';

// One nav list for both layouts. `primary` tabs sit in the phone's bottom bar;
// the rest live behind "More". The desktop rail shows them all.
export const NAV = [
    { id: 'live', label: 'Live Desk', short: 'Desk', icon: CandlestickChart, primary: true },
    { id: 'forge', label: 'Forge Feed', short: 'Forge', icon: Inbox, primary: true },
    { id: 'feed', label: 'News', short: 'News', icon: LayoutGrid, primary: true },
    { id: 'narratives', label: 'Narratives', short: 'Stories', icon: Layers, primary: true },
    { id: 'daily', label: 'Daily Briefing', icon: Calendar },
    { id: 'weekly', label: 'Weekly Analysis', icon: BarChart3 },
    { id: 'inspiration', label: 'Inspiration', icon: Lightbulb },
    { id: 'history', label: 'History', icon: History },
    { id: 'guide', label: 'Universe Guide', icon: BookOpen },
];

export const tabLabel = (id) => (NAV.find(n => n.id === id) || NAV[2]).label;

// Priority tiers mirror the backend's impact labels (main.py format_news_event).
export const PRIORITY_TIERS = [
    { label: 'Any', min: 0 },
    { label: 'Medium+', min: 5 },
    { label: 'High+', min: 7 },
    { label: 'Critical', min: 9 },
];

// Count of filters set away from their default; the Feed toolbar badges it.
export const activeFilterCount = ({ minRelevance, minConfidence, minNovelty, selectedSession, selectedSource, selectedCategory }) =>
    [minRelevance > 0, minConfidence > 0, minNovelty > 0,
        selectedSession !== 'ALL', selectedSource !== 'ALL', selectedCategory !== 'ALL'].filter(Boolean).length;
