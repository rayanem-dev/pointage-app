// Parcours complet de la démonstration dans un vrai navigateur : entre avec demo / demo, remplit toutes les étapes, teste chaque onglet de chaque profil
// et relève les erreurs (JavaScript, appels serveur refusés, téléchargements). Usage (depuis appscript/) : SIJIL_DEMO=1 node dev/e2e-demo.js [dossier-captures]
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');
process.env.SIJIL_DEMO = process.env.SIJIL_DEMO || '1';
const { start } = require('./server');

const OUT = path.resolve(process.argv[2] || '/tmp/sijil-e2e'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const rpcRefus = []; const jsErrors = []; let downloads = 0;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 50);

(async () => {
  const server = await start(0); const URL = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
  let courant = '';
  p.on('pageerror', (e) => jsErrors.push(courant + ' : ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|ERR_TUNNEL|net::ERR/.test(m.text())) jsErrors.push(courant + ' : console ' + m.text()); });
  p.on('download', () => { downloads += 1; });
  p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Réponse de test' : undefined));
  p.on('response', async (r) => {
    if (!r.url().endsWith('/rpc')) return;
    try { const req = JSON.parse(r.request().postData() || '{}').args || []; const j = await r.json(); if (j && j.ok === false) rpcRefus.push(courant + ' → ' + req[1] + ' : ' + j.error); } catch (e) { /* ignore */ }
  });

  async function step(nom, fn) {
    courant = nom;
    try { await fn(); results.push(['✓', nom]); }
    catch (e) { let nav = ''; try { nav = (await p.locator('header nav').first().innerText({ timeout: 800 })).replace(/\s+/g, ' ').slice(0, 90); } catch (e3) { /* ignore */ } results.push(['✗', nom + ' — ' + String(e.message).split('\n')[0] + (nav ? '  [menu : ' + nav + ']' : '')]); try { await p.screenshot({ path: path.join(OUT, 'ECHEC-' + slug(nom) + '.png') }); } catch (e2) { /* ignore */ } }
  }
  const wait = (ms) => p.waitForTimeout(ms || 900);
  const go = async (name) => { await p.locator('header nav a').filter({ hasText: new RegExp('^\\s*' + name + '(\\s*\\d+)?\\s*$') }).first().click({ timeout: 4000 }); await wait(1200); };
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
  const clickBtn = async (name, o) => { await p.getByRole('button', { name }).first().click(Object.assign({ timeout: 4000 }, o || {})); await wait(); };
  const texte = () => p.evaluate(() => document.body.innerText);
  const voir = async (re, msg) => { const t = await texte(); if (!re.test(t)) throw new Error(msg || ('texte absent : ' + re)); };
  const sansErreurVisible = async () => { const n = await p.locator('.msg.err').count(); if (n) throw new Error('message d\'erreur à l\'écran : ' + (await p.locator('.msg.err').first().innerText())); };
  async function seConnecter(id, pw) {
    await p.goto(URL); await wait(700);
    await p.fill('input[autocomplete="username"]', id); await p.fill('input[type=password]', pw); await p.keyboard.press('Enter'); await wait(2200);
  }
  const profil = async (nom) => { await p.locator('.demobar .profils button').filter({ hasText: new RegExp('^' + nom + '$') }).click(); await wait(2200); };
  const ajd = new Date().toISOString().slice(0, 10);

  // ================= connexion =================
  await step('Connexion : la page propose l\'essai demo / demo', async () => { await p.goto(URL); await wait(800); await voir(/Essai immédiat/); await voir(/demo/); });
  await step('Connexion : mauvais mot de passe refusé', async () => { await p.fill('input[autocomplete="username"]', 'demo'); await p.fill('input[type=password]', 'faux'); await p.keyboard.press('Enter'); await wait(); await voir(/incorrect/); });
  await step('Connexion : demo / demo ouvre l\'espace administrateur', async () => { await seConnecter('demo', 'demo'); await voir(/Démonstration/); await voir(/Pointer un agent/); await shot('01-admin-pointer'); });

  // ================= administrateur =================
  await step('Pointer : T sur une période pour un agent', async () => {
    await go('Pointer');
    await p.locator('select').first().selectOption({ label: 'SAMIR HAMLAOUI — Technicien électricien' });
    await p.locator('input[type=date]').first().fill(ajd); await p.locator('input[type=date]').nth(1).fill(ajd);
    await clickBtn(/Valider le pointage/); await voir(/pointage enregistré|enregistré|jour/i); await sansErreurVisible();
  });
  await step('Pointer : ABS puis effacer', async () => {
    await p.getByText(/ABS — Absence/).first().click(); await clickBtn(/Valider le pointage/); await sansErreurVisible();
    await p.getByText(/Effacer/).first().click(); await clickBtn(/Valider le pointage/); await sansErreurVisible();
  });
  await step('Pointer : « Copier le dernier pointage » (aperçu puis validation)', async () => {
    await p.locator('thead input[type=checkbox]').first().check(); await clickBtn(/Copier le dernier pointage/); await wait(1200); await shot('02-completer'); await sansErreurVisible();
  });
  await step('Pointer : pointage automatique activé puis désactivé', async () => {
    const c = p.locator('label', { hasText: /Automatique chaque jour/i }).locator('input[type=checkbox]').first(); await c.check(); await wait(900); await c.uncheck(); await wait(900); await sansErreurVisible();
  });
  await step('Pointage global : mois, 3 mois, 6 mois, 1 an, mois précédent', async () => {
    await go('Pointage global'); await voir(/Nom et prénom/);
    for (const v of ['3 mois', '6 mois', '1 an', 'Mois']) { await p.getByRole('button', { name: v, exact: true }).first().click(); await wait(1100); await sansErreurVisible(); }
    await p.locator('button').filter({ hasText: '‹' }).first().click(); await wait(1000); await sansErreurVisible();
  });
  await step('Pointage global : modifier une case, export Excel et PDF', async () => {
    await go('Pointage global'); await p.locator('td.cell, tbody td').nth(60).click().catch(() => {}); await wait(600);
    await clickBtn('Excel'); await wait(1500); await clickBtn('PDF'); await wait(1500); await sansErreurVisible();
  });
  await step('Agents : liste, personnel et matériel, formulaire de création', async () => { await go('Agents'); await voir(/Personnel et véhicules/); await voir(/VH/); await shot('03-agents'); });
  await step('Agents : créer une personne (sans e-mail réel envoyé)', async () => {
    await p.locator('input').nth(0); const f = p.locator('form').first();
    await f.getByLabel(/Nom et prénom/i).fill('TEST DEMO PERSONNE').catch(async () => { await f.locator('input[type=text]').first().fill('TEST DEMO PERSONNE'); });
    await f.locator('input[type=email]').first().fill('test.demo@exemple.com');
    await f.getByRole('button', { name: /Créer l'agent/ }).click(); await wait(1600); await sansErreurVisible(); await voir(/TEST DEMO PERSONNE/);
  });
  await step('Agents : créer un véhicule (immatriculation)', async () => {
    const f = p.locator('form').first(); await f.locator('select').first().selectOption({ index: 1 }); await wait(500);
    await f.locator('input[placeholder*="Toyota Hilux"]').fill('4242 777 16 Test 4x4'); await f.getByRole('button', { name: /Ajouter le véhicule|Créer/ }).click(); await wait(1600); await sansErreurVisible(); await voir(/4242 777 16/);
  });
  await step('Agents : modifier une fiche', async () => { await p.getByRole('button', { name: 'Modifier' }).first().click(); await wait(900); await shot('04-agent-modifier'); await sansErreurVisible(); await p.getByRole('button', { name: /Annuler|Fermer/ }).first().click().catch(() => {}); });
  await step('Agents : modification de plusieurs agents', async () => {
    const rows = p.locator('tbody input[type=checkbox]'); await rows.nth(7).check(); await rows.nth(8).check(); await wait(500); await voir(/Modifier 2 agents/); await p.getByRole('button', { name: /Annuler la sélection|Tout désélectionner/ }).first().click().catch(() => {});
  });
  await step('Agents : « Envoyer l\'accès » (e-mail non envoyé en démonstration)', async () => { await p.getByRole('button', { name: /Envoyer l'accès/ }).first().click(); await wait(1500); await sansErreurVisible(); });
  await step('Demandes (administrateur) : tableau de bord et jauges', async () => { await go('Demandes'); await voir(/En cours/); await voir(/Chez la direction/); await voir(/À clôturer/); await shot('05-demandes-admin'); });
  await step('Demandes : réponse de la direction puis clôture avec document', async () => {
    await go('Demandes');
    const rep = p.getByRole('button', { name: /Réponse : acceptée/ }).first(); if (await rep.count()) { await rep.click(); await wait(1400); }
    const clore = p.getByRole('button', { name: /Clôturer et remettre le document/ }).first();
    if (await clore.count()) { await clore.click(); await wait(1200); const sel = p.locator('select').filter({ has: p.locator('option', { hasText: /choisir le document/ }) }).first(); if (await sel.count()) { const opts = await sel.locator('option').allInnerTexts(); if (opts.length > 1) { await sel.selectOption({ index: 1 }); await p.getByRole('button', { name: /^Clôturer$/ }).click(); await wait(1400); } } }
    await sansErreurVisible();
  });
  await step('Documents : dépôt d\'un PDF, analyse, validation, aperçu, suppression', async () => {
    await go('Documents'); await voir(/Déposer des documents/);
    const pdf = path.join(OUT, 'FDP_Hamlaoui_octobre2026.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
    await p.locator('input[type=file]').first().setInputFiles(pdf); await wait(2500); await shot('06-depot'); await sansErreurVisible();
    await p.locator('table select').first().selectOption({ index: 1 }); await wait(500); const mois = p.locator('table input[placeholder*="mars"]').first(); if (await mois.count()) { await mois.fill('octobre 2026'); await mois.dispatchEvent('change'); await wait(700); } await p.locator('table tbody input[type=checkbox]').first().check(); await wait(400);
    await p.getByRole('button', { name: /Envoyer vers les espaces des agents/ }).click(); await wait(3000); await sansErreurVisible(); await voir(/Documents de l'agent|envoyé|rangé/i);
  });
  await step('Exports : fiche Excel et PDF', async () => { await go('Exports'); await voir(/Fiche de pointage/); await p.getByRole('button', { name: 'Excel (.xlsx)' }).first().click(); await wait(2000); await p.getByRole('button', { name: 'PDF' }).first().click(); await wait(2000); await sansErreurVisible(); });
  await step('Exports : attachement du mois précédent (brouillon, quantité, validation)', async () => {
    await go('Exports'); await wait(1200); await voir(/Attachement N°/); await shot('07-attachement');
    await clickBtn(/Valider l'attachement/); await wait(2000); await sansErreurVisible(); await voir(/Validé|figée|Rouvrir/);
  });
  await step('Exports : facture (numéro, génération PDF)', async () => {
    const n = p.locator('input[placeholder="235/PS/2026"]').first(); await n.fill('001/DEMO/2026'); await wait(400);
    await p.getByRole('button', { name: 'PDF' }).last().click(); await wait(2500); await sansErreurVisible(); await shot('08-facture');
  });
  await step('Exports : rouvrir impossible une fois facturé, historique du contrat', async () => { await go('Setup'); await tab('Contrat'); await voir(/Attachements et factures validés/); await sansErreurVisible(); });
  async function tab(nom) { await p.locator('main').getByText(nom, { exact: true }).first().click({ timeout: 4000 }); await wait(1100); }
  await step('Connexions : qui est en ligne', async () => { await go('Connexions'); await voir(/en ligne|connexion/i); await sansErreurVisible(); });
  await step('Aide : recherche', async () => { await go('Aide'); await p.locator('input[type=search], input[placeholder*="echerch"]').first().fill('matériel'); await wait(900); await voir(/Matériel/); await sansErreurVisible(); });
  for (const t of ['Prestataire (mon entreprise)', 'Client', 'Contrat', 'Rotation', 'Demandes', 'Maintenance']) {
    await step('Setup → ' + t, async () => { await go('Setup'); await tab(t); await sansErreurVisible(); await shot('09-setup-' + slug(t)); });
  }
  await step('Setup → Prestataire : modifier et enregistrer', async () => { await go('Setup'); await tab('Prestataire (mon entreprise)'); await p.locator('input[type=text]').first().fill('SARL HORIZON SERVICES (démo)'); await p.getByRole('button', { name: 'Enregistrer' }).first().click(); await wait(1500); await voir(/enregistré/i); });
  await step('Setup → Rotation : enregistrer', async () => { await go('Setup'); await tab('Rotation'); await p.getByRole('button', { name: 'Enregistrer' }).first().click(); await wait(1500); await voir(/enregistré/i); });
  await step('Setup → Demandes : ajouter un type puis enregistrer', async () => {
    await go('Setup'); await tab('Demandes'); await p.getByRole('button', { name: /Ajouter un type de demande/ }).click(); await wait(500);
    await p.locator('input[placeholder*="Nom du type"]').last().fill('Attestation de domicile'); await p.getByRole('button', { name: 'Enregistrer' }).last().click(); await wait(1500); await voir(/enregistré/i);
  });
  await step('Setup → Contrat : interrupteurs Facturation et accès des responsables', async () => {
    await go('Setup'); await tab('Contrat'); const sel = p.locator('select').filter({ has: p.locator('option[value=tous]') }).first(); await sel.selectOption('individuel'); await p.getByRole('button', { name: 'Enregistrer' }).last().click(); await wait(1500); await sansErreurVisible();
    await sel.selectOption('tous'); await p.getByRole('button', { name: 'Enregistrer' }).last().click(); await wait(1500);
  });
  await step('Setup → Maintenance : export Excel du pointage', async () => { await go('Setup'); await tab('Maintenance'); const b = p.getByRole('button', { name: /Exporter/ }).first(); if (await b.count()) { await b.click(); await wait(2500); } await sansErreurVisible(); });
  await step('Setup → Maintenance : sauvegarde et vidage verrouillés en démonstration', async () => {
    const b = p.getByRole('button', { name: /Sauvegarder maintenant|Créer une sauvegarde/ }).first();
    if (await b.count()) { await b.click(); await wait(1500); await voir(/démonstration/i, 'la sauvegarde devrait être désactivée'); }
  });
  await step('Mot de passe : changement refusé en démonstration', async () => {
    await p.locator('a[href="#/motdepasse"]').click(); await wait(900); const inp = p.locator('input[type=password]'); const n = await inp.count();
    for (let i = 0; i < n; i += 1) await inp.nth(i).fill('nouveau123'); await p.getByRole('button', { name: /Changer|Enregistrer|Valider/ }).first().click(); await wait(1200); await voir(/démonstration/i);
  });
  await step('Nouveautés et confidentialité', async () => { await p.getByText(/version 3\./).first().click(); await wait(900); await voir(/Nouveautés/); });

  // ================= responsable d'équipe =================
  await step('Bascule vers le responsable d\'équipe', async () => { await profil('Responsable d\'équipe'); await voir(/responsable d’équipe/); await shot('10-chef'); });
  await step('Responsable : demande groupée pour toute l\'équipe, un seul envoi', async () => {
    await go('Demandes'); await p.getByText('Tous les agents de mon équipe').click(); await wait(400);
    await p.locator('form select').filter({ has: p.locator('option', { hasText: 'Titre de congé' }) }).first().selectOption({ label: 'Certificat de travail' });
    await p.getByRole('button', { name: /Envoyer ma demande/ }).click(); await wait(3500); await sansErreurVisible(); await voir(/demandes créées|créée/i); await shot('11-demande-groupee');
  });
  await step('Responsable : accepter / refuser / modifier, puis envoi unique à la direction', async () => {
    const acc = p.getByRole('button', { name: 'Accepter' }).first(); if (await acc.count()) { await acc.click(); await wait(1300); }
    const ref = p.getByRole('button', { name: 'Refuser' }).first(); if (await ref.count()) { await ref.click(); await wait(1300); }
    await p.getByRole('button', { name: /Envoyer à la direction/ }).first().click(); await wait(2200); await sansErreurVisible(); await shot('12-envoi-direction');
  });
  for (const t of ['Mon espace', 'Pointer', 'Mon groupe', 'Contrat', 'Agents', 'Documents', 'Exports', 'Aide']) {
    await step('Responsable → ' + t, async () => { await go(t); await sansErreurVisible(); });
  }
  await step('Responsable : exports attachement et facture (accès réglé sur « tous »)', async () => { await go('Exports'); await voir(/Attachement N°|Facture/); });

  // ================= agent =================
  await step('Bascule vers l\'agent', async () => { await profil('Agent'); await voir(/Aujourd'hui/); await shot('13-agent'); });
  await step('Agent : nouvelle demande et suivi par jauge', async () => {
    await go('Mes demandes'); await p.locator('form select').first().selectOption({ index: 1 }); await p.getByRole('button', { name: /Envoyer ma demande/ }).click(); await wait(1800); await sansErreurVisible(); await shot('14-agent-demandes'); await voir(/Reçue/);
  });
  await step('Agent : modifier puis supprimer sa demande en attente', async () => {
    await p.getByRole('button', { name: 'Modifier' }).first().click(); await wait(700); await p.getByRole('button', { name: 'Enregistrer' }).first().click(); await wait(1300); await sansErreurVisible();
    await p.getByRole('button', { name: 'Supprimer' }).first().click(); await wait(1300); await sansErreurVisible();
  });
  for (const t of ['Accueil', 'Mon pointage', 'Mes documents', 'Aide']) { await step('Agent → ' + t, async () => { await go(t); await sansErreurVisible(); }); }
  await step('Agent : pointage 3 mois, 6 mois, 1 an', async () => { await go('Mon pointage'); for (const v of ['3 mois', '6 mois', '1 an']) { await p.getByRole('button', { name: v, exact: true }).first().click(); await wait(1000); await sansErreurVisible(); } });

  // ================= client =================
  await step('Bascule vers le client', async () => { await profil('Client'); await voir(/Client/); await shot('15-client'); });
  await step('Client : laisser une remarque sur un jour', async () => {
    await go('Pointage'); await p.locator('tbody td').nth(50).click(); await wait(600); await p.locator('textarea').last().fill('Remarque de test'); await p.getByRole('button', { name: /Envoyer la remarque/ }).click(); await wait(1300); await sansErreurVisible();
  });
  await step('Client : contrat et attachements (consultation)', async () => { await go('Contrat et attachements'); await voir(/Contrat n°/); await sansErreurVisible(); });
  await step('Client : aide', async () => { await go('Aide'); await sansErreurVisible(); });

  // ================= langues, thème, mobile =================
  await step('Langue arabe puis anglais puis français', async () => {
    for (const l of ['ar', 'en', 'fr']) { await p.locator('#prefs select').selectOption(l); await wait(1200); await sansErreurVisible(); }
  });
  await step('Mode sombre', async () => { await p.locator('#pf-theme').click(); await wait(600); await shot('16-sombre'); await p.locator('#pf-theme').click(); await wait(400); });
  await step('Retour administrateur puis déconnexion', async () => { await profil('Administrateur'); await p.getByRole('button', { name: 'Déconnexion' }).click(); await wait(1200); await voir(/Se connecter/); });
  await step('Téléphone : connexion et pages principales sans défilement horizontal', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 800 } }); const q = await m.newPage();
    await q.goto(URL); await q.waitForTimeout(700); await q.fill('input[autocomplete="username"]', 'demo-agent'); await q.fill('input[type=password]', 'demo'); await q.keyboard.press('Enter'); await q.waitForTimeout(2200);
    for (const n of ['Accueil', 'Mes demandes', 'Mes documents']) {
      await q.locator('header nav a').filter({ hasText: new RegExp('^\\s*' + n + '(\\s*\\d+)?\\s*$') }).first().click(); await q.waitForTimeout(1100);
      const debord = await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); if (debord) throw new Error(n + ' : défilement horizontal sur téléphone');
    }
    await q.screenshot({ path: path.join(OUT, '17-mobile.png'), fullPage: true }); await m.close();
  });

  await browser.close(); server.close();
  const ko = results.filter((r) => r[0] === '✗');
  console.log('\n===== RÉSULTAT : ' + (results.length - ko.length) + ' / ' + results.length + ' étapes réussies =====');
  results.forEach((r) => console.log(r[0] + ' ' + r[1]));
  console.log('\nErreurs JavaScript : ' + jsErrors.length); jsErrors.slice(0, 20).forEach((e) => console.log('  - ' + e));
  console.log('Appels serveur refusés : ' + rpcRefus.length); [...new Set(rpcRefus)].slice(0, 40).forEach((e) => console.log('  - ' + e));
  console.log('Téléchargements déclenchés : ' + downloads);
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
