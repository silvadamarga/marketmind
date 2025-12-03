
import React from 'react';
import { Radio, Settings, Activity, BookOpen, LayoutGrid, BarChart3, Calendar } from 'lucide-react';

const SidebarItem = ({ icon, label, active, onClick }) => {
    const Icon = icon;
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-lg transition-all duration-200 ${active ? 'bg-indigo-500/10 text-indigo-400 border-r-2 border-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
        >
            <Icon size={20} />
            <span className="font-medium text-sm whitespace-nowrap">{label}</span>
        </button>
    );
};

export default function Sidebar({ activeTab, setActiveTab, leftOpen, loading, lastConnection, mobile, onClose }) {
    const Container = mobile ? 'div' : 'aside';
    const containerClasses = mobile 
        ? 'h-full flex flex-col bg-[#0f1422]' 
        : `hidden lg:flex flex-col border-r border-slate-800 bg-[#0f1422] transition-all duration-300 ${leftOpen ? 'w-72' : 'w-0 overflow-hidden opacity-0'}`;

    const handleItemClick = (tab) => {
        setActiveTab(tab);
        if (mobile && onClose) onClose();
    };

    return (
        <Container className={containerClasses}>
            {!mobile && (
                <div className="p-6 flex items-center space-x-3 whitespace-nowrap overflow-hidden">
                    <Activity className="text-indigo-400 shrink-0" size={28} />
                    <span className="text-xl font-bold tracking-tight text-white">Market<span className="text-indigo-400">Mind</span></span>
                </div>
            )}
            <nav className="flex-1 px-4 space-y-2 overflow-hidden pt-6">
                <SidebarItem icon={LayoutGrid} label="Live Intelligence" active={activeTab === 'feed'} onClick={() => handleItemClick('feed')} />
                <SidebarItem icon={Calendar} label="Daily Analysis" active={activeTab === 'daily'} onClick={() => handleItemClick('daily')} />
                <SidebarItem icon={BarChart3} label="Weekly Analysis" active={activeTab === 'weekly'} onClick={() => handleItemClick('weekly')} />
                <SidebarItem icon={Radio} label="Verified Sources" active={activeTab === 'sources'} onClick={() => handleItemClick('sources')} />
                <SidebarItem icon={Settings} label="System Config" active={activeTab === 'settings'} onClick={() => handleItemClick('settings')} />
                <button
                    onClick={() => handleItemClick('guide')}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'guide' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                    <BookOpen size={20} />
                    <span className="font-medium">Universe Guide</span>
                </button>
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
        </Container>
    );
}
