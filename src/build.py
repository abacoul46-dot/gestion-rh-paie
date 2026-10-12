"""Construit index.html (application complète en un seul fichier) à partir des sources.
Usage : python3 src/build.py   (depuis la racine du dépôt)"""
import os
d = os.path.dirname(os.path.abspath(__file__))
lire = lambda n: open(os.path.join(d, n), encoding='utf8').read()
out = (lire('shell.html').replace('/*ENGINE*/', lire('engine.js')).replace('/*SEED*/', '[]')
       .replace('/*LOGO*/', '').replace('/*APP*/', lire('app.js')))
head, rest = out.split('</style>', 1)
pwa = ('<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#2b333c">\n'
       '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n')
sw = ("<script>if ('serviceWorker' in navigator && location.protocol === 'https:') "
      "{ navigator.serviceWorker.register('sw.js').catch(function () {}); }</script>\n")
html = ('<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' + pwa + head + '</style>\n</head>\n<body>\n'
        + rest + '\n' + sw + '</body>\n</html>\n')
open(os.path.join(d, '..', 'index.html'), 'w', encoding='utf8').write(html)
print('index.html :', len(html), 'octets')
