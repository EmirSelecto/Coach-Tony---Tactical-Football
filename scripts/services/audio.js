const AudioManager = {
  enabled: false,
  volume: BALANCE.audio.defaultVolume,
  musicEnabled: false,
  musicAudio: null,
  musicLoopAudio: null,
  musicGeneration: 0,
  sounds: {
    snap: 'assets/sounds/snap.mp3', tackle: 'assets/sounds/tackle.mp3',
    whistle: 'assets/sounds/whistle.mp3', firstDown: 'assets/sounds/first_down.mp3',
    bigPlay: 'assets/sounds/cheering.mp3', touchdown: 'assets/sounds/cheering.mp3',
    cheering: 'assets/sounds/cheering.mp3', booing: 'assets/sounds/booing.mp3',
    turnover: 'assets/sounds/turnover.mp3',
    fieldGoal: 'assets/sounds/field_goal.mp3',
    crowd: 'assets/sounds/crowd.mp3', pass: 'assets/sounds/pass.mp3',
    catch: 'assets/sounds/catch.mp3'
  },
  cache: {},
  play(name){
    const crowdReaction = ['booing','cheering','bigPlay','touchdown'].includes(name);
    if(!this.enabled && !(this.musicEnabled && crowdReaction)) return;
    const src = this.sounds[name];
    if(!src) return;
    let audio = this.cache[name];
    if(!audio){
      audio = new Audio(src);
      this.cache[name] = audio;
    }
    audio.volume = this.volume;
    audio.currentTime = 0;
    this.startAudio(audio, src);
  },
  startAudio(audio, label){
    audio.onerror = () => console.warn(`Impossible de lire le fichier audio ${label}.`);
    const playback = audio.play();
    if(playback) playback.catch(error => {
      console.warn(`La lecture audio a échoué pour ${label}.`, error);
    });
  },
  setMusicEnabled(enabled){
    this.musicEnabled = enabled;
    const generation = ++this.musicGeneration;
    if(!enabled){
      [this.musicAudio, this.musicLoopAudio].forEach(audio => {
        if(audio){
          audio.pause();
          audio.currentTime = 0;
        }
      });
      this.musicAudio = null;
      this.musicLoopAudio = null;
      this.updateMusicButtons();
      return;
    }

    const intro = new Audio('assets/sounds/20secs.mp3');
    intro.volume = this.volume;
    intro.addEventListener('ended', () => {
      if(!this.musicEnabled || generation !== this.musicGeneration) return;
      const loop = new Audio('assets/sounds/loop.mp3');
      loop.loop = true;
      loop.volume = this.volume;
      this.musicLoopAudio = loop;
      this.startAudio(loop, 'assets/sounds/loop.mp3');
    }, {once:true});
    this.musicAudio = intro;
    this.startAudio(intro, 'assets/sounds/20secs.mp3');
    this.updateMusicButtons();
  },
  setVolume(volume){
    this.volume = volume;
    Object.values(this.cache).forEach(audio => { audio.volume = volume; });
    [this.musicAudio, this.musicLoopAudio].forEach(audio => {
      if(audio) audio.volume = volume;
    });
  },
  updateMusicButtons(){
    const label = t(this.musicEnabled ? 'ui.static.musicDisable' : 'ui.static.musicEnable');
    ['musicToggle', 'musicToggleToss'].forEach(id => {
      const button = document.getElementById(id);
      if(!button) return;
      button.textContent = label;
      button.setAttribute('aria-pressed', String(this.musicEnabled));
    });
    document.querySelectorAll('.music-recommendation').forEach(message => {
      message.hidden = this.musicEnabled;
    });
  }
};
