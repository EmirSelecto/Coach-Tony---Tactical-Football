(function(){
  const teams = [
    ['Ironvale Iron', '#687E88', '#C98443'],
    ['Blackridge Wolves', '#385B71', '#C7D3D7'],
    ['Harbor City Krakens', '#176D80', '#52A7B3'],
    ['Redmont Outlaws', '#9A2934', '#D6B87A'],
    ['Northgate Guardians', '#142141', '#D9B76A'],
    ['Ashford Ravens', '#222546', '#A78BC8'],
    ['Silverlake Vipers', '#369DAE', '#152C42'],
    ['Thunder Bay Bolts', '#263F70', '#E3C64D'],
    ['Stonewall Titans', '#802125', '#AAA9A0'],
    ['Kingsport Monarchs', '#3C2760', '#D6B64F'],
    ['Highpoint Hawks', '#C32D2F', '#E4BA57'],
    ['Frosthaven Yetis', '#72C6E2', '#EFF5F4'],
    ['Westbridge Pioneers', '#435C4A', '#93734C'],
    ['Copperfield Coyotes', '#744225', '#D58A48'],
    ['Bayview Sharks', '#284F60', '#57A9B6'],
    ['Rockford Rhinos', '#538D36', '#B4B7A8'],
    ['Pinecrest Stags', '#825735', '#2D6545'],
    ['Goldhaven Foxes', '#BF8030', '#344E75'],
    ['Ravenwood Reapers', '#352951', '#83A454'],
    ['Clearwater Barracudas', '#4B94A5', '#193C4A'],
    ['Stormridge Thunder', '#1B283B', '#5C9CD1'],
    ['Eastport Admirals', '#213A59', '#C7A85D'],
    ['Suncrest Scorpions', '#CA5448', '#22213A'],
    ['Grand Mesa Mustangs', '#B26539', '#E8C477'],
    ['Cinder City Firebirds', '#D94D29', '#F8C278'],
    ['Wildwood Grizzlies', '#774E32', '#668445'],
    ['Summit Falls Mountaineers', '#2D5277', '#A8D4E5'],
    ['Duston Rattlers', '#B68D59', '#57442F'],
    ['Glacier Point Mammoths', '#3F6C83', '#C4E1EA'],
    ['Rivergate Sentinels', '#28626E', '#D0B966'],
    ['Crimson Bay Corsairs', '#941F28', '#20253A'],
    ['Falconridge Falcons', '#852E34', '#6FA8C8'],
    ['Neon City Phantoms', '#4A2879', '#63C9DF'],
    ['Steel Harbor Forge', '#F1A744', '#32343A'],
    ['Moonstone Comets', '#212447', '#72D6E4'],
    ['Sandstone Renegades', '#8F2622', '#D2A354'],
    ['Victory Valkyries', '#2E6C9B', '#E8CB79'],
    ['Briarwood Behemoths', '#3C633A', '#D49747'],
    ['Hollow Creek Bison', '#4F2D21', '#C39147'],
    ['Aurora Northern Lights', '#53B5B4', '#B24DD0']
  ];
  const teamConfig = Object.fromEntries(teams.map(([name, primary, secondary], index) => [
    name,
    {name, batch:index < 20 ? 1 : 2, row:Math.floor((index % 20) / 5), col:index % 5, primary, secondary}
  ]));

  const imagePaths = {
    logos1:'assets/images/logos_batch_1.jpg',
    logos2:'assets/images/logos_batch_2.jpg',
    sprites:'assets/images/ui_sprites.jpg'
  };
  const imageSpecs = {
    logos1:[1152, 864],
    logos2:[1152, 864],
    sprites:[1152, 864]
  };
  const expressions = ['neutral', 'hyped', 'shocked', 'smirking'];
  const spriteNames = ['token_qb', 'token_offense', 'token_defense', 'token_lb', 'ball_carrier_aura', 'football'];
  const images = {};
  const imagePromises = Object.entries(imagePaths).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const [width, height] = imageSpecs[key];
      if(image.naturalWidth !== width || image.naturalHeight !== height){
        reject(new Error(`${src} doit mesurer ${width}x${height}px (reçu ${image.naturalWidth}x${image.naturalHeight}).`));
        return;
      }
      images[key] = image;
      resolve();
    };
    image.onerror = () => reject(new Error(`Impossible de charger l’image ${src}.`));
    image.src = src;
  }));
  const canvasCache = new Map();
  const tintedCache = new Map();

  function makeCanvas(width, height){
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    const context = canvas.getContext('2d', {willReadFrequently:true});
    if(!context) throw new Error('Impossible de créer le canvas des assets tactiques.');
    return {canvas, context};
  }
  function extract(key, sx, sy, sw, sh, width, height){
    const cacheKey = `${key}:${sx}:${sy}:${sw}:${sh}`;
    if(canvasCache.has(cacheKey)) return canvasCache.get(cacheKey);
    const {canvas, context} = makeCanvas(width, height);
    context.drawImage(images[key], sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const pixelCount = canvas.width * canvas.height;
    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let read = 0, write = 0;
    const addBackground = index => {
      if(index < 0 || index >= pixelCount || visited[index]) return;
      const offset = index * 4;
      const distance = Math.hypot(pixels[offset] - 226, pixels[offset+1] - 232, pixels[offset+2] - 240);
      if(distance > 70) return;
      visited[index] = 1;
      queue[write++] = index;
      pixels[offset+3] = distance <= 24 ? 0 : Math.round(pixels[offset+3] * (distance - 24) / 46);
    };
    const lastRow = canvas.height - 1, lastColumn = canvas.width - 1;
    [[0, 0], [lastColumn, 0], [0, lastRow], [lastColumn, lastRow]]
      .forEach(([column, row]) => addBackground(row * canvas.width + column));
    while(read < write){
      const index = queue[read++];
      const row = Math.floor(index / canvas.width), column = index % canvas.width;
      if(row > 0) addBackground(index - canvas.width);
      if(row < lastRow) addBackground(index + canvas.width);
      if(column > 0) addBackground(index - 1);
      if(column < lastColumn) addBackground(index + 1);
      if(row > 0 && column > 0) addBackground(index - canvas.width - 1);
      if(row > 0 && column < lastColumn) addBackground(index - canvas.width + 1);
      if(row < lastRow && column > 0) addBackground(index + canvas.width - 1);
      if(row < lastRow && column < lastColumn) addBackground(index + canvas.width + 1);
    }
    for(let i=0;i<pixels.length;i+=4){
      if(!visited[i / 4]){
        const distance = Math.hypot(pixels[i] - 226, pixels[i+1] - 232, pixels[i+2] - 240);
        if(distance < 26) pixels[i+3] = 0;
      }
    }
    context.putImageData(imageData, 0, 0);
    canvasCache.set(cacheKey, canvas);
    return canvas;
  }
  function getTeamConfig(teamName){
    const team = teamConfig[teamName];
    if(!team) throw new Error(`Équipe inconnue dans teamsConfig.js : "${teamName}".`);
    return team;
  }
  function getTeamLogoCanvas(teamName){
    const team = getTeamConfig(teamName);
    const key = team.batch === 1 ? 'logos1' : 'logos2';
    const cellWidth = 1152 / 5, cellHeight = 864 / 4;
    return extract(key, team.col * cellWidth, team.row * cellHeight, cellWidth, cellHeight, 256, 240);
  }
  function getSpriteCanvas(spriteName){
    if(!spriteNames.includes(spriteName)) throw new Error(`Sprite inconnu : "${spriteName}".`);
    const index = spriteNames.indexOf(spriteName);
    return extract('sprites', index * 192, 288, 192, 216, 192, 216);
  }
  function getCommentatorCanvas(expression){
    if(!expressions.includes(expression)) throw new Error(`Expression de commentateur inconnue : "${expression}".`);
    const index = expressions.indexOf(expression);
    return extract('sprites', index * 288, 0, 288, 272, 288, 272);
  }
  function getTintedSpriteCanvas(spriteName, color){
    const cacheKey = `${spriteName}:${color}`;
    if(tintedCache.has(cacheKey)) return tintedCache.get(cacheKey);
    const source = getSpriteCanvas(spriteName);
    const {canvas, context} = makeCanvas(source.width, source.height);
    context.drawImage(source, 0, 0);
    context.globalCompositeOperation = 'source-atop';
    context.globalAlpha = 0.66;
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    tintedCache.set(cacheKey, canvas);
    return canvas;
  }

  window.TeamArt = {
    teams:teamConfig,
    expressions,
    ready:Promise.all(imagePromises),
    getTeamConfig,
    getTeamLogoCanvas,
    getSpriteCanvas,
    getCommentatorCanvas,
    getTintedSpriteCanvas
  };
})();
