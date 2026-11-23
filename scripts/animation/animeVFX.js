(function(){
  const canvas = document.getElementById('animeVfxCanvas');
  const flashes = document.querySelector('.stadium-flashes');
  const flashColors = ['#ffffff', '#baf7ff', '#ffe69a'];
  for(let i = 0; i < 50; i++){
    const flash = document.createElement('span');
    flash.className = 'crowd-flash';
    const side = i % 4;
    const x = side === 2 ? Math.random() * 15 : side === 3 ? 85 + Math.random() * 15 : 5 + Math.random() * 90;
    const y = side === 0 ? 2 + Math.random() * 16 : side === 1 ? 82 + Math.random() * 16 : 20 + Math.random() * 60;
    flash.style.left = x + '%';
    flash.style.top = y + '%';
    flash.style.setProperty('--flash-color', flashColors[i % flashColors.length]);
    flash.style.setProperty('--flash-delay', (Math.random() * -5) + 's');
    flash.style.setProperty('--flash-duration', (4 + Math.random()) + 's');
    flashes.appendChild(flash);
  }
  const effects = [];
  const scoreTypes = ['TOUCHDOWN', 'FIELD GOAL'];
  const impactTypes = ['FUMBLE', 'INTERCEPTION', 'SACK'];
  const impactColors = {
    FUMBLE:['#FF4D72', '#FF9BE5'],
    INTERCEPTION:['#E45DFF', '#63E7FF'],
    SACK:['#FFB23F', '#FFF1AA']
  };
  let flashTimer, crowdTimer;

  window.clearAnimeVFX = function(){
    effects.length = 0;
    clearTimeout(flashTimer);
    clearTimeout(crowdTimer);
    flashes.classList.remove('anime-vfx-flash', 'crowd-celebrating');
    const context = canvas.getContext('2d');
    if(!context) throw new Error('Impossible de nettoyer le canvas des effets anime.');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  window.triggerCrowdCelebration = function(){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    clearTimeout(crowdTimer);
    flashes.classList.remove('crowd-celebrating');
    void flashes.offsetWidth;
    flashes.classList.add('crowd-celebrating');
    crowdTimer = setTimeout(() => flashes.classList.remove('crowd-celebrating'), 2000);
  };

  window.triggerAnimeVFX = function(type, x, y, teamColors){
    if(!scoreTypes.includes(type) && !impactTypes.includes(type)){
      throw new Error(`Type d'effet anime inconnu : "${type}".`);
    }
    if(!Number.isFinite(x) || !Number.isFinite(y)){
      throw new TypeError('Les coordonnées de l’effet anime doivent être numériques.');
    }
    if(!teamColors || !/^#[0-9a-f]{6}$/i.test(teamColors.primary) ||
       !/^#[0-9a-f]{6}$/i.test(teamColors.secondary)){
      throw new TypeError('Les couleurs de l’équipe doivent être des couleurs hexadécimales.');
    }
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const score = scoreTypes.includes(type);
    const count = score ? 40 : 16;
    const ringColors = impactColors[type];
    const colors = score
      ? ['#FFD66B', teamColors.primary, teamColors.secondary, '#FFF3C0']
      : [ringColors[0], ringColors[1], teamColors.secondary, '#FFFFFF'];
    const particles = Array.from({length:count}, (_, index) => ({
      angle:Math.PI * 2 * (index + Math.random() * 0.7) / count,
      speed:0.82 + Math.random() * 0.18,
      length:0.045 + Math.random() * 0.055,
      color:colors[index % colors.length],
      width:1.2 + Math.random() * 1.8
    }));
    effects.push({x, y, score, particles, ringColors, start:performance.now(), duration:score ? 1200 : 650});
    if(score){
      clearTimeout(flashTimer);
      flashes.classList.remove('anime-vfx-flash');
      void flashes.offsetWidth;
      flashes.classList.add('anime-vfx-flash');
      flashTimer = setTimeout(() => flashes.classList.remove('anime-vfx-flash'), 700);
    }
    refreshTacticalCanvas();
  };

  window.renderAnimeVFX = function(fieldBounds, now){
    if(!effects.length) return false;
    const bounds = canvas.getBoundingClientRect();
    if(!bounds.width || !bounds.height) return false;
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(bounds.width * ratio), pixelHeight = Math.round(bounds.height * ratio);
    if(canvas.width !== pixelWidth || canvas.height !== pixelHeight){
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    if(!context) throw new Error('Impossible de dessiner les effets anime.');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    for(let i = effects.length - 1; i >= 0; i--){
      const effect = effects[i], progress = (now - effect.start) / effect.duration;
      if(progress >= 1){ effects.splice(i, 1); continue; }
      const p = Math.max(0, progress);
      const originX = fieldBounds.left - bounds.left + fieldBounds.width * effect.x / 100;
      const originY = fieldBounds.top - bounds.top + fieldBounds.height * effect.y / 100;
      const eased = 1 - (1 - p) * (1 - p);
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = 1 - p;
      context.lineCap = 'round';
      context.shadowBlur = 12;
      if(!effect.score){
        const radius = Math.max(20, Math.min(fieldBounds.width, fieldBounds.height) * 0.22);
        for(let ring = 0; ring < 2; ring++){
          const ringProgress = Math.max(0, (p - ring * 0.12) / (1 - ring * 0.12));
          context.strokeStyle = effect.ringColors[ring];
          context.shadowColor = context.strokeStyle;
          context.lineWidth = ring === 0 ? 3 : 2;
          context.beginPath();
          context.arc(originX, originY, radius * (1 - (1 - ringProgress) ** 2), 0, Math.PI * 2);
          context.stroke();
        }
      }
      effect.particles.forEach(particle => {
        const dx = Math.cos(particle.angle), dy = Math.sin(particle.angle);
        const edgeX = dx > 0 ? (bounds.width - originX) / dx : dx < 0 ? -originX / dx : Infinity;
        const edgeY = dy > 0 ? (bounds.height - originY) / dy : dy < 0 ? -originY / dy : Infinity;
        const distance = effect.score ? Math.min(edgeX, edgeY) : Math.min(fieldBounds.width, fieldBounds.height) * 0.28;
        const head = Math.min(1, eased / particle.speed) * distance;
        const tail = Math.max(0, head - distance * particle.length);
        context.strokeStyle = particle.color;
        context.shadowColor = particle.color;
        context.lineWidth = particle.width;
        context.beginPath();
        context.moveTo(originX + dx * tail, originY + dy * tail);
        context.lineTo(originX + dx * head, originY + dy * head);
        context.stroke();
      });
      context.restore();
    }
    return effects.length > 0;
  };
})();
