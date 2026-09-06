export class Soundscape {
  context?: AudioContext; master?: GainNode; enabled = false;
  private timer?: ReturnType<typeof setInterval>; private beat = 0; private lastClash = 0;
  private notes = [130.81, 155.56, 174.61, 196, 233.08, 261.63, 311.13, 349.23];
  async toggle() {
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = 0; this.master.connect(this.context.destination);
      // Original synthesized ambience. No downloaded or copyrighted audio.
      const reverb = this.context.createConvolver(); const length = this.context.sampleRate * 3;
      const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
      for (let channel = 0; channel < 2; channel++) { const data = impulse.getChannelData(channel); for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3); }
      reverb.buffer = impulse; const wet = this.context.createGain(); wet.gain.value = .24; reverb.connect(wet); wet.connect(this.master);
      for (const frequency of [65.406, 98, 130.81, 155.56]) {
        const osc = this.context.createOscillator(); osc.type = 'sine'; osc.frequency.value = frequency;
        const gain = this.context.createGain(); gain.gain.value = .019; osc.connect(gain); gain.connect(this.master); gain.connect(reverb); osc.start();
        const lfo = this.context.createOscillator(), depth = this.context.createGain(); lfo.frequency.value = .06 + Math.random() * .08; depth.gain.value = .008; lfo.connect(depth); depth.connect(gain.gain); lfo.start();
      }
      this.timer = setInterval(() => { if (!this.enabled) return; const melody = [0, 4, 2, 6, 1, 4, 3, 7, 2, 5, 1, 4, 0, 3, 2, 6]; this.tone(this.notes[melody[this.beat++ % melody.length]] * 2, .045, 2.8); }, 760);
    }
    await this.context.resume(); this.enabled = !this.enabled;
    this.master!.gain.setTargetAtTime(this.enabled ? .5 : 0, this.context.currentTime, .4);
    return this.enabled;
  }
  tone(frequency: number, volume = .08, duration = .7, delay = 0) {
    if (!this.enabled || !this.context || !this.master) return;
    const t = this.context.currentTime + delay, o = this.context.createOscillator(), g = this.context.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(frequency, t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + .014); g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + duration + .1); o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  select() { this.tone(523.25, .06, .25); }
  order() { this.tone(349.23, .08, .5); this.tone(523.25, .04, .7, .05); }
  capture() { [261.63, 349.23, 523.25, 698.46].forEach((f, i) => this.tone(f, .09, 2.4, i * .09)); }
  clash() { const now = performance.now(); if (now - this.lastClash < 100) return; this.lastClash = now; this.tone(this.notes[Math.floor(Math.random() * this.notes.length)] * 4, .025, .4); }
  dispose() { clearInterval(this.timer); this.context?.close(); }
}
