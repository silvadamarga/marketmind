import React from 'react';
import { X, BrainCircuit, Clock } from 'lucide-react';

export default function OverviewModal({ isOpen, onClose, data, loading }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative bg-[#0f1422] border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-[#131b2e]">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                            <BrainCircuit className="text-indigo-400" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {loading ? "Loading Context..." : `${data?.key} Overview`}
                            </h2>
                            <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
                                {data?.type} INTELLIGENCE
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-slate-400 text-sm">Fetching latest intelligence...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="prose prose-invert max-w-none">
                                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                                    {data?.overview || "No overview data available for this entity."}
                                </p>
                            </div>
                            
                            {data?.last_updated && (
                                <div className="flex items-center space-x-2 text-xs text-slate-500 pt-4 border-t border-slate-800/50">
                                    <Clock size={12} />
                                    <span>Last Updated: {new Date(data.last_updated).toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
