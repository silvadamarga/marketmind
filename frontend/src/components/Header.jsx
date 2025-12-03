import React from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, ExternalLink, PanelRightClose, PanelRightOpen, SlidersHorizontal, Zap, Droplets, Activity, TrendingUp, Check } from 'lucide-react';

import UniverseBar from './UniverseBar';

export default function Header({
    activeTab,
    setMobileMenuOpen,
    leftOpen,
    setLeftOpen,
    rightOpen,
    setRightOpen,
    setMobileConfigOpen,
    handleExport,
    signals,
    marqueeDuration,
    marqueeSignals
}) {
    return (
        <header className="flex flex-col border-b border-slate-800 bg-[#0f1422]/50 backdrop-blur-md w-full z-30 sticky top-0">
            <div className="h-12 flex items-center justify-between px-4 sm:px-8 border-b border-slate-800/50 w-full">
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
                    <button onClick={handleExport} className="hidden sm:flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-indigo-500/20">
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
            <UniverseBar signals={signals} marqueeDuration={marqueeDuration} marqueeSignals={marqueeSignals} />
        </header>
    );
}
