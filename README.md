# Gestion RH & Paie

Logiciel de paie et de gestion du personnel (calculs repris du classeur Excel « Logiciel de gestion RH »), édité par ABA GROUP — Bamako.

Application en ligne : https://abacoul46-dot.github.io/gestion-rh-paie/

## Installation chez un client (comme Sage)

1. Le client télécharge et lance **Setup-GestionRH-Paie.exe** (page *Releases* du dépôt). L'installation ne demande pas de droits administrateur : raccourcis Bureau et menu Démarrer, désinstallation par « Applications installées ».
2. Au premier démarrage, il saisit la **clé de licence** (RHP-XXXX-XXXX-XXXX-XXXX) remise par ABA GROUP et le nom du poste.
3. Chaque ordinateur activé occupe un poste de la licence. Un poste se libère par Fichier › Désactiver ce poste, ou depuis Fichier › Utilisateurs et postes.
4. Le logiciel installé se met à jour tout seul (nouvelle version prise en compte au démarrage suivant).

Les clés sont créées dans la console éditeur (Fichier › Console éditeur) : Nouvelle licence → la clé s'affiche.

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
| `supabase/02_cles_licence.sql` | clés de licence et postes : à exécuter ensuite (nécessite « Allow anonymous sign-ins ») |
| `installer/` | programme d'installation Windows (Go) : `installer/build.sh` produit `dist/Setup-GestionRH-Paie.exe` |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | installation comme application de bureau |
