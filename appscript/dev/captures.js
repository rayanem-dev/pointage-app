// Captures d'écran du kit commercial (manuel, présentation, e-mails, aide intégrée, vitrine) : entreprise fictive, date figée.
// Usage (depuis appscript/) : SIJIL_DATE=2026-10-15T09:00:00 node -r ./dev/freeze-date.js dev/captures.js [dossier-de-sortie]
// Playwright : require('playwright') ou /opt/node-tools/node_modules/playwright.
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { start } = require('./server');

const OUT = path.resolve(process.argv[2] || '/tmp/sijil-captures');
const DATE = process.env.SIJIL_DATE || '2026-10-15T09:00:00';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const server = await start(0); const URL = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const out = (name) => path.join(OUT, name);

  async function session(email, pw, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: opts.w || 1360, height: opts.h || 820 }, deviceScaleFactor: opts.scale || 1, locale: 'fr-FR' });
    await ctx.clock.setFixedTime(new Date(DATE));
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(500);
    if (email) {
      await p.fill('input[type=email],input[name=email]', email); await p.fill('input[type=password]', pw); await p.keyboard.press('Enter'); await p.waitForTimeout(1600);
    }
    const go = async (name) => { await p.locator('nav button, nav a').filter({ hasText: new RegExp('^\\s*' + name + '(\\s*\\d+)?\\s*$') }).first().click(); await p.waitForTimeout(1300); };
    return { ctx, p, go };
  }
  const shot = (p, name, o) => p.screenshot(Object.assign({ path: out(name) }, o || {}));
  const month = async (p, ym) => { const m = p.locator('input[type=month]').first(); await m.fill(ym); await m.dispatchEvent('change'); await p.waitForTimeout(1400); };
  const tab = async (p, name) => { await p.getByText(name, { exact: true }).first().click(); await p.waitForTimeout(1000); };

  // ---------- connexion ----------
  { const s = await session(); await shot(s.p, '01-connexion.png'); await s.ctx.close(); }

  // ---------- administrateur ----------
  { const s = await session('admin@demo.local', 'admin1234', { h: 1000 }); const { p, go } = s;
    await go('Pointer');
    await p.locator('select').first().selectOption({ label: 'SAMIR HAMLAOUI — Technicien électricien' }).catch(() => {}); await p.waitForTimeout(500);
    await shot(p, '10-pointer.png');
    await p.locator('thead input[type=checkbox]').first().check().catch(() => {});
    await p.getByRole('button', { name: /Copier le dernier pointage/ }).first().click().catch(() => {}); await p.waitForTimeout(900);
    await shot(p, '11-completer.png');
    await p.setViewportSize({ width: 1360, height: 1180 });
    await go('Pointage global'); await shot(p, '12-global-mois.png');
    await month(p, '2026-09'); await p.locator('.card').first().screenshot({ path: out('15-materiel-pointage.png') }); await month(p, '2026-10');
    await p.getByRole('button', { name: '3 mois' }).first().click(); await p.waitForTimeout(1200); await shot(p, '13-vue-3-mois.png');
    await p.getByRole('button', { name: '1 an' }).first().click(); await p.waitForTimeout(1500); await shot(p, '14-vue-1-an.png');
    await p.setViewportSize({ width: 1360, height: 1000 });
    await go('Agents'); await shot(p, '20-agents.png');
    await p.locator('.card').nth(1).screenshot({ path: out('22-materiel-agents.png') });
    const rows = p.locator('tbody input[type=checkbox]'); await rows.nth(6).check(); await rows.nth(7).check(); await p.waitForTimeout(500);
    await shot(p, '21-agents-groupe.png');
    await go('Demandes'); await shot(p, '30-demandes-admin.png');
    await go('Documents'); await shot(p, '31-documents-admin.png');
    await go('Exports'); await shot(p, '50-exports-full.png', { fullPage: true });
    await go('Setup');
    await tab(p, 'Contrat'); await shot(p, '40-setup-contrat.png', { fullPage: true });
    await shot(p, '40a-contrat.png', { fullPage: true, clip: { x: 0, y: 0, width: 1360, height: 1030 } });
    { const hd = await p.getByText('Contrats : modification manuelle').first().boundingBox(); const sy = await p.evaluate(() => window.scrollY);
      if (hd) await shot(p, '40b-contrat-formulaire.png', { fullPage: true, clip: { x: 0, y: Math.max(0, hd.y + sy - 55), width: 1360, height: 630 } }); }
    await tab(p, 'Prestataire (mon entreprise)'); await shot(p, '41-setup-prestataire.png', { fullPage: true });
    await tab(p, 'Rotation'); await shot(p, '42-setup-rotation.png', { fullPage: true });
    await tab(p, 'Demandes'); await shot(p, '44-setup-demandes.png', { fullPage: true });
    await tab(p, 'Maintenance'); await shot(p, '43-setup-maintenance.png', { fullPage: true });
    await go('Aide'); await shot(p, '97-aide.png');
    await go('Clients'); await shot(p, '95-console-clients.png');
    await p.getByText(/version 3\./).first().click().catch(() => {}); await p.waitForTimeout(900); await shot(p, '90-nouveautes.png');
    // attachement d'août validé, puis facture (module Facturation)
    await go('Exports'); await month(p, '2026-08');
    await p.locator('section.card').nth(2).screenshot({ path: out('51-materiel-attachement.png') });
    p.on('dialog', (d) => d.accept());
    await p.getByRole('button', { name: /Valider l'attachement/ }).click().catch(() => {}); await p.waitForTimeout(1800);
    const fn = p.locator('input[placeholder="235/PS/2026"]').first(); await fn.fill('235/PS/2026').catch(() => {}); await p.waitForTimeout(500);
    await shot(p, '52-exports-facture-full.png', { fullPage: true });
    await s.ctx.close(); }

  // ---------- agent ----------
  { const s = await session('hamlaoui@demo.local', 'demo1234', { h: 900 }); const { p, go } = s;
    await shot(p, '60-agent-accueil.png');
    await shot(p, '63-agent-menu-pastille.png', { clip: { x: 0, y: 0, width: 1360, height: 110 } });
    await go('Mon pointage'); await p.getByRole('button', { name: '3 mois' }).first().click().catch(() => {}); await p.waitForTimeout(1000); await shot(p, '61-mon-pointage.png');
    await go('Mes demandes'); await shot(p, '62-demandes-agent.png');
    await go('Mes documents'); await shot(p, '64-documents-agent.png');
    await s.ctx.close(); }
  { const s = await session('hamlaoui@demo.local', 'demo1234', { w: 390, h: 800, scale: 1 }); await shot(s.p, '93-mobile.png'); await s.ctx.close(); }

  // ---------- responsable d'équipe ----------
  { const s = await session('karim@demo.local', 'demo1234', { h: 1100 }); const { p, go } = s;
    await go('Demandes'); await shot(p, '70-demandes-chef.png');
    const pour = p.locator('input[type=checkbox]').first(); await p.getByText('Tous les agents de mon équipe').click().catch(() => {}); await p.waitForTimeout(500);
    await shot(p, '71-demandes-groupees.png');
    await go('Mon groupe'); await shot(p, '72-mon-groupe.png');
    await s.ctx.close(); }

  // ---------- client ----------
  { const s = await session('client@demo.local', 'demo1234', { h: 1000 }); const { p, go } = s;
    await shot(p, '80-client-pointage.png');
    await p.locator('tbody td.cell, tbody td[data-d], tbody td').nth(40).click().catch(() => {}); await p.waitForTimeout(700);
    await p.locator('textarea').last().fill('Merci de vérifier ce jour : le camion était en panne.').catch(() => {}); await p.waitForTimeout(300);
    await shot(p, '81-client-remarque.png');
    await p.getByRole('button', { name: /Envoyer la remarque/ }).click().catch(() => {}); await p.waitForTimeout(1000);
    await go('Contrat et attachements'); await shot(p, '82-client-contrat.png');
    await s.ctx.close(); }

  // ---------- la remarque du client vue par le prestataire ----------
  { const s = await session('admin@demo.local', 'admin1234', { h: 1180 }); await s.go('Pointage global'); await shot(s.p, '83-remarque-prestataire.png'); await s.ctx.close(); }

  // ---------- langues, mode sombre, à propos ----------
  { const s = await session('admin@demo.local', 'admin1234', { h: 1180 }); const { p, go } = s;
    await go('Pointage global');
    await p.locator('#pf-theme').click(); await p.waitForTimeout(600); await shot(p, '91-mode-sombre.png');
    await p.locator('#pf-theme').click(); await p.waitForTimeout(400);
    await p.locator('select[aria-label="Langue"]').selectOption('ar'); await p.waitForTimeout(1500); await shot(p, '92-arabe.png');
    await s.ctx.close(); }
  { const s = await session('admin@demo.local', 'admin1234', { h: 1000 }); try { await s.go('À propos'); await shot(s.p, '94-apropos.png'); } catch (e) { /* menu absent pour l'éditeur */ } await s.ctx.close(); }

  // ---------- captures de l'aide intégrée (1000 x 880) ----------
  const HELP = path.join(OUT, 'help'); fs.mkdirSync(HELP, { recursive: true });
  const hshot = (p, name, o) => p.screenshot(Object.assign({ path: path.join(HELP, name + '.png') }, o || {}));
  { const s = await session(null, null, { w: 480, h: 550 }); await hshot(s.p, 'connexion'); await s.ctx.close(); }
  { const s = await session('hamlaoui@demo.local', 'demo1234', { w: 1000, h: 880 }); const { p, go } = s;
    await hshot(p, 'agent-accueil');
    await go('Mon pointage'); await hshot(p, 'mon-pointage');
    await go('Mes demandes'); await hshot(p, 'agent-demandes');
    await go('Mes documents'); await hshot(p, 'agent-documents'); await s.ctx.close(); }
  { const s = await session('hamlaoui@demo.local', 'demo1234', { w: 390, h: 780 }); await s.p.locator('#pf-theme').click(); await s.p.waitForTimeout(600); await hshot(s.p, 'mobile-sombre'); await s.ctx.close(); }
  { const s = await session('admin@demo.local', 'admin1234', { w: 1000, h: 880 }); const { p, go } = s;
    await go('Pointer'); await p.locator('select').first().selectOption({ label: 'SAMIR HAMLAOUI — Technicien électricien' }).catch(() => {}); await hshot(p, 'pointer');
    await go('Pointage global'); await hshot(p, 'pointage-global');
    await p.locator('.card').first().evaluate((el) => { const w = el.querySelector('.gridwrap'); if (w) w.scrollTop = w.scrollHeight; window.scrollTo(0, 0); }).catch(() => {}); await p.waitForTimeout(400); await hshot(p, 'pointage-materiel');
    await go('Agents'); await hshot(p, 'agents');
    await p.locator('.card').nth(1).scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 120)); await p.waitForTimeout(300); await hshot(p, 'materiel');
    await go('Demandes'); await hshot(p, 'demandes');
    await go('Documents'); await hshot(p, 'documents');
    await go('Exports'); await hshot(p, 'exports');
    await go('Setup'); await tab(p, 'Contrat'); await hshot(p, 'setup');
    await tab(p, 'Demandes'); await hshot(p, 'setup-demandes'); await s.ctx.close(); }
  { const s = await session('karim@demo.local', 'demo1234', { w: 1000, h: 1000 }); await s.go('Demandes'); await hshot(s.p, 'chef-demandes');
    await s.p.getByText('Tous les agents de mon équipe').click().catch(() => {}); await s.p.waitForTimeout(400); await hshot(s.p, 'demandes-groupees'); await s.ctx.close(); }
  { const s = await session('client@demo.local', 'demo1234', { w: 1000, h: 880 }); await hshot(s.p, 'client-pointage'); await s.go('Contrat et attachements'); await hshot(s.p, 'client-contrat'); await s.ctx.close(); }

  await browser.close(); server.close(); console.log('captures dans', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
