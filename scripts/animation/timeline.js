/* =========================================================================
   PLAY ANIMATION CONTROLLER
   =========================================================================
   Refonte complète : plus de transitions CSS indépendantes ni de cascades de
   setTimeout par joueur. Une SEULE horloge de jeu par play, pilotée par
   requestAnimationFrame, sur une timeline normalisée 0->1. Le DOM n'est qu'un
   rendu de l'état des acteurs (renderActor). Le ballon (ballState) suit
   toujours le porteur quand il est "carried", et n'est indépendant que
   pendant le snap, une passe en vol, un fumble ou un kick.

   Le résultat (yards, spot final, type de turnover...) est TOUJOURS calculé
   avant l'appel à cette fonction -- l'animation ne fait que le mettre en
   scène ; elle ne le modifie jamais.
   ========================================================================= */

const PLAY_TIMELINES = {
  insideRun:         {snap:0.08, handoff:0.20, laneCommit:0.35, defenderRead:0.45, tackle:0.86, whistle:1.0},
  outsideRun:        {snap:0.08, handoff:0.22, laneCommit:0.40, defenderRead:0.48, tackle:0.88, whistle:1.0},
  quickPass:         {snap:0.08, dropback:0.16, routesDevelop:0.26, throw:0.38, catch:0.52, tackle:0.86, whistle:1.0},
  intermediatePass:  {snap:0.08, dropback:0.18, routesDevelop:0.30, throw:0.46, catch:0.62, tackle:0.87, whistle:1.0},
  deepPass:          {snap:0.08, dropback:0.20, routesDevelop:0.34, throw:0.52, catch:0.74, tackle:0.90, whistle:1.0},
  sack:              {snap:0.08, dropback:0.22, pressure:0.42, tackle:0.60, whistle:1.0}
};

function createPlayTimelineEvents(setup, cfg){
  const {kf, outcome, offPlay, carrierId, qbId, family, animVariant} = setup;
  const events = [];
  let order = 0;
  const add = (type, time, detail = {}) => events.push({type, time, order:order++, ...detail});

  add('snap', kf.snap);
  if(animVariant === 'playAction' && kf.dropback !== undefined && kf.routesDevelop !== undefined){
    add('handoff', (kf.dropback + kf.routesDevelop) / 2, {kind:'playActionFake'});
    add('fakeHandoffReturn', kf.routesDevelop);
  } else if(offPlay.type === 'run' && carrierId !== qbId && family !== 'sack'){
    add('handoff', kf.handoff, {kind:offPlay.name === 'Toss' ? 'toss' : 'handoff'});
  }
  if(family === 'sack' && kf.pressure !== undefined) add('pressure', kf.pressure);

  if(offPlay.type === 'pass' && family !== 'sack') add('throw', kf.throw);
  if(outcome === 'incomplete'){
    add('incomplete', kf.catch);
  } else if(outcome === 'interception'){
    add('interception', kf.catch);
    add('turnover', kf.catch, {kind:'interception'});
  } else {
    if(offPlay.type === 'pass' && family !== 'sack') add('catch', kf.catch);
    if(outcome === 'fumble'){
      add('fumble', setup.turnoverFrac);
      add('turnover', setup.fumbleRecoverTime, {kind:'fumble'});
    }
  }

  if(setup.breakaway){
    add('breakaway', offPlay.type === 'pass' ? kf.catch : (kf.laneCommit || 0.45));
  }
  if(outcome !== 'incomplete') add('tackle', kf.tackle || kf.whistle);
  if(cfg.advType === 'turnoverOnDowns'){
    add('turnover', kf.whistle, {kind:'downs'});
  }
  add('whistle', kf.whistle);

  return events.sort((a,b) => a.time - b.time || a.order - b.order);
}

function timelineEventTime(setup, type, kind, fallback){
  const event = (setup.timelineEvents || []).find(item =>
    item.type === type && (kind === undefined || item.kind === kind));
  return event ? event.time : fallback;
}

BALANCE.animation.familyBaseMs = {
  insideRun:1650, outsideRun:1850, quickPass:1750, intermediatePass:2050, deepPass:2450, sack:1250
};
BALANCE.animation.yardsMsPerYard = 35;
BALANCE.animation.yardsMsCap = 900;

function lerp(a,b,t){ return a + (b-a)*t; }
function clamp01(t){ return Math.max(0, Math.min(1, t)); }
function smoothProgress(t){
  const progress = clamp01(t);
  return progress * progress * (3 - 2 * progress);
}
function pathSegmentSlope(a, b, key){
  const span = b.t - a.t;
  return span > 0 ? (b[key] - a[key]) / span : 0;
}
function pathTangent(path, index, key){
  const last = path.length - 1;
  if(last === 1) return pathSegmentSlope(path[0], path[1], key);

  if(index === 0 || index === last){
    const first = index === 0 ? 0 : last - 1;
    const second = index === 0 ? 1 : last;
    const span = path[second].t - path[first].t;
    const nextSpan = path[index === 0 ? 2 : last - 1].t - path[index === 0 ? 1 : last - 2].t;
    const slope = pathSegmentSlope(path[first], path[second], key);
    const nextSlope = pathSegmentSlope(path[index === 0 ? 1 : last - 2], path[index === 0 ? 2 : last - 1], key);
    if(span <= 0 || nextSpan <= 0) return 0;
    let tangent = ((2 * span + nextSpan) * slope - span * nextSlope) / (span + nextSpan);
    if(Math.sign(tangent) !== Math.sign(slope)) return 0;
    if(Math.sign(slope) !== Math.sign(nextSlope) && Math.abs(tangent) > Math.abs(3 * slope)){
      tangent = 3 * slope;
    }
    return tangent;
  }

  const previous = path[index - 1], current = path[index], nextPoint = path[index + 1];
  const previousSpan = current.t - previous.t, nextSpan = nextPoint.t - current.t;
  if(previousSpan <= 0 || nextSpan <= 0) return 0;
  const previousSlope = pathSegmentSlope(previous, current, key);
  const nextSlope = pathSegmentSlope(current, nextPoint, key);
  if(previousSlope === 0 || nextSlope === 0 || Math.sign(previousSlope) !== Math.sign(nextSlope)) return 0;

  const previousWeight = 2 * nextSpan + previousSpan;
  const nextWeight = nextSpan + 2 * previousSpan;
  return (previousWeight + nextWeight)
    / (previousWeight / previousSlope + nextWeight / nextSlope);
}
function interpolatePathValue(path, index, t, key){
  const a = path[index - 1], b = path[index];
  const span = b.t - a.t;
  if(span <= 0) return b[key];

  const u = clamp01((t - a.t) / span);
  const u2 = u * u, u3 = u2 * u;
  const startWeight = 2 * u3 - 3 * u2 + 1;
  const startTangentWeight = u3 - 2 * u2 + u;
  const endWeight = -2 * u3 + 3 * u2;
  const endTangentWeight = u3 - u2;
  return startWeight * a[key]
    + startTangentWeight * span * pathTangent(path, index - 1, key)
    + endWeight * b[key]
    + endTangentWeight * span * pathTangent(path, index, key);
}
function evalPath(path, t){
  if(path.length === 0) throw new Error('Une trajectoire d’animation ne peut pas être vide.');
  if(t <= path[0].t) return {x:path[0].x, y:path[0].y};
  for(let i=1;i<path.length;i++){
    if(t <= path[i].t){
      return {
        x:interpolatePathValue(path, i, t, 'x'),
        y:interpolatePathValue(path, i, t, 'y')
      };
    }
  }
  const last = path[path.length-1];
  return {x:last.x, y:last.y};
}
function freezePathsAtTackle(actors, tackleTime){
  actors.forEach(actor => {
    const position = evalPath(actor.path, tackleTime);
    actor.path = actor.path.filter(point => point.t < tackleTime);
    actor.path.push(
      {t:tackleTime,x:position.x,y:position.y},
      {t:1,x:position.x,y:position.y}
    );
    actor.targetX = position.x;
    actor.targetY = position.y;
  });
}
function renderActor(actor){
  actor.element.style.left = fx(actor.x) + '%';
  actor.element.style.top = actor.y + '%';
}

function selectPlayFamily(offPlay, outcome){
  if(outcome === 'sack') return 'sack';
  if(offPlay.type === 'run'){
    return ['Outside Zone','Sweep','Toss','Counter Run','QB Keeper','Read Option'].includes(offPlay.name)
      ? 'outsideRun' : 'insideRun';
  }
  if(offPlay.depth === 'short') return 'quickPass';
  if(offPlay.depth === 'medium') return 'intermediatePass';
  return 'deepPass';
}

function computeBlockPairs(offenseActors, defenseActors, family){
  const pairs = new Map();
  const ol = offenseActors.filter(a => a.role === 'OL');
  const dl = defenseActors.filter(a => a.role === 'DL');
  ol.forEach(o => {
    let best = null, bd = Infinity;
    dl.forEach(d => { const dist = Math.abs(d.y-o.y); if(dist < bd){ bd = dist; best = d; } });
    if(best){
      pairs.set(o.id, best);
      if(!pairs.has(best.id)) pairs.set(best.id, o);
    }
  });
  if(family === 'outsideRun'){
    const blockers = offenseActors.filter(a => a.role === 'WR' || a.role === 'TE');
    const dbs = defenseActors.filter(a => a.role === 'CB' || a.role === 'S');
    blockers.forEach(o => {
      let best = null, bd = Infinity;
      dbs.forEach(d => { if(pairs.has(d.id)) return; const dist = Math.abs(d.y-o.y); if(dist < bd){ bd = dist; best = d; } });
      if(best){ pairs.set(o.id, best); pairs.set(best.id, o); }
    });
  }
  return pairs;
}

function pickTackler(defenseActors, family, lane, defPlay, targetX){
  const byRole = (roles) => defenseActors.filter(a => roles.includes(a.role))
    .sort((a,b) => Math.abs(a.y-lane) - Math.abs(b.y-lane))[0];
  const nearestBack = () => defenseActors.filter(a => a.role === 'CB' || a.role === 'S')
    .sort((a,b) => Math.hypot(a.x-targetX, a.y-lane) - Math.hypot(b.x-targetX, b.y-lane))[0];
  if(family === 'sack'){
    // Un sack sur un blitz déclaré doit visiblement provenir d'un blitzer (LB),
    // pas d'un lineman qui n'a pourtant pas bougé plus que les autres.
    const isBlitz = defPlay && defPlay.name && defPlay.name.toLowerCase().includes('blitz');
    return isBlitz ? (byRole(['LB']) || byRole(['DL']) || defenseActors[0])
                    : (byRole(['DL']) || byRole(['LB']) || defenseActors[0]);
  }
  if(family === 'insideRun' || family === 'outsideRun') return byRole(['LB']) || byRole(['CB','S']) || defenseActors[0];
  return nearestBack() || byRole(['CB']) || byRole(['S']) || defenseActors[0];
}
function pickDefenseReactorNear(defenseActors, targetLane, targetX){
  if(!defenseActors.length) return null;
  const dbs = defenseActors.filter(a => a.role === 'CB' || a.role === 'S');
  const pool = dbs.length ? dbs : defenseActors;
  const target = Number.isFinite(targetX) ? targetX : pool[0].x;
  return [...pool].sort((a,b) => Math.hypot(a.x-target, a.y-targetLane)
    - Math.hypot(b.x-target, b.y-targetLane))[0];
}

// Bloqueurs qui accompagnent le porteur (screen : receveurs + 2 linemen du côté
// choisi ; courses extérieures : tight end + guard qui tire). Chacun est
// apparié au défenseur le plus proche, qui vient s'engager sur lui.
function planEscorts(variant, offenseSrc, defenseSrc, blockPairs, o){
  const offense = new Map(), defense = new Map();
  if(variant !== 'screen' && variant !== 'outsideLead') return {offense, defense};
  const {kf, lane, offenseDir, throwX, finalX, preSnapSpot, outcome, excludeIds, offPlay} = o;
  const byLane = (a,b) => Math.abs(a.y-lane) - Math.abs(b.y-lane);
  let chosen = [];
  if(variant === 'screen'){
    const rec = offenseSrc.filter(a => (a.role === 'WR' || a.role === 'TE') && !excludeIds.has(a.id) && Math.abs(a.y-lane) <= 34).sort(byLane).slice(0, 2);
    const ol = offenseSrc.filter(a => a.role === 'OL' && !excludeIds.has(a.id)).sort(byLane).slice(0, 2);
    chosen = [...rec, ...ol];
  } else if(offPlay && offPlay.name === 'Sweep'){
    const fb = offenseSrc.find(a => a.role === 'FB' && !excludeIds.has(a.id));
    const guards = offenseSrc.filter(a => a.role === 'OL' && (a.y === 42 || a.y === 58) && !excludeIds.has(a.id))
      .sort((a,b) => Math.abs(a.y-50) - Math.abs(b.y-50));
    chosen = [...(fb ? [fb] : []), ...guards];
  } else {
    const te = offenseSrc.filter(a => (a.role === 'TE' || a.role === 'FB') && !excludeIds.has(a.id)).sort(byLane).slice(0, 1);
    const ol = offenseSrc.filter(a => a.role === 'OL' && !excludeIds.has(a.id)).sort(byLane).slice(0, 1);
    chosen = [...te, ...ol];
  }
  const midT = variant === 'screen' ? kf.catch : kf.laneCommit;
  const endT = kf.tackle;
  const gained = outcome === 'gain' || outcome === 'touchdown' || outcome === 'safety';
  const baseX = variant === 'screen' ? throwX : clamp(preSnapSpot + offenseDir*1, -5, 105);
  const offs = [-9, 9, -17, 17];
  const usedDef = new Set();
  chosen.forEach((a, k) => {
    // Un lineman qui part en escorte ne bloque plus le DL d'en face.
    const partner = blockPairs.get(a.id);
    if(partner){ blockPairs.delete(a.id); blockPairs.delete(partner.id); }
    const y = clamp(lane + offs[k], 4, 96);
    const mid = {t: midT, x: clamp(baseX + offenseDir*(2.5 + k*1.2), -8, 108), y};
    const end = gained
      ? {t: endT, x: clamp(finalX + offenseDir*(1.2 + k*0.6), -8, 108), y: clamp(lane + offs[k]*0.7, 4, 96)}
      : {t: endT, x: mid.x, y};
    offense.set(a.id, {mid, end});
    const def = defenseSrc.filter(d => (d.role === 'LB' || d.role === 'CB' || d.role === 'S') && !excludeIds.has(d.id) && !usedDef.has(d.id))
      .sort((d1,d2) => (Math.abs(d1.y-end.y) + Math.abs(d1.x-end.x)) - (Math.abs(d2.y-end.y) + Math.abs(d2.x-end.x)))[0];
    if(def){
      usedDef.add(def.id);
      defense.set(def.id, {
        mid: {t: midT, x: clamp(mid.x + offenseDir*1.4, -8, 108), y: mid.y},
        end: {t: endT, x: clamp(end.x + offenseDir*1.1, -8, 108), y: end.y}
      });
      blockPairs.set(a.id, def); blockPairs.set(def.id, a);
    }
  });
  return {offense, defense};
}

function passTargetLane(offPlay, receiver, lane){
  if(offPlay.name === 'Quick Slant') return clamp(lerp(lane, 50, 0.65), 4, 96);
  if(offPlay.name === 'Out Route' || offPlay.name === 'Flood Concept'){
    const side = Math.sign(lane - 50) || Math.sign(receiver.y - 50) || 1;
    return clamp(lane === 50 ? (side < 0 ? 10 : 90) : lane + side * 10, 4, 96);
  }
  if(offPlay.name === 'Crossing Route') return clamp(100 - receiver.y, 4, 96);
  if(offPlay.name === 'Mesh Concept' || offPlay.name === 'Deep Post') return 50;
  return lane;
}

