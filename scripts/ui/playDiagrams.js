(function(){
  const NS = 'http://www.w3.org/2000/svg';
  const RUNS = new Set([
    'Inside Zone', 'Power Run', 'Dive', 'QB Sneak', 'Outside Zone', 'Sweep',
    'Toss', 'Counter Run', 'QB Keeper', 'Read Option'
  ]);
  const DEFENSES = new Set([
    'Eight-Man Box', 'Bear Front', 'Inside Run Blitz', 'Edge Contain',
    'Outside Run Stop', 'Press Coverage', 'Cover 1', 'Nickel Blitz', 'Cover 3',
    'Cover 4', 'Dime Defense', 'Prevent Defense', 'Goal-Line Defense',
    'Base 4-3', 'Base 3-4'
  ]);
  let diagramSequence = 0;

  function makeSvg(name, kind, direction){
    const id = `play-${++diagramSequence}`;
    const color = kind === 'run' ? '#f59e0b' : kind === 'pass' ? '#38bdf8' : '#f87171';
    const defs = `<defs>
      <pattern id="${id}-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#1b3449" stroke-width=".5"/></pattern>
      <filter id="${id}-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <marker id="${id}-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="${color}"/></marker>
      </defs>`;
    const field = `<rect width="64" height="48" rx="4" fill="#071321"/><rect width="64" height="48" rx="4" fill="url(#${id}-grid)"/><path d="M2 24H62" stroke="#b6c8d8" stroke-opacity=".46" stroke-dasharray="2 2"/>`;
    const path = (d, stroke=color, dash='') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#${id}-arrow)" filter="url(#${id}-glow)"/>`;
    const line = Array.from({length:5}, (_, i) => `<rect x="${25+i*3.5}" y="22" width="2.2" height="4" rx=".7" fill="#e2e8f0"/>`).join('');
    let drawing = '';

    if(kind === 'run'){
      const directionSign = direction === 'left' ? -1 : direction === 'right' ? 1
        : /toss|sweep|outside zone|counter/i.test(name) ? -1 : 1;
      const outside = /outside|sweep|toss|edge|counter/i.test(name);
      const qb = /QB Sneak|QB Keeper/i.test(name);
      const counter = /counter|read option/i.test(name);
      const laneX = direction === 'left' ? 28 : direction === 'right' ? 36 : 32;
      const targetX = qb ? 32 : outside ? (directionSign < 0 ? 13 : 51)
        : counter ? (directionSign < 0 ? 28 : 36) : laneX;
      const targetY = outside ? 10 : counter ? 13 : 15;
      const startX = qb ? 32 : 39;
      const controlX = counter ? (directionSign < 0 ? 44 : 20) : (startX+targetX)/2;
      drawing = `${line}<circle cx="32" cy="31" r="2" fill="#dbeafe"/><circle cx="${startX}" cy="35" r="2.1" fill="#fbbf24"/>${path(`M${startX} 35 Q${controlX} 31 ${targetX} ${targetY}`)}`;
      if(/Power|Sweep/i.test(name)) drawing += `<circle cx="${directionSign < 0 ? 27 : 37}" cy="28" r="1.8" fill="#fcd34d"/>${path(`M${directionSign < 0 ? 27 : 37} 28L${directionSign < 0 ? 21 : 43} ${targetY+2}`, '#fcd34d')}`;
    }else if(kind === 'pass'){
      const receiverXs = [10,20,32,44,54];
      drawing = `${line}${receiverXs.map(x => `<circle cx="${x}" cy="18" r="1.7" fill="#7dd3fc"/>`).join('')}<circle cx="32" cy="31" r="2" fill="#dbeafe"/>`;
      if(/Four Verticals/i.test(name)){
        drawing += receiverXs.slice(0,4).map(x => path(`M${x} 17V4`)).join('');
      }else if(/Mesh|Crossing/i.test(name)){
        drawing += path('M10 18Q19 11 31 8') + path('M54 18Q44 12 32 10');
      }else if(/Screen/i.test(name)){
        drawing += path('M32 30Q24 29 17 26') + path('M10 18Q11 25 18 27');
      }else if(/Slant/i.test(name)){
        drawing += path('M10 18L18 8') + path('M54 18L47 8');
      }else if(/Out Route/i.test(name)){
        drawing += path('M10 18V10H20') + path('M54 18V10H44');
      }else if(/Hitch|Curl/i.test(name)){
        drawing += path('M15 18V9Q15 6 18 9');
      }else if(/Flood/i.test(name)){
        drawing += path('M10 18L14 12') + path('M32 18V7') + path('M54 18L49 10');
      }else if(/Deep Post/i.test(name)){
        drawing += path('M10 18Q20 5 31 6') + path('M54 18Q44 5 34 6');
      }else{
        drawing += path('M10 18L18 9') + path('M54 18L46 9') + path('M32 18V7');
      }
    }else{
      const rushers = /Blitz|Bear|Box|Goal-Line/i.test(name) ? [15,25,32,39,49] : [19,28,36,45];
      drawing = rushers.map(x => `<path d="M${x-1.6} 14L${x+1.6} 18M${x+1.6} 14L${x-1.6} 18" stroke="#fb7185" stroke-width="1.4"/>`).join('');
      if(/Cover 3|Cover 4|Prevent|Dime/i.test(name)){
        const zones = /Cover 4|Prevent|Dime/i.test(name) ? [[12,8],[28,7],[44,7],[56,8]] : [[17,8],[32,6],[47,8]];
        drawing += zones.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#818cf8" fill-opacity=".2" stroke="#818cf8" stroke-opacity=".7" stroke-width=".7"/>`).join('');
      }
      if(/Blitz|Contain|Run Stop/i.test(name)){
        drawing += path('M18 18L22 29', '#fb7185') + path(/Inside/i.test(name) ? 'M32 18V29' : 'M46 18L42 29', '#fb7185');
      }
      drawing += `<path d="M25 29L29 33M29 29L25 33M35 29L39 33M39 29L35 33" stroke="#67e8f9" stroke-width="1.2"/>`;
    }

    return `<svg xmlns="${NS}" viewBox="0 0 64 48" role="img" aria-label="Schéma tactique : ${kind === 'run' ? 'course' : kind === 'pass' ? 'passe' : 'défense'}" focusable="false">${defs}${field}${drawing}</svg>`;
  }

  window.PlayDiagrams = {
    forPlay(name, type, direction){
      const kind = DEFENSES.has(name) || type === 'def' ? 'defense' : RUNS.has(name) || type === 'run' ? 'run' : 'pass';
      return makeSvg(name, kind, direction);
    }
  };
})();
