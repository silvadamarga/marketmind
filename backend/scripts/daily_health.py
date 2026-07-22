"""Daily pipeline health digest — deterministic, zero API tokens.

Guards against the failure modes that already happened silently once:
embeddings dead for 3 months (text-embedding-004 retirement), analyses 100%
FAILED for 2 weeks (Gemini 2.x death), and the ones that would hurt next:
silent gemini-flash-latest retarget (annotation drift), scorer breakage,
ingestion or market-poll death.

Posts a compact digest to Discord every run (the digest's absence is itself
a dead-job signal) with a red alert embed when any check breaches. Exit code
1 on breach for cron mail / chaining.

Run from backend/ via cron on the production server, e.g. daily at 04:00 UTC:
    0 4 * * * cd /path/to/backend && venv/bin/python scripts/daily_health.py
Local test: venv/bin/python scripts/daily_health.py --dry-run
"""

import argparse
import datetime
import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import DB_FILE

UTC = datetime.timezone.utc

# Alert when a single day's Gemini spend crosses this (USD). Tune to your comfort;
# the point is a surprise-bill tripwire, not a hard cap (we can't stop mid-run).
DAILY_BUDGET_USD = 2.0


def cutoff(days):
    return (datetime.datetime.now(UTC) - datetime.timedelta(days=days)).isoformat()


def forge_age_h(path):
    """Hours since the forge last built the briefing snapshot (its `generated_at`,
    falling back to file mtime when the push landed). 999 if never received — the
    forge is a separate machine that may go dark or lose internet, so it can't
    alert about its own death; the always-on VPS watches for the missing push."""
    if not os.path.exists(path):
        return 999.0
    try:
        gen = json.load(open(path)).get("generated_at")
        ts = datetime.datetime.fromisoformat(gen)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        return (datetime.datetime.now(UTC) - ts).total_seconds() / 3600
    except Exception:
        return (datetime.datetime.now(UTC).timestamp() - os.path.getmtime(path)) / 3600


def window(conn, days, until_days=0):
    # ml_score_json only exists after the Phase 7 scorer deploy (2026-06-11)
    has_ml = conn.execute("SELECT COUNT(*) FROM pragma_table_info('news_events')"
                          " WHERE name='ml_score_json'").fetchone()[0]
    ml_col = "ml_score_json IS NOT NULL" if has_ml else "0"
    rows = conn.execute(
        f"""SELECT impact_score, sentiment, embedding IS NOT NULL,
                   {ml_col}, ai_analysis_json
            FROM news_events WHERE timestamp >= ? AND timestamp < ?""",
        (cutoff(days), cutoff(until_days) if until_days else "9999")).fetchall()
    n = len(rows)
    out = {"n": n, "failed": 0, "bullish": 0, "imp_sum": 0.0, "imp_n": 0,
           "hi": 0, "hi_emb": 0, "scored": 0, "tickers": 0.0, "tick_n": 0}
    for imp, sent, has_emb, has_score, ai in rows:
        try:
            a = json.loads(ai) if ai else {}
        except json.JSONDecodeError:
            a = {}
        if a.get("status") == "FAILED":
            out["failed"] += 1
            continue
        out["scored"] += has_score
        if sent == "BULLISH":
            out["bullish"] += 1
        if imp is not None:
            out["imp_sum"] += imp
            out["imp_n"] += 1
            if imp >= 5:
                out["hi"] += 1
                out["hi_emb"] += has_emb
        t = a.get("tickers")
        if isinstance(t, list):
            out["tickers"] += len(t)
            out["tick_n"] += 1
    return out


