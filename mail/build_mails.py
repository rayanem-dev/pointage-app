# -*- coding: utf-8 -*-
"""Génère les deux e-mails (HTML + texte). Usage : python3 mail/build_mails.py  — les images sont servies par la page d'accueil (GitHub Pages)."""
import os, html
BASE = os.environ.get('MAIL_IMG', 'https://rayanem-dev.github.io/pointage-app/mail/img/')
APP = 'https://rayanem-dev.github.io/pointage-app/'
PRES = 'https://docs.google.com/presentation/d/1ziQ3U7c2lvkEywjihQnhlqHUNaRj0OjS/edit?usp=sharing&ouid=100581094853869883670&rtpof=true&sd=true'
DOC = 'https://drive.google.com/file/d/1A5EqFAm2lkxheq45ONfrDexYiD7oTxrp/view?usp=sharing'
NAVY, BLUE, TEAL, INK, GREY, PAPER = '#0E4377', '#16598D', '#2FB5B4', '#12263A', '#6B7785', '#F2F7F8'
e = html.escape

def btn(label, url, bg=TEAL, fg='#ffffff'):
    return f'<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:6px auto"><tr><td bgcolor="{bg}" style="border-radius:26px"><a href="{url}" style="display:inline-block;padding:14px 30px;font:700 16px Arial,Helvetica,sans-serif;color:{fg};text-decoration:none;border-radius:26px">{e(label)}</a></td></tr></table>'

def block(img, title, text, flip=False):
    pic = f'<img src="{BASE}{img}" width="{"150" if img=="mobile.jpg" else "270"}" alt="{e(title)}" style="display:block;width:100%;max-width:{"150" if img=="mobile.jpg" else "270"}px;height:auto;border:1px solid #D9DFE5;border-radius:8px">'
    txt = f'<h3 style="margin:0 0 6px;font:700 17px Arial,Helvetica,sans-serif;color:{NAVY}">{e(title)}</h3><p style="margin:0;font:15px/1.5 Arial,Helvetica,sans-serif;color:{INK}">{e(text)}</p>'
    a, b = (txt, pic) if flip else (pic, txt)
    wa, wb = ('52%', '48%') if flip else ('48%', '52%')
    return f'<tr><td style="padding:14px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td valign="middle" width="{wa}" style="padding-right:14px">{a}</td><td valign="middle" width="{wb}">{b}</td></tr></table></td></tr>'

