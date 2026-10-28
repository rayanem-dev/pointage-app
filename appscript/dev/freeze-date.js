// Fige l'heure du processus Node (variable SIJIL_DATE, ex. 2026-10-15T09:00:00) : pour des captures d'écran reproductibles. Usage : node -r ./dev/freeze-date.js dev/captures.js
const FIXED = process.env.SIJIL_DATE ? new Date(process.env.SIJIL_DATE).getTime() : null;
if (FIXED) {
  const Real = Date;
  class FakeDate extends Real {
    constructor(...a) { if (a.length) super(...a); else super(FIXED); }
    static now() { return FIXED; }
  }
  global.Date = FakeDate;
}