def spend(conn, days, until_days=0):
    """Gemini cost + call count over a window. Returns zeros if the ledger table
    doesn't exist yet (first run before the migration/first insert lands)."""
    has_tbl = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='gemini_usage'"
    ).fetchone()
    if not has_tbl:
        return {"calls": 0, "cost": 0.0}
    row = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(est_cost_usd),0) FROM gemini_usage"
        " WHERE ts >= ? AND ts < ?",
        (cutoff(days), cutoff(until_days) if until_days else "9999")).fetchone()
    return {"calls": row[0], "cost": row[1]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_FILE)
    ap.add_argument("--dry-run", action="store_true", help="print, don't post")
    args = ap.parse_args()

    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    d1, d7 = window(conn, 1), window(conn, 7)
    base = window(conn, 37, until_days=7)  # trailing 30d ending 7d ago
    sp1, sp30 = spend(conn, 1), spend(conn, 30)  # Gemini cost: yesterday, 30d
    md_last = conn.execute("SELECT MAX(timestamp) FROM market_data").fetchone()[0]
    conn.close()

    ok = d7["n"] - d7["failed"]
    okb = base["n"] - base["failed"]
    rate = {
        "ev_24h": d1["n"],
        "ev_7d_vs_30d": d7["n"] / max(base["n"] / 30 * 7, 1),
        "failed_7d": d7["failed"] / max(d7["n"], 1),
        "emb_7d": d7["hi_emb"] / max(d7["hi"], 1),
        "scored_7d": d7["scored"] / max(ok, 1),
        "imp_7d": d7["imp_sum"] / max(d7["imp_n"], 1),
        "imp_30d": base["imp_sum"] / max(base["imp_n"], 1),
        "bull_7d": d7["bullish"] / max(ok, 1),
        "bull_30d": base["bullish"] / max(okb, 1),
        "tick_7d": d7["tickers"] / max(d7["tick_n"], 1),
        "tick_30d": base["tickers"] / max(base["tick_n"], 1),
    }
    # market_data timestamps are naive UTC
    md_age_h = (datetime.datetime.now(UTC)
                - datetime.datetime.fromisoformat(md_last).replace(tzinfo=UTC)
                ).total_seconds() / 3600 if md_last else 999

    # Forge heartbeat: the forge runs Mon-Fri after US close and pushes
    # forge_brief.json. forge_brief.json lives in backend/ (one dir up from scripts/).
    forge_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "forge_brief.json")
    fa_h = forge_age_h(forge_path)

    alerts = []
    if d1["n"] == 0:
        alerts.append("no events in 24h — ingestion dead?")
    if rate["ev_7d_vs_30d"] < 0.5:
        alerts.append(f"7d volume at {rate['ev_7d_vs_30d']:.0%} of trailing 30d")
    if rate["failed_7d"] > 0.2:
        alerts.append(f"FAILED rate 7d {rate['failed_7d']:.0%} — Gemini broken?")
    if d7["hi"] >= 5 and rate["emb_7d"] < 0.8:
        alerts.append(f"embeddings {rate['emb_7d']:.0%} of impact>=5 (7d) — API broken?")
    if ok >= 20 and rate["scored_7d"] < 0.8:
        alerts.append(f"ML scorer coverage {rate['scored_7d']:.0%} (7d)")
    if abs(rate["imp_7d"] - rate["imp_30d"]) > 1.0:
        alerts.append(f"impact drift {rate['imp_30d']:.2f}->{rate['imp_7d']:.2f} — model change?")
    if abs(rate["bull_7d"] - rate["bull_30d"]) > 0.15:
        alerts.append(f"BULLISH share {rate['bull_30d']:.0%}->{rate['bull_7d']:.0%}")
    if abs(rate["tick_7d"] - rate["tick_30d"]) > 0.6:
        alerts.append(f"tickers/event {rate['tick_30d']:.2f}->{rate['tick_7d']:.2f}")
    if md_age_h > 72 or (md_age_h > 3 and datetime.datetime.now(UTC).weekday() < 5):
        alerts.append(f"market_data stale {md_age_h:.0f}h — monitor dead?")
    # The forge runs Mon-Fri evenings, so a fresh push is due the morning AFTER a
    # weekday run (Tue-Sat). On Sun/Mon the Fri push is legitimately old (no weekend
    # run); 96h catches a genuinely dead forge regardless of weekday.
    expect_forge = datetime.datetime.now(UTC).weekday() in (1, 2, 3, 4, 5)
    if fa_h > 96 or (expect_forge and fa_h > 28):
        alerts.append(f"forge update not received ({fa_h:.0f}h) — forge down/offline?")
    if sp1["cost"] > DAILY_BUDGET_USD:
        alerts.append(f"Gemini spend ${sp1['cost']:.2f}/24h over ${DAILY_BUDGET_USD:.2f} budget")

    # Box-level: disk headroom and db growth (ops-plan phase 4).
    st = os.statvfs("/")
    disk_free_pct = st.f_bavail / st.f_blocks * 100
    db_gb = os.path.getsize(args.db) / 1e9
    if disk_free_pct < 15:
        alerts.append(f"disk {disk_free_pct:.0f}% free — cleanup needed")
    if db_gb > 1.0:
        alerts.append(f"db {db_gb:.1f} GB — growth check due")

    digest = (
        f"events 24h/7d: {d1['n']}/{d7['n']} ({rate['ev_7d_vs_30d']:.0%} of 30d pace) | "
        f"FAILED 7d: {rate['failed_7d']:.0%} | emb(imp>=5): {rate['emb_7d']:.0%} | "
        f"scored: {rate['scored_7d']:.0%}\n"
        f"impact 7d/30d: {rate['imp_7d']:.2f}/{rate['imp_30d']:.2f} | "
        f"bullish: {rate['bull_7d']:.0%}/{rate['bull_30d']:.0%} | "
        f"tickers/ev: {rate['tick_7d']:.2f}/{rate['tick_30d']:.2f} | "
        f"market_data age: {md_age_h:.1f}h | forge age: {fa_h:.1f}h\n"
        f"gemini spend 24h/30d: ${sp1['cost']:.2f}/${sp30['cost']:.2f} "
        f"({sp1['calls']}/{sp30['calls']} calls)\n"
        f"disk free: {disk_free_pct:.0f}% | db: {db_gb * 1000:.0f} MB"
    )
    status = "🚨 " + "; ".join(alerts) if alerts else "✅ all checks pass"
    print(f"{status}\n{digest}")

    if not args.dry_run:
        from notifications import send_system_alert
        send_system_alert(
            f"Daily health: {'ALERT' if alerts else 'OK'}",
            f"{status}\n\n{digest}",
            color=0xFF0000 if alerts else 0x2ECC71)
    sys.exit(1 if alerts else 0)


if __name__ == "__main__":
    main()