function buildPassRoutePath(actor, ctx, isTarget){
  const {kf, offenseDir, offPlay, throwX} = ctx;
  const lane = ctx.throwLane;
  const name = offPlay.name;
  const isCarrier = isTarget;
  const depth = offPlay.depth === 'short' ? 5 : offPlay.depth === 'medium' ? 10 : 16;
  const ordinal = Number(actor.id.slice(1)) || 0;
  const side = actor.y < 50 ? -1 : 1;
  let destination = isCarrier
    ? {x:throwX, y:lane}
    : {x:clamp(actor.x + offenseDir * depth, 0, 100), y:actor.y};
  let breakPoint = {x:lerp(actor.x, destination.x, 0.62), y:actor.y};

  if(name === 'Quick Slant' || name === 'Slant'){
    const slantY = clamp(lerp(actor.y, 50, 0.72), 5, 95);
    destination.y = isCarrier ? lane : slantY;
    breakPoint = {x:lerp(actor.x, destination.x, 0.55), y:lerp(actor.y, destination.y, 0.62)};
  } else if(name === 'Hitch / Curl'){
    breakPoint = {x:lerp(actor.x, destination.x, 0.76), y:destination.y};
    destination = {x:clamp(breakPoint.x - offenseDir * 1.5, 0, 100), y:destination.y};
  } else if(name === 'Out Route'){
    const outY = clamp(actor.y + side * 9, 3, 97);
    destination.y = isCarrier ? lane : outY;
    breakPoint = {x:lerp(actor.x, destination.x, 0.58), y:lerp(actor.y, destination.y, 0.35)};
  } else if(name === 'Crossing Route' || name === 'Mesh Concept'){
    const crossY = name === 'Mesh Concept'
      ? clamp(50 + (ordinal % 2 ? 5 : -5), 5, 95)
      : clamp(100 - actor.y, 5, 95);
    destination.y = isCarrier ? lane : crossY;
    breakPoint = {
      x:lerp(actor.x, destination.x, 0.55),
      y:name === 'Mesh Concept' ? lerp(actor.y, 50, 0.62) : lerp(actor.y, crossY, 0.72)
    };
  } else if(name === 'Flood Concept'){
    const level = ordinal % 3;
    const floodDepth = [5, 10, 16][level];
    const floodY = clamp(actor.y + side * [9, 14, 19][level], 3, 97);
    destination = isCarrier
      ? {x:throwX, y:lane}
      : {x:clamp(actor.x + offenseDir * floodDepth, 0, 100), y:floodY};
    breakPoint = {x:lerp(actor.x, destination.x, 0.68), y:lerp(actor.y, destination.y, 0.55)};
  } else if(name === 'Deep Post'){
    const postY = clamp(lerp(actor.y, 50, 0.7), 5, 95);
    destination.y = isCarrier ? lane : postY;
    breakPoint = {x:lerp(actor.x, destination.x, 0.6), y:lerp(actor.y, destination.y, 0.55)};
  } else if(name === 'Four Verticals'){
    destination.y = isCarrier ? lane : actor.y;
    breakPoint = {x:lerp(actor.x, destination.x, 0.62), y:actor.y};
  } else if(name === 'Screen Pass'){
    destination = isCarrier
      ? {x:throwX, y:lane}
      : {x:clamp(actor.x - offenseDir * 1.5, 0, 100), y:lane};
    breakPoint = {x:lerp(actor.x, destination.x, 0.62), y:lerp(actor.y, destination.y, 0.5)};
  } else if(name === 'Play Action'){
    breakPoint = {x:lerp(actor.x, destination.x, 0.5), y:destination.y};
  }

  const path = [
    {t:0,x:actor.x,y:actor.y},
    {t:kf.snap,x:actor.x,y:actor.y},
    {t:kf.routesDevelop,x:breakPoint.x,y:breakPoint.y},
    {t:kf.throw,x:lerp(breakPoint.x,destination.x,0.68),y:lerp(breakPoint.y,destination.y,0.68)},
    {t:kf.catch,x:destination.x,y:destination.y}
  ];
  if(!isCarrier) return [...path, {t:1,x:destination.x,y:destination.y}];

  if(ctx.outcome === 'fumble'){
    return [...path,
      {t:ctx.turnoverFrac,x:ctx.spotBeforeFumble,y:lane},
      {t:1,x:ctx.spotBeforeFumble,y:lane}
    ];
  }
  if(ctx.outcome === 'interception'){
    return [...path, {t:1,x:destination.x,y:destination.y}];
  }
  if(ctx.outcome === 'incomplete'){
    return [...path, {t:1,x:destination.x,y:destination.y}];
  }
  return [...path, {t:kf.tackle,x:ctx.finalX,y:lane}, {t:1,x:ctx.finalX,y:lane}];
}

