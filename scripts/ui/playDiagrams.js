(function(){
  const GOLD = '#facc15';
  const CYAN = '#00f0ff';
  const PINK = '#ff007f';
  const BLOCK = '#cbd5e1';
  let sequence = 0;

  function getPlayDiagramSVG(name, direction = null){
    if(direction != null && !['left', 'middle', 'right'].includes(direction)){
      throw new Error(`Direction de schéma inconnue : ${direction}`);
    }
    const offense = Object.prototype.hasOwnProperty.call(OFFENSE, name);
    const defense = Object.prototype.hasOwnProperty.call(DEFENSE, name);
    if(!offense && !defense) throw new Error(`Schéma tactique inconnu : ${name}`);

    const id = `play-${++sequence}`;
    const side = direction === 'left' ? -1 : 1;
    const x = offset => 60 + side * offset;
    const middle = direction === 'middle';
    const route = (d, color, options = {}) => {
      const marker = options.marker === false ? '' : ` marker-end="url(#${id}-${color})"`;
      const dash = options.dash ? ' stroke-dasharray="3 2"' : '';
      const role = options.primary ? ' class="primary-route"' : '';
      return `<path${role} d="${d}" fill="none" stroke="${COLORS[color]}" stroke-width="${options.width || 2.5}" stroke-linecap="round" stroke-linejoin="round"${dash}${marker}/>`;
    };
    const run = d => route(d, 'gold', {primary:true});
    const primary = d => route(d, 'pink', {primary:true});
    const pass = d => route(d, 'cyan');
    const decoy = d => route(d, 'block', {dash:true, width:1.5});
    const blitz = d => route(d, 'pink');
    const zone = (cx, cy, rx, ry) =>
      `<ellipse class="coverage-zone" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#818cf8" fill-opacity=".22" stroke="#a5b4fc" stroke-opacity=".8" stroke-width="1"/>`;
    const defender = (cx, cy) =>
      `<g class="defender" stroke="${CYAN}" stroke-width="1.8" stroke-linecap="round"><path d="M${cx-2} ${cy-2}L${cx+2} ${cy+2}M${cx+2} ${cy-2}L${cx-2} ${cy+2}"/></g>`;
    const defenders = points => points.map(([cx, cy]) => defender(cx, cy)).join('');
    const circles = (points, color = '#f8fafc') => points.map(([cx, cy]) =>
      `<circle cx="${cx}" cy="${cy}" r="2.2" fill="${color}" stroke="#090d16" stroke-width=".8"/>`).join('');
    const los = offense ? 44 : 28;
    const field = `<rect width="120" height="72" rx="3" fill="rgba(9,13,22,.75)"/>
      <path d="M2 14H118M2 58H118" stroke="rgba(255,255,255,.12)" stroke-width=".8"/>
      <path d="M2 ${los}H118" stroke="${CYAN}" stroke-opacity=".8" stroke-width="1" stroke-dasharray="3 2"/>`;
    const markers = Object.entries(COLORS).map(([key, color]) =>
      `<marker id="${id}-${key}" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L6 3L0 6Z" fill="${color}"/></marker>`).join('');
    const tools = {direction, side, x, middle, route, run, primary, pass, decoy, blitz, zone, defenders, circles};
    const drawing = offense ? OFFENSE[name](tools) : DEFENSE[name](tools);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72" focusable="false"><defs>${markers}</defs>${field}${drawing}</svg>`;
  }

  const COLORS = {gold:GOLD, cyan:CYAN, pink:PINK, block:BLOCK};

  function offensePlayers(t, options = {}){
    const line = [46,53,60,67,74].map(cx => `<rect x="${cx-2}" y="42" width="4" height="4" rx=".7" fill="#f8fafc"/>`).join('');
    const wide = options.wide || (options.fullback ? [[10,44],[25,44],[110,44]] : [[10,44],[25,44],[95,44],[110,44]]);
    const rb = options.rb || [t.x(9), 61];
    return line + t.circles(wide, CYAN) + t.circles([[60,51]], '#fff') +
      t.circles([rb], GOLD) + (options.fullback ? t.circles([[60,57]], BLOCK) : '');
  }

  function runDrawing(t, routes, options){
    return routes + offensePlayers(t, options);
  }

  function passDrawing(t, routes, options){
    return routes + offensePlayers(t, options);
  }

  const OFFENSE = {
    'Inside Zone': t => runDrawing(t,
      [46,53,60,67,74].map(n => t.decoy(`M${n} 41l${t.side*3} -5`)).join('') +
      t.run(`M${t.x(9)} 61Q60 57 60 51L${t.middle ? 60 : t.x(8)} 33`)),
    'Power Run': t => runDrawing(t,
      t.decoy(`M${t.x(-7)} 42Q60 49 ${t.x(14)} 39L${t.x(18)} 32`) +
      t.run(`M${t.x(9)} 61Q60 57 60 51Q${t.x(13)} 48 ${t.middle ? 60 : t.x(18)} 33`)),
    'Dive': t => runDrawing(t, t.run('M60 64L60 51L60 37'), {rb:[60,64]}),
    'QB Sneak': t => runDrawing(t, t.route('M60 51L60 39', 'gold', {primary:true, width:3.5}), {rb:[60,64]}),
    'Outside Zone': t => runDrawing(t,
      [46,53,60,67,74].map(n => t.decoy(`M${n} 42l${t.side*5} -4`)).join('') +
      t.run(`M${t.x(-10)} 61Q60 56 60 51Q${t.x(20)} 55 ${t.x(32)} 42L${t.x(32)} 19`),
      {rb:[t.x(-10),61]}),
    'Sweep': t => runDrawing(t,
      t.decoy(`M${t.x(-7)} 42Q60 49 ${t.x(27)} 38`) +
      t.decoy(`M${t.x(7)} 42Q${t.x(17)} 47 ${t.x(36)} 35`) +
      t.decoy(`M60 57Q${t.x(26)} 55 ${t.x(41)} 36`) +
      t.run(`M60 65Q${t.x(28)} 64 ${t.x(46)} 46L${t.x(46)} 13`),
      {rb:[60,65], fullback:true}),
    'Toss': t => runDrawing(t,
      t.decoy(`M60 51Q${t.x(9)} 50 ${t.x(18)} 55`) +
      t.run(`M${t.x(18)} 55Q${t.x(36)} 52 ${t.x(42)} 41L${t.x(42)} 15`),
      {rb:[t.x(18),55]}),
    'Counter Run': t => runDrawing(t,
      t.decoy(`M${t.x(10)} 61L${t.x(-2)} 57`) +
      t.decoy(`M${t.x(-7)} 42Q60 49 ${t.x(19)} 36`) +
      t.run(`M${t.x(-2)} 57L60 51Q${t.x(22)} 52 ${t.x(27)} 33L${t.x(27)} 22`),
      {rb:[t.x(10),61]}),
    'QB Keeper': t => runDrawing(t,
      t.decoy(`M60 51L${t.x(-10)} 58L${t.x(-18)} 40`) +
      t.run(t.middle ? 'M60 51L60 34' : `M60 51Q${t.x(21)} 54 ${t.x(30)} 40L${t.x(30)} 20`),
      {rb:[t.x(-10),58]}),
    'Read Option': t => runDrawing(t,
      t.decoy(`M${t.x(-10)} 61L60 53L60 34`) +
      t.run(t.middle ? 'M60 51L60 34' : `M60 51Q${t.x(20)} 52 ${t.x(30)} 40L${t.x(30)} 20`),
      {rb:[t.x(-10),61]}),
    'Quick Slant': t => passDrawing(t,
      t.pass(t.side < 0 && !t.middle ? 'M110 42V32L86 8' : 'M10 42V32L34 8') +
      t.primary(t.middle ? 'M95 42V32L70 7' :
        `M${t.x(50)} 42V32L${t.x(26)} 8`)),
    'Screen Pass': t => passDrawing(t,
      [46,53,60,67,74].map(n => t.decoy(`M${n} 42L${n} 38`)).join('') +
      t.decoy(`M${t.x(7)} 42L${t.x(21)} 38`) + t.decoy(`M${t.x(14)} 42L${t.x(27)} 34`) +
      t.route(t.middle ? 'M60 51Q55 58 60 60' : `M60 51Q${t.x(15)} 54 ${t.x(28)} 58`, 'cyan', {dash:true}) +
      t.primary(t.middle ? `M${t.x(9)} 61Q60 65 60 58L60 24` :
        `M${t.x(9)} 61Q${t.x(22)} 66 ${t.x(28)} 58L${t.x(36)} 22`)),
    'Hitch / Curl': t => passDrawing(t,
      t.pass(`M${t.x(-50)} 42V18Q${t.x(-50)} 12 ${t.x(-44)} 20`) +
      t.primary(t.middle ? 'M95 42V17Q95 11 88 17L68 25' :
        `M${t.x(50)} 42V17Q${t.x(50)} 11 ${t.x(44)} 18L${t.x(40)} 24`)),
    'Out Route': t => passDrawing(t,
      t.pass(`M${t.x(-35)} 42V24L${t.x(-48)} 24`) +
      t.primary(`M${t.x(35)} 42V19L${t.x(50)} 19`)),
    'Crossing Route': t => passDrawing(t,
      t.pass(t.side < 0 && !t.middle ? 'M10 42V34L98 20' : 'M110 42V34L22 20') +
      t.primary(t.middle ? 'M10 42V34L68 25' : t.side < 0 ? 'M110 42V34L22 20' : 'M10 42V34L98 20')),
    'Mesh Concept': t => passDrawing(t,
      t.pass('M10 42V8') + t.pass('M110 42V8') +
      t.pass(t.side < 0 && !t.middle ? 'M25 42L80 33' : 'M95 42L40 33') +
      t.primary(t.middle ? 'M25 42L68 34' : t.side < 0 ? 'M95 42L40 34' : 'M25 42L80 34')),
    'Flood Concept': t => passDrawing(t,
      t.pass(`M${t.x(-50)} 42Q60 27 ${t.x(36)} 7`) +
      t.pass(`M${t.x(35)} 42V23L${t.x(49)} 23`) +
      t.primary(`M${t.x(9)} 61Q${t.x(20)} 53 ${t.x(45)} 36`)),
    'Play Action': t => passDrawing(t,
      t.decoy(`M60 51L${t.x(9)} 61L60 40`) +
      t.decoy('M60 51L60 61') + t.pass('M10 42V25L24 18') +
      t.primary(t.middle ? 'M60 61L60 10' : `M60 61L${t.x(35)} 9`)),
    'Deep Post': t => passDrawing(t,
      t.pass('M10 42V29L26 27') + t.pass('M25 42V24L38 20') +
      t.primary(`M${t.x(50)} 42V18L60 5`)),
    'Four Verticals': t => passDrawing(t,
      [10,50,70,110].map((n, i) => {
        const selected = t.middle ? i === 1 : t.side < 0 ? i === 0 : i === 3;
        const start = i === 1 || i === 2 ? 36 : 42;
        return selected ? t.primary(`M${n} ${start}V6`) : t.pass(`M${n} ${start}V6`);
      }).join(''), {wide:[[10,44],[50,38],[70,38],[110,44]]})
  };

  const front4 = [[42,26],[54,26],[66,26],[78,26]];
  const backs4 = [[12,18],[42,8],[78,8],[108,18]];
  const lbs3 = [[44,19],[60,18],[76,19]];
  const front3 = [[48,26],[60,26],[72,26]];
  const lbs4 = [[35,19],[51,19],[69,19],[85,19]];
  const normal = (t, front = front4, lbs = lbs3, backs = backs4) =>
    t.defenders([...front, ...lbs, ...backs]);

  const DEFENSE = {
    'Eight-Man Box': t => normal(t, front4, [[42,19],[54,18],[66,18],[78,19]], [[12,17],[60,7],[108,17]]),
    'Bear Front': t => normal(t, [[46,26],[53,26],[60,26],[67,26],[74,26]], [[52,18],[68,18]], backs4),
    'Inside Run Blitz': t => t.blitz('M53 19L56 40') + t.blitz('M67 19L64 40') +
      normal(t, front4, [[53,19],[67,19],[85,19]], backs4),
    'Edge Contain': t => t.blitz('M32 26Q19 27 16 39L22 42') + t.blitz('M88 26Q101 27 104 39L98 42') +
      t.blitz('M22 18Q10 22 10 34L16 38') + t.blitz('M98 18Q110 22 110 34L104 38') +
      normal(t, [[32,26],[52,26],[68,26],[88,26]], [[22,18],[60,18],[98,18]], backs4),
    'Outside Run Stop': t => ['M12 17L30 39','M32 18L43 38','M88 18L77 38','M108 17L90 39'].map(t.blitz).join('') +
      normal(t, front4, [[32,18],[60,18],[88,18]], backs4),
    'Press Coverage': t => ['M10 29V36M6 36H14','M110 29V36M106 36H114'].map(d => t.route(d, 'pink', {marker:false})).join('') +
      normal(t, front4, lbs3, [[10,26],[43,8],[77,8],[110,26]]),
    'Cover 1': t => t.zone(60,8,18,6) +
      ['M12 20L12 40','M35 19L25 40','M51 19L42 40','M69 19L78 40','M85 19L95 40','M108 20L108 40']
        .map(d => t.route(d, 'block', {dash:true, width:1.4, marker:false})).join('') +
      normal(t, front4, [[35,19],[51,19],[69,19],[85,19]], [[12,20],[60,8],[108,20]]),
    'Nickel Blitz': t => t.blitz('M92 18L83 25L89 25L69 45') +
      normal(t, front4, [[48,19],[72,19]], [[10,19],[40,8],[80,8],[92,18],[110,19]]),
    'Cover 3': t => [[20,8],[60,8],[100,8]].map(([a,b]) => t.zone(a,b,18,6)).join('') +
      [17,45,75,103].map(a => t.zone(a,20,12,5)).join('') + normal(t),
    'Cover 4': t => [15,45,75,105].map(a => t.zone(a,8,13,6)).join('') + normal(t),
    'Dime Defense': t => t.route('M8 20Q60 -2 112 20', 'cyan', {marker:false, width:1.4, dash:true}) +
      normal(t, front4, [[60,19]], [[10,18],[28,11],[47,7],[73,7],[92,11],[110,18]]),
    'Prevent Defense': t => [15,45,75,105].map(a => t.zone(a,8,13,6)).join('') +
      t.defenders([[8,15],[19,12],[30,9],[41,7],[52,6],[68,6],[79,7],[90,9],[101,12],[112,15],[60,14]]),
    'Goal-Line Defense': t => [28,36,44,52,60,68,76,84,92].map(a => t.blitz(`M${a} 27V35`)).join('') +
      t.defenders([[28,26],[36,26],[44,26],[52,26],[60,26],[68,26],[76,26],[84,26],[92,26],[15,17],[105,17]]),
    'Base 4-3': t => normal(t),
    'Base 3-4': t => normal(t, front3, lbs4, backs4)
  };

  window.PlayDiagrams = {
    getPlayDiagramSVG,
    forPlay(name, type, direction){ return getPlayDiagramSVG(name, direction); }
  };
})();
