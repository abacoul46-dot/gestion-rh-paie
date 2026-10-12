# Gestion RH & Paie

Logiciel de paie et de gestion du personnel (calculs repris du classeur Excel « Logiciel de gestion RH »), édité par ABA GROUP — Bamako.

Application en ligne : https://abacoul46-dot.github.io/gestion-rh-paie/

## Fonctionnement

- Chaque entreprise cliente a ses données, ses utilisateurs et une licence annuelle.
- Rôles : Administrateur, Gestionnaire de paie, Consultation seule.
- Les données sont enregistrées en ligne (Supabase) et gardées sur l'ordinateur : l'application continue de fonctionner sans connexion et envoie les modifications au retour du réseau.
- Une copie par jour est conservée 30 jours (Fichier › Historique des sauvegardes).
- L'éditeur gère les licences depuis Fichier › Console éditeur.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | application construite (ne pas modifier à la main) |
| `src/engine.js` | moteur de calcul (formules du classeur) |
| `src/app.js` | interface, comptes, licences, synchronisation |
| `src/shell.html` | mise en page et styles |
| `src/build.py` | construit `index.html` : `python3 src/build.py` |
| `supabase/schema.sql` | base de données : à exécuter dans Supabase › SQL Editor |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | installation comme application de bureau |
