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

## Fondations graphiques

La direction artistique de l’interface s’inspire d’une retransmission sportive :
fond bleu-vert profond, terrain vert, or pour les moments clés et couleurs
d’équipe pour distinguer les camps. Les tokens de couleur, d’espacement,
d’arrondi et d’ombre sont définis dans `styles/main.css`.

Les classes `.icon-button`, `.overlay-panel`, `.choice-category` et
`.commentator-bubble` servent de base aux prochaines étapes de l’interface.
Les pictogrammes vectoriels réutilisables sont dans
`assets/images/ui-icons.svg` ; l’illustration `assets/images/commentator-manga.svg`
est une création originale destinée à accompagner les commentaires.

L’écran de match utilise le stade comme scène plein écran. Le terrain conserve
un ratio de 120 par 53,3 (environ 2,25:1) ; les zones restantes représentent les
tribunes et l’enceinte. Le tableau de score et la situation tactique restent en
surimpression ; les réglages et les tendances s’ouvrent dans des panneaux.
Les marqueurs des joueurs sont agrandis pour rester lisibles à cette échelle.
Le panneau des tendances tactiques est accessible depuis la rangée de gestion
du play, à côté du temps mort et du tempo.
Les lignes de scrimmage et de 1st Down sont désormais distinguées par leur
couleur et leur libellé. La ligne de 1st Down est continue. En portrait, le terrain reste à son ratio naturel et
se place sous le HUD compact ; les gradins utilisent des rangées et des
sections de sièges plus lisibles.
Les catégories tactiques et leurs sous-menus sont navigables au clavier ; le
focus suit l’ouverture d’une catégorie et revient au bouton déclencheur lors de
la fermeture des panneaux. Le choix du tempo est annoncé comme un état
sélectionné ; les annonces de phase et de résultat sont exposées aux lecteurs
d’écran.
En attaque, les appels sont choisis par catégorie course/passe ; en défense,
par pression, couverture ou défense contre la course.

Les textes statiques de la page sont associés à leurs entrées de `ui.json` par
les attributs `data-text` et `data-title` dans `index.html`.

## Musique et sons

Le bouton « Activer la musique », disponible au coin toss et pendant le match,
joue d’abord `assets/sounds/20secs.mp3`, puis répète `assets/sounds/loop.mp3`.
Les réactions `assets/sounds/booing.mp3` et `assets/sounds/cheering.mp3` sont
utilisées respectivement quand l’équipe du joueur perd le ballon sur interception
ou fumble, et lors d’un big play ou d’un touchdown. Les sons brefs de snap,
passe, réception, plaquage, sifflet et premier down sont générés par Web Audio ;
ils ne nécessitent pas de fichiers supplémentaires. Les fichiers audio fournis
doivent rester dans ce dossier avec leurs noms exacts.

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

Les joueurs suivent des courbes cubiques qui traversent leurs points de passage
avec une vitesse continue, plutôt que de ralentir à chaque point. Les délais de
départ restent déterministes et varient selon le joueur ; ils ne changent ni les
résultats ni la durée logique du match.
Les variations défensives ne sont ajoutées que sur des segments assez longs pour
éviter les accélérations brusques, et les joueurs concernés s'immobilisent au
point du plaquage lorsque l'action se termine par un gain, un touchdown ou un
sack.

Les moments forts ont des effets visuels renforcés et ciblés : impact au point
du sack, flash et onde de choc au turnover, traînées brèves derrière le porteur
lors d'une échappée, et lumière concentrée sur la zone d'en-but au touchdown.
Les touchdowns conservent leurs confettis et gerbes spectaculaires ; ils ne
modifient jamais le résultat sportif. Si le système demande une réduction des
animations, les célébrations animées sont supprimées et les bannières restent
affichées sans mouvement pour garder l'événement compréhensible.

En mode debug animation, les assignments sont séparés entre attaque et défense.
Les défenseurs en marquage individuel conservent leur receveur désigné comme
cible tout au long de sa route ; les défenseurs de zone restent identifiés
comme responsables de leur zone et ne sont pas confondus avec un suivi individuel.

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
