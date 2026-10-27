(async function loadGame(){
  const catalogs = [
    'ui',
    'game',
    'playbook',
    'commentary',
    'save',
    'animation',
    'teams'
  ];
  const scripts = [
    'scripts/game/rules.js',
    'scripts/services/save.js',
    'scripts/game/engine.js',
    'scripts/services/audio.js',
    'scripts/game/runtime.js',
    'scripts/animation/players.js',
    'scripts/animation/timeline.js',
    'scripts/game/plays.js',
    'scripts/ui/interface.js',
    'scripts/app.js',
    'scripts/services/inline-edit-bridge.js'
  ];

  try{
    const loadedCatalogs = await Promise.all(catalogs.map(async name => {
      const response = await fetch(`json/${name}.json`);
      if(!response.ok) throw new Error(`Impossible de charger json/${name}.json (${response.status}).`);
      const catalog = await response.json();
      if(!catalog || typeof catalog !== 'object' || Array.isArray(catalog)){
        throw new Error(`Le fichier json/${name}.json doit contenir un objet.`);
      }
      return [name, catalog];
    }));

    window.GAME_TEXTS = Object.fromEntries(loadedCatalogs);
    if(!Array.isArray(window.GAME_TEXTS.teams.names) ||
       window.GAME_TEXTS.teams.names.some(name => typeof name !== 'string' || !name.trim())){
      throw new Error('json/teams.json doit contenir une liste de noms d’équipes non vides.');
    }

    const resolveText = path => {
      const value = path.split('.').reduce((entry, key) =>
        entry && Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : undefined,
      window.GAME_TEXTS);
      if(typeof value !== 'string') throw new Error(`Texte JSON manquant ou invalide : "${path}".`);
      return value;
    };
    const formatText = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match);

    document.querySelectorAll('[data-text]').forEach(element => {
      const values = element.dataset.textValues ? JSON.parse(element.dataset.textValues) : {};
      element.textContent = formatText(resolveText(element.dataset.text), values);
    });
    document.querySelectorAll('[data-title]').forEach(element => {
      element.title = resolveText(element.dataset.title);
    });

    for(const src of scripts){
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Impossible de charger ${src}.`));
        document.body.appendChild(script);
      });
    }
  } catch(error){
    console.error('Échec du chargement des textes ou des scripts du jeu.', error);
    const notice = document.createElement('p');
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;z-index:10000;inset:1rem 1rem auto;padding:1rem;background:#5b1717;color:#fff;border:1px solid #ff8b8b;border-radius:8px;font:600 1rem sans-serif;';
    notice.textContent = `Impossible de démarrer le jeu : ${error.message} Vérifiez les fichiers du dossier json et ouvrez index.html depuis un serveur HTTP local.`;
    document.body.prepend(notice);
  }
})();
