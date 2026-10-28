# -*- coding: utf-8 -*-
"""Range les captures (appscript/dev/captures.js) là où le kit commercial les utilise : manuel et présentation (docs/captures), e-mails (mail/img),
aide intégrée (help/) et, si le dossier est donné, vitrine JawlaDev (assets/img).
Usage : python3 docs/build/images.py <dossier-des-captures> [dossier-du-depot-jawladev]"""
import os, sys, shutil
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.abspath(sys.argv[1]); JD = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else None
CAP = os.path.join(ROOT, 'docs', 'captures'); CROPS = os.path.join(CAP, 'crops'); os.makedirs(CROPS, exist_ok=True)
def op(n): return Image.open(os.path.join(SRC, n + '.png')).convert('RGB')
def jpg(im, dest, width=None, q=85):
    if width and im.size[0] != width: im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
    im.save(dest, quality=q, optimize=True)

# docs/captures : mêmes noms que les précédentes captures
special = {'50-exports-full': '50-exports', '52-exports-facture-full': '52-exports-facture'}
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png'): continue
    n = f[:-4]
    if n in ('40a-contrat', '40b-contrat-formulaire'): continue
    shutil.copy(os.path.join(SRC, f), os.path.join(CAP, special.get(n, n) + '.png'))
# recadrages (sans le bandeau de menu quand il n'apporte rien)
shutil.copy(os.path.join(SRC, '40a-contrat.png'), os.path.join(CROPS, '40a-contrat.png'))
shutil.copy(os.path.join(SRC, '40b-contrat-formulaire.png'), os.path.join(CROPS, '40b-contrat-formulaire.png'))
shutil.copy(os.path.join(SRC, '41-setup-prestataire.png'), os.path.join(CROPS, '41-setup-prestataire.png'))
shutil.copy(os.path.join(SRC, '42-setup-rotation.png'), os.path.join(CROPS, '42-setup-rotation.png'))
im = op('43-setup-maintenance'); im.crop((0, 121, im.size[0], im.size[1])).save(os.path.join(CROPS, '43-setup-maintenance.png'))
im = op('50-exports-full'); im.crop((0, 132, 1360, min(im.size[1], 132 + 1040))).save(os.path.join(CROPS, '50-exports.png'))
im = op('52-exports-facture-full'); im.crop((0, 132, 1360, im.size[1])).save(os.path.join(CROPS, '52-exports-facture.png'))

# e-mails (hébergées par le site : https://rayanem-dev.github.io/pointage-app/mail/img/)
M = os.path.join(ROOT, 'mail', 'img')
for dest, src in [('agent', '60-agent-accueil'), ('annee', '14-vue-1-an'), ('client', '80-client-pointage'), ('completer', '11-completer'), ('demandes', '70-demandes-chef'),
                  ('mois', '12-global-mois'), ('materiel', '15-materiel-pointage'), ('arabe', '92-arabe'), ('groupees', '71-demandes-groupees'), ('contrat', '82-client-contrat')]:
    jpg(op(src), os.path.join(M, dest + '.jpg'), 1120)
jpg(Image.open(os.path.join(CROPS, '50-exports.png')).convert('RGB'), os.path.join(M, 'exports.jpg'), 1120)
jpg(Image.open(os.path.join(CROPS, '52-exports-facture.png')).convert('RGB'), os.path.join(M, 'facture.jpg'), 1120)
jpg(op('93-mobile'), os.path.join(M, 'mobile.jpg'), 300)

# aide intégrée (help/)
H = os.path.join(ROOT, 'help'); os.makedirs(H, exist_ok=True)
for f in sorted(os.listdir(os.path.join(SRC, 'help'))):
    if f.endswith('.png'): jpg(Image.open(os.path.join(SRC, 'help', f)).convert('RGB'), os.path.join(H, f[:-4] + '.jpg'), None, 82)

# vitrine JawlaDev
if JD:
    I = os.path.join(JD, 'assets', 'img')
    for dest, src in [('sijil-10-pointer', '10-pointer'), ('sijil-12-global-mois', '12-global-mois'), ('sijil-60-agent-accueil', '60-agent-accueil'), ('sijil-92-arabe', '92-arabe'),
                      ('sijil-15-materiel', '15-materiel-pointage'), ('sijil-51-attachement', '51-materiel-attachement'), ('sijil-71-demandes-groupees', '71-demandes-groupees')]:
        jpg(op(src), os.path.join(I, dest + '.jpg'), 1100)
    jpg(Image.open(os.path.join(CROPS, '50-exports.png')).convert('RGB'), os.path.join(I, 'sijil-50-exports.jpg'), 1100)
    jpg(Image.open(os.path.join(CROPS, '52-exports-facture.png')).convert('RGB'), os.path.join(I, 'sijil-52-facture.jpg'), 1100)
print('images rangées')
