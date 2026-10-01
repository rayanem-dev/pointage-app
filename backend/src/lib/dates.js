const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const pad = (n) => String(n).padStart(2, '0');

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthKey = (y, m) => `${y}-${pad(m)}`;
const parseKey = (k) => { const [y, m] = k.split('-').map(Number); return { y, m }; };
const isMonthKey = (k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k || '');
const fmt = (d) => d.toISOString().slice(0, 10);
const parseDate = (s) => new Date(`${s}T00:00:00Z`);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && fmt(parseDate(s)) === s;
const addDays = (s, n) => { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const today = () => fmt(new Date());
const monthLabel = (k) => { const { y, m } = parseKey(k); return `${MOIS[m - 1]} ${y}`; };
const addMonths = (k, n) => { const { y, m } = parseKey(k); const t = y * 12 + (m - 1) + n; return monthKey(Math.floor(t / 12), (t % 12) + 1); };
const monthDiff = (a, b) => { const x = parseKey(a); const y = parseKey(b); return (y.y - x.y) * 12 + (y.m - x.m); };
const monthStart = (k) => `${k}-01`;
const monthEnd = (k) => { const { y, m } = parseKey(k); return `${k}-${pad(daysInMonth(y, m))}`; };
const frDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

module.exports = { MOIS, daysInMonth, monthKey, parseKey, isMonthKey, fmt, parseDate, isDate, addDays, diffDays, today, monthLabel, addMonths, monthDiff, monthStart, monthEnd, frDate };
