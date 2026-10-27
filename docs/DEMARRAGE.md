# Démarrer Coach Tony

Le jeu charge ses textes depuis les catalogues JSON du dossier `json/`. Il faut
le lancer depuis un serveur HTTP local : les navigateurs bloquent généralement
les requêtes JSON lorsque la page est ouverte directement en `file://`.

## Méthode recommandée : Live Server

1. Ouvrez le dossier du projet dans VS Code.
2. Installez l’extension Live Server si nécessaire.
3. Dans l’explorateur de fichiers, faites un clic droit sur `index.html`, puis
   choisissez **Open with Live Server** (ou **Ouvrir avec Live Server**).
4. Le jeu s’ouvre à une adresse locale en `http://`, généralement sur le port
   `5500`. Gardez VS Code ouvert pendant que vous jouez.

Après avoir modifié un catalogue JSON, rechargez la page dans le navigateur.
N’ouvrez pas `index.html` directement depuis l’explorateur Windows : l’adresse
doit commencer par `http://`, pas `file://`.

Un autre serveur HTTP statique peut être utilisé à la place, à condition de
servir la racine du projet afin que `index.html`, `scripts/`, `styles/` et
`json/` restent accessibles à leurs chemins relatifs.

## Catalogues de textes

- `json/ui.json` : interface, commandes, écrans et sélecteurs.
- `json/game.json` : déroulement et résultats du match.
- `json/playbook.json` : noms affichés, catégories et descriptions des tactiques.
- `json/commentary.json` : réactions du commentateur.
- `json/save.json` : sauvegarde, reprise et messages associés.
- `json/animation.json` : phases, événements et détails de diagnostic d’animation.
- `json/teams.json` : noms des équipes.

Les scripts accèdent aux textes avec des clés telles que
`t('game.match.kickoffTitle')`. Les valeurs entre accolades, par exemple
`{yards}`, sont remplacées par les données transmises à `t()`. Conservez les
clés et les paramètres entre accolades lorsque vous modifiez les traductions.
Les noms utilisés par le moteur de jeu restent des identifiants internes ; les
libellés visibles correspondants se modifient dans `playbook.json`.

Les textes statiques de la page sont associés à leurs entrées de `ui.json` par
les attributs `data-text` et `data-title` dans `index.html`.

## Musique et sons

Le bouton « Activer la musique », disponible au coin toss et pendant le match,
joue d’abord `assets/sounds/20secs.mp3`, puis répète `assets/sounds/loop.mp3`.
Les effets `assets/sounds/booing.mp3` et `assets/sounds/cheering.mp3` sont
utilisés respectivement quand l’équipe du joueur perd le ballon sur interception
ou fumble, et lors d’un big play ou d’un touchdown. Les fichiers audio doivent
rester dans ce dossier avec ces noms exacts.

Les libellés du journal de calcul de l’IA et du journal des tests d’équilibrage
restent dans `scripts/ui/interface.js` : ce sont des sorties de diagnostic
technique plutôt que du contenu éditorial du jeu.

Le bouton **Lancer les tests d’équilibrage** exécute les vérifications intégrées
au jeu depuis le navigateur.

## Chronologie des animations

Le moteur calcule d’abord l’issue du play (gain, passe incomplète, interception,
fumble, etc.). Le contrôleur d’animation construit ensuite une chronologie
normalisée de 0 à 100 % à partir de cette issue. Elle déclenche les événements
visuels et sonores dans l’ordre prévu : snap, remise ou passe, réception ou
incomplétude, turnover, plaquage et coup de sifflet. Les fumbles distinguent la
perte du ballon de sa récupération ; les field goals et punts utilisent aussi
les événements snap, kick et sifflet.

Cette chronologie ne recalcule ni ne modifie le résultat sportif. Le panneau
**Mode debug (animation)** affiche les événements prévus, leur progression et
ceux déjà déclenchés.

## Publication automatique sur GitHub

Le workflow `.github/workflows/publish-release.yml` crée une release GitHub
numérotée à chaque push sur la branche `main`. Chaque release contient une
archive ZIP du projet au commit envoyé. Les versions suivent le format
`v0.5.1-build.1`, puis `v0.5.1-build.2`, etc. Le numéro de build est attribué
par GitHub Actions ; cette publication ne modifie pas le numéro de version
affiché dans le jeu (`GAME_VERSION`).

Pour l’activer :

1. Crée un dépôt GitHub vide et configure Git sur ton ordinateur (Git for
   Windows si la commande `git` n’existe pas).
2. À la racine du projet, ouvre PowerShell et exécute :

   ```powershell
   git init
   git add .
   git commit -m "Initial project upload"
   git branch -M main
   git remote add origin https://github.com/TON-PSEUDO/NOM-DU-DEPOT.git
   git push -u origin main
   ```

3. Le premier push déclenche le workflow. Dans l’onglet **Actions** du dépôt,
   vérifie qu’il se termine correctement ; la release et son archive ZIP
   apparaîtront ensuite dans **Releases**.

Pour publier les modifications suivantes, enregistre-les et pousse-les sur
`main` avec `git add`, `git commit` et `git push`. Les pushes sur d’autres
branches ne créent pas de release. Le workflow utilise le `GITHUB_TOKEN` fourni
par GitHub Actions et demande la permission `contents: write` pour créer les
tags/releases et téléverser l’archive.
