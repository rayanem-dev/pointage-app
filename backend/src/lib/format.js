const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const T = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

// Nombre entier -> lettres (français). `final` : "vingts"/"cents" prennent le s quand rien ne les suit.
function below100(n, final) {
  if (n < 20) return U[n];
  if (n < 70) { const t = Math.floor(n / 10); const u = n % 10; return T[t] + (u === 1 ? ' et un' : u ? `-${U[u]}` : ''); }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${U[n - 60]}`;
  return n === 80 ? (final ? 'quatre-vingts' : 'quatre-vingt') : `quatre-vingt-${U[n - 80]}`;
}
function below1000(n, final) {
  const c = Math.floor(n / 100); const r = n % 100;
  let s = c === 1 ? 'cent' : c > 1 ? `${U[c]} cent${r === 0 && final ? 's' : ''}` : '';
  if (r) s += (s ? ' ' : '') + below100(r, final);
  return s;
}
function words(n) {
  if (n === 0) return 'zéro';
  const bil = Math.floor(n / 1e9); const mil = Math.floor((n % 1e9) / 1e6); const k = Math.floor((n % 1e6) / 1e3); const r = n % 1e3;
  const parts = [];
  if (bil) parts.push(`${below1000(bil, true)} milliard${bil > 1 ? 's' : ''}`);
  if (mil) parts.push(`${below1000(mil, true)} million${mil > 1 ? 's' : ''}`);
  if (k) parts.push(k === 1 ? 'mille' : `${below1000(k, false)} mille`);
  if (r) parts.push(below1000(r, true));
  return parts.join(' ');
}

const money = (n) => {
  const [i, d] = Number(n).toFixed(2).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${d}`;
};
const int = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// 3224000 -> "TROIS MILLIONS DEUX CENT VINGT-QUATRE MILLE DINARS ALGERIENS" (+ centimes)
function amountInWords(n) {
  const total = Math.round(Number(n) * 100);
  const dinars = Math.floor(total / 100); const cents = total % 100;
  let s = `${words(dinars)} dinar${dinars > 1 ? 's' : ''} algérien${dinars > 1 ? 's' : ''}`;
  if (cents) s += ` et ${words(cents)} centime${cents > 1 ? 's' : ''}`;
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

module.exports = { money, int, amountInWords, norm, words };