def page(title, preheader, hero_t, hero_s, intro, blocks, extra, cta_rows, sign):
    cta = ''.join(f'<tr><td style="padding:4px 24px">{btn(*c)}</td></tr>' for c in cta_rows)
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(title)}</title></head>
<body style="margin:0;padding:0;background:#E6EDF2"><span style="display:none;max-height:0;overflow:hidden;opacity:0">{e(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#E6EDF2"><tr><td align="center" style="padding:20px 8px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td bgcolor="{NAVY}" style="background:{NAVY} linear-gradient(135deg,{NAVY} 0%,{BLUE} 60%,{TEAL} 100%);padding:34px 24px 30px" align="center">
<img src="{BASE}logo.png" width="64" height="64" alt="Sijil" style="display:block;margin:0 auto 12px;border-radius:14px;background:#fff;padding:6px">
<div style="font:700 13px Arial,Helvetica,sans-serif;letter-spacing:3px;color:#BFEDEC">SIJIL</div>
<h1 style="margin:10px 0 8px;font:700 27px/1.25 Arial,Helvetica,sans-serif;color:#ffffff">{e(hero_t)}</h1>
<p style="margin:0;font:16px/1.5 Arial,Helvetica,sans-serif;color:#E4F3F3">{e(hero_s)}</p></td></tr>
<tr><td style="padding:24px 24px 6px;font:16px/1.6 Arial,Helvetica,sans-serif;color:{INK}">{intro}</td></tr>
<tr><td style="padding:6px 24px"><img src="{BASE}mois.jpg" width="552" alt="Le pointage du mois" style="display:block;width:100%;height:auto;border:1px solid #D9DFE5;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.12)"></td></tr>
{''.join(blocks)}
{extra}
{cta}
<tr><td style="padding:18px 24px 26px;font:15px/1.6 Arial,Helvetica,sans-serif;color:{INK}">{sign}</td></tr>
<tr><td bgcolor="{NAVY}" align="center" style="padding:16px 24px;font:12px/1.5 Arial,Helvetica,sans-serif;color:#B8C8D8">Sijil · Gestion du temps de travail<br>© 2026 <a href="https://rayanem-dev.github.io/JawlaDev/" target="_blank" style="color:#B8C8D8">JawlaDev</a> — Tous droits réservés</td></tr>
</table></td></tr></table></body></html>'''

def ul(items):
    return '<ul style="margin:8px 0 0;padding-left:20px">' + ''.join(f'<li style="margin:5px 0">{x}</li>' for x in items) + '</ul>'

def card(t, s, bg=PAPER):
    return f'<td valign="top" width="33%" style="padding:4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="{bg}" style="border-radius:10px"><tr><td style="padding:12px;font:13px/1.45 Arial,Helvetica,sans-serif;color:{INK}"><b style="color:{NAVY};font-size:14px">{e(t)}</b><br>{e(s)}</td></tr></table></td>'

# ---------- E-mail 1 : présentation aux agents et à la direction ----------
m1 = page(
 'Présentation de Sijil', 'Du pointage à l’attachement et à la facture, avec les demandes et les documents du personnel — sur téléphone comme sur ordinateur.',
 'Du pointage à la facture, au même endroit', 'Sijil suit le temps de travail, les demandes et les documents du personnel, puis établit l’attachement et la facture du contrat.',
 '<p style="margin:0 0 12px">Bonjour,</p><p style="margin:0 0 12px">Nous avons le plaisir de vous présenter <b>Sijil</b>, l’outil qui remplace les fichiers et les messages éparpillés. Il gère <b>le pointage</b> du personnel, puis <b>l’attachement</b> et <b>la facture</b> du contrat qui en découlent ; les <b>demandes</b> (titre de congé, attestation…) et les <b>documents</b> des agents s’y trouvent aussi.</p><p style="margin:0 0 12px">Tout est accessible depuis un <b>téléphone</b> ou un <b>ordinateur</b>, en <b>français</b>, en <b>arabe</b> et en <b>anglais</b>. Voici l’essentiel de ce que chacun y trouve :</p>',
 [block('agent.jpg', 'Pour l’agent', 'Sa situation du jour (travail ou congé), les jours qui lui restent, son solde et sa date de reprise. Il consulte son pointage sur 1 mois, 3 mois, 6 mois ou 1 an, retrouve ses documents et peut laisser une remarque sur un jour de son pointage.'),
  block('demandes.jpg', 'Les demandes, sans courir après', 'L’agent fait sa demande en deux clics ; le responsable d’équipe est prévenu, regroupe les demandes par thème et envoie une seule demande à la direction, avec un message prêt à lire. La date de reprise est calculée automatiquement.', True),
  block('completer.jpg', 'Pour le responsable d’équipe', 'Il pointe son équipe en un clic (T, R, ABS). Avec la case « Pointage automatique », Sijil recopie chaque jour le pointage de la veille à l’heure choisie : il n’intervient que pour les changements (départ, entrée, absence).'),
  block('exports.jpg', 'De l’attachement à la facture', 'Les quantités viennent des jours réellement pointés. Une fois l’attachement validé, le mois est figé ; la facture s’en déduit. Fiche de pointage, attachement et facture s’exportent en Excel et en PDF, avec votre logo.', True),
  block('mobile.jpg', 'Partout, sur téléphone', 'L’application s’installe sur le téléphone comme une application. Une pastille signale les nouveaux documents et demandes.')],
 f'<tr><td style="padding:10px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>{card("Direction et RH","Une demande groupée par e-mail ; la réponse s’applique à toutes les demandes.")}{card("Documents rangés","Fiches de paie, titres de congé, attestations : déposés en vrac, reconnus, classés par agent et notifiés.")}{card("Compte client","Le client suit le pointage et consulte les attachements et factures validés, en lecture seule.")}</tr></table></td></tr>'
 f'<tr><td style="padding:10px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="{PAPER}" style="border-radius:10px"><tr><td style="padding:14px 16px;font:14px/1.5 Arial,Helvetica,sans-serif;color:{INK}"><b style="color:{NAVY};font-size:15px">Vos données sont protégées</b>' + ul(['Chacun ne voit que ce qui le concerne (l’agent, son responsable d’équipe, la direction, le client).', 'Les mots de passe ne sont jamais stockés en clair ; « Mot de passe oublié ? » envoie un code par e-mail.', 'Option « Rester connecté » pour ne pas retaper son mot de passe.', 'Jours fériés nationaux et religieux visibles sur toutes les vues.']) + '</td></tr></table></td></tr>'
 f'<tr><td style="padding:6px 24px 4px;font:15px/1.6 Arial,Helvetica,sans-serif;color:{INK}"><b>Pour vous connecter :</b> cliquez sur « Se connecter à l’application », saisissez l’identifiant et le mot de passe qui vous ont été transmis (par e-mail ou par votre responsable d’équipe), puis installez l’application sur votre téléphone si vous le souhaitez.</td></tr>',
 [('Se connecter à l’application', APP), ('Découvrir la présentation', PRES, BLUE), ('Ouvrir le manuel d’utilisation', DOC, BLUE)],
 'Nous restons à votre disposition pour une démonstration ou pour répondre à vos questions.<br><br>Cordialement,<br><b>Rayane M.</b><br><span style="color:'+GREY+'">Sijil — Gestion du temps de travail</span>')

# ---------- E-mail 2 : commercial ----------
m2 = page(
 'Sijil — la gestion du personnel mis à disposition, de A à Z', 'Du bordereau des prix à la facture : un seul outil. Essai gratuit.',
 'Du bordereau des prix à la facture, sans ressaisie', 'Sijil gère la mise à disposition et le personnel de prestation de services, de A à Z.',
 f'<p style="margin:0 0 12px">Bonjour,</p><p style="margin:0 0 12px">Vous mettez du personnel à disposition de vos clients ? Entre les fichiers Excel, les jours oubliés, les calculs à la main et les relances, <b>chaque fin de mois coûte du temps et expose à l’erreur</b>.</p><p style="margin:0 0 12px"><b>Sijil</b> relie tout, du <b>bordereau des prix</b> du contrat jusqu’à l’<b>attachement</b> et à la <b>facture</b> :</p>{ul(["<b>Le bordereau des prix se lit tout seul</b> (PDF scanné, photo, Excel) : fonctions, nombres, délais et prix alimentent le contrat.","<b>Le pointage</b> des agents et des véhicules, avec prévisions de rotation, soldes et jours fériés algériens.","<b>L’attachement et la facture</b> calculés sur les jours réellement pointés, figés à la validation, en Excel et en PDF.","<b>Votre client suit en direct</b> le pointage de son contrat et vous laisse ses remarques : fini les « qui était présent mardi ? ».","<b>Demandes et documents</b> du personnel au même endroit, avec notifications."])}',
 [block('exports.jpg', 'L’attachement et la facture en quelques clics', 'Les quantités viennent des jours pointés. Vous validez : le mois est figé. Fiche de pointage, attachement et facture s’exportent en Excel et en PDF, avec votre logo.'),
  block('client.jpg', 'Un compte client, en lecture seule', 'Votre client suit le pointage de son contrat, consulte les attachements validés et vous écrit une remarque directement sur le jour concerné.', True),
  block('annee.jpg', 'Voir loin : 3 mois, 6 mois, 1 an', 'Départs, reprises, jours fériés : un coup d’œil suffit pour anticiper le mois suivant.')],
 f'<tr><td style="padding:12px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="{NAVY}" style="border-radius:12px"><tr><td align="center" style="padding:20px;font:16px/1.5 Arial,Helvetica,sans-serif;color:#ffffff"><b style="font-size:20px">Essayez gratuitement</b><br>Votre espace est créé et prêt à l’emploi, avec vos propres données, isolées de celles des autres entreprises.<br><span style="color:#BFEDEC">Application en français, arabe et anglais · sur téléphone et ordinateur</span></td></tr></table></td></tr>',
 [('Demander mon essai gratuit', APP), ('Voir la présentation', PRES, BLUE)],
 'Je vous propose une démonstration de 20 minutes, sur votre propre cas. Répondez simplement à ce message, ou appelez-moi.<br><br>Cordialement,<br><b>Rayane M.</b><br><span style="color:'+GREY+'">Sijil — Gestion du temps de travail</span>')

# ---------- versions texte ----------
t1 = f'''Objet : Présentation de Sijil — du pointage à l'attachement et à la facture

Bonjour,

Nous avons le plaisir de vous présenter Sijil, l'outil qui remplace les fichiers et les messages éparpillés. Il gère le pointage du personnel, puis l'attachement et la facture du contrat qui en découlent ; les demandes (titre de congé, attestation…) et les documents des agents s'y trouvent aussi. Tout est accessible depuis un téléphone ou un ordinateur, en français, en arabe et en anglais.

POUR L'AGENT : sa situation du jour, les jours restants, son solde et sa date de reprise ; pointage sur 1 mois, 3, 6 ou 12 mois ; ses documents ; une remarque possible sur un jour de son pointage.
LES DEMANDES : l'agent demande en deux clics ; le responsable d'équipe les regroupe par thème et envoie une seule demande à la direction, avec un message prêt à lire. La date de reprise est calculée.
POUR LE RESPONSABLE D'ÉQUIPE : pointage en un clic (T, R, ABS) ; case « Pointage automatique » : Sijil recopie chaque jour le pointage de la veille à l'heure choisie, il n'intervient que pour les changements (départ, entrée, absence).
DE L'ATTACHEMENT À LA FACTURE : les quantités viennent des jours réellement pointés ; l'attachement validé fige le mois ; la facture s'en déduit ; fiche de pointage, attachement et facture s'exportent en Excel et PDF, avec votre logo.
DIRECTION ET RH : une demande groupée par e-mail ; la réponse s'applique à toutes les demandes.
DOCUMENTS : fiches de paie, titres de congé, attestations déposés en vrac, reconnus, classés par agent et notifiés.
COMPTE CLIENT : le client suit le pointage et consulte les attachements et factures validés, en lecture seule.
PROTECTION : chacun ne voit que ce qui le concerne ; mots de passe jamais en clair ; mot de passe oublié par e-mail ; option « Rester connecté ».

Se connecter à l'application : {APP}
Identifiant et mot de passe : transmis par e-mail ou par votre responsable d'équipe.

Présentation : {PRES}
Manuel d'utilisation : {DOC}

Nous restons à votre disposition pour une démonstration ou pour répondre à vos questions.

Cordialement,
Rayane M.
Sijil — Gestion du temps de travail
'''
t2 = f'''Objet : Sijil — du bordereau des prix à la facture, sans ressaisie

Bonjour,

Vous mettez du personnel à disposition de vos clients ? Entre les fichiers Excel, les jours oubliés et les calculs à la main, chaque fin de mois coûte du temps et expose à l'erreur.

Sijil relie tout, du bordereau des prix jusqu'à l'attachement et à la facture :
- le bordereau des prix se lit tout seul (PDF scanné, photo, Excel) ;
- le pointage des agents et véhicules, avec prévisions, soldes et jours fériés algériens ;
- l'attachement et la facture calculés sur les jours pointés, figés à la validation, en Excel et PDF ;
- votre client suit le pointage en direct et vous laisse ses remarques ;
- les demandes et documents du personnel au même endroit.

Essai gratuit : {APP}
Présentation : {PRES}

Je vous propose une démonstration de 20 minutes, sur votre propre cas. Répondez à ce message ou appelez-moi.

Cordialement,
Rayane M.
Sijil — Gestion du temps de travail
'''
for n, h_, t in (('email-presentation', m1, t1), ('email-commercial', m2, t2)):
    open(os.path.join(os.path.dirname(__file__), n + '.html'), 'w', encoding='utf-8').write(h_)
    open(os.path.join(os.path.dirname(__file__), n + '.txt'), 'w', encoding='utf-8').write(t)
print('ok')
