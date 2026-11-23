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
Les couleurs primaires restent visibles dans le HUD et les zones d’en-but.
Quand les couleurs des deux équipes sont trop proches, l’équipe IA reçoit
automatiquement une tenue blanche à liseré de sa couleur, afin de garder une
identité visuelle distincte sans changer les couleurs de la franchise. Cette
adaptation ne nécessite aucune annonce pendant le toss.

Les classes `.icon-button`, `.overlay-panel`, `.choice-category` et
`.commentator-bubble` servent de base aux prochaines étapes de l’interface.
Les annonces du match utilisent le cut-in anime. Pour le tester dans la console
du navigateur, utilisez par exemple
`showAnimeCutin('touchdown', 'Touchdown', 'Grand jeu', 'Grand Mesa Mustangs')`.
Les types disponibles sont `touchdown`, `fieldgoal`, `turnover`, `impact` et
`firstdown` ; le dernier argument doit être le nom exact d'une équipe.
Les événements successifs sont affichés dans l'ordre ; la sélection d'un nouveau
play efface les annonces en attente. Le portrait suit l'événement affiché, puis
revient à l'expression neutre lorsque le choix suivant est disponible.
Le bloc du commentateur associe un portrait animé et une boîte de dialogue dans
deux panneaux manga en perspective, avec l'onglet « LIVE COMMENTARY ». Le
portrait agrandi passe devant le bord des commentaires, tandis que le Playbook
reste aligné à droite en bas de l'écran.
Les tests ciblés du cut-in se lancent avec `node --test tests/animeCutin.test.js`.
Les pictogrammes vectoriels réutilisables sont dans
`assets/images/ui-icons.svg` ; le portrait du commentateur est généré au
chargement du jeu.
En cas d'échec de sauvegarde, un avertissement apparaît sous les commandes en
haut à droite.

L’écran de match utilise le stade ultra-large comme scène plein écran. L'image
est centrée et recadrée selon le format de la fenêtre ; le terrain et le masque
des tribunes suivent ce même recadrage. Les zones restantes représentent les
tribunes et l’enceinte. Le tableau de score et la situation tactique restent en
surimpression ; les réglages et les tendances s’ouvrent dans des panneaux.
Les tribunes et les projecteurs prennent les couleurs primaires des deux équipes
sans teinter la pelouse. Les flashs du public accélèrent pendant deux secondes
lors des touchdowns et des gros jeux, sauf si les animations sont réduites.
Le masque des tribunes suit le contour du muret autour de toute l'enceinte verte ;
cinquante flashs indépendants animent les quatre côtés du stade.
Soixante-quatre drapeaux répartis dans les tribunes utilisent les couleurs des
équipes. Ils accélèrent pendant 2,5 secondes dans le camp concerné par un
touchdown ou un gros jeu ; ils restent immobiles si les animations sont réduites.
Leurs planches sont `assets/images/flags_pennant.jpg` et
`assets/images/flags_square.jpg`.
Le tableau de score adopte un style manga angulaire : bordures polygonales
asymétriques, ailes en perspective, logos débordants, scores aux couleurs des
équipes, horloge ambrée sombre et bandeau de situation contrasté. Sur les
écrans très étroits, les noms longs peuvent être tronqués visuellement ; leur
nom complet reste disponible aux lecteurs d’écran.
Les marqueurs des joueurs sont agrandis pour rester lisibles à cette échelle.
Après chaque action animée, les joueurs restent en place deux secondes puis
chaque équipe forme un huddle. Les commandes restent disponibles : un choix
immédiat interrompt l'attente ou le huddle et les joueurs rejoignent leur
nouvelle formation avant le snap. En mode mouvement réduit, les déplacements
sont instantanés après l'attente. Après un changement de possession, les postes
affichés dans les huddles correspondent aux nouvelles équipes d'attaque et de défense.
Le panneau des tendances tactiques est accessible depuis la rangée de gestion
du play, à côté du temps mort et du tempo.
Sur les écrans peu hauts en paysage, le Playbook affiche un en-tête compact ;
en attaque, le bouton « Temps & tempo » ouvre les commandes de tempo, spike et
genou à terre disponibles selon la situation.
Les lignes de scrimmage et de 1st Down sont distinguées par leur couleur et
leur libellé. La ligne de 1st Down est continue. Le jeu est conçu pour un
affichage en paysage, notamment sur desktop au format 16:9.
Les catégories tactiques et leurs sous-menus sont navigables au clavier ; le
focus suit l’ouverture d’une catégorie et revient au bouton déclencheur lors de
la fermeture des panneaux. Le choix du tempo est annoncé comme un état
sélectionné ; les annonces de phase et de résultat sont exposées aux lecteurs
d’écran.
En attaque, choisissez la catégorie course/passe puis la tactique ; les tactiques
avec plusieurs directions proposent ensuite leurs directions disponibles.
Leurs fiches affichent les forces et faiblesses générales ; lorsqu'elles
varient selon la direction, les fiches suivantes présentent les valeurs propres
à chaque direction. Chaque carte comporte un schéma tactique ; les variantes
directionnelles affichent leur tracé correspondant.
En 4e tentative, le field goal (si sa distance le permet), son pourcentage de
réussite, puis le punt précèdent les deux catégories offensives ; le fake field
goal, disponible à la même distance que le field goal, vient en dernier.
En défense, les catégories sont affichées dans l'ordre défense contre la course,
couverture puis pression. Les cartes de jeux défilent horizontalement ; la molette permet de parcourir
la rangée. Les commandes de l'en-tête passent à la ligne lorsque nécessaire,
notamment en 4e tentative.

