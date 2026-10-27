const AudioManager = {
  enabled: false,
  volume: BALANCE.audio.defaultVolume,
  sounds: {
    snap: 'assets/sounds/snap.mp3', tackle: 'assets/sounds/tackle.mp3',
    whistle: 'assets/sounds/whistle.mp3', firstDown: 'assets/sounds/first_down.mp3',
    bigPlay: 'assets/sounds/big_play.mp3', turnover: 'assets/sounds/turnover.mp3',
    fieldGoal: 'assets/sounds/field_goal.mp3', touchdown: 'assets/sounds/touchdown.mp3',
    crowd: 'assets/sounds/crowd.mp3', pass: 'assets/sounds/pass.mp3',
    catch: 'assets/sounds/catch.mp3'
  },
  cache: {},
  play(name){
    if(!this.enabled) return;
    try{
      const src = this.sounds[name];
      if(!src) return;
      let audio = this.cache[name];
      if(!audio){ audio = new Audio(src); this.cache[name] = audio; }
      audio.volume = this.volume;
      audio.currentTime = 0;
      const p = audio.play();
      if(p && p.catch) p.catch(() => { /* asset absent : fallback silencieux */ });
    } catch(e){ /* fallback silencieux */ }
  }
};