function buildCarrierPath(actor, ctx){
  const {kf, family, outcome, finalX, lane, offenseDir, throwX} = ctx;
  if(family === 'sack'){
    return [
      {t:0, x:actor.x, y:actor.y}, {t:kf.snap, x:actor.x, y:actor.y},
      {t:kf.dropback, x: clamp(actor.x - offenseDir*1.5, 0, 100), y:actor.y},
      {t:kf.tackle, x: finalX, y: actor.y}, {t:1, x: finalX, y: actor.y}
    ];
  }
  if(ctx.offPlay.type === 'pass') return buildPassRoutePath(actor, ctx, true);
  if(ctx.offPlay.name === 'Toss'){
    const side = ctx.offPlay.direction === 'right' ? 1 : -1;
    const tossX = clamp(actor.x + offenseDir * 0.45, 0, 100);
    const tossY = clamp(actor.y + side * 1.5, 2, 98);
    const releaseT = Math.max(kf.snap, kf.handoff - 0.04);
    const tossPath = [
      {t:0, x:actor.x, y:actor.y},
      {t:kf.snap, x:actor.x, y:actor.y},
      {t:releaseT, x:tossX, y:tossY},
      {t:kf.handoff, x:tossX, y:tossY}
    ];
    if(outcome === 'fumble'){
      return [...tossPath,
        {t:ctx.turnoverFrac, x:ctx.spotBeforeFumble, y:lane},
        {t:1, x:ctx.spotBeforeFumble, y:lane}
      ];
    }
    return [...tossPath,
      {t:kf.laneCommit, x:clamp(tossX + offenseDir*3, 0, 100), y:lane},
      {t:kf.tackle, x:finalX, y:lane},
      {t:1, x:finalX, y:lane}
    ];
  }
  if(['Outside Zone','Sweep','Counter Run'].includes(ctx.offPlay.name)){
    const qb = ctx.qbActor;
    const side = ctx.offPlay.direction === 'right' ? 1 : -1;
    const meshX = clamp(qb.x + offenseDir * (ctx.offPlay.name === 'Counter Run' ? 0.35 : 0.8), 0, 100);
    const meshY = ctx.offPlay.name === 'Sweep' ? 50 : 50 + side * 3.5;
    const approachT = (kf.snap + kf.handoff) / 2;
    const approachX = ctx.offPlay.name === 'Counter Run'
      ? lerp(actor.x, qb.x - offenseDir * 0.2, 0.7)
      : lerp(actor.x, meshX, 0.65);
    const approachY = ctx.offPlay.name === 'Counter Run'
      ? lerp(actor.y, meshY, 0.7)
      : lerp(actor.y, lane, ctx.offPlay.name === 'Outside Zone' ? 0.34 : 0.5);
    const commitY = ctx.offPlay.name === 'Outside Zone' ? lane
      : clamp(lane + (ctx.offPlay.name === 'Sweep' ? side * 2 : 0), 2, 98);
    const meshPath = [
      {t:0, x:actor.x, y:actor.y},
      {t:kf.snap, x:actor.x, y:actor.y},
      {t:approachT, x:approachX, y:approachY},
      {t:kf.handoff, x:meshX, y:meshY}
    ];
    if(outcome === 'fumble'){
      return [...meshPath,
        {t:ctx.turnoverFrac, x:ctx.spotBeforeFumble, y:lane},
        {t:1, x:ctx.spotBeforeFumble, y:lane}
      ];
    }
    return [...meshPath,
      {t:kf.laneCommit, x:clamp(meshX + offenseDir*(ctx.offPlay.name === 'Sweep' ? 4 : 3), 0, 100), y:commitY},
      {t:kf.tackle, x:finalX, y:commitY},
      {t:1, x:finalX, y:commitY}
    ];
  }
  if(family === 'insideRun' || family === 'outsideRun'){
    const commitX = clamp(actor.x + offenseDir*3, 0, 100);
    const startY = actor.y;
    const commitY = ctx.offPlay.direction === 'middle' ? 50 : lane;
    if(outcome === 'fumble'){
      return [
        {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
        {t:kf.handoff, x:commitX, y:commitY},
        {t:ctx.turnoverFrac, x: ctx.spotBeforeFumble, y:lane},
        {t:1, x: ctx.spotBeforeFumble, y:lane}
      ];
    }
    return [
      {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
      {t:kf.handoff, x:commitX, y:lerp(startY,commitY,0.55)},
      {t:kf.laneCommit, x:clamp((commitX+finalX)/2,0,100), y:commitY},
      {t:kf.tackle, x:finalX, y:commitY}, {t:1, x:finalX, y:commitY}
    ];
  }
  const midX = clamp((actor.x + throwX)/2, 0, 100), midY = (actor.y + lane)/2;
  if(outcome === 'fumble'){
    return [
      {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
      {t:kf.routesDevelop, x:midX, y:midY},
      {t:ctx.catchFrac, x:throwX, y:lane},
      {t:ctx.turnoverFrac, x: ctx.spotBeforeFumble, y:lane},
      {t:1, x: ctx.spotBeforeFumble, y:lane}
    ];
  }
  return [
    {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
    {t:kf.routesDevelop, x:midX, y:midY},
    {t:ctx.catchFrac, x:throwX, y:lane},
    {t:kf.tackle, x: finalX, y: lane}, {t:1, x: finalX, y: lane}
  ];
}

function buildOffenseActorPath(actor, ctx){
  if(actor.id === ctx.carrierId) return buildCarrierPath(actor, ctx);
  const {kf, offenseDir, family} = ctx;
  const plan = ctx.escortPlan && ctx.escortPlan.get(actor.id);
  if(plan){
    const preT = (kf.snap + plan.mid.t) / 2;
    return [
      {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
      {t:preT, x: actor.x + offenseDir*0.6, y: lerp(actor.y, plan.mid.y, 0.5)},
      plan.mid, plan.end, {t:1, x:plan.end.x, y:plan.end.y}
    ];
  }
  if(ctx.animVariant === 'playAction' && actor.role === 'RB'){
    // Feinte de remise : le RB vient chercher le ballon puis s'écrase dans la ligne.
    const qbSrc = actor.x + offenseDir*5;
    return [
      {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
      {t:kf.dropback, x: qbSrc - offenseDir*0.8, y: 54},
      {t:kf.routesDevelop, x: ctx.preSnapSpot - offenseDir*0.8, y: 56},
      {t:1, x: ctx.preSnapSpot - offenseDir*0.6, y: 56}
    ];
  }
  if(actor.role === 'OL' || actor.role === 'FB'){
    const duel = ctx.duelByActor && ctx.duelByActor.get(actor.id);
    if(duel){
      const blockerEnd = duel.battleType === 'pullBlock'
        ? {...duel.blockerEnd, y:clamp(50 + Math.sign(ctx.lane - 50) * 9, 2, 98)}
        : duel.blockerEnd;
      return [
        {t:0,x:actor.x,y:actor.y},
        {t:kf.snap,x:actor.x,y:actor.y},
        {t:duel.engageTime,x:duel.blockerContact.x,y:duel.blockerContact.y},
        {t:duel.resolveTime,x:blockerEnd.x,y:blockerEnd.y},
        {t:kf.tackle,x:blockerEnd.x,y:blockerEnd.y},
        {t:1,x:blockerEnd.x,y:blockerEnd.y}
      ];
    }
    if(actor.role === 'FB'){
      const assignment = ctx.actorAssignments && ctx.actorAssignments.get(actor.id);
      const target = assignment && ctx.defenseActors.find(defender => defender.id === assignment.targetId);
      if(target){
        const engageT = kf.handoff || kf.routesDevelop || 0.3;
        const contact = {
          x:clamp(lerp(actor.x, target.x - offenseDir*1.2, 0.65), 0, 100),
          y:clamp(lerp(actor.y, target.y, 0.65), 2, 98)
        };
        return [
          {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
          {t:engageT,x:contact.x,y:contact.y}, {t:1,x:contact.x,y:contact.y}
        ];
      }
    }
    const block = ctx.blockPairs.get(actor.id);
    const engageT = kf.handoff || kf.dropback || 0.2;
    const engageX = block ? clamp(actor.x + (block.x-actor.x)*0.4, 0, 100) : clamp(actor.x + offenseDir*1.2, 0, 100);
    const lateralOffset = ((Number(actor.id.slice(1)) * 7) % 5) - 2;
    return [
      {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
      {t:engageT, x:engageX, y: clamp(actor.y + lateralOffset, 2, 98)},
      {t:1, x:engageX, y: clamp(actor.y + lateralOffset, 2, 98)}
    ];
  }
  if(actor.role === 'QB'){
    const dropX = (family === 'insideRun' || family === 'outsideRun')
      ? actor.x : clamp(actor.x - offenseDir*1.5, 0, 100);
    if(ctx.animVariant === 'playAction'){
      return [
        {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
        {t:kf.dropback, x: actor.x - offenseDir*0.6, y: actor.y + 2},   // feinte de remise
        {t:kf.throw, x: actor.x - offenseDir*3.5, y: actor.y},          // recul profond
        {t:1, x: actor.x - offenseDir*3.5, y: actor.y}
      ];
    }
    if(ctx.animVariant === 'screen'){
      return [
        {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
        {t:kf.throw, x: actor.x - offenseDir*2.5, y: actor.y},          // recule pour attirer la pression
        {t:1, x: actor.x - offenseDir*2.5, y: actor.y}
      ];
    }
    if(ctx.offPlay.name === 'Toss'){
      return [
        {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
        {t:kf.handoff, x:actor.x, y:actor.y},
        {t:1, x:actor.x - offenseDir*0.8, y:actor.y}
      ];
    }
    return [
      {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
      {t:kf.handoff || kf.dropback || 0.2, x:dropX, y:actor.y},
      {t:1, x:dropX, y:actor.y}
    ];
  }
  if(ctx.offPlay.type === 'pass' && family !== 'sack' && (actor.role === 'WR' || actor.role === 'TE')){
    return buildPassRoutePath(actor, ctx, false);
  }
  const block = ctx.blockPairs.get(actor.id);
  if(block){
    const engageT = kf.handoff || kf.routesDevelop || 0.3;
    const engageX = clamp(actor.x + (block.x-actor.x)*0.35, 0, 100);
    return [
      {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
      {t:engageT, x:engageX, y: clamp(actor.y + (block.y-actor.y)*0.3, 2, 98)},
      {t:1, x:engageX, y: clamp(actor.y + (block.y-actor.y)*0.3, 2, 98)}
    ];
  }
  const isPass = ctx.offPlay && ctx.offPlay.type === 'pass';
  const depthYards = !isPass ? 3 : ctx.animVariant === 'verticals' ? 18
    : ({short:5, medium:10, deep:16}[ctx.offPlay.depth] || 6);
  const ordinal = Number(actor.id.slice(1)) || 0;
  const depthOffset = (ordinal * 7) % 4;
  const lateralOffset = ((ordinal * 5) % 9) - 4;
  const releaseX = clamp(actor.x + offenseDir*(depthYards + depthOffset), -8, 108);
  let releaseY = clamp(actor.y + lateralOffset, 2, 98);
  if(ctx.animVariant === 'verticals') releaseY = actor.y;
  if(ctx.animVariant === 'crossers'){
    const crossingOffset = ordinal % 2 ? 3 : -3;
    releaseY = clamp(100 - actor.y + crossingOffset, 6, 94);
  }
  const releaseT = isPass ? (kf.catch || kf.throw || 0.5) : (kf.throw || kf.laneCommit || 0.35);
  return [
    {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
    {t:releaseT, x:releaseX, y:releaseY}, {t:1, x:releaseX, y:releaseY}
  ];
}

function coverageSchemeFor(defPlay){
  const profile = defPlay && DEFENSE_PROFILES[defPlay.name];
  return profile && profile.tags.includes('man') ? 'man' : 'zone';
}
function selectBlitzers(defPlay, offPlay, defenseActors){
  const profile = defPlay && DEFENSE_PROFILES[defPlay.name];
  if(!profile || !profile.tags.includes('blitz')) return new Set();
  const runBlitz = profile.tags.includes('runBlitz');
  let count = 0;
  if(runBlitz){
    count = offPlay.type === 'run' ? 3 : 0;
  } else if(offPlay.type === 'pass'){
    count = offPlay.depth === 'deep' ? 3 : offPlay.depth === 'medium' ? 2 : 1;
  } else {
    count = 1;
  }
  return new Set(defenseActors.filter(actor => actor.role === 'LB')
    .sort((a,b) => Math.abs(a.y-50) - Math.abs(b.y-50))
    .slice(0, count).map(actor => actor.id));
}
const COVERAGE_MAX_SPEED = 30;
function coverageStepDistance(elapsed){
  return COVERAGE_MAX_SPEED * Math.max(0, elapsed) / 1.5;
}
function moveCoverageToward(from, target, elapsed){
  const dx = target.x - from.x, dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  const maxDistance = coverageStepDistance(elapsed);
  if(distance <= maxDistance || distance < 0.0001) return {x:target.x, y:target.y};
  const ratio = maxDistance / distance;
  return {x:from.x + dx*ratio, y:from.y + dy*ratio};
}
function buildBoundedDefensePath(actor, checkpoints){
  const points = [{t:0,x:actor.x,y:actor.y}];
  let position = {x:actor.x,y:actor.y};
  let previousTime = 0;
  checkpoints.forEach(checkpoint => {
    if(checkpoint.t < previousTime) return;
    position = moveCoverageToward(position, checkpoint, checkpoint.t - previousTime);
    points.push({t:checkpoint.t,x:position.x,y:position.y});
    previousTime = checkpoint.t;
  });
  return points;
}
function buildCoveragePath(actor, assignment, targetPath, ctx){
  const {kf, offenseDir, offPlay, defPlay, preSnapSpot, lane} = ctx;
  const isMan = assignment.pathType === 'manCoverage';
  const coverageTimes = [...new Set([
    kf.snap,
    kf.routesDevelop || kf.defenderRead || 0.3,
    kf.throw || kf.catch || kf.tackle * 0.7,
    kf.catch || kf.tackle * 0.8,
    kf.tackle
  ])].filter(t => t > 0 && t < 1).sort((a,b) => a-b);
  const ordinal = Number(actor.id.slice(1)) || 0;
  const lateralOffset = ordinal % 2 ? 1.8 : -1.8;
  const coveragePath = [{t:0,x:actor.x,y:actor.y}];
  let position = {x:actor.x,y:actor.y};
  let previousTime = 0;

  coverageTimes.forEach(t => {
    if(t === kf.snap){
      coveragePath.push({t,x:position.x,y:position.y});
      previousTime = t;
      return;
    }
    let target;
    if(isMan){
      const receiverNow = evalPath(targetPath, t);
      const receiver = evalPath(targetPath, Math.min(1, t + 0.05));
      const maxDistance = coverageStepDistance(t - previousTime);
      const alreadyInFront = (position.x - receiverNow.x) * offenseDir >= 2.8;
      const targetX = alreadyInFront ? position.x : clamp(receiver.x + offenseDir * 2.8, 0, 100);
      const targetY = clamp(receiver.y + lateralOffset, 2, 98);
      const deltaX = targetX - position.x;
      const moveX = Math.sign(deltaX) * Math.min(Math.abs(deltaX), maxDistance);
      const remainingY = Math.sqrt(Math.max(0, maxDistance*maxDistance - moveX*moveX));
      const deltaY = targetY - position.y;
      position = {
        x:position.x + moveX,
        y:position.y + Math.sign(deltaY) * Math.min(Math.abs(deltaY), remainingY)
      };
    } else {
      const receiver = evalPath(targetPath, kf.routesDevelop || 0.3);
      const defenseName = defPlay && defPlay.name;
      const depth = defenseName === 'Cover 4' ? (actor.role === 'S' ? 22 : 14)
        : defenseName === 'Cover 3' ? (actor.role === 'S' ? 19 : 12)
        : defenseName === 'Prevent Defense' ? (actor.role === 'S' ? 24 : 18)
        : defenseName === 'Dime Defense' ? 18
        : actor.role === 'S' ? 16 : 9;
      const zoneY = actor.y + (receiver.y - actor.y) * (actor.role === 'S' ? 0.12 : 0.24);
      target = {
        x:clamp(preSnapSpot + offenseDir * depth, 0, 100),
        y:clamp(zoneY + (t >= (kf.catch || kf.tackle * 0.8) ? (lane - zoneY) * 0.12 : 0), 2, 98)
      };
    }
    if(!isMan) position = moveCoverageToward(position, target, t - previousTime);
    coveragePath.push({t,x:position.x,y:position.y});
    previousTime = t;
  });
  coveragePath.push({t:1,x:position.x,y:position.y});
  return coveragePath;
}

function buildTacklePursuitPath(actor, carrierPath, ctx, approachPath){
  const {kf, offPlay} = ctx;
  const startT = offPlay.type === 'pass' ? kf.catch : (kf.handoff || kf.laneCommit || kf.snap);
  const endT = kf.tackle;
  if(!carrierPath || endT <= startT) return approachPath;

  const start = evalPath(approachPath, startT);
  const carrierAtStart = evalPath(carrierPath, startT);
  const dx = start.x - carrierAtStart.x;
  const dy = start.y - carrierAtStart.y;
  const gap = Math.hypot(dx, dy);
  const offsetScale = gap > 2.8 ? 2.8 / gap : 1;
  const offsetX = dx * offsetScale;
  const offsetY = dy * offsetScale;
  const midT = (startT + endT) / 2;
  const carrierAtMid = evalPath(carrierPath, midT);
  const carrierAtEnd = evalPath(carrierPath, endT);
  const tail = [
    {t:startT,x:start.x,y:start.y},
    {t:midT,x:clamp(carrierAtMid.x + offsetX, 0, 100),y:clamp(carrierAtMid.y + offsetY, 2, 98)},
    {t:endT,x:clamp(carrierAtEnd.x + offsetX, 0, 100),y:clamp(carrierAtEnd.y + offsetY, 2, 98)}
  ];
  const path = approachPath.filter(point => point.t < startT);
  path.push(...tail, {t:1,x:tail[tail.length-1].x,y:tail[tail.length-1].y});
  return path;
}

function buildBlitzerPath(actor, ctx){
  const {kf,offPlay,offenseDir} = ctx;
  const qbPath = ctx.offensePaths && ctx.offensePaths.get(ctx.qbId);
  const carrierPath = ctx.offensePaths && ctx.offensePaths.get(ctx.carrierId);
  if(!qbPath) return [{t:0,x:actor.x,y:actor.y},{t:1,x:actor.x,y:actor.y}];

  const qbAt = t => evalPath(qbPath, t);
  const ordinal = Number(actor.id.slice(1)) || 0;
  const offsetY = ordinal % 2 ? 1.5 : -1.5;
  const pressureT = offPlay.type === 'run'
    ? Math.max(kf.snap, (kf.snap + (kf.handoff || kf.tackle)) / 2)
    : (kf.pressure || kf.routesDevelop || kf.defenderRead || kf.snap + 0.2);
  const firstTarget = qbAt(pressureT);
  const path = [
    {t:0,x:actor.x,y:actor.y},
    {t:kf.snap,x:actor.x,y:actor.y},
    {t:pressureT,
      x:clamp(lerp(actor.x, firstTarget.x + offenseDir*1.6, 0.72), 0, 100),
      y:clamp(lerp(actor.y, firstTarget.y + offsetY, 0.72), 2, 98)}
  ];

  if(offPlay.type === 'run' && carrierPath){
    const handoffT = kf.handoff || pressureT;
    const handoff = evalPath(carrierPath, handoffT);
    path.push({
      t:handoffT,
      x:clamp(handoff.x + offenseDir*2.8, 0, 100),
      y:clamp(handoff.y + offsetY, 2, 98)
    });
    const endT = kf.tackle || 0.85;
    const carrierEnd = evalPath(carrierPath, endT);
    path.push({
      t:endT,
      x:clamp(carrierEnd.x + offenseDir*2.8, 0, 100),
      y:clamp(carrierEnd.y + offsetY, 2, 98)
    });
  } else {
    const releaseT = kf.throw || kf.tackle || pressureT;
    const qbAtRelease = qbAt(releaseT);
    path.push({
      t:releaseT,
      x:clamp(qbAtRelease.x + offenseDir*1.6, 0, 100),
      y:clamp(qbAtRelease.y + offsetY, 2, 98)
    });
  }
  const last = path[path.length-1];
  path.push({t:1,x:last.x,y:last.y});
  return path;
}

function buildDefenseActorPath(actor, ctx){
  const {kf, family, finalX, lane, throwX} = ctx;
  const applyTacklePursuit = path => {
    if(actor.id !== ctx.tacklerId || family === 'sack'
      || ['incomplete','interception','fumble'].includes(ctx.outcome)) return path;
    const carrierPath = ctx.offensePaths && ctx.offensePaths.get(ctx.carrierId);
    return buildTacklePursuitPath(actor, carrierPath, ctx, path);
  };

  if(actor.id === ctx.interceptorId){
    const midX = clamp((actor.x+throwX)/2,0,100), midY=(actor.y+ctx.throwLane)/2;
    return buildBoundedDefensePath(actor, [
      {t:kf.snap,x:actor.x,y:actor.y},
      {t:kf.routesDevelop || 0.3,x:midX,y:midY},
      {t:ctx.catchFrac,x:throwX,y:ctx.throwLane},
      {t:1,x:ctx.ret.newSpot,y:ctx.throwLane}
    ]);
  }
  const eng = ctx.escortDefenders && ctx.escortDefenders.get(actor.id);
  if(eng){
    const readT = Math.max(kf.snap + 0.02, eng.mid.t * 0.6);
    return [
      {t:0,x:actor.x,y:actor.y}, {t:readT, x:actor.x, y:actor.y},
      eng.mid, eng.end, {t:1, x:eng.end.x, y:eng.end.y}
    ];
  }
  if(actor.id === ctx.fumbleRecovererId){
    return [
      {t:0,x:actor.x,y:actor.y},
      {t:ctx.turnoverFrac, x:ctx.fumbleSpot.x, y:ctx.fumbleSpot.y},
      {t:ctx.fumbleRecoverTime, x:ctx.fumbleSpot.x, y:ctx.fumbleSpot.y},
      {t:1, x: ctx.ret.newSpot, y:ctx.throwLane}
    ];
  }
  if(ctx.blitzerIds && ctx.blitzerIds.has(actor.id)
    && !(family === 'sack' && actor.id === ctx.tacklerId)){
    return applyTacklePursuit(buildBlitzerPath(actor, ctx));
  }

  const assignment = ctx.actorAssignments && ctx.actorAssignments.get(actor.id);
  const tacklerCoverageTarget = actor.id === ctx.tacklerId && ctx.coverageTargets
    && ctx.coverageTargets.get(actor.id);
  if(assignment && (assignment.pathType === 'manCoverage' || assignment.pathType === 'deepCoverage'
    || assignment.pathType === 'zoneCoverage' || tacklerCoverageTarget)){
    const targetId = assignment.pathType === 'manCoverage'
      ? assignment.targetId : tacklerCoverageTarget || assignment.targetId;
    const targetPath = ctx.offensePaths && ctx.offensePaths.get(targetId);
    if(targetPath){
      const coverageAssignment = tacklerCoverageTarget && assignment.pathType !== 'manCoverage'
        ? {...assignment, targetId, pathType:ctx.coverageScheme === 'man' ? 'manCoverage' : 'zoneCoverage'}
        : assignment;
      return applyTacklePursuit(buildCoveragePath(actor, coverageAssignment, targetPath, ctx));
    }
  }

  if(actor.role === 'DL'){
    const duel = ctx.duelsByDefender && ctx.duelsByDefender.get(actor.id)
      && ctx.duelsByDefender.get(actor.id)[0];
    if(duel){
      if(actor.id === ctx.tacklerId && family === 'sack'){
        return applyTacklePursuit([
          {t:0,x:actor.x,y:actor.y},
          {t:kf.snap,x:actor.x,y:actor.y},
          {t:duel.engageTime,x:duel.defenderContact.x,y:duel.defenderContact.y},
          {t:Math.min(duel.resolveTime,kf.tackle-0.04),x:duel.defenderEnd.x,y:duel.defenderEnd.y},
          {t:kf.tackle,x:finalX,y:lane},
          {t:1,x:finalX,y:lane}
        ]);
      }
      return applyTacklePursuit([
        {t:0,x:actor.x,y:actor.y},
        {t:kf.snap,x:actor.x,y:actor.y},
        {t:duel.engageTime,x:duel.defenderContact.x,y:duel.defenderContact.y},
        {t:duel.resolveTime,x:duel.defenderEnd.x,y:duel.defenderEnd.y},
        {t:1,x:duel.defenderEnd.x,y:duel.defenderEnd.y}
      ]);
    }
    const block = ctx.blockPairs.get(actor.id);
    const readT = kf.handoff || kf.dropback || 0.2;
    const pressT = family === 'sack' ? kf.pressure : Math.min(0.7, kf.tackle*0.65);
    const pressX = clamp(actor.x - ctx.offenseDir*(ctx.animVariant === 'screen' ? 5 : (block ? 1.2 : 2.6)), -8, 108);
    const pts = [{t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y}, {t:readT, x:pressX, y:actor.y}];
    if(actor.id === ctx.tacklerId){
      pts.push({t:kf.tackle, x: finalX, y: lane}, {t:1, x: finalX, y: lane});
    } else {
      pts.push({t:pressT, x:pressX, y:actor.y}, {t:1, x:pressX, y:actor.y});
    }
    return applyTacklePursuit(pts);
  }

  if(actor.role === 'LB'){
    // Un blitzer qui est le tackleur désigné sur un sack fonce directement sur
    // le QB dès le snap, sans délai de lecture (contrairement à un LB en jeu
    // normal qui lit l'action avant de réagir).
    if(family === 'sack' && actor.id === ctx.tacklerId){
      return applyTacklePursuit([
        {t:0,x:actor.x,y:actor.y}, {t:kf.snap,x:actor.x,y:actor.y},
        {t:kf.tackle, x: finalX, y: lane}, {t:1, x: finalX, y: lane}
      ]);
    }
    const readT = kf.defenderRead || kf.routesDevelop || 0.4;
    const pts = [{t:0,x:actor.x,y:actor.y}, {t:readT, x:actor.x, y:actor.y}];
    if(actor.id === ctx.tacklerId){
      pts.push({t:kf.tackle, x: finalX, y: lane}, {t:1, x: finalX, y: lane});
    } else {
      const convergeX = clamp(actor.x + (finalX-actor.x)*0.55, 0, 100);
      const convergeY = actor.y + (lane-actor.y)*0.3;
      pts.push({t: kf.tackle || 0.85, x:convergeX, y:convergeY}, {t:1, x:convergeX, y:convergeY});
    }
    return applyTacklePursuit(pts);
  }

  const isDeep = actor.role === 'S';
  const coverT = isDeep ? (kf.catch || (kf.tackle*0.7)) : (kf.routesDevelop || 0.3);
  if(actor.id === ctx.tacklerId){
    if(actor.role === 'CB' || actor.role === 'S'){
      return applyTacklePursuit(buildBoundedDefensePath(actor, [
        {t:kf.snap,x:actor.x,y:actor.y},
        {t:coverT,x:finalX,y:lane},
        {t:kf.tackle,x:finalX,y:lane},
        {t:1,x:finalX,y:lane}
      ]));
    }
    return applyTacklePursuit([
      {t:0,x:actor.x,y:actor.y}, {t:coverT, x:actor.x, y:(actor.y+lane)/2},
      {t:kf.tackle, x: finalX, y: lane}, {t:1, x: finalX, y: lane}
    ]);
  }
  const convergeX = clamp(actor.x + (finalX-actor.x)*0.35, 0, 100);
  if(actor.role === 'CB' || actor.role === 'S'){
    return applyTacklePursuit(buildBoundedDefensePath(actor, [
      {t:kf.snap,x:actor.x,y:actor.y},
      {t:coverT,x:convergeX,y:(actor.y+lane)/2},
      {t:1,x:convergeX,y:(actor.y+lane)/2}
    ]));
  }
  return applyTacklePursuit([
    {t:0,x:actor.x,y:actor.y}, {t:coverT, x:actor.x, y:actor.y},
    {t:1, x:convergeX, y:(actor.y+lane)/2}
  ]);
}

function actorAssignment(actor, ctx){
  const {family, offPlay, animVariant} = ctx;
  let task, movementProfile, pathType, targetId = null;
  if(actor.team === 'offense'){
    if(actor.id === ctx.carrierId){
      task = offPlay.type === 'pass' ? 'routeAndReceive' : 'carry';
      pathType = family === 'sack' ? 'sackContact'
        : offPlay.type === 'pass' ? 'receiverRoute' : 'ballCarrier';
      targetId = family === 'sack' ? ctx.tacklerId
        : ctx.qbId === actor.id ? null : ctx.qbId;
    } else if(actor.id === ctx.playActionFakeId){
      task = 'playActionFakeHandoff';
      pathType = 'fakeHandoff';
      targetId = ctx.qbId;
    } else if(actor.role === 'QB'){
      task = animVariant === 'playAction' ? 'playActionDropback'
        : offPlay.name === 'Toss' ? 'shortLateralToss'
        : (offPlay.type === 'run' ? 'handoffOrFake' : 'dropbackAndThrow');
      pathType = animVariant === 'playAction' ? 'playAction'
        : offPlay.type === 'run' ? 'handoff' : 'pocketAndThrow';
      targetId = ctx.carrierId;
    } else if(actor.role === 'OL' || actor.role === 'FB'){
      const duel = ctx.duelByActor && ctx.duelByActor.get(actor.id);
      const blockTarget = ctx.blockPairs.get(actor.id);
      const escort = ctx.escortPlan && ctx.escortPlan.has(actor.id);
      task = duel ? (duel.battleType === 'pullBlock' ? 'pullAndBlock'
        : duel.battleType === 'doubleTeam' ? 'doubleTeamBlock' : 'engageBlock')
        : escort || actor.role === 'FB' ? 'leadBlock' : 'protectOrRelease';
      pathType = duel ? duel.battleType : escort ? 'leadBlock'
        : actor.role === 'FB' ? 'secondLevelBlock' : 'lineProtection';
      targetId = blockTarget ? blockTarget.id : null;
      if(!targetId && actor.role === 'FB'){
        const secondLevel = (ctx.defenseActors || []).filter(defender => defender.role === 'LB' || defender.role === 'DL')
          .sort((a,b) => (Math.abs(a.y-actor.y) + Math.abs(a.x-actor.x))
            - (Math.abs(b.y-actor.y) + Math.abs(b.x-actor.x)))[0];
        targetId = secondLevel ? secondLevel.id : ctx.carrierId;
      }
    } else {
      const blockTarget = ctx.blockPairs.get(actor.id);
      if(blockTarget && blockTarget.team === 'defense'){
        task = 'engageBlock';
        pathType = 'skillBlock';
        targetId = blockTarget.id;
      } else {
        task = offPlay.type === 'pass' ? 'decoyRoute'
          : family === 'outsideRun' ? 'edgeSupport' : 'secondLevelBlock';
        pathType = offPlay.type === 'pass' ? 'receiverRoute' : 'clearoutRoute';
        targetId = ctx.qbId;
      }
    }
    movementProfile = actor.role === 'OL' || actor.role === 'FB' ? 'power' : actor.role === 'QB' ? 'quarterback' : 'skill';
  } else {
    if(actor.id === ctx.interceptorId){
      task = 'interceptAndReturn'; pathType = 'interceptionReturn'; targetId = ctx.carrierId;
    } else if(actor.id === ctx.fumbleRecovererId){
      task = 'recoverAndReturn'; pathType = 'fumbleRecovery'; targetId = ctx.carrierId;
    } else if(ctx.blitzerIds && ctx.blitzerIds.has(actor.id) && family !== 'sack'){
      task = actor.id === ctx.tacklerId ? 'blitzAndTackle' : 'blitzAndPressure';
      pathType = 'linebackerBlitz';
      targetId = offPlay.type === 'run' ? ctx.carrierId : ctx.qbId;
    } else if(actor.id === ctx.tacklerId && offPlay.type === 'pass' && ctx.coverageScheme === 'man'
      && ctx.coverageTargets.has(actor.id)){
      task = 'manCoverAndTackle';
      pathType = 'manCoverage';
      targetId = ctx.coverageTargets.get(actor.id);
    } else if(actor.id === ctx.tacklerId){
      task = family === 'sack' ? 'rushAndSack' : 'pursueAndTackle';
      pathType = family === 'sack' ? 'quarterbackRush' : 'tacklePursuit';
      targetId = ctx.carrierId;
    } else if(ctx.escortDefenders && ctx.escortDefenders.has(actor.id)){
      task = 'shedBlockAndPursue'; pathType = 'blockEngagement';
      const blockTarget = ctx.blockPairs.get(actor.id);
      targetId = blockTarget ? blockTarget.id : ctx.carrierId;
    } else if(actor.role === 'DL'){
      const duel = ctx.duelsByDefender && ctx.duelsByDefender.get(actor.id)
        && ctx.duelsByDefender.get(actor.id)[0];
      task = duel ? 'rushOrEngage' : 'rushTheBackfield';
      pathType = duel ? duel.battleType : 'gapRush';
      targetId = duel ? duel.blockerId : (family === 'sack' ? ctx.qbId : ctx.carrierId);
    } else if(actor.role === 'LB' && !(offPlay.type === 'pass' && ctx.coverageScheme === 'man'
      && ctx.coverageTargets.has(actor.id))){
      task = family === 'sack' ? 'blitzOrRead' : 'readAndFill';
      pathType = family === 'sack' ? 'linebackerBlitz' : 'runPassRead';
      targetId = family === 'sack' ? ctx.qbId : ctx.carrierId;
    } else {
      const coverageTarget = ctx.coverageTargets && ctx.coverageTargets.get(actor.id);
      const passPlay = offPlay.type === 'pass';
      const manCoverage = passPlay && ctx.coverageScheme === 'man' && !!coverageTarget;
      task = passPlay ? (manCoverage ? 'manCoverReceiver'
        : actor.role === 'S' ? 'protectDeepZone' : 'coverZone')
        : 'containAndPursue';
      pathType = passPlay ? (manCoverage ? 'manCoverage'
        : ctx.coverageScheme === 'man' ? 'deepCoverage' : 'zoneCoverage') : 'pursuit';
      targetId = passPlay && coverageTarget ? coverageTarget : ctx.carrierId;
    }
    movementProfile = actor.role === 'DL' ? 'power' : actor.role === 'LB' ? 'read' : 'coverage';
  }
  const ordinal = Number(actor.id.slice(1)) || 0;
  const directionSeed = ctx.offPlay.direction === 'right' ? 7 : ctx.offPlay.direction === 'left' ? 13 : 3;
  const delayStep = (ordinal * 37 + (actor.team === 'defense' ? 71 : 13)
    + ctx.offPlay.name.length * 11 + directionSeed) % 17;
  return {
    actorId: actor.id,
    task,
    targetId,
    startDelay: actor.id === ctx.carrierId ? 0.025 : 0.035 + delayStep * 0.018,
    movementProfile,
    pathType
  };
}

function buildBlockDuels(blockPairs, offenseActors, family, outcome, lane, yards, offPlay, offenseDir){
  const duels = [];
  const offenseById = new Map(offenseActors.map(actor => [actor.id, actor]));
  const blockersPerDefender = new Map();
  blockPairs.forEach((opponent, actorId) => {
    if(actorId.startsWith('O') && opponent.id.startsWith('D') && opponent.role === 'DL'){
      blockersPerDefender.set(opponent.id, (blockersPerDefender.get(opponent.id) || 0) + 1);
    }
  });
  blockPairs.forEach((opponent, actorId) => {
    if(!actorId.startsWith('O') || !opponent.id.startsWith('D')) return;
    const blocker = offenseById.get(actorId);
    const isLineBlock = opponent.role === 'DL' && blocker && (blocker.role === 'OL' || blocker.role === 'FB');
    if(!isLineBlock) return;
    const passPlay = offPlay.type === 'pass';
    const advantage = outcome === 'sack' || yards < 0 || (passPlay && outcome === 'incomplete') ? 'defense'
      : yards > 0 ? 'offense' : 'balanced';
    const isDoubleTeam = blockersPerDefender.get(opponent.id) > 1;
    const isGuard = blocker.role === 'OL' && (blocker.y === 42 || blocker.y === 58);
    const battleType = passPlay
      ? (outcome === 'sack' ? (Math.abs(opponent.y - 50) > 12 ? 'edgeRush' : 'bullRush') : 'passBlock')
      : offPlay.name === 'Sweep' && isGuard ? 'pullBlock'
      : family === 'outsideRun' ? 'reachBlock'
      : family === 'insideRun' && isDoubleTeam ? 'doubleTeam'
      : 'driveBlock';
    const defenderContactY = isDoubleTeam ? opponent.y : (blocker.y + opponent.y) / 2;
    const blockerContactY = isDoubleTeam ? blocker.y : defenderContactY;
    const lateralSign = blocker.y < 50 ? -1 : 1;
    const isPassBlock = passPlay;
    const blockerEnd = isPassBlock
      ? {x:clamp(blocker.x - offenseDir * 0.8, 0, 100), y:clamp(lerp(blocker.y, 50, 0.16), 2, 98)}
      : {x:clamp(blocker.x + offenseDir * (advantage === 'offense' ? 0.9 : advantage === 'defense' ? -0.8 : 0.15), 0, 100),
        y:clamp(blockerContactY + lateralSign * (battleType === 'doubleTeam' ? 0.7 : 0.25), 2, 98)};
    const defenderEnd = isPassBlock
      ? {x:clamp(opponent.x - offenseDir * (advantage === 'defense' ? 1.7 : 0.65), 0, 100),
        y:clamp(defenderContactY + lateralSign * 0.35, 2, 98)}
      : {x:clamp(opponent.x + offenseDir * (advantage === 'offense' ? 1.8 : advantage === 'defense' ? -2.2 : 0.05), 0, 100),
        y:clamp(defenderContactY + lateralSign * (advantage === 'defense' ? 0.65 : -0.25), 2, 98)};
    const engageTime = Math.min(PLAY_TIMELINES[family].tackle - 0.12, PLAY_TIMELINES[family].snap + 0.14);
    const resolveTime = Math.min(PLAY_TIMELINES[family].tackle - 0.06,
      Math.max(engageTime + 0.1, PLAY_TIMELINES[family].defenderRead
        || PLAY_TIMELINES[family].pressure || PLAY_TIMELINES[family].laneCommit
        || PLAY_TIMELINES[family].routesDevelop || 0.4));
    duels.push({
      blockerId: actorId,
      defenderId: opponent.id,
      battleType,
      advantage,
      lane,
      startTime: PLAY_TIMELINES[family].snap,
      duration: Math.max(0.1, (PLAY_TIMELINES[family].tackle || 0.85) - PLAY_TIMELINES[family].snap),
      engageTime,
      resolveTime,
      blockerContact: {x:clamp(blocker.x + offenseDir * 0.65, 0, 100), y:blockerContactY},
      defenderContact: {x:clamp(opponent.x - offenseDir * 0.65, 0, 100), y:defenderContactY},
      blockerEnd,
      defenderEnd
    });
  });
  return duels;
}

function buildPlaySetup(cfg){
  const {offPlay, defPlay, preSnapSpot, offenseSide, outcome} = cfg;
  const offenseDir = offenseSide === 'player' ? 1 : -1;
  const finalX = Number.isFinite(cfg.finalX) ? cfg.finalX
    : cfg.ret && Number.isFinite(cfg.ret.newSpot) ? cfg.ret.newSpot
    : clamp(preSnapSpot + offenseDir * (cfg.yards || 0), 0, 100);
  const lane = laneForDirection(offPlay.direction);
  const family = selectPlayFamily(offPlay, outcome);
  const kf = PLAY_TIMELINES[family];

  const offenseSrc = formationDots.offense.map((d,i) => ({id:'O'+i, team:'offense', role:d.role, x:d.formX, y:d.y, el:d.el}));
  const defenseSrc = formationDots.defense.map((d,i) => ({id:'D'+i, team:'defense', role:d.role, x:d.formX, y:d.y, el:d.el}));

  // Variante d'animation propre à certaines actions (Phase 3)
  const animVariant = family === 'sack' ? null
    : offPlay.name === 'Play Action' ? 'playAction'
    : offPlay.name === 'Screen Pass' ? 'screen'
    : outcome === 'interception' || outcome === 'fumble' ? null
    : ['Sweep','Toss','Outside Zone','Counter Run'].includes(offPlay.name) ? 'outsideLead'
    : offPlay.name === 'Four Verticals' ? 'verticals'
    : ['Mesh Concept','Crossing Route'].includes(offPlay.name) ? 'crossers'
    : null;

  let carrier;
  if(animVariant === 'screen'){
    carrier = offenseSrc.find(a => a.role === 'RB');
  }
  if(carrier){
    // porteur déjà désigné (screen : le running back reçoit derrière la ligne)
  } else if(family === 'sack'){
    carrier = offenseSrc.find(a => a.role === 'QB') || offenseSrc[0];
  } else if(offPlay.type === 'run'){
    if(['QB Sneak','QB Keeper','Read Option'].includes(offPlay.name)) carrier = offenseSrc.find(a => a.role === 'QB');
    carrier = carrier || offenseSrc.find(a => a.role === 'RB') || offenseSrc.find(a => a.role === 'FB') || offenseSrc[offenseSrc.length-1];
  } else {
    const receivers = offenseSrc.filter(a => a.role === 'WR' || a.role === 'TE');
    const pool = receivers.length ? receivers : offenseSrc;
    carrier = [...pool].sort((a,b) => Math.abs(a.y-lane) - Math.abs(b.y-lane))[0];
  }

  const airYards = animVariant === 'screen' ? -2 : offPlay.depth === 'short' ? 6 : offPlay.depth === 'medium' ? 12 : 22;
  const throwX = clamp(preSnapSpot + offenseDir*airYards, 0, 100);
  const throwLane = offPlay.type === 'pass' ? passTargetLane(offPlay, carrier, lane) : lane;
  const qbActor = offenseSrc.find(a => a.role === 'QB') || carrier;

  const coverageScheme = coverageSchemeFor(defPlay);
  const blitzerIds = selectBlitzers(defPlay, offPlay, defenseSrc);
  const coverageReceivers = offenseSrc.filter(actor => actor.role === 'WR' || actor.role === 'TE');
  const coverageDefenders = defenseSrc.filter(actor => actor.role === 'CB' || actor.role === 'S');
  const coverageTargets = new Map();
  const availableReceivers = [...coverageReceivers];
  if(coverageScheme === 'man'){
    const assignedDefenders = selectManCoverageDefenders(defenseSrc, offPlay, defPlay, coverageReceivers.length);
    matchManCoverage(assignedDefenders, coverageReceivers)
      .forEach((receiver, defender) => coverageTargets.set(defender.id, receiver.id));
  } else {
    coverageDefenders.forEach(defender => {
      const pool = availableReceivers.length ? availableReceivers : coverageReceivers;
      const receiver = [...pool].sort((a,b) => Math.abs(a.y-defender.y) - Math.abs(b.y-defender.y))[0];
      if(receiver){
        coverageTargets.set(defender.id, receiver.id);
        const receiverIndex = availableReceivers.indexOf(receiver);
        if(receiverIndex >= 0) availableReceivers.splice(receiverIndex, 1);
      }
    });
  }
  let tackler = ['interception','fumble','incomplete'].includes(outcome) ? null
    : pickTackler(defenseSrc, family, lane, defPlay, finalX);
  if(offPlay.type === 'pass' && coverageScheme === 'man' && family !== 'sack'
    && tackler && !['interception','fumble','incomplete'].includes(outcome)){
    const assignedDefender = defenseSrc.find(defender => coverageTargets.get(defender.id) === carrier.id);
    if(assignedDefender) tackler = assignedDefender;
  }
  const interceptor = outcome === 'interception'
    ? (pickDefenseReactorNear(defenseSrc, throwLane, throwX) || defenseSrc[0]) : null;
  const fumbleRecoverer = outcome === 'fumble'
    ? (pickDefenseReactorNear(defenseSrc, throwLane, cfg.spotBeforeFumble) || defenseSrc[0]) : null;
  const playActionFake = animVariant === 'playAction'
    ? (offenseSrc.find(actor => actor.role === 'RB') || offenseSrc.find(actor => actor.role === 'FB'))
    : null;
  const spotBeforeFumble = cfg.spotBeforeFumble;
  const turnoverFrac = offPlay.type === 'pass'
    ? Math.min(0.97, (kf.catch || 0.6) + 0.08)
    : Math.min(0.9, (kf.laneCommit || 0.4) + 0.05);
  const tackleTime = kf.tackle || kf.whistle;
  const fumbleRecoverTime = Math.min(
    0.98,
    Math.min(turnoverFrac + 0.12, Math.max(turnoverFrac + 0.04, tackleTime - 0.04))
  );
  const fumbleSpot = {
    x:clamp((spotBeforeFumble === undefined || spotBeforeFumble === null ? preSnapSpot : spotBeforeFumble) + offenseDir * 0.8, 0, 100),
    y:clamp(throwLane + ((fumbleRecoverer && Number(fumbleRecoverer.id.slice(1)) % 2) ? 1.4 : -1.4), 2, 98)
  };

  const blockPairs = computeBlockPairs(offenseSrc, defenseSrc, family);
  // Sur un touchdown, le porteur finit sa course DANS la zone d'en-but.
  const animFinalX = outcome === 'touchdown' ? finalX + offenseDir*4 : finalX;
  const escort = planEscorts(animVariant, offenseSrc, defenseSrc, blockPairs, {
    kf, lane, offenseDir, throwX, finalX: animFinalX, preSnapSpot, outcome, offPlay,
    excludeIds: new Set([carrier.id, tackler && tackler.id, interceptor && interceptor.id, ...blitzerIds].filter(Boolean))
  });
  const duels = buildBlockDuels(blockPairs, offenseSrc, family, outcome, lane, cfg.yards || 0, offPlay, offenseDir);
  const duelByActor = new Map();
  const duelsByDefender = new Map();
  duels.forEach(duel => {
    duelByActor.set(duel.blockerId, duel);
    if(!duelByActor.has(duel.defenderId)) duelByActor.set(duel.defenderId, duel);
    if(!duelsByDefender.has(duel.defenderId)) duelsByDefender.set(duel.defenderId, []);
    duelsByDefender.get(duel.defenderId).push(duel);
  });

  const ctx = {
    kf, family, outcome, finalX: animFinalX, lane, throwLane, offenseDir, throwX, offPlay, animVariant, preSnapSpot,
    coverageScheme,
    escortPlan: escort.offense, escortDefenders: escort.defense,
    duelByActor, duelsByDefender,
    offenseActors: offenseSrc, defenseActors: defenseSrc,
    carrierId: carrier.id, qbId: qbActor.id, qbActor, tacklerId: tackler ? tackler.id : null,
    playActionFakeId: playActionFake ? playActionFake.id : null,
    interceptorId: interceptor ? interceptor.id : null,
    fumbleRecovererId: fumbleRecoverer ? fumbleRecoverer.id : null,
    ret: cfg.ret || null, spotBeforeFumble, turnoverFrac,
    fumbleSpot, fumbleRecoverTime,
    catchFrac: kf.catch, blockPairs,
    coverageTargets, blitzerIds
  };

  ctx.actorAssignments = new Map();
  [...offenseSrc, ...defenseSrc].forEach(actor => {
    ctx.actorAssignments.set(actor.id, actorAssignment(actor, ctx));
  });
  coverageTargets.forEach((receiverId, defenderId) => {
    const defenderAssignment = ctx.actorAssignments.get(defenderId);
    const receiverAssignment = ctx.actorAssignments.get(receiverId);
    if(defenderAssignment && receiverAssignment){
      receiverAssignment.startDelay = defenderAssignment.startDelay;
    }
  });

  const baseMs = BALANCE.animation.familyBaseMs[family] || 1800;
  const yardsMs = Math.min(BALANCE.animation.yardsMsCap, Math.abs(cfg.yards || 0) * BALANCE.animation.yardsMsPerYard);
  const totalMs = Math.max(300, Math.round((baseMs + yardsMs) * BALANCE.animation.globalSlowdown / (game.animSpeed || 1)));
  const actors = [];
  ctx.offensePaths = new Map();
  const applyStartDelay = actor => {
    actor.assignment = ctx.actorAssignments.get(actor.id);
    const startIndex = actor.path.findIndex(point => point.t >= kf.snap);
    const nextPoint = actor.path[startIndex + 1];
    if(startIndex >= 0 && nextPoint){
      const start = actor.path[startIndex];
      const requestedDelay = actor.assignment.startDelay * 1000 / totalMs;
      const movementWindow = Math.max(0, nextPoint.t - start.t);
      const appliedDelay = Math.min(requestedDelay, movementWindow * 0.65);
      actor.assignment.startDelay = appliedDelay * totalMs / 1000;
      const holdUntil = start.t + appliedDelay;
      if(holdUntil > start.t){
        actor.path.splice(startIndex + 1, 0, {t:holdUntil, x:start.x, y:start.y});
      }
    }
  };
  offenseSrc.forEach(a => {
    const path = buildOffenseActorPath(a, ctx);
    ctx.offensePaths.set(a.id, path);
    actors.push({id:a.id, team:a.team, role:a.role, x:a.x, y:a.y, startX:a.x, startY:a.y,
      targetX:path[path.length-1].x, targetY:path[path.length-1].y, state:'preSnap', element:a.el, path,
      assignment:ctx.actorAssignments.get(a.id)});
  });
  actors.forEach(actor => {
    if(actor.team !== 'offense') return;
    applyStartDelay(actor);
    if(actor.role !== 'OL' && actor.role !== 'FB' && actor.id !== ctx.carrierId
      && actor.id !== ctx.qbId && actor.id !== ctx.tacklerId){
      const routePointIndex = actor.path.findIndex(point => point.t >= (kf.routesDevelop || kf.laneCommit || 0.4));
      const routePoint = routePointIndex >= 0 ? actor.path[routePointIndex] : null;
      if(routePoint && routePoint.t < (kf.tackle || 0.85)){
        const nextTime = actor.path[routePointIndex + 1]
          ? Math.min(actor.path[routePointIndex + 1].t, kf.tackle || 0.85)
          : (kf.tackle || 0.85);
        const progress = (routePoint.t + nextTime) / 2;
        const direction = ctx.offenseDir;
        actor.path.splice(routePointIndex + 1, 0, {
          t:progress,
          x:clamp(routePoint.x + direction * (family === 'insideRun' || family === 'outsideRun' ? 2.2 : 3.2), -8, 108),
          y:clamp(routePoint.y + ((Number(actor.id.slice(1)) % 2) ? 1.2 : -1.2), 2, 98)
        });
      }
    }
  });
  defenseSrc.forEach(a => {
    const path = buildDefenseActorPath(a, ctx);
    actors.push({id:a.id, team:a.team, role:a.role, x:a.x, y:a.y, startX:a.x, startY:a.y,
      targetX:path[path.length-1].x, targetY:path[path.length-1].y, state:'preSnap', element:a.el, path,
      assignment:ctx.actorAssignments.get(a.id)});
  });
  actors.forEach(actor => {
    if(actor.team !== 'defense') return;
    applyStartDelay(actor);
    if(actor.team === 'defense' && ['DL','LB'].includes(actor.role)
      && !duelByActor.has(actor.id) && actor.id !== ctx.tacklerId){
      let variationIndex = actor.path.findIndex(point => point.t > kf.snap && point.t < (kf.tackle || 0.85));
      if(variationIndex > 0){
        const point = actor.path[variationIndex], previous = actor.path[variationIndex - 1];
        if(point.x === previous.x && point.y === previous.y) variationIndex++;
      }
      const variationPoint = actor.path[variationIndex];
      if(variationPoint){
        const seed = (Number(actor.id.slice(1)) * 19 + offPlay.name.length * 7
          + (offPlay.direction === 'right' ? 5 : offPlay.direction === 'left' ? 11 : 2)) % 9;
        variationPoint.x = clamp(variationPoint.x + offenseDir * ((seed % 3) - 1) * 0.6, 0, 100);
        variationPoint.y = clamp(variationPoint.y + (seed - 4) * 0.38, 2, 98);
      }
    }
  });
  if(['gain','touchdown','safety','sack'].includes(outcome)){
    freezePathsAtTackle(actors, kf.tackle);
  }
  const actorsById = {};
  actors.forEach(a => actorsById[a.id] = a);

  const setup = {
    actors, actorsById, kf, family, outcome, finalX, lane, throwLane, offenseSide, offenseDir,
    preSnapSpot, defPlay, coverageScheme, coverageTargets, animVariant,
    yards:cfg.yards || 0, breakaway:!!cfg.breakaway,
    duels,
    carrierId: carrier.id, qbId: qbActor.id, playActionFakeId: ctx.playActionFakeId,
    centerId: (offenseSrc.find(a => a.role === 'OL' && a.y === 50) || offenseSrc[2]).id,
    snapEnd: Math.min(kf.snap + 0.05, kf.handoff || kf.throw || kf.tackle),
    tacklerId: ctx.tacklerId, interceptorId: ctx.interceptorId,
    fumbleRecovererId: ctx.fumbleRecovererId, throwX, catchFrac: kf.catch, turnoverFrac,
    fumbleSpot, fumbleRecoverTime,
    ret: cfg.ret || null, spotBeforeFumble, totalMs, offPlay, defPlay,
    variant: offPlay.name + (animVariant ? ' [' + animVariant + ']' : ''),
    // Où la ligne de scrimmage / la ligne à gagner doivent apparaître une fois
    // le porteur tombé — jamais avant (voir _onTimelineEvent, événement 'tackle').
    visualBallX: (cfg.visualBallX !== undefined) ? cfg.visualBallX : finalX,
    visualMarkerX: (cfg.visualMarkerX !== undefined) ? cfg.visualMarkerX : finalX,
    blockPairIds: new Map([...blockPairs.entries()].map(([k, v]) => [k, v.id]))
  };
  setup.feedback = cfg.feedback || null;
  setup.advType = cfg.advType || null;
  setup.timelineEvents = createPlayTimelineEvents(setup, cfg);
  return setup;
}

// Évite qu'un acteur offensif et un acteur défensif non engagés dans un
// contact voulu (blocage, tacle, interception, récupération de fumble) ne se
// superposent visuellement — pas une physique réelle, juste une distance
// minimale maintenue entre les trajectoires scriptées.
const ANTI_OVERLAP_MIN_DIST = 3; // en % de largeur de terrain
function enforceMinimumSeparation(setup){
  const specialIds = new Set([
    ballState.carrierId, setup.carrierId, setup.tacklerId, setup.interceptorId, setup.fumbleRecovererId
  ].filter(Boolean));
  const offense = setup.actors.filter(a => a.team === 'offense' && !specialIds.has(a.id));
  const defense = setup.actors.filter(a => a.team === 'defense' && !specialIds.has(a.id));
  offense.forEach(o => {
    defense.forEach(d => {
      if(setup.blockPairIds.get(o.id) === d.id) return; // engagement de blocage voulu
      const dx = o.x - d.x, dy = o.y - d.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if(dist > 0.0001 && dist < ANTI_OVERLAP_MIN_DIST){
        const push = (ANTI_OVERLAP_MIN_DIST - dist) / 2;
        const nx = dx/dist, ny = dy/dist;
        o.x = clamp(o.x + nx*push, 0, 100); o.y = clamp(o.y + ny*push, 2, 98);
        d.x = clamp(d.x - nx*push, 0, 100); d.y = clamp(d.y - ny*push, 2, 98);
        renderActor(o); renderActor(d);
      }
    });
  });
}

// Liste des incohérences détectées pour LE PLAY EN COURS (remise à zéro à
// chaque run()). console.warn reste émis dans tous les cas (même debug off) ;
// l'affichage à l'écran n'apparaît que si le mode debug animation est activé.
let animDebugWarnings = [];
function animDebugAssert(cond, msg){
  if(!cond){
    console.warn('[AnimDebug] Incohérence : ' + msg);
    animDebugWarnings.push(msg);
  }
}

const PlayAnimationController = {
  _raf: null,
  _token: 0,
  _setup: null,
  _startTs: null,
  _finished: true,
  _firedEvents: null,
  _nextTimelineEventIndex: 0,
  _onComplete: null,
  _lastHaloCarrierId: null,
  _lastCarrierId: null,
  _possessionLog: null,
  _snapAsserted: false,

  cancelCurrent(){
    this._token++;
    if(this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._finished = true;
    this._setup = null;
    this._nextTimelineEventIndex = 0;
    this._lastHaloCarrierId = null;
    this._lastCarrierId = null;
    this._possessionLog = null;
    this._snapAsserted = false;
    clearTempPlayers();
    formationDots = { offense: [], defense: [] };
  },

  run(cfg){
    this._token++;
    const token = this._token;
    this._finished = false;
    this._firedEvents = new Set();
    this._nextTimelineEventIndex = 0;
    this._finishCallCount = 0;
    animDebugWarnings = [];
    this._lastHaloCarrierId = null;
    this._possessionLog = [];
    this._snapAsserted = false;
    game.skipAnimRequested = false;
    setPlayPhase(t('animation.phaseLabels.snap'));

    if(!formationDots.offense || formationDots.offense.length === 0){
      renderFormation(cfg.offPlay, (cfg.defPlay && cfg.defPlay.name) ? cfg.defPlay : {name:'Base 4-3'}, cfg.preSnapSpot, cfg.offenseSide);
    }

    const setup = buildPlaySetup(cfg);
    this._setup = setup;

    animDebugAssert(setup.actors.length === 22, 'les assignments doivent couvrir les 22 acteurs (observe : ' + setup.actors.length + ')');
    animDebugAssert(setup.actors.every(actor => actor.assignment && actor.assignment.task),
      'chaque acteur doit avoir une assignment');
    animDebugAssert(setup.actors.every(actor => actor.assignment && actor.assignment.pathType
      && actor.path.length >= 2
      && actor.path.every((point, index, path) => Number.isFinite(point.t) && Number.isFinite(point.x)
        && Number.isFinite(point.y) && (index === 0 || point.t >= path[index-1].t))),
      'chaque acteur doit avoir une trajectoire complète, finie et chronologique');
    animDebugAssert(setup.actors.every(actor => !actor.assignment.targetId || !!setup.actorsById[actor.assignment.targetId]),
      'une responsabilité référence un joueur cible absent');
    const manAssignments = setup.actors.filter(actor => actor.assignment.pathType === 'manCoverage');
    animDebugAssert(manAssignments.every(actor => {
      const receiver = setup.actorsById[actor.assignment.targetId];
      return receiver && (receiver.role === 'WR' || receiver.role === 'TE')
        && setup.actors.some(candidate => candidate.id === receiver.id && candidate.team === 'offense');
    }), 'un marquage individuel doit conserver un receveur offensif assigné');
    animDebugAssert(new Set(manAssignments.map(actor => actor.assignment.targetId)).size === manAssignments.length,
      'un receveur ne doit pas être assigné simultanément à plusieurs défenseurs individuels');
    animDebugAssert([...setup.coverageTargets.values()].every(receiverId => {
      const receiver = setup.actorsById[receiverId];
      return receiver && receiver.team === 'offense' && (receiver.role === 'WR' || receiver.role === 'TE');
    }), 'une couverture doit cibler un receveur offensif existant');
    animDebugAssert(setup.timelineEvents.length > 0
      && setup.timelineEvents[setup.timelineEvents.length - 1].type === 'whistle'
      && setup.timelineEvents.every((event, index, events) => Number.isFinite(event.time)
        && event.time >= 0 && event.time <= 1
        && (index === 0 || event.time >= events[index - 1].time)),
      'les événements du play doivent être complets et chronologiques');
    if(setup.outcome === 'incomplete'){
      animDebugAssert(setup.timelineEvents.some(event => event.type === 'incomplete')
        && !setup.timelineEvents.some(event => event.type === 'tackle'),
      'une passe incomplète doit produire un événement incomplet sans plaquage');
    }
    if(setup.outcome === 'interception' || setup.outcome === 'fumble'){
      animDebugAssert(setup.timelineEvents.some(event => event.type === 'turnover'),
        'un changement de possession doit produire un événement de turnover');
    }
    animDebugAssert(!!setup.actorsById[setup.carrierId], "le porteur choisi n'existe pas parmi les 22 acteurs");
    if(setup.outcome === 'interception'){
      const role = setup.actorsById[setup.interceptorId] && setup.actorsById[setup.interceptorId].role;
      animDebugAssert(role === 'CB' || role === 'S', 'une interception doit provenir d un CB ou S (role observe : ' + role + ')');
    }
    if(setup.outcome === 'sack'){
      const role = setup.actorsById[setup.carrierId] && setup.actorsById[setup.carrierId].role;
      animDebugAssert(role === 'QB', 'un sack doit impliquer le QB (role observe : ' + role + ')');
    }

    const field = document.getElementById('field');
    const ballEl = document.createElement('div');
    ballEl.className = 'ball-flight temp-player';
    field.appendChild(ballEl);
    const qb = setup.actorsById[setup.qbId];
    const center = setup.actorsById[setup.centerId];
    ballState = {x:center ? center.x : (qb ? qb.x : cfg.preSnapSpot), y:center ? center.y : (qb ? qb.y : 50),
      mode:'preSnap', carrierId:center ? setup.centerId : null, visible:true, element:ballEl, arcOffset:0, angle:0};
    this._lastCarrierId = ballState.carrierId;
    if(ballState.carrierId) this._possessionLog.push('Center ' + ballState.carrierId);
    animDebugAssert(ballState.carrierId === setup.centerId, 'avant le snap, le Center doit porter le ballon');

    this._startTs = null;
    const step = (ts) => {
      if(token !== this._token) return;
      if(this._startTs === null) this._startTs = ts;
      const elapsed = ts - this._startTs;
      let t = clamp01(elapsed / setup.totalMs);
      if(game.skipAnimRequested) t = 1;
      this._applyFrame(setup, t);
      this._fireEvents(t);
      renderAnimDebugPanel(setup, t);
      if(t >= 1){
        this._finishPlay(setup);
        return;
      }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  },

  _applyFrame(setup, t){
    setup.actors.forEach(actor => {
      const p = evalPath(actor.path, t);
      actor.x = p.x; actor.y = p.y;
      actor.state = t >= 1 ? 'done' : (t >= setup.kf.snap ? 'live' : 'preSnap');
      renderActor(actor);
    });
    if(t >= setup.kf.snap) enforceMinimumSeparation(setup);

    const kf = setup.kf;
    const snapTime = timelineEventTime(setup, 'snap', undefined, kf.snap);
    const handoffTime = timelineEventTime(setup, 'handoff', undefined, kf.handoff);
    const throwTime = timelineEventTime(setup, 'throw', undefined, kf.throw);
    const fakeHandoffTime = timelineEventTime(setup, 'handoff', 'playActionFake',
      kf.dropback !== undefined && kf.routesDevelop !== undefined ? (kf.dropback + kf.routesDevelop) / 2 : undefined);
    const fakeHandoffReturnTime = timelineEventTime(setup, 'fakeHandoffReturn', undefined, kf.routesDevelop);
    const catchEvent = setup.outcome === 'incomplete' ? 'incomplete'
      : setup.outcome === 'interception' ? 'interception' : 'catch';
    const catchTime = timelineEventTime(setup, catchEvent, undefined, kf.catch);
    const fumbleTime = timelineEventTime(setup, 'fumble', undefined, setup.turnoverFrac);
    const fumbleRecoveryTime = timelineEventTime(setup, 'turnover', 'fumble', setup.fumbleRecoverTime);
    if(t < snapTime){
      const center = setup.actorsById[setup.centerId];
      if(center){ ballState.mode = 'preSnap'; ballState.carrierId = setup.centerId; ballState.x = center.x; ballState.y = center.y; }
    } else if(t < setup.snapEnd){
      const center = setup.actorsById[setup.centerId], qb = setup.actorsById[setup.qbId];
      const localT = smoothProgress((t - kf.snap) / Math.max(0.0001, setup.snapEnd - kf.snap));
      ballState.mode = 'snap'; ballState.carrierId = null;
      if(center && qb){
        ballState.x = lerp(center.x, qb.x, localT);
        ballState.y = lerp(center.y, qb.y, localT);
      }
    } else if(setup.animVariant === 'playAction' && kf.dropback !== undefined && fakeHandoffReturnTime !== undefined
      && t >= kf.dropback && t < fakeHandoffReturnTime){
      const qb = setup.actorsById[setup.qbId];
      const receiver = setup.actorsById[setup.playActionFakeId];
      const receivingBack = t < fakeHandoffTime;
      const transferStart = receivingBack ? kf.dropback : fakeHandoffTime;
      const transferEnd = receivingBack ? fakeHandoffTime : fakeHandoffReturnTime;
      const transferT = smoothProgress((t - transferStart) / Math.max(0.0001, transferEnd - transferStart));
      const from = receivingBack ? qb : receiver;
      const to = receivingBack ? receiver : qb;
      ballState.mode = 'playAction'; ballState.carrierId = null;
      if(from && to){
        ballState.x = lerp(from.x, to.x, transferT);
        ballState.y = lerp(from.y, to.y, transferT);
        ballState.arcOffset = -1.2 * Math.sin(Math.PI * transferT);
      }
    } else if(setup.offPlay.type === 'pass' && setup.family !== 'sack' && t >= throwTime && t < catchTime){
      const localT = smoothProgress((t - throwTime) / Math.max(0.0001, catchTime - throwTime));
      ballState.mode = 'inflight'; ballState.carrierId = null;
      const qb = setup.actorsById[setup.qbId];
      ballState.x = lerp(qb.x, setup.throwX, localT);
      ballState.y = lerp(qb.y, setup.throwLane, localT);
      ballState.arcOffset = -5 * Math.sin(Math.PI * localT);
    } else if(setup.offPlay.type === 'run' && setup.carrierId !== setup.qbId
      && setup.animVariant !== 'playAction'
      && t >= Math.max(snapTime, handoffTime - (setup.offPlay.name === 'Toss' ? 0.10 : 0.07))
      && t < handoffTime){
      const qb = setup.actorsById[setup.qbId], receiver = setup.actorsById[setup.carrierId];
      const isToss = setup.offPlay.name === 'Toss';
      const transferStart = Math.max(snapTime, handoffTime - (isToss ? 0.10 : 0.07));
      const localT = smoothProgress((t - transferStart) / Math.max(0.0001, handoffTime - transferStart));
      ballState.mode = isToss ? 'toss' : 'handoff'; ballState.carrierId = null;
      if(qb && receiver){
        ballState.x = lerp(qb.x, receiver.x, localT);
        ballState.y = lerp(qb.y, receiver.y, localT);
        ballState.arcOffset = isToss ? -1.8 * Math.sin(Math.PI * localT) : -0.5 * Math.sin(Math.PI * localT);
      }
    } else if(setup.outcome === 'fumble' && t >= fumbleTime && t < fumbleRecoveryTime){
      const carrier = setup.actorsById[setup.carrierId];
      const localT = smoothProgress((t - fumbleTime)
        / Math.max(0.0001, fumbleRecoveryTime - fumbleTime));
      ballState.mode = 'loose'; ballState.carrierId = null;
      if(carrier){
        ballState.x = lerp(carrier.x, setup.fumbleSpot.x, localT);
        ballState.y = lerp(carrier.y, setup.fumbleSpot.y, localT);
      } else {
        ballState.x = setup.fumbleSpot.x; ballState.y = setup.fumbleSpot.y;
      }
      ballState.arcOffset = -2.2 * Math.sin(Math.PI * localT);
    } else if(setup.outcome === 'incomplete' && t >= catchTime){
      ballState.mode = 'loose'; ballState.carrierId = null;
      ballState.x = setup.throwX; ballState.y = setup.throwLane;
      const dropProgress = smoothProgress((t - catchTime) / 0.06);
      ballState.arcOffset = -1.3 * Math.sin(Math.PI * dropProgress);
    } else {
      ballState.mode = 'carried';
      let carrierId = setup.qbId;
      if(setup.offPlay.type === 'run' && setup.carrierId !== setup.qbId
        && setup.animVariant !== 'playAction' && t >= handoffTime) carrierId = setup.carrierId;
      if(setup.offPlay.type === 'pass' && setup.family !== 'sack' && t >= catchTime
        && setup.outcome !== 'incomplete') carrierId = setup.carrierId;
      if(setup.outcome === 'interception' && t >= catchTime) carrierId = setup.interceptorId;
      if(setup.outcome === 'fumble' && t >= fumbleRecoveryTime) carrierId = setup.fumbleRecovererId;
      ballState.carrierId = carrierId;
      const carrierActor = setup.actorsById[carrierId];
      if(carrierActor){ ballState.x = carrierActor.x; ballState.y = carrierActor.y; }
      ballState.arcOffset = 0;
    }
    if(t >= setup.snapEnd && !this._snapAsserted){
      const qbPossessionWindowEnds = setup.offPlay.type === 'run' && setup.carrierId !== setup.qbId
        ? Math.max(kf.snap, kf.handoff - (setup.offPlay.name === 'Toss' ? 0.10 : 0.07))
        : setup.offPlay.type === 'pass' && setup.family !== 'sack' ? kf.throw : 1;
      if(t < qbPossessionWindowEnds){
        animDebugAssert(ballState.mode === 'carried'
          && (ballState.carrierId === setup.qbId || setup.offPlay.name === 'Read Option'),
        'apres le snap, le QB doit recevoir le ballon avant le transfert');
        this._snapAsserted = true;
      } else {
        // Une frame peut sauter directement au transfert (notamment pendant Skip) :
        // ne pas déclarer à tort l'absence d'une possession QB qui a déjà eu lieu.
        this._snapAsserted = true;
      }
    }
    if(ballState.carrierId && ballState.carrierId !== this._lastCarrierId){
      const actor = setup.actorsById[ballState.carrierId];
      this._possessionLog.push((actor ? actor.role + ' ' : '') + ballState.carrierId);
      this._lastCarrierId = ballState.carrierId;
    }
    renderBall();

    // Halo visuel du porteur (déjà utilisé dans le reste du jeu) : appliqué à
    // l'acteur qui porte réellement le ballon à cette frame, retiré des autres.
    if(ballState.carrierId !== this._lastHaloCarrierId){
      if(this._lastHaloCarrierId && setup.actorsById[this._lastHaloCarrierId]){
        setup.actorsById[this._lastHaloCarrierId].element.classList.remove('carrier');
      }
      if(ballState.carrierId && setup.actorsById[ballState.carrierId]){
        setup.actorsById[ballState.carrierId].element.classList.add('carrier');
      }
      this._lastHaloCarrierId = ballState.carrierId;
    }

    if(t >= 1){
      const carrierId = ballState.mode === 'carried' ? ballState.carrierId : setup.carrierId;
      const finalCarrier = setup.actorsById[carrierId];
      if(finalCarrier && ballState.mode === 'carried'){
        animDebugAssert(Math.abs(finalCarrier.x - ballState.x) < 1.5, 'au whistle, le ballon doit etre au meme spot que le porteur');
      }
    }
  },

  _fireEvents(t){
    const setup = this._setup;
    const events = setup && setup.timelineEvents;
    if(!events) return;
    while(this._nextTimelineEventIndex < events.length && events[this._nextTimelineEventIndex].time <= t){
      const event = events[this._nextTimelineEventIndex++];
      const eventId = event.kind ? `${event.type}:${event.kind}` : event.type;
      this._firedEvents.add(eventId);
      this._onTimelineEvent(event, setup);
    }
  },

  _onTimelineEvent(event, setup){
    const {type:name} = event;
    if(name === 'snap') AudioManager.play('snap');
    if(name === 'throw') AudioManager.play('pass');
    if(name === 'kick' && setup.type === 'fieldGoal'){
      AudioManager.play(setup.made ? 'fieldGoal' : 'tackle');
    }
    if(name === 'catch' || name === 'interception') AudioManager.play('catch');
    if(name === 'turnover'){
      const userLostPossession = setup.offenseSide === 'player'
        && ['interception','fumble'].includes(event.kind);
      if(event.kind === 'fumble' && !userLostPossession) AudioManager.play('catch');
      triggerTurnoverFlash();
      if(event.kind !== 'downs'){
        this._triggerCameraShake('heavy');
        triggerTackleImpact(ballState.x, ballState.y, 'turnover');
      }
      showEventBanner(t('game.banners.turnover'), 'turnover');
      AudioManager.play(userLostPossession ? 'booing' : 'turnover');
    }
    if(name === 'fumble'){
      this._triggerCameraShake('light');
      triggerTackleImpact(ballState.x, ballState.y, 'turnover');
    }
    if(name === 'tackle'){
      AudioManager.play('tackle');
      if(!['interception','fumble'].includes(setup.outcome)){
        this._triggerCameraShake(setup.outcome === 'sack' || setup.yards <= 0 ? 'heavy' : 'light');
      }
      const carrierActor = setup.actorsById[ballState.carrierId] || setup.actorsById[setup.carrierId];
      if(carrierActor){
        triggerTackleImpact(carrierActor.x, carrierActor.y, setup.outcome === 'sack' ? 'sack' : 'standard');
      }
      if(setup.outcome === 'sack') triggerSackImpact();

      // Le porteur tombe : c'est SEULEMENT maintenant que la ligne de scrimmage,
      // la ligne à gagner et le ballon posé rejoignent leur position finale —
      // jamais dès la résolution du play par le moteur.
      game.visualBallX = setup.visualBallX;
      game.visualFirstDownX = setup.visualMarkerX;
      const ballEl = document.getElementById('ballMarker');
      const scrimEl = document.getElementById('scrimmageLine');
      ballEl.style.left = fx(setup.visualBallX) + '%';
      scrimEl.style.left = fx(setup.visualBallX) + '%';
      document.getElementById('firstDownMarker').style.left = fx(setup.visualMarkerX) + '%';
      ballEl.classList.remove('pop'); void ballEl.offsetWidth; ballEl.classList.add('pop');
      scrimEl.classList.remove('pop'); void scrimEl.offsetWidth; scrimEl.classList.add('pop');
    }
    if(name === 'breakaway'){
      this._triggerCameraShake('breakaway');
      const carrierActor = setup.actorsById[ballState.carrierId] || setup.actorsById[setup.carrierId];
      if(carrierActor) triggerBreakawayEffect(carrierActor.element, setup.offenseDir);
    }
    if(name === 'whistle'){
      AudioManager.play('whistle');
      if(setup.feedback && setup.feedback.kind === 'play'){
        const {offenseSide, context, tactical} = setup.feedback;
        applyEventFeedback(offenseSide, context, tactical);
      }
      if(setup.type === 'fieldGoal' && setup.made && !setup.suppressFieldGoalFeedback){
        triggerScoreCelebration(setup.offenseSide);
        showEventBanner(t('game.banners.fieldGoal'), 'score');
        celebrate('fieldGoal', setup.offenseSide);
        AudioManager.play('crowd');
      }
      if(setup.feedback && setup.feedback.kind === 'fakeFieldGoal'){
        const {success, advType, scorer} = setup.feedback;
        if(advType === 'touchdown'){
          triggerScoreCelebration(scorer);
          triggerTouchdownImpact(scorer);
          showEventBanner(t('game.banners.touchdown'), 'touchdown', 2400);
          celebrate('touchdown', scorer);
          AudioManager.play('cheering');
          AudioManager.play('crowd');
        } else if(success){
          showEventBanner(t('game.banners.fakeFieldGoal'), 'bigPlay');
          AudioManager.play('cheering');
          if(advType === 'firstdown'){
            flashFirstDownMarker();
            showEventBanner(t('game.banners.firstDown'), 'firstdown');
            AudioManager.play('firstDown');
          }
        }
      }
    }
  },

  _finishPlay(setup){
    this._finishCallCount = (this._finishCallCount || 0) + 1;
    animDebugAssert(this._finishCallCount <= 1 || this._finished, 'callback de fin appelé plus d\'une fois pour le même play');
    if(this._finished) return;
    this._finished = true;
    if(this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;

    setup.actors.forEach(actor => {
      const p = evalPath(actor.path, 1);
      actor.x = p.x; actor.y = p.y; actor.state = 'done';
      renderActor(actor);
    });
    enforceMinimumSeparation(setup);
    const finalCarrierId = setup.outcome === 'incomplete' ? null
      : (setup.outcome === 'interception') ? setup.interceptorId
      : (setup.outcome === 'fumble') ? setup.fumbleRecovererId : setup.carrierId;
    const finalCarrier = setup.actorsById[finalCarrierId];
    if(finalCarrier){
      ballState.mode = 'carried'; ballState.carrierId = finalCarrierId;
      ballState.x = finalCarrier.x; ballState.y = finalCarrier.y; ballState.arcOffset = 0;
      renderBall();
    } else {
      ballState.mode = 'loose'; ballState.carrierId = null; ballState.visible = false;
      renderBall();
    }
    animDebugAssert(!!finalCarrier || setup.outcome === 'incomplete', 'au whistle, aucun porteur identifiable');
    // Le ballon ne peut avoir qu'un seul porteur : au plus un acteur affiche le halo.
    const haloCount = setup.actors.filter(a => a.element.classList.contains('carrier')).length;
    animDebugAssert(haloCount <= 1, 'le ballon semble porté par plusieurs acteurs à la fois (' + haloCount + ')');

    clearTempPlayers();
    formationDots = { offense: [], defense: [] };
    setPlayPhase(t('animation.phaseLabels.result'));
    game.playLocked = false;
    renderControls();
    setTimeout(() => { if(!game.playLocked) setPlayPhase(t('animation.phaseLabels.choosePlay')); }, 700);

    if(typeof this._onComplete === 'function'){
      const cb = this._onComplete;
      this._onComplete = null;
      cb();
    }
  },

  _triggerCameraShake(kind){
    const field = document.getElementById('field');
    if(!field) return;
    field.classList.remove('camera-shake-light','camera-shake-heavy','camera-shake-breakaway');
    void field.offsetWidth;
    field.classList.add('camera-shake-' + kind);
  }
};

function runPlayAnimation(cfg, onComplete){
  PlayAnimationController._onComplete = onComplete || null;
  PlayAnimationController.run(cfg);
}

// ---- Famille "specialTeams" : field goal / punt ----
// Volontairement plus légère que le reste (pas de formation à 22 joueurs),
// mais construite sur la MÊME discipline : une seule horloge rAF, le ballon
// suit le holder/kicker pendant la préparation puis vole en arc interpolé,
// skip et annulation partagent le même contrôleur (token/_raf/_finished).
const KICK_TIMELINE = { snap: 0.15, kick: 0.30, whistle: 1.0 };
function runKickPlayAnimation(cfg, onComplete){
  const ctrl = PlayAnimationController;
  ctrl._token++;
  const token = ctrl._token;
  ctrl._finished = false;
  ctrl._onComplete = onComplete || null;
  ctrl._setup = cfg;
  ctrl._firedEvents = new Set();
  ctrl._nextTimelineEventIndex = 0;
  ctrl._setup.timelineEvents = [
    {type:'snap', time:KICK_TIMELINE.snap},
    {type:'kick', time:KICK_TIMELINE.kick},
    {type:'whistle', time:KICK_TIMELINE.whistle}
  ];
  ctrl._lastHaloCarrierId = null;
  game.skipAnimRequested = false;
  setPlayPhase(t(cfg.type === 'fieldGoal' ? 'animation.phaseLabels.fieldGoalFormation' : 'animation.phaseLabels.puntFormation'));
  clearTempPlayers();
  formationDots = { offense: [], defense: [] };

  const field = document.getElementById('field');
  const offenseDir = cfg.offenseSide === 'player' ? 1 : -1;
  const kickerEl = makeDot('offense mini qb', 'K');
  const holderEl = makeDot('offense mini', cfg.type === 'fieldGoal' ? 'H' : '');
  field.appendChild(kickerEl); field.appendChild(holderEl);
  placeEl(kickerEl, clamp(cfg.preSnapSpot - offenseDir*3, 0, 100), 50);
  placeEl(holderEl, clamp(cfg.preSnapSpot - offenseDir*1, 0, 100), 50);

  const ballEl = document.createElement('div');
  ballEl.className = 'ball-flight temp-player';
  field.appendChild(ballEl);
  ballState = {x:cfg.preSnapSpot, y:50, mode:'held', carrierId:null, visible:true, element:ballEl, arcOffset:0, angle:0};

  let targetX = cfg.type === 'fieldGoal' ? (offenseDir === 1 ? 110 : -10) : cfg.newPos;
  let missDeviation = 0;
  if(cfg.type === 'fieldGoal' && !cfg.made){
    missDeviation = (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random()*9);
  }

  const kf = KICK_TIMELINE;
  const baseMs = cfg.type === 'fieldGoal' ? 1500 : 1750;
  const totalMs = Math.max(500, Math.round(baseMs * BALANCE.animation.globalSlowdown / (game.animSpeed || 1)));
  let startTs = null;
  const finishKick = () => {
    if(ctrl._finished) return;
    ctrl._finished = true;
    if(ctrl._raf) cancelAnimationFrame(ctrl._raf);
    ctrl._raf = null;
    ballState.visible = false;
    renderBall();
    clearTempPlayers();
    setPlayPhase(t('animation.phaseLabels.result'));
    game.playLocked = false;
    renderControls();
    setTimeout(() => { if(!game.playLocked) setPlayPhase(t('animation.phaseLabels.choosePlay')); }, 500);
    if(typeof ctrl._onComplete === 'function'){
      const cb = ctrl._onComplete; ctrl._onComplete = null; cb();
    }
  };

  const step = (ts) => {
    if(token !== ctrl._token) return;
    if(startTs === null) startTs = ts;
    let t = clamp01((ts - startTs) / totalMs);
    if(game.skipAnimRequested) t = 1;

    if(t < kf.kick){
      ballState.mode = 'held'; ballState.x = cfg.preSnapSpot; ballState.y = 50; ballState.arcOffset = 0;
    } else {
      const localT = clamp01((t - kf.kick) / Math.max(0.0001, 1 - kf.kick));
      ballState.mode = 'inflight';
      const curTargetX = (cfg.type === 'fieldGoal' && !cfg.made)
        ? clamp(cfg.preSnapSpot + (targetX - cfg.preSnapSpot) * 0.85, -10, 110) : targetX;
      const curTargetY = (cfg.type === 'fieldGoal' && !cfg.made) ? (50 + missDeviation) : 50;
      ballState.x = lerp(cfg.preSnapSpot, curTargetX, localT);
      ballState.y = lerp(50, curTargetY, localT);
      ballState.arcOffset = -(cfg.type === 'fieldGoal' ? 16 : 11) * Math.sin(Math.PI * localT);
    }
    renderBall();

    ctrl._fireEvents(t);

    if(t >= 1){ finishKick(); return; }
    ctrl._raf = requestAnimationFrame(step);
  };
  ctrl._raf = requestAnimationFrame(step);
}

let ballState = {x:50, y:50, mode:'held', carrierId:null, visible:false, element:null, arcOffset:0, angle:0};
function renderBall(){
  if(!ballState || !ballState.element) return;
  const drawY = ballState.y + (ballState.arcOffset || 0);
  const previous = ballState._renderPosition;
  if(previous){
    const dx = ballState.x - previous.x;
    const dy = drawY - previous.y;
    if(Math.hypot(dx, dy) > 0.02) ballState.angle = Math.atan2(dy, dx) * 180 / Math.PI;
  }
  ballState._renderPosition = {x:ballState.x,y:drawY};
  ballState.element.style.left = fx(ballState.x) + '%';
  ballState.element.style.top = drawY + '%';
  ballState.element.style.transform = `rotate(${ballState.angle || 0}deg)`;
  ballState.element.dataset.mode = ballState.mode;
  ballState.element.style.display = ballState.visible === false ? 'none' : '';
}

function renderAnimDebugPanel(setup, elapsed){
  if(!game.animDebugEnabled) return;
  const el = document.getElementById('animDebugLog');
  if(!el) return;
  const actorLabel = actorId => {
    const actor = setup.actorsById[actorId];
    return actor ? `${actor.role} ${actorId}` : t('animation.debug.none');
  };
  const responsibility = actor => {
    const assignment = actor.assignment;
    const target = actorLabel(assignment.targetId);
    if(actor.team === 'offense'){
      if(actor.id === setup.carrierId && setup.offPlay.type === 'pass'){
        return t('animation.debug.responsibility.receiverTarget');
      }
      if(actor.id === setup.carrierId) return t('animation.debug.responsibility.ballCarrier');
      if(actor.id === setup.qbId){
        return t(setup.offPlay.type === 'pass'
          ? 'animation.debug.responsibility.quarterbackPass'
          : 'animation.debug.responsibility.quarterbackHandoff');
      }
      if(assignment.pathType === 'receiverRoute'){
        return t('animation.debug.responsibility.receiverRoute', {play:playLabel(setup.offPlay.name)});
      }
      if(assignment.targetId && ['engageBlock','pullAndBlock','doubleTeamBlock','leadBlock','protectOrRelease','skillBlock'].includes(assignment.task)){
        return t('animation.debug.responsibility.block', {target});
      }
      if(assignment.task === 'playActionFakeHandoff'){
        return t('animation.debug.responsibility.playActionFake');
      }
      return t('animation.debug.responsibility.offenseSupport', {task:assignment.task});
    }
    if(assignment.pathType === 'manCoverage' && assignment.targetId){
      return t(actor.id === setup.tacklerId
        ? 'animation.debug.responsibility.manCoverageTackle'
        : 'animation.debug.responsibility.manCoverage', {target});
    }
    if(assignment.pathType === 'zoneCoverage' || assignment.pathType === 'deepCoverage'){
      return t('animation.debug.responsibility.zoneCoverage', {target});
    }
    if(assignment.task === 'interceptAndReturn'){
      return t('animation.debug.responsibility.interception', {target});
    }
    if(assignment.task === 'recoverAndReturn'){
      return t('animation.debug.responsibility.fumbleRecovery');
    }
    if(assignment.task === 'blitzAndTackle' || assignment.task === 'blitzAndPressure'){
      return t('animation.debug.responsibility.blitz', {target});
    }
    if(assignment.task === 'pursueAndTackle' || assignment.task === 'rushAndSack'){
      return t('animation.debug.responsibility.tackle', {target});
    }
    if(assignment.targetId && ['engageBlock','pullAndBlock','doubleTeamBlock','shedBlockAndPursue'].includes(assignment.task)){
      return t('animation.debug.responsibility.blockOrShed', {target});
    }
    if(assignment.targetId){
      return t('animation.debug.responsibility.pursuit', {target});
    }
    return t('animation.debug.responsibility.defenseSupport', {task:assignment.task});
  };
  const events = setup.timelineEvents.map(event => {
    const eventId = event.kind ? `${event.type}:${event.kind}` : event.type;
    const fired = PlayAnimationController._firedEvents.has(eventId) ? ' ✓' : '';
    return `${eventId}@${(event.time*100).toFixed(0)}%${fired}`;
  }).join(', ') || t('animation.debug.none');
  const warnLines = animDebugWarnings.length
    ? animDebugWarnings.map(w => '⚠ ' + w).join('\n')
    : t('animation.debug.noWarnings');
  const assignments = ['offense','defense'].map(team => {
    const actors = setup.actors.filter(actor => actor.team === team);
    const rows = actors.map(actor =>
      t('animation.debug.actorAssignment', {
        id:actor.id,
        role:actor.role,
        task:responsibility(actor),
        target:actor.assignment.targetId ? actorLabel(actor.assignment.targetId) : t('animation.debug.none'),
        path:actor.assignment.pathType,
        profile:actor.assignment.movementProfile,
        delay:(actor.assignment.startDelay*1000).toFixed(0)
      })
    ).join('\n');
    return `${t(`animation.debug.${team}`)}:\n${rows}`;
  }).join('\n\n');
  const duels = setup.duels.map(duel => {
    const state = elapsed < duel.engageTime ? t('animation.debug.approaching')
      : elapsed < duel.resolveTime ? t('animation.debug.engaged') : t('animation.debug.resolved');
    return t('animation.debug.duel', {blocker:duel.blockerId, defender:duel.defenderId, type:duel.battleType, advantage:duel.advantage, state});
  }).join('\n') || t('animation.debug.noAssignedLineDuel');
  const possession = (PlayAnimationController._possessionLog || []).join(' → ') + (elapsed >= setup.kf.tackle ? ' → ' + t('animation.debug.tackled') : '');
  el.textContent =
`${t('animation.debug.familyValue', {label:t('animation.debug.family'), value:setup.family})} | ${t('animation.debug.familyValue', {label:t('animation.debug.variant'), value:setup.variant})}
${t('animation.debug.percentTimeline', {percent:(elapsed*100).toFixed(0)})}
${t('animation.debug.familyValue', {label:t('animation.debug.carrier'), value:t('animation.debug.carrierValue', {id:setup.carrierId, role:setup.actorsById[setup.carrierId] ? setup.actorsById[setup.carrierId].role : '?'})})}
${t('animation.debug.tackler')}: ${setup.tacklerId || t('animation.debug.none')} | ${t('animation.debug.interceptor')}: ${setup.interceptorId || t('animation.debug.none')}
${t('animation.debug.familyValue', {label:t('animation.debug.expectedFinalSpot'), value:setup.finalX.toFixed(1)})}
${t('animation.debug.ball')}: ${t('animation.debug.ballValue', {mode:ballState.mode, carrier:ballState.carrierId || t('animation.debug.none'), x:ballState.x.toFixed(1), y:ballState.y.toFixed(1)})}
${t('animation.debug.possession')}: ${t('animation.debug.possessionValue', {possession})}
${t('animation.debug.events')}: ${events}
${t('animation.debug.lineDuels', {count:setup.duels.length})}:
${duels}
${t('animation.debug.countTotal', {label:t('animation.debug.assignments'), count:setup.actors.length, total:22})}:
${assignments}
${t('animation.debug.inconsistencies')}: ${warnLines}`;
}

// Position cible de la ligne à gagner pour un spot / une possession / une
// distance donnés (utilisé pour synchroniser la ligne orange).
function computeFirstDownTargetX(spot, possessionSide, distance){
  const dir = possessionSide === 'player' ? 1 : -1;
  return clamp(spot + distance*dir, 0, 100);
}
// Synchronise IMMÉDIATEMENT les positions visuelles (ligne de scrimmage, ligne
// à gagner, ballon posé) sur l'état logique actuel. Réservé aux contextes SANS
// animation de play à protéger : kickoffs, field goal, punt.
function syncFieldVisualsNow(){
  game.visualBallX = game.fieldPosition;
  game.visualFirstDownX = computeFirstDownTargetX(game.fieldPosition, game.possession, game.distance);
  render();
}

function applyPlayOutcome(offPlay, defPlay, result, isPlayerOffense, predictability, repetitionPenalty, surpriseBonus){
  const offenseSide = isPlayerOffense ? 'player' : 'ai';
  const dir = isPlayerOffense ? 1 : -1;
  const preSnapSpot = game.fieldPosition;
  const preContext = buildContext(offenseSide); // situation AVANT résolution : sert à classifyPlayEvent (clutch, etc.)
  recordDrivePlay(offenseSide, result.yards, offPlay.name);

  let headline = '', explain = '', commentary = '', animCfg = null;
  let advType = 'continue', driveEndReason = null;
  const dirTxt = offPlay.direction && offPlay.direction !== 'mixed' ? ` ${dirLabel(offPlay.direction)}` : '';
  const playName = playLabel(offPlay.name);
  const outcomeText = (key, values = {}) => t(`game.results.outcomes.${key}`, values);

  if(result.outcome === 'interception'){
    const ret = resolveTurnoverReturn('interception', offenseSide, preSnapSpot);
    const teamName = teamLabel(ret.defenderSide);
    if(game.lastDebug) game.lastDebug.turnoverReturn = ret;
    if(ret.isPickSix){
      headline = outcomeText('interceptionPickSixHeadline');
      explain = outcomeText('interceptionPickSixExplain', {
        play:playName, direction:dirTxt, defense:playLabel(defPlay.name), yards:ret.returnYards, team:teamName
      });
      commentary = pickCommentary('pickSix');
      score(ret.defenderSide, 6);
      if(game.quarter < 5) game.pendingConversion = {team: ret.defenderSide};
      advType = 'touchdown';
    } else {
      headline = outcomeText('interceptionHeadline');
      explain = ret.returnYards > 0
        ? outcomeText('interceptionReturnedExplain', {
          play:playName, direction:dirTxt, defense:playLabel(defPlay.name), yards:ret.returnYards, plural:ret.returnYards > 1 ? 's' : ''
        })
        : outcomeText('interceptionNoReturnExplain', {play:playName, direction:dirTxt, defense:playLabel(defPlay.name)});
      commentary = pickCommentary('interception');
      advType = 'turnover';
    }
    const visualBallX = ret.newSpot;
    const visualMarkerX = ret.isPickSix ? ret.newSpot : computeFirstDownTargetX(ret.newSpot, ret.defenderSide, 10);
    if(!ret.isPickSix) switchPossession(ret.newSpot);
    driveEndReason = 'interception';
    animCfg = {offPlay, defPlay, preSnapSpot, offenseSide, outcome:'interception', ret, yards: result.yards, visualBallX, visualMarkerX};
  } else if(result.outcome === 'fumble'){
    const spotBeforeFumble = clamp(preSnapSpot + dir*result.yards, 0, 100);
    const ret = resolveTurnoverReturn('fumble', offenseSide, spotBeforeFumble);
    const teamName = teamLabel(ret.defenderSide);
    if(game.lastDebug) game.lastDebug.turnoverReturn = ret;
    if(ret.isPickSix){
      headline = outcomeText('fumblePickSixHeadline');
      explain = outcomeText('fumblePickSixExplain', {
        play:playName, direction:dirTxt, yards:ret.returnYards, team:teamName
      });
      commentary = pickCommentary('pickSix');
      score(ret.defenderSide, 6);
      if(game.quarter < 5) game.pendingConversion = {team: ret.defenderSide};
      advType = 'touchdown';
    } else {
      headline = outcomeText('fumbleHeadline');
      explain = ret.returnYards > 0
        ? outcomeText('fumbleReturnedExplain', {
          play:playName, direction:dirTxt, yards:ret.returnYards, plural:ret.returnYards > 1 ? 's' : ''
        })
        : outcomeText('fumbleRecoveredExplain', {play:playName, direction:dirTxt});
      commentary = pickCommentary('fumble');
      advType = 'turnover';
    }
    const visualBallX = ret.newSpot;
    const visualMarkerX = ret.isPickSix ? ret.newSpot : computeFirstDownTargetX(ret.newSpot, ret.defenderSide, 10);
    if(!ret.isPickSix) switchPossession(ret.newSpot);
    driveEndReason = 'fumble';
    animCfg = {offPlay, defPlay, preSnapSpot, offenseSide, outcome:'fumble', ret, spotBeforeFumble, yards: result.yards, visualBallX, visualMarkerX};
  } else if(result.outcome === 'sack'){
    const adv = advanceBall(result.yards, dir, offenseSide);
    if(adv.type === 'safety'){
      headline = outcomeText('safetySackHeadline');
      explain = outcomeText('safetySackExplain', {
        defense:playLabel(defPlay.name), team:teamLabel(adv.scoringTeam)
      });
      commentary = pickCommentary('safety');
      advType = 'safety';
      driveEndReason = 'safety';
    } else {
      headline = outcomeText('sackHeadline', {yards:result.yards});
      const matchup = matchupNote(offPlay, defPlay, result);
      explain = outcomeText('sackExplain', {
        defense:playLabel(defPlay.name),
        matchup:matchup ? ` ${matchup}` : '',
        turnover:adv.type === 'turnoverOnDowns' ? outcomeText('turnoverOnDownsSuffix') : ''
      });
      commentary = commentaryForPlay({outcome:'sack', yards:result.yards});
      advType = adv.type === 'turnoverOnDowns' ? 'turnoverOnDowns' : 'continue';
      if(adv.type === 'turnoverOnDowns') driveEndReason = 'turnoverOnDowns';
    }
    const visualBallX_sack = adv.finalX;
    const visualMarkerX_sack = (adv.type==='touchdown'||adv.type==='safety') ? adv.finalX
      : (adv.type==='turnoverOnDowns') ? computeFirstDownTargetX(adv.finalX, game.possession, 10)
      : computeFirstDownTargetX(adv.finalX, offenseSide, game.distance);
    animCfg = {offPlay, defPlay, preSnapSpot, offenseSide, outcome:'sack', finalX: adv.finalX, yards: result.yards, visualBallX: visualBallX_sack, visualMarkerX: visualMarkerX_sack};
  } else if(result.outcome === 'incomplete'){
    const adv = advanceBall(0, dir, offenseSide);
    headline = outcomeText('incompleteHeadline');
    const matchup = matchupNote(offPlay, defPlay, result);
    explain = outcomeText('incompleteExplain', {
      play:playName,
      direction:dirTxt,
      defense:playLabel(defPlay.name),
      matchup:matchup ? ` ${matchup}` : '',
      turnover:adv.type === 'turnoverOnDowns' ? outcomeText('turnoverOnDownsSuffix') : ''
    });
    advType = adv.type === 'turnoverOnDowns' ? 'turnoverOnDowns' : 'continue';
    if(adv.type === 'turnoverOnDowns') driveEndReason = 'turnoverOnDowns';
    const visualBallX_inc = adv.finalX;
    const visualMarkerX_inc = (adv.type==='turnoverOnDowns') ? computeFirstDownTargetX(adv.finalX, game.possession, 10)
      : computeFirstDownTargetX(adv.finalX, offenseSide, game.distance);
    animCfg = {offPlay, defPlay, preSnapSpot, offenseSide, outcome:'incomplete', finalX: adv.finalX, yards: result.yards, visualBallX: visualBallX_inc, visualMarkerX: visualMarkerX_inc};
  } else {
    const adv = advanceBall(result.yards, dir, offenseSide);
    advType = adv.type;
    if(adv.type === 'touchdown'){
      headline = outcomeText('touchdownHeadline', {team:teamNameOf(offenseSide)});
      explain = outcomeText('touchdownExplain', {play:playName, direction:dirTxt, yards:result.yards});
      commentary = pickCommentary('touchdown');
      driveEndReason = 'touchdown';
    } else if(adv.type === 'safety'){
      headline = outcomeText('safetyHeadline');
      explain = outcomeText('safetyExplain', {play:playName, direction:dirTxt});
      commentary = pickCommentary('safety');
      driveEndReason = 'safety';
    } else {
      headline = outcomeText('gainHeadline', {
        play:playName, direction:dirTxt, yards:result.yards, plural:result.yards > 1 ? 's' : ''
      });
      explain = outcomeText('gainExplain', {
        explanation:buildExplain(offPlay, defPlay, result, predictability, repetitionPenalty, surpriseBonus),
        turnover:adv.type === 'turnoverOnDowns' ? outcomeText('turnoverOnDownsSuffix') : ''
      });
      commentary = commentaryForPlay({outcome:result.outcome, yards:result.yards});
      if(adv.type === 'turnoverOnDowns') driveEndReason = 'turnoverOnDowns';
    }
    const visualBallX_gain = adv.finalX;
    const visualMarkerX_gain = (adv.type==='touchdown'||adv.type==='safety') ? adv.finalX
      : (adv.type==='turnoverOnDowns') ? computeFirstDownTargetX(adv.finalX, game.possession, 10)
      : computeFirstDownTargetX(adv.finalX, offenseSide, game.distance);
    animCfg = {offPlay, defPlay, preSnapSpot, offenseSide, outcome: adv.type==='touchdown' ? 'touchdown' : (adv.type==='safety' ? 'safety' : 'gain'), finalX: adv.finalX, yards: result.yards, breakaway: result.breakaway, visualBallX: visualBallX_gain, visualMarkerX: visualMarkerX_gain};
  }

  // Chrono (Phase 3) : durée de l'action, puis le chrono s'arrête ou continue.
  const lateOOB = (advType === 'continue' || advType === 'firstdown') && result.outcome !== 'incomplete' && result.outcome !== 'sack'
    && outOfBoundsStopsClock() && rollOutOfBounds(offPlay);
  const stopClock = ['incomplete','interception','fumble'].includes(result.outcome)
    || ['touchdown','safety','turnoverOnDowns','turnover'].includes(advType) || lateOOB;
  if(lateOOB) explain += outcomeText('lateOutOfBoundsSuffix');
  const clockEvents = endSnapClock(playDurationSeconds(), stopClock);
  animCfg.advType = advType;
  animCfg.feedback = {
    kind:'play',
    offenseSide,
    context:preContext,
    tactical:{offPlay, defPlay, predictability, repetitionPenalty, surpriseBonus, result, advType}
  };

  if(!game.gameOver) setResult(headline, explain, commentary);
  render();
  runPlayAnimation(animCfg, () => {
    if(driveEndReason) showDriveSummaryPanel(game.lastFinishedDrive, driveEndReason);
    handleClockEvents(clockEvents);
    afterPlayResolved();
  });
}

// Phrase courte expliquant l'interaction spécifique quand elle a pesé (|valeur| >= 6).
function matchupNote(offPlay, defPlay, result){
  if(!result || result.matchup === undefined || Math.abs(result.matchup) < 6) return '';
  const reasons = (result.matchupReasons || []).slice().sort((a,b) => Math.abs(b.mod) - Math.abs(a.mod));
  const key = reasons.find(r => Math.sign(r.mod) === Math.sign(result.matchup));
  const label = key ? DEF_TAG_LABELS[key.tag] : '';
  const sign = result.matchup > 0 ? '+' : '';
  const failed = result.outcome === 'incomplete' || result.outcome === 'sack';
  if(result.matchup > 0 && failed){
    return t('animation.results.advantageWasPresent', {
      offense:playLabel(offPlay.name),
      gap:label ? t('animation.results.gapDescription', {label}) + ' de ' : '',
      defense:playLabel(defPlay.name),
      advantage:sign + result.matchup
    });
  }
  return result.matchup > 0
    ? t('animation.results.exploitsGap', {
      offense:playLabel(offPlay.name),
      gap:label ? t('animation.results.gapDescription', {label}) + ' de ' : '',
      defense:playLabel(defPlay.name),
      advantage:sign + result.matchup
    })
    : t('animation.results.defenseCounters', {
      defense:playLabel(defPlay.name),
      offense:playLabel(offPlay.name),
      tag:label ? t('animation.results.withTag', {label}) : '',
      advantage:result.matchup
    });
}

function buildExplain(offPlay, defPlay, result, predictability, repetitionPenalty, surpriseBonus){
  let txt = '';
  if(surpriseBonus >= 4){
    txt = t('animation.results.brokenTrend', {offense:playLabel(offPlay.name), defense:playLabel(defPlay.name), bonus:surpriseBonus});
  } else if(defPlay._adapted && result.finalAdvantage < -5){
    txt = t('animation.results.defenseAnticipated', {defense:playLabel(defPlay.name)});
  } else if(repetitionPenalty >= 5){
    txt = t('animation.results.repetitionPenalty', {offense:playLabel(offPlay.name), penalty:repetitionPenalty});
  } else {
    txt = t('animation.results.playDuel', {offense:playLabel(offPlay.name), defense:playLabel(defPlay.name)});
  }
  const note = matchupNote(offPlay, defPlay, result);
  if(note) txt += ' ' + note;
  if(result.breakaway){
    txt += result.finalAdvantage <= -8
      ? ' ' + t('animation.results.missedTackleDespiteDefense', {yards:result.breakYards, chance:result.breakProb})
      : ' ' + t('animation.results.breakaway');
  }
  return txt;
}

function advanceBall(yards, dir, offenseSide){
  const newPos = game.fieldPosition + dir*yards;

  // Touchdown ?
  if((offenseSide === 'player' && newPos >= 100) || (offenseSide === 'ai' && newPos <= 0)){
    score(offenseSide, 6);
    // Transformation jouée juste après l'animation (pas de transformation en prolongation)
    if(game.quarter < 5) game.pendingConversion = {team: offenseSide};
    game.fieldPosition = offenseSide === 'player' ? BALANCE.conversion.twoPointBallOn : 100 - BALANCE.conversion.twoPointBallOn;
    return {type:'touchdown', scoringTeam:offenseSide, finalX: offenseSide === 'player' ? 100 : 0};
  }
  // Safety ?
  if((offenseSide === 'player' && newPos <= 0) || (offenseSide === 'ai' && newPos >= 100)){
    const defender = offenseSide === 'player' ? 'ai' : 'player';
    score(defender, 2);
    // Après une safety, l'équipe qui a concédé effectue un free kick (depuis
    // ses 20 yards, pas d'onside) : l'équipe qui vient de marquer reçoit.
    if(!game.pendingGameEnd) game.pendingKickoff = {kicking: offenseSide, free: true};
    return {type:'safety', scoringTeam:defender, finalX: offenseSide === 'player' ? 0 : 100};
  }

  game.fieldPosition = clamp(newPos, 1, 99);
  game.distance -= yards;
  if(game.distance <= 0){
    game.down = 1; game.distance = 10;
    return {type:'firstdown', finalX: game.fieldPosition};
  } else {
    game.down += 1;
    if(game.down > 4){
      const spot = game.fieldPosition;
      switchPossession(spot);
      return {type:'turnoverOnDowns', finalX: spot};
    }
    return {type:'continue', finalX: game.fieldPosition};
  }
}

/* -------- Décisions de 4e tentative -------- */
// (Le "go for it" passe par le flux offensif normal.)

// Résolution pure d'un punt (partagée par le jeu et la simulation de test).
// fieldPosition : 0 = but du joueur, 100 = but de l'IA.
function resolvePunt(fieldPosition, punterSide){
  const dir = punterSide === 'player' ? 1 : -1;
  const puntYards = randInt(32, 48);
  const landing = fieldPosition + dir*puntYards;
  const touchback = punterSide === 'player' ? landing >= 100 : landing <= 0;
  // Touchback : le receveur repart de SES 20 yards.
  const newPos = touchback ? (punterSide === 'player' ? 80 : 20) : clamp(landing, 1, 99);
  return {puntYards, landing: clamp(landing, 0, 100), touchback, newPos};
}

// Décision de 4e tentative de l'IA (pure) : 'fieldGoal' | 'punt' | 'goForIt'.
// Phase 3 : tient compte du score et du temps restant.
function aiFourthDownDecision(context){
  const kickDistance = computeKickDistance(context);
  const fgChance = kickDistance <= BALANCE.fieldGoal.availableMaxDistance ? getFieldGoalSuccessChance(kickDistance) : 0;
  const q = context.quarter, t = context.timeRemaining, diff = context.scoreDiff;
  const late = q >= 4 && t <= 300, veryLate = q >= 4 && t <= 120;
  // Dernières secondes de la mi-temps : prendre les points s'ils sont là.
  if(q === 2 && t <= 40 && fgChance >= 0.25) return 'fieldGoal';
  // Mené en toute fin de match : le FG seulement s'il suffit, sinon tenter le coup.
  if(veryLate && diff < 0){
    if(diff >= -3 && fgChance >= 0.40) return 'fieldGoal';
    return 'goForIt';
  }
  if(late && diff < -3 && context.ballOn >= 35 && context.distance <= 6) return 'goForIt';
  // Devant au score en fin de match : on joue la sécurité.
  if(late && diff > 0){
    if(fgChance >= BALANCE.fieldGoal.aiMinChance) return 'fieldGoal';
    if(context.distance <= 1 && context.ballOn >= 50) return 'goForIt';
    return 'punt';
  }
  if(context.ballOn >= 95 && context.distance <= 2) return 'goForIt';
  if(context.distance <= 1 && context.ballOn >= 40) return 'goForIt';
  if(context.distance <= 2 && context.ballOn >= 55 && fgChance < 0.85) return 'goForIt';
  if(fgChance >= BALANCE.fieldGoal.aiMinChance) return 'fieldGoal';
  if(context.ballOn >= 62 && context.distance <= 3) return 'goForIt';
  return 'punt';
}
function fourthDownAdviceText(context){
  const d = aiFourthDownDecision(context);
  if(d === 'fieldGoal') return t('game.fourthDown.adviceFieldGoal', {chance:Math.round(getFieldGoalSuccessChance(computeKickDistance(context))*100)});
  if(d === 'punt') return t('game.fourthDown.advicePunt');
  return t('game.fourthDown.adviceGoForIt');
}

// Courbe de réussite du field goal (Phase 2) : points [distance, chance] dans
// BALANCE.fieldGoal.curve, interpolation linéaire, décroissance au-delà.
function getFieldGoalSuccessChance(distanceKick){
  const curve = BALANCE.fieldGoal.curve;
  if(distanceKick <= curve[0][0]) return curve[0][1];
  for(let i=1;i<curve.length;i++){
    if(distanceKick <= curve[i][0]){
      const [d0,c0] = curve[i-1], [d1,c1] = curve[i];
      return c0 + (c1-c0) * (distanceKick-d0)/(d1-d0);
    }
  }
  return Math.max(0.05, curve[curve.length-1][1] - (distanceKick - curve[curve.length-1][0])*0.03);
}
// Distance de tentative simplifiée : position du ballon jusqu'à la goal line + ~17y (end zone + snap/hold).
function computeKickDistance(context){
  const distanceToGoal = 100 - context.ballOn;
  return distanceToGoal + 17;
}

function attemptFieldGoal(){
  game.playLocked = true;
  if(!preSnapGate(game.possession, game.possession === 'player' ? 'normal' : aiTempo('ai'))) return;
  const context = buildContext(game.possession);
  const kickDistance = computeKickDistance(context);
  const successProb = getFieldGoalSuccessChance(kickDistance);
  const kicker = game.possession;
  const preSnapSpot = game.fieldPosition;
  recordDrivePlay(kicker, 0, `Field Goal (${kickDistance}y)`);
  const made = Math.random() < successProb;

  game.playLocked = true;
  renderControls();

  if(made){
    score(kicker, 3);
    const otNote = (game.quarter >= 5 && !game.pendingGameEnd) ? t('game.results.firstOvertimeFieldGoal') : '';
    setResult(
      t('game.results.fieldGoalMadeHeadline', {yards:kickDistance, chance:Math.round(successProb*100)}),
      t('game.results.fieldGoalMadeExplain', {overtime:otNote}),
      pickCommentary('fieldGoalGood')
    );
    if(!game.pendingGameEnd) game.pendingKickoff = {kicking: kicker};
  } else {
    setResult(t('game.results.fieldGoalMissedHeadline'), t('game.results.fieldGoalMissedExplain', {yards:kickDistance, chance:Math.round(successProb*100)}), pickCommentary('fieldGoalMiss'));
    switchPossession(missedFieldGoalSpot(kicker));
  }
  const clockEvents = endSnapClock(randInt(BALANCE.clock.kick[0], BALANCE.clock.kick[1]), true);

  runKickPlayAnimation({type:'fieldGoal', preSnapSpot, offenseSide: kicker, made}, () => {
    syncFieldVisualsNow();
    handleClockEvents(clockEvents);
    showDriveSummaryPanel(game.lastFinishedDrive, 'fieldgoal');
    afterPlayResolved();
  });
}

function attemptPunt(){
  game.playLocked = true;
  if(!preSnapGate(game.possession, game.possession === 'player' ? 'normal' : aiTempo('ai'))) return;
  const punter = game.possession;
  const preSnapSpot = game.fieldPosition;
  const punt = resolvePunt(game.fieldPosition, punter);
  recordDrivePlay(punter, 0, `Punt (${punt.puntYards}y)`);
  setResult(punt.touchback ? t('game.results.puntTouchbackHeadline') : t('game.results.puntHeadline'),
    punt.touchback
      ? t('game.results.puntTouchbackExplain', {yards:punt.puntYards, team:teamLabel(punter === 'player' ? 'ai' : 'player')})
      : t('game.results.puntExplain', {yards:punt.puntYards}), '');
  switchPossession(punt.newPos);
  const clockEvents = endSnapClock(randInt(BALANCE.clock.kick[0], BALANCE.clock.kick[1]), true);

  game.playLocked = true;
  renderControls();

  runKickPlayAnimation({type:'punt', preSnapSpot, offenseSide: punter, newPos: punt.landing}, () => {
    syncFieldVisualsNow();
    handleClockEvents(clockEvents);
    showDriveSummaryPanel(game.lastFinishedDrive, 'punt');
    afterPlayResolved();
  });
}

// Fake Field Goal : play spécial à haut risque proposé dès que le Field Goal est
// disponible. Traité comme un run ou une passe surprise depuis la formation de kick.
function attemptFakeFieldGoal(){
  if(game.gameOver || game.phase !== 'playing' || game.playLocked) return;
  game.playLocked = true;
  if(!preSnapGate(game.possession, 'normal')) return;
  const context = buildContext(game.possession);
  const isPlayerOffense = game.possession === 'player';
  const predictability = calculatePredictability(
    isPlayerOffense ? game.offensivePlayHistoryPlayer : game.defensivePlayHistoryPlayer, context
  );
  const cfg = BALANCE.fakeFieldGoal;
  let successChance = cfg.baseSuccessMin + Math.random() * (cfg.baseSuccessMax - cfg.baseSuccessMin);
  // La défense s'attend d'autant plus à un vrai field goal que le tir est facile :
  // c'est là que la feinte surprend le plus (bonus si réussite du FG >= 70%).
  if(getFieldGoalSuccessChance(computeKickDistance(context)) >= 0.70) successChance += cfg.surpriseBonusIfExpected;
  successChance = clamp(successChance, 0.05, 0.55);

  game.playLocked = true;
  setPlayPhase(t('game.results.fakeFieldGoalPhase'));
  renderControls();

  const fakeType = Math.random() < 0.5 ? 'run' : 'pass';
  const fakePlay = fakeType === 'run'
    ? {name:t('game.results.fakeFieldGoalRunName'), type:'run', depth:'short', direction:'middle'}
    : {name:t('game.results.fakeFieldGoalPassName'), type:'pass', depth:'short', direction:'middle'};

  scheduleForGame(()=>{
    const success = Math.random() < successChance;
    const dir = isPlayerOffense ? 1 : -1;
    const preSnapSpot = game.fieldPosition;
    let yards;
    if(success){
      yards = randInt(context.distance, context.distance + 10); // au moins la distance nécessaire
    } else {
      yards = randInt(-3, Math.max(0, context.distance - 3));
    }
    recordDrivePlay(game.possession, yards, fakePlay.name);
    const fakeResult = {yards, outcome:success ? (fakeType === 'pass' ? 'completion' : 'gain') : 'incomplete'};
    const offHistory = isPlayerOffense ? game.offensivePlayHistoryPlayer : game.offensivePlayHistoryAI;
    const defHistory = isPlayerOffense ? game.defensivePlayHistoryAI : game.defensivePlayHistoryPlayer;
    addHistory(offHistory, buildHistoryEntry(fakePlay, context, fakeResult, success));
    addHistory(defHistory, buildHistoryEntry({name:'Défense',type:'balanced'}, context, fakeResult, !success));
    recordOffensivePlayTendency(isPlayerOffense ? 'player' : 'ai', fakeType);
    const fakeScorer = game.possession;
    const adv = advanceBall(yards, dir, game.possession);
    const clockEvents = endSnapClock(playDurationSeconds(), adv.type === 'touchdown' || adv.type === 'turnoverOnDowns');
    const fakeVisualBallX = adv.finalX;
    const fakeVisualMarkerX = (adv.type==='touchdown'||adv.type==='safety') ? adv.finalX
      : (adv.type==='turnoverOnDowns') ? computeFirstDownTargetX(adv.finalX, game.possession, 10)
      : computeFirstDownTargetX(adv.finalX, isPlayerOffense ? 'player' : 'ai', game.distance);
    const teamName = teamLabel(game.possession);
    const headline = t(success ? 'game.results.fakeFieldGoalMade' : 'game.results.fakeFieldGoalStopped');
    const touchdownOrGain = adv.type === 'firstdown' ? t('game.results.fakeFieldGoalFirstDown')
      : adv.type === 'touchdown' ? t('game.results.fakeFieldGoalTouchdown')
      : t('game.results.fakeFieldGoalGain');
    const explain = success
      ? t('game.results.fakeFieldGoalSuccess', {team:teamName, playType:t(fakeType === 'run' ? 'game.results.fakeFieldGoalRun' : 'game.results.fakeFieldGoalPass'), yards, result:touchdownOrGain})
      : t('game.results.fakeFieldGoalFailed', {team:teamName}) + (adv.type === 'turnoverOnDowns' ? t('game.results.fakeFieldGoalTurnover') : '');
    const commentary = t(success ? 'game.results.fakeFieldGoalCommentarySuccess' : 'game.results.fakeFieldGoalCommentaryFailed');
    if(!game.gameOver) setResult(headline, explain, commentary);
    render();
    runPlayAnimation(
      {offPlay: fakePlay, defPlay: {name:'Défense', type:'balanced'}, preSnapSpot, offenseSide: game.possession,
       outcome: adv.type === 'touchdown' ? 'touchdown' : 'gain', finalX: adv.finalX, yards,
       advType:adv.type,
       feedback:{kind:'fakeFieldGoal', success, advType:adv.type, scorer:fakeScorer},
       visualBallX: fakeVisualBallX, visualMarkerX: fakeVisualMarkerX},
      () => {
        handleClockEvents(clockEvents);
        if(adv.type === 'touchdown') showDriveSummaryPanel(game.lastFinishedDrive, 'touchdown');
        else if(adv.type === 'turnoverOnDowns') showDriveSummaryPanel(game.lastFinishedDrive, 'turnoverOnDowns');
        afterPlayResolved();
      }
    );
  }, preSnapDelayMs());
}

function endGame(){
  game.gameOver = true;
  render();
  const overlay = document.getElementById('finalOverlay');
  SaveManager.clear();
  let title = game.scorePlayer === game.scoreAI ? t('game.results.matchTie') : t('game.results.victory', {team:teamNameOf(game.scorePlayer > game.scoreAI ? 'player' : 'ai')});
  if(game.quarter >= 5) title += t('game.results.overtimeSuffix');
  document.getElementById('finalTitle').textContent = title;
  document.getElementById('finalScore').textContent = `${game.scorePlayer} – ${game.scoreAI}`;
  overlay.classList.remove('hidden');
}

function setResult(headline, explain, commentary){
  document.getElementById('resultBox').querySelector('.headline').textContent = headline;
  document.getElementById('resultBox').querySelector('.explain').textContent = explain;
  const c = document.getElementById('resultCommentary');
  if(commentary){
    c.textContent = commentary;
    c.classList.add('show');
  } else {
    c.textContent = '';
    c.classList.remove('show');
  }
}