Les textes statiques de la page sont associés à leurs entrées de `ui.json` par
les attributs `data-text` et `data-title` dans `index.html`.

## Musique et sons

Le bouton « Activer la musique », disponible au coin toss et pendant le match,
joue d’abord `assets/sounds/20secs.mp3`, puis répète `assets/sounds/loop.mp3`.
Les voix de big play choisissent aléatoirement `Marvellous.mp3`,
`Incredible.mp3` ou `WAP.mp3` ; un touchdown déclenche `TD.mp3`. Un field goal
réussi ou manqué joue respectivement `Good.mp3` ou `NoGood.mp3`. La réaction
`booing.mp3` reste utilisée quand l’équipe du joueur perd le ballon sur
interception ou fumble. Les sons brefs de snap, passe, réception, plaquage,
sifflet et premier down sont générés par Web Audio ; ils ne nécessitent pas de
fichiers supplémentaires. Les fichiers audio fournis doivent rester dans ce
dossier avec leurs noms exacts.

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
perte du ballon de sa récupération ; les field goals utilisent aussi les
événements snap, kick et sifflet. Les punts ont leur propre formation et
animent le snap au punter, le coup de pied, la réception et le retour. Le
résultat est calculé avant le snap : un punt reçu (hors touchback) a 1 % de
chances d'être retourné pour un touchdown, suivi d'une transformation en temps
réglementaire.

Cette chronologie ne recalcule ni ne modifie le résultat sportif. Le panneau
**Mode debug (animation)** affiche les événements prévus, leur progression et
ceux déjà déclenchés.

Pendant le choix tactique, une formation neutre présente les 22 joueurs autour
de la ligne de scrimmage, sans révéler les appels choisis. Elle est remplacée
par les formations propres aux jeux au début de la séquence pré-snap. Les
alignements défensifs varient selon la tactique ; les couvertures individuelles
s'adaptent aussi aux receveurs adverses, en laissant un safety profond en Cover 1.
Les pions et leurs trajectoires lumineuses reprennent la couleur principale de
leur équipe, que celle-ci soit en attaque ou en défense.

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
Les touchdowns et field goals déclenchent des traînées d'énergie depuis la zone
d'en-but atteinte, avec un flash dans les gradins. Les fumbles, interceptions
et sacks produisent une onde de choc à l'endroit de l'action. Ces effets sont
synchronisés avec les bannières, sans modifier le résultat sportif. Si le
système demande une réduction des animations, ils sont supprimés et les
bannières restent affichées sans mouvement.

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
