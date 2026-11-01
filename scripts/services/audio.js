const PROCEDURAL_EFFECTS = {
  snap: [
    {frequency:180, endFrequency:72, duration:0.11, level:0.2, type:'triangle'},
    {frequency:760, endFrequency:280, duration:0.045, level:0.06, type:'square'}
  ],
  pass: [{frequency:520, endFrequency:250, duration:0.16, level:0.07, type:'sine'}],
  catch: [
    {frequency:240, endFrequency:88, duration:0.13, level:0.18, type:'triangle'},
    {frequency:680, endFrequency:360, duration:0.045, level:0.045, type:'square'}
  ],
  tackle: [
    {frequency:130, endFrequency:48, duration:0.2, level:0.24, type:'triangle'},
    {frequency:420, endFrequency:120, duration:0.075, level:0.07, type:'sine'}
  ],
  whistle: [{frequency:1850, endFrequency:1450, duration:0.32, level:0.075, type:'sine'}],
  firstDown: [
    {frequency:587, duration:0.12, level:0.075, type:'sine'},
    {frequency:784, duration:0.19, offset:0.11, level:0.075, type:'sine'}
  ],
  turnover: [
    {frequency:180, endFrequency:85, duration:0.19, level:0.17, type:'triangle'},
    {frequency:125, endFrequency:58, duration:0.26, offset:0.1, level:0.13, type:'triangle'}
  ],
  fieldGoal: [
    {frequency:523, duration:0.12, level:0.07, type:'sine'},
    {frequency:784, duration:0.22, offset:0.1, level:0.075, type:'sine'}
  ]
};

const AudioManager = {
  enabled: false,
  volume: BALANCE.audio.defaultVolume,
  musicEnabled: false,
  musicAudio: null,
  musicLoopAudio: null,
  musicGeneration: 0,
  audioContext: null,
  sounds: {
    bigPlay: [
      'assets/sounds/Marvellous.mp3',
      'assets/sounds/Incredible.mp3',
      'assets/sounds/WAP.mp3'
    ],
    touchdown: 'assets/sounds/TD.mp3',
    fieldGoalGood: 'assets/sounds/Good.mp3',
    fieldGoalNoGood: 'assets/sounds/NoGood.mp3',
    booing: 'assets/sounds/booing.mp3'
  },
  cache: {},
  play(name){
    const crowdReaction = ['booing','bigPlay','touchdown'].includes(name);
    if(!this.enabled && !(this.musicEnabled && crowdReaction)) return;
    const sound = this.sounds[name];
    if(!sound){
      if(this.enabled) this.playProcedural(name);
      return;
    }
    const src = Array.isArray(sound)
      ? sound[Math.floor(Math.random() * sound.length)]
      : sound;
    let audio = this.cache[src];
    if(!audio){
      audio = new Audio(src);
      this.cache[src] = audio;
    }
    audio.volume = this.volume;
    audio.currentTime = 0;
    this.startAudio(audio, src);
  },
  setEffectsEnabled(enabled){
    this.enabled = enabled;
    const AudioContextConstructor = window.AudioContext;
    if(!enabled || !AudioContextConstructor) return;
    this.audioContext = this.audioContext || new AudioContextConstructor();
    if(this.audioContext.state !== 'running'){
      this.audioContext.resume().catch(error => {
        console.warn('La reprise des effets audio a échoué.', error);
      });
    }
  },
  playProcedural(name){
    const effect = PROCEDURAL_EFFECTS[name];
    if(!effect){
      console.warn(`Aucun effet audio n'est défini pour « ${name} ».`);
      return;
    }
    const AudioContextConstructor = window.AudioContext;
    if(!AudioContextConstructor){
      console.warn(`Web Audio n'est pas disponible pour l'effet « ${name} ».`);
      return;
    }
    this.audioContext = this.audioContext || new AudioContextConstructor();
    const context = this.audioContext;
    const schedule = () => {
      if(!this.enabled) return;
      const now = context.currentTime;
      effect.forEach(tone => {
        const start = now + (tone.offset || 0);
        const end = start + tone.duration;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = tone.type;
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        if(tone.endFrequency){
          oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(Math.min(tone.level * this.volume, 0.22), start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.01);
      });
    };
    if(context.state === 'running'){
      schedule();
    } else {
      context.resume().then(schedule).catch(error => {
        console.warn(`La lecture de l'effet audio « ${name} » a échoué.`, error);
      });
    }
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
      if(button.querySelector('svg')){
        button.setAttribute('aria-label', label);
        button.title = label;
      } else {
        button.textContent = label;
      }
      button.setAttribute('aria-pressed', String(this.musicEnabled));
    });
    document.querySelectorAll('.music-recommendation').forEach(message => {
      message.hidden = this.musicEnabled;
    });
  }
};
