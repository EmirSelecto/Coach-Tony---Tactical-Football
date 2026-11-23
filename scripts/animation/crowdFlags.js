(function(){
  const paths = ['assets/images/flags_pennant.jpg', 'assets/images/flags_square.jpg'];
  const canvas = document.getElementById('crowdFlagsCanvas');
  const context = canvas.getContext('2d');
  if(!context) throw new Error('Impossible de créer le canvas des drapeaux.');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const flags = [];
  const celebrations = {player:0, ai:0};
  let sprites, palette, animationFrame = 0, lastTime = 0, needsDraw = true;

  function makeCanvas(width, height){
    const result = document.createElement('canvas');
    result.width = width;
    result.height = height;
    const ctx = result.getContext('2d', {willReadFrequently:true});
    if(!ctx) throw new Error('Impossible de préparer les sprites des drapeaux.');
    return {canvas:result, context:ctx};
  }

  function removeBackground(imageData, width, height){
    const pixels = imageData.data;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let read = 0, write = 0;
    function visit(index){
      if(visited[index]) return;
      visited[index] = 1;
      const offset = index * 4;
      const distance = Math.hypot(pixels[offset] - 9, pixels[offset + 1] - 13, pixels[offset + 2] - 22);
      if(distance > 35) return;
      pixels[offset + 3] = distance <= 17 ? 0 : Math.round(255 * (distance - 17) / 18);
      queue[write++] = index;
    }
    [0, width - 1, (height - 1) * width, height * width - 1].forEach(visit);
    while(read < write){
      const index = queue[read++], x = index % width, y = Math.floor(index / width);
      if(x) visit(index - 1);
      if(x + 1 < width) visit(index + 1);
      if(y) visit(index - width);
      if(y + 1 < height) visit(index + width);
    }
  }

  function extractSheet(image, path){
    if(image.naturalWidth !== 1152 || image.naturalHeight !== 864){
      throw new Error(`${path} doit mesurer 1152x864px.`);
    }
    const cellWidth = image.naturalWidth / 6, cellHeight = image.naturalHeight / 4;
    const width = Math.max(cellWidth, cellHeight), height = width;
    // Certaines cases de la planche carrée ne pointent pas dans le sens de leur ligne.
    const squareRotations = [
      [0, 0, Math.PI, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, -Math.PI / 2, -Math.PI / 2],
      [0, 0, 0, 0, Math.PI / 2, Math.PI / 2]
    ];
    return Array.from({length:4}, (_, row) => {
      const frames = [];
      let left = width, top = height, right = -1, bottom = -1;
      for(let column = 0; column < 6; column++){
        const {canvas:cell, context:cellContext} = makeCanvas(cellWidth, cellHeight);
        cellContext.drawImage(image, column * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
        const cellData = cellContext.getImageData(0, 0, cellWidth, cellHeight);
        removeBackground(cellData, cellWidth, cellHeight);
        cellContext.putImageData(cellData, 0, 0);
        const {canvas:frame, context:ctx} = makeCanvas(width, height);
        ctx.translate(width / 2, height / 2);
        if(path === paths[1]) ctx.rotate(squareRotations[row][column]);
        ctx.drawImage(cell, -cellWidth / 2, -cellHeight / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const data = ctx.getImageData(0, 0, width, height);
        for(let y = 0; y < height; y++){
          for(let x = 0; x < width; x++){
            if(data.data[(y * width + x) * 4 + 3] > 32){
              left = Math.min(left, x); right = Math.max(right, x);
              top = Math.min(top, y); bottom = Math.max(bottom, y);
            }
          }
        }
        frames.push(frame);
      }
      if(right < left || bottom < top) throw new Error(`Ligne ${row + 1} vide dans ${path}.`);
      return frames.map(frame => {
        const {canvas:cropped, context:ctx} = makeCanvas(right - left + 1, bottom - top + 1);
        ctx.drawImage(frame, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
        return cropped;
      });
    });
  }

  function tint(frame, color){
    const {canvas:mask, context:maskContext} = makeCanvas(frame.width, frame.height);
    maskContext.drawImage(frame, 0, 0);
    const data = maskContext.getImageData(0, 0, frame.width, frame.height);
    for(let i = 0; i < data.data.length; i += 4){
      const brightness = Math.min(data.data[i], data.data[i + 1], data.data[i + 2]);
      data.data[i + 3] = Math.round(data.data[i + 3] * Math.max(0, Math.min(1, (brightness - 100) / 55)));
    }
    maskContext.putImageData(data, 0, 0);
    const {canvas:colored, context:coloredContext} = makeCanvas(frame.width, frame.height);
    coloredContext.drawImage(frame, 0, 0);
    coloredContext.globalCompositeOperation = 'multiply';
    coloredContext.fillStyle = color;
    coloredContext.fillRect(0, 0, frame.width, frame.height);
    coloredContext.globalCompositeOperation = 'destination-in';
    coloredContext.drawImage(mask, 0, 0);
    const {canvas:result, context:resultContext} = makeCanvas(frame.width, frame.height);
    resultContext.drawImage(frame, 0, 0);
    resultContext.drawImage(colored, 0, 0);
    return result;
  }

  function placeFlags(){
    const groups = [
      {row:0, side:'player', x:[.20,.47], y:[.08,.13], columns:12, rows:1, bounds:[.19,.48,.055,.16]},
      {row:0, side:'ai', x:[.53,.80], y:[.08,.13], columns:12, rows:1, bounds:[.52,.81,.055,.16]},
      {row:0, side:'player', x:[.11,.19], y:[.155,.205], columns:4, rows:1, bounds:[.10,.20,.125,.23]},
      {row:0, side:'ai', x:[.81,.89], y:[.155,.205], columns:4, rows:1, bounds:[.80,.90,.125,.23]},
      {row:1, side:'player', x:[.20,.47], y:[.915,.975], columns:12, rows:1, bounds:[.19,.48,.895,1]},
      {row:1, side:'ai', x:[.53,.80], y:[.915,.975], columns:12, rows:1, bounds:[.52,.81,.895,1]},
      {row:1, side:'player', x:[.11,.19], y:[.795,.845], columns:4, rows:1, bounds:[.10,.20,.77,.875]},
      {row:1, side:'ai', x:[.81,.89], y:[.795,.845], columns:4, rows:1, bounds:[.80,.90,.77,.875]},
      {row:2, side:'player', x:[.06,.18], y:[.25,.75], columns:4, rows:6, bounds:[.05,.19,.23,.77]},
      {row:3, side:'ai', x:[.82,.94], y:[.25,.75], columns:4, rows:6, bounds:[.81,.95,.23,.77]}
    ];
    for(const group of groups){
      const groupFlags = [];
      const count = group.columns * group.rows;
      for(let i = 0; i < count; i++){
        let x, y, valid = false;
        for(let attempt = 0; attempt < 1000 && !valid; attempt++){
          x = group.x[0] + (i % group.columns + .15 + Math.random() * .7) / group.columns * (group.x[1] - group.x[0]);
          y = group.y[0] + (Math.floor(i / group.columns) + .15 + Math.random() * .7) / group.rows * (group.y[1] - group.y[0]);
          valid = flags.every(flag => Math.hypot((flag.x - x) * 1493, (flag.y - y) * 640) >= 29);
        }
        if(!valid) throw new Error('Impossible de répartir les drapeaux dans les tribunes.');
        const flag = {x, y, row:group.row, side:group.side, bounds:group.bounds, kind:Math.floor(Math.random() * 2),
          size:22 + Math.random() * 6, speed:8 + Math.random() * 2, phase:Math.random() * 6,
          secondary:false, frame:-1};
        flags.push(flag);
        groupFlags.push(flag);
      }
      for(let i = groupFlags.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [groupFlags[i], groupFlags[j]] = [groupFlags[j], groupFlags[i]];
      }
      groupFlags.slice(0, count / 2).forEach(flag => { flag.secondary = true; });
    }
  }

  function draw(){
    if(!palette) return;
    const bounds = canvas.getBoundingClientRect();
    if(!bounds.width || !bounds.height) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
    if(canvas.width !== width || canvas.height !== height){
      canvas.width = width; canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    flags.forEach(flag => {
      const frame = palette[flag.side][flag.secondary ? 1 : 0][flag.kind][flag.row][Math.floor(flag.phase) % 6];
      const scale = Math.min(flag.size, bounds.height * .10) / Math.max(frame.width, frame.height);
      const w = frame.width * scale, h = frame.height * scale;
      const [left, right, top, bottom] = flag.bounds;
      const x = Math.max(left * bounds.width + w / 2, Math.min(right * bounds.width - w / 2, flag.x * bounds.width));
      const y = Math.max(top * bounds.height + h / 2, Math.min(bottom * bounds.height - h / 2, flag.y * bounds.height));
      context.drawImage(frame, x - w / 2, y - h / 2, w, h);
      flag.frame = Math.floor(flag.phase) % 6;
    });
    needsDraw = false;
  }

  function advance(now){
    if(lastTime){
      const elapsed = Math.max(0, now - lastTime);
      flags.forEach(flag => {
        const boosted = Math.max(0, Math.min(now, celebrations[flag.side]) - lastTime);
        flag.phase = (flag.phase + ((elapsed - boosted) * flag.speed + boosted * 18) / 1000) % 6;
        if(Math.floor(flag.phase) !== flag.frame) needsDraw = true;
      });
    }
    lastTime = now;
  }

  function tick(now){
    animationFrame = 0;
    advance(now);
    if(needsDraw) draw();
    if(!motion.matches && !document.hidden) animationFrame = requestAnimationFrame(tick);
  }

  function restart(){
    if(animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastTime = 0;
    needsDraw = true;
    if(palette) draw();
    if(palette && !motion.matches && !document.hidden) animationFrame = requestAnimationFrame(tick);
  }

  const ready = Promise.all(paths.map(path => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Impossible de charger l’image ${path}.`));
    image.src = path;
  }))).then(images => {
    sprites = images.map((image, index) => extractSheet(image, paths[index]));
    placeFlags();
  });

  window.CrowdFlags = {
    ready,
    setTeams(teams){
      const colors = [teams.player.color, teams.player.secondaryColor, teams.ai.color, teams.ai.secondaryColor];
      if(colors.some(color => !/^#[0-9a-f]{6}$/i.test(color))){
        throw new TypeError('Les couleurs des drapeaux doivent être hexadécimales.');
      }
      if(!sprites) throw new Error('Les planches de drapeaux ne sont pas encore chargées.');
      const variants = new Map();
      colors.forEach(color => {
        if(!variants.has(color)) variants.set(color, sprites.map(sheet => sheet.map(row => row.map(frame => tint(frame, color)))));
      });
      palette = {player:[variants.get(colors[0]), variants.get(colors[1])],
        ai:[variants.get(colors[2]), variants.get(colors[3])]};
      celebrations.player = celebrations.ai = 0;
      restart();
    },
    celebrate(side){
      if(side !== 'player' && side !== 'ai') throw new Error(`Camp inconnu pour les drapeaux : "${side}".`);
      if(motion.matches || document.hidden) return;
      const now = performance.now();
      advance(now);
      celebrations[side] = now + 2500;
    },
    clearCelebrations(){
      celebrations.player = celebrations.ai = 0;
      lastTime = 0;
    }
  };
  window.addEventListener('resize', restart);
  document.addEventListener('visibilitychange', restart);
  motion.addEventListener('change', () => {
    celebrations.player = celebrations.ai = 0;
    restart();
  });
})();
