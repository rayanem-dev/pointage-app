// ---------- langues : français (source), arabe, anglais ----------
var LANGS = [['fr', 'Français'], ['ar', 'العربية'], ['en', 'English']];
var LANG = 'fr';
var TR = { en: {}, ar: {} }, TRK = { en: [], ar: [] }, TRC = { en: {}, ar: {} };
I18N_DATA.forEach(function (r) { TR.en[r[0]] = r[1]; TR.ar[r[0]] = r[2]; });
['en', 'ar'].forEach(function (l) { TRK[l] = Object.keys(TR[l]).filter(function (k) { return k.length >= 8; }).sort(function (a, b) { return b.length - a.length; }); });
// Traduit un texte français : correspondance exacte, puis par morceaux (les messages sont souvent assemblés à partir de plusieurs textes).
function tr(s) {
  if (LANG === 'fr' || s == null) return s;
  s = String(s); if (!s) return s;
  var M = TR[LANG], C = TRC[LANG];
  if (C[s] !== undefined) return C[s];
  var out;
  if (M[s] !== undefined) out = M[s];
  else {
    var core = s.trim();
    if (core && M[core] !== undefined) out = s.replace(core, M[core]);
    else if (s.length < 8) out = s;
    else { out = s; TRK[LANG].forEach(function (k) { if (out.indexOf(k) >= 0) out = out.split(k).join(M[k]); }); }
  }
  C[s] = out; return out;
}
var MOIS_I18N = {
  fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ar: ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
};
var WEEK_I18N = { fr: ['D', 'L', 'M', 'M', 'J', 'V', 'S'], en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], ar: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] };
var LOCALE_I18N = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-DZ-u-nu-latn' };
// Applique la langue : sens d'écriture, mois, jours, titre, texte des boîtes de dialogue.
function applyLang(l) {
  LANG = TR[l] || l === 'fr' ? l : 'fr';
  var d = document.documentElement; d.lang = LANG; d.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  if (window.langHook) window.langHook(LANG, MOIS_I18N[LANG], WEEK_I18N[LANG]); // l'application met à jour ses mois et ses jours
}
function langStored() { try { return localStorage.getItem('pt-lang') || ''; } catch (e) { return ''; } }
function langSave(l) { try { localStorage.setItem('pt-lang', l); } catch (e) { /* ignore */ } try { window.parent.postMessage({ sijilLang: l }, '*'); } catch (e) { /* ignore */ } }
