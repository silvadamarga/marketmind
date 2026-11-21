import React, { useState } from 'react';
import { Activity, MoreHorizontal, X } from 'lucide-react';
import { NAV } from '../utils/nav';

// Desktop (lg+): a fixed left rail, always visible.
export default function Sidebar({ activeTab, setActiveTab }) {
    return (
        <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-slate-800 bg-[#0f1422]">
            <div className="h-14 px-5 flex items-center gap-2.5 border-b border-slate-800/50">
                <Activity className="text-indigo-400 shrink-0" size={22} />
                <span className="text-lg font-bold tracking-tight text-white">Market<span className="text-indigo-400">Mind</span></span>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {NAV.map(({ id, label, icon }) => {
                    const Icon = icon;
                    return (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${activeTab === id
                            ? 'bg-indigo-500/15 text-indigo-300 font-semibold'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                    >
                        <Icon size={18} />
                        <span className="whitespace-nowrap">{label}</span>
                    </button>
                    );
                })}
            </nav>
        </aside>
    );
}

// Phone (<lg): four primary tabs + More, pinned to the bottom of the screen.
export function BottomNav({ activeTab, setActiveTab }) {
    const [moreOpen, setMoreOpen] = useState(false);
    const primary = NAV.filter(n => n.primary);
    const secondary = NAV.filter(n => !n.primary);
    const inMore = secondary.some(n => n.id === activeTab);

    const go = (id) => { setActiveTab(id); setMoreOpen(false); };

    return (
        <>
            {moreOpen && (
                <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
                    <div className="absolute inset-0 bg-black/60" />
                    <div
                        className="absolute inset-x-0 bottom-0 bg-[#0f1422] border-t border-slate-800 rounded-t-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">More</span>
                            <button onClick={() => setMoreOpen(false)} className="p-1 text-slate-400"><X size={20} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {secondary.map(({ id, label, icon }) => {
                                const Icon = icon;
                                return (
                                <button
                                    key={id}
                                    onClick={() => go(id)}
                                    className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm ${activeTab === id
                                        ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-200'
                                        : 'bg-slate-900 border-slate-800 text-slate-300'
                                        }`}
                                >
                                    <Icon size={18} /> {label}
                                </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            <nav className="lg:hidden relative z-50 shrink-0 grid grid-cols-5 border-t border-slate-800 bg-[#0f1422] pb-[env(safe-area-inset-bottom)]">
                {primary.map(({ id, short, icon }) => (
                    <TabButton key={id} active={activeTab === id && !moreOpen} onClick={() => go(id)} icon={icon} label={short} />
                ))}
                <TabButton active={moreOpen || inMore} onClick={() => setMoreOpen(!moreOpen)} icon={MoreHorizontal} label="More" />
            </nav>
        </>
    );
}

const TabButton = ({ active, onClick, icon, label }) => {
    const Icon = icon;
    return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium ${active ? 'text-indigo-300' : 'text-slate-500'}`}>
        <Icon size={20} />
        {label}
    </button>
    );
};
