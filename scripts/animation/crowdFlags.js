(function(){
  const paths = ['assets/images/flags_pennant.jpg', 'assets/images/flags_square.jpg'];
  const stadiumPath = 'assets/images/imagesstadium_base_wide.jpg.jpg';
  const canvas = document.getElementById('crowdFlagsCanvas');
  const context = canvas.getContext('2d');
  if(!context) throw new Error('Impossible de créer le canvas des drapeaux.');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const flags = [];
  const celebrations = {player:0, ai:0};
  let sprites, audience, palette, animationFrame = 0, lastTime = 0, needsDraw = true;

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
    const poleBases = path === paths[0] ? [
      Array(6).fill([64,103]), Array(6).fill([99,190]),
      Array(6).fill([55,155]), Array(6).fill([136,155])
    ] : [
      [[20,143],[22,143],[99,199],[167,143],[173,143],[171,143]],
      [[96,191],[97,191],[96,194],[95,190],[95,190],[95,190]],
      [[84,189],[71,189],[40,184],[36,184],[20,151],[20,151]],
      [[108,190],[112,190],[152,188],[152,188],[170,151],[170,151]]
    ];
    return Array.from({length:4}, (_, row) => {
      const frames = [];
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for(let column = 0; column < 6; column++){
        const {canvas:cell, context:cellContext} = makeCanvas(cellWidth, cellHeight);
        cellContext.drawImage(image, column * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
        const cellData = cellContext.getImageData(0, 0, cellWidth, cellHeight);
        removeBackground(cellData, cellWidth, cellHeight);
        cellContext.putImageData(cellData, 0, 0);
        const {canvas:frame, context:ctx} = makeCanvas(width, height);
        const angle = path === paths[1] ? squareRotations[row][column] : 0;
        const [baseX, baseY] = poleBases[row][column];
        const dx = baseX - cellWidth / 2, dy = baseY - cellHeight / 2;
        const anchorX = Math.round(width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle));
        const anchorY = Math.round(height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle));
        ctx.translate(width / 2, height / 2);
        if(path === paths[1]) ctx.rotate(angle);
        ctx.drawImage(cell, -cellWidth / 2, -cellHeight / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const data = ctx.getImageData(0, 0, width, height);
        for(let y = 0; y < height; y++){
          for(let x = 0; x < width; x++){
            if(data.data[(y * width + x) * 4 + 3] > 32){
              left = Math.min(left, x - anchorX); right = Math.max(right, x - anchorX);
              top = Math.min(top, y - anchorY); bottom = Math.max(bottom, y - anchorY);
            }
          }
        }
        frames.push({frame, anchorX, anchorY});
      }
      if(right < left || bottom < top) throw new Error(`Ligne ${row + 1} vide dans ${path}.`);
      return frames.map(({frame, anchorX, anchorY}) => {
        const {canvas:cropped, context:ctx} = makeCanvas(right - left + 1, bottom - top + 1);
        ctx.drawImage(frame, -anchorX - left, -anchorY - top);
        cropped.poleX = -left;
        cropped.poleY = -top;
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
    result.poleX = frame.poleX;
    result.poleY = frame.poleY;
    return result;
  }

  function makeAudienceMask(image){
    if(image.naturalWidth !== 1493 || image.naturalHeight !== 640){
      throw new Error(`${stadiumPath} doit mesurer 1493x640px.`);
    }
    const width = image.naturalWidth, height = image.naturalHeight, stride = width + 1;
    const {context:ctx} = makeCanvas(width, height);
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const sums = new Float64Array(stride * (height + 1)), squares = new Float64Array(sums.length);
    for(let y = 0; y < height; y++){
      let sum = 0, square = 0;
      for(let x = 0; x < width; x++){
        const pixel = (y * width + x) * 4;
        const value = (pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2]) / 3;
        sum += value; square += value * value;
        const index = (y + 1) * stride + x + 1;
        sums[index] = sums[index - stride] + sum;
        squares[index] = squares[index - stride] + square;
      }
    }
    const mask = new Uint8Array(width * height);
    for(let y = 5; y < height - 5; y++){
      for(let x = 5; x < width - 5; x++){
        const a = (y - 5) * stride + x - 5, b = a + 11, c = a + 11 * stride, d = c + 11;
        const mean = (sums[d] - sums[b] - sums[c] + sums[a]) / 121;
        const variance = (squares[d] - squares[b] - squares[c] + squares[a]) / 121 - mean * mean;
        mask[y * width + x] = mean < 75 && variance > 289 ? 1 : 0;
      }
    }
    return mask;
  }

  function isAudience(x, y){
    const column = Math.round(x * 1493), row = Math.round(y * 640), index = row * 1493 + column;
    return audience[index] && audience[index - 3] && audience[index + 3] &&
      audience[index - 3 * 1493] && audience[index + 3 * 1493];
  }

  function audienceCoverage(x, y, sprite, scale, viewport){
    let score = 0;
    for(const horizontal of [.2, .5, .8]){
      for(const vertical of [.2, .5, .8]){
        const px = Math.round((x + (sprite.width * horizontal - sprite.poleX) * scale / viewport.width) * 1493);
        const py = Math.round((y + (sprite.height * vertical - sprite.poleY) * scale / viewport.height) * 640);
        if(px >= 0 && px < 1493 && py >= 0 && py < 640 && audience[py * 1493 + px]) score++;
      }
    }
    return score;
  }

  function placeFlags(){
    const viewport = canvas.getBoundingClientRect();
    if(!viewport.width || !viewport.height) throw new Error('Impossible de mesurer le stade pour placer les drapeaux.');
    flags.length = 0;
    const groups = [
      {row:0, side:'player', x:[.20,.47], y:[.025,.145], columns:12, rows:1, bounds:[.19,.48,.005,.16]},
      {row:0, side:'ai', x:[.53,.80], y:[.025,.145], columns:12, rows:1, bounds:[.52,.81,.005,.16]},
      {row:0, side:'player', x:[.06,.195], y:[.15,.22], columns:4, rows:1, bounds:[.05,.20,.125,.23]},
      {row:0, side:'ai', x:[.805,.94], y:[.15,.22], columns:4, rows:1, bounds:[.80,.95,.125,.23]},
      {row:1, side:'player', x:[.20,.47], y:[.90,.995], columns:12, rows:1, bounds:[.19,.48,.895,1]},
      {row:1, side:'ai', x:[.53,.80], y:[.90,.995], columns:12, rows:1, bounds:[.52,.81,.895,1]},
      {row:1, side:'player', x:[.06,.195], y:[.78,.85], columns:4, rows:1, bounds:[.05,.20,.77,.875]},
      {row:1, side:'ai', x:[.805,.94], y:[.78,.85], columns:4, rows:1, bounds:[.80,.95,.77,.875]},
      {row:2, side:'player', x:[.06,.18], y:[.25,.75], columns:4, rows:6, bounds:[.05,.19,.23,.77]},
      {row:3, side:'ai', x:[.82,.94], y:[.25,.75], columns:4, rows:6, bounds:[.81,.95,.23,.77]}
    ];
    for(const group of groups){
      let groupFlags = [];
      const count = group.columns * group.rows;
      const start = flags.length;
      for(let retry = 0; retry < 10 && groupFlags.length < count; retry++){
        flags.length = start;
        groupFlags = [];
        for(let i = 0; i < count; i++){
          const kind = Math.floor(Math.random() * 2), size = 22 + Math.random() * 6;
          const sprite = sprites[kind][group.row][0];
          const scale = Math.min(size, viewport.height * .10) / Math.max(sprite.width, sprite.height);
          const [left, right, top, bottom] = group.bounds;
          const minX = Math.max(group.x[0], left + sprite.poleX * scale / viewport.width);
          const maxX = Math.min(group.x[1], right - (sprite.width - sprite.poleX) * scale / viewport.width);
          const minY = Math.max(group.y[0], top + sprite.poleY * scale / viewport.height);
          const maxY = Math.min(group.y[1], bottom - (sprite.height - sprite.poleY) * scale / viewport.height);
          if(maxX <= minX || maxY <= minY) throw new Error('Les tribunes sont trop petites pour les drapeaux.');
          let x, y, best = null;
          for(let attempt = 0; attempt < 1500; attempt++){
            const xFraction = attempt < 100 ? (i % group.columns + .15 + Math.random() * .7) / group.columns : Math.random();
            const yFraction = attempt < 100 ? (Math.floor(i / group.columns) + .15 + Math.random() * .7) / group.rows : Math.random();
            x = minX + xFraction * (maxX - minX);
            y = minY + yFraction * (maxY - minY);
            const gap = attempt < 500 ? 27 : 23;
            const overlapsLights = group.row === 0 && y - sprite.poleY * scale / viewport.height < .055 &&
              ((x + (sprite.width - sprite.poleX) * scale / viewport.width > .31 && x - sprite.poleX * scale / viewport.width < .38) ||
               (x + (sprite.width - sprite.poleX) * scale / viewport.width > .62 && x - sprite.poleX * scale / viewport.width < .70));
            if(overlapsLights || !isAudience(x, y) ||
               !flags.every(flag => Math.hypot((flag.x - x) * 1493, (flag.y - y) * 640) >= gap)) continue;
            const score = audienceCoverage(x, y, sprite, scale, viewport);
            if(!best || score > best.score) best = {x, y, score};
            if(score >= 7 || (attempt >= 500 && best.score >= 5)) break;
          }
          if(!best) break;
          ({x, y} = best);
          const flag = {x, y, row:group.row, side:group.side, bounds:group.bounds, kind,
            size, speed:8 + Math.random() * 2, phase:Math.random() * 6,
            secondary:false, frame:-1};
          flags.push(flag);
          groupFlags.push(flag);
        }
      }
      if(groupFlags.length !== count) throw new Error(`Impossible de répartir les drapeaux en tribune ${group.row}, camp ${group.side}.`);
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
      const x = Math.max(left * bounds.width + frame.poleX * scale, Math.min(right * bounds.width - w + frame.poleX * scale, flag.x * bounds.width));
      const y = Math.max(top * bounds.height + frame.poleY * scale, Math.min(bottom * bounds.height - h + frame.poleY * scale, flag.y * bounds.height));
      context.drawImage(frame, x - frame.poleX * scale, y - frame.poleY * scale, w, h);
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

  const ready = Promise.all([...paths, stadiumPath].map(path => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Impossible de charger l’image ${path}.`));
    image.src = path;
  }))).then(images => {
    sprites = paths.map((path, index) => extractSheet(images[index], path));
    audience = makeAudienceMask(images[2]);
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
  window.addEventListener('resize', () => {
    if(sprites && audience) placeFlags();
    restart();
  });
  document.addEventListener('visibilitychange', restart);
  motion.addEventListener('change', () => {
    celebrations.player = celebrations.ai = 0;
    restart();
  });
})();
