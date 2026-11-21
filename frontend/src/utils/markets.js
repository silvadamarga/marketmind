// Exchange sessions for the header clocks: regular hours, weekends, full-day
// closures and early closes. Times are local to the exchange's own timezone,
// so daylight saving is handled by Intl.
//
// Calendars are listed through 2027. Past the last listed year a holiday reads
// as open. Extend each December.
//
// NYSE: mirrors the forge's scraper/market_calendar.py, checked against
// nyse.com/trade/hours-calendars on 2026-11-21.
// Xetra: deutsche-boerse.com "Trading calendar and trading hours", read
// 2026-11-21. Ascension, Whit Monday and Corpus Christi are trading days.
// 30 Dec 2026 "deviating trading hours may apply"; no time is published yet,
// so it reads as a full day.

export const MARKETS = [
    {
        label: 'NY', name: 'NYSE', tz: 'America/New_York', open: '09:30', close: '16:00',
        holidays: new Set([
            '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
            '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
            '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
            '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
        ]),
        earlyClose: { '2026-11-27': '13:00', '2026-12-24': '13:00', '2027-11-26': '13:00' },
    },
    {
        label: 'FRA', name: 'Xetra', tz: 'Europe/Berlin', open: '09:00', close: '17:30',
        holidays: new Set([
            '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01',
            '2026-12-24', '2026-12-25', '2026-12-31',
            '2027-01-01', '2027-03-26', '2027-03-29', '2027-12-24', '2027-12-31',
        ]),
        earlyClose: {},
    },
];

const toMins = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

// The wall clock, date and weekday at the exchange.
const zoned = (now, tz) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(x => [x.type, x.value]));
    return {
        date: `${p.year}-${p.month}-${p.day}`,
        weekday: p.weekday,
        hhmm: `${p.hour}:${p.minute}`,
        mins: +p.hour * 60 + +p.minute,
    };
};

// { hhmm, open, why }: why is the reason in words, for the tooltip.
export function marketStatus(m, now) {
    const z = zoned(now, m.tz);
    const close = m.earlyClose[z.date] || m.close;
    let open = false, why;
    if (z.weekday === 'Sat' || z.weekday === 'Sun') why = 'weekend';
    else if (m.holidays.has(z.date)) why = 'holiday';
    else if (z.mins < toMins(m.open)) why = `opens ${m.open}`;
    else if (z.mins >= toMins(close)) why = `closed at ${close}`;
    else { open = true; why = `closes ${close}${m.earlyClose[z.date] ? ' (early close)' : ''}`; }
    return { hhmm: z.hhmm, open, why };
}
