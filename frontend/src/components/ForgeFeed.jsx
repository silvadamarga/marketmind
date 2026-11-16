import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, BellRing } from 'lucide-react';

// The forge's site feed (forge plan 41 M3), phone first. Signal pages only what
// needs action now; everything the forge writes to be read (news flashes, the
// Sunday card, nightly status, the dev log) lands here, with a copy of every
// page marked as such. Read-only: replies still go through `go` on the forge.

const POLL_MS = 5 * 60 * 1000;
const PAGED_KEY = 'forge-feed-paged-only';

const parse = (iso) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
const ago = (s) => (s === null || s === undefined ? '—' : s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`);
const dayOf = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// The rendered text repeats the title as its first line (with Signal's ■ mark).
const bodyOf = (it) => {
    const lines = (it.text || '').split('\n');
    return lines.length && lines[0].replace(/^■ /, '') === it.title ? lines.slice(1).join('\n') : it.text;
};

const readPaged = () => {
    try { return localStorage.getItem(PAGED_KEY) === '1'; } catch { return false; }
};

export default function ForgeFeed() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [pagedOnly, setPagedOnly] = useState(readPaged);

    const load = useCallback(() => fetch('/api/forge-feed')
        .then((r) => r.json())
        .then((j) => { setData(j); setErr(null); })
        .catch((e) => setErr(String(e))), []);

    useEffect(() => {
        load();
        const id = setInterval(load, POLL_MS);
        return () => clearInterval(id);
    }, [load]);

    const flip = () => {
        const v = !pagedOnly;
        setPagedOnly(v);
        try { localStorage.setItem(PAGED_KEY, v ? '1' : '0'); } catch { /* private mode: per-visit only */ }
    };

    if (!data) {
        return <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">{err ? `Feed unreadable: ${err}` : 'Loading the forge feed…'}</div>;
    }
    if (data.message || data.error) {
        return <div className="flex-1 flex items-center justify-center text-slate-500 text-sm px-6 text-center">{data.message || `Feed unreadable: ${data.error}`}</div>;
    }

    const items = (data.items || []).filter((it) => !pagedOnly || it.paged);
    const days = [];
    for (const it of items) {
        const d = parse(it.ts);
        const k = dayOf(d);
        if (!days.length || days[days.length - 1].k !== k) days.push({ k, rows: [] });
        days[days.length - 1].rows.push({ ...it, d });
    }
    const stale = data.age_s !== null && data.age_s > 36 * 3600;

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950">
            <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-2 flex items-center gap-3 text-xs">
                <span className={stale ? 'text-amber-400' : 'text-slate-400'}>built {ago(data.age_s)} ago · last {data.days}d</span>
                <button onClick={flip} className={`ml-auto flex items-center gap-1 px-2 py-1 rounded ${pagedOnly ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    <BellRing size={12} /> pages only
                </button>
                <button onClick={load} className="p-1 text-slate-400 hover:text-white" aria-label="Refresh"><RefreshCw size={14} /></button>
            </div>
            <div className="max-w-2xl mx-auto px-4 py-3 space-y-5">
                {!days.length && <div className="text-slate-500 text-sm text-center py-10">Nothing in the window.</div>}
                {days.map((day) => (
                    <section key={day.k}>
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{day.k}</h2>
                        <div className="space-y-2">
                            {day.rows.map((it) => (
                                <article key={it.id || it.ts + it.title} className={`rounded-lg border px-3 py-2 ${it.paged ? 'border-indigo-500/40 bg-indigo-950/30' : 'border-slate-800 bg-slate-900/60'}`}>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{timeOf(it.d)}</span>
                                        <span className="text-sm font-medium text-slate-100 break-words min-w-0">{it.title}</span>
                                        {it.paged && <span className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">Signal</span>}
                                    </div>
                                    {bodyOf(it) && <div className="mt-1 text-[13px] leading-snug text-slate-300 whitespace-pre-wrap break-words">{bodyOf(it)}</div>}
                                </article>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
