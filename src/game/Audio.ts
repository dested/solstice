export class Soundscape {
  context?: AudioContext;
  master?: GainNode;
  enabled = false;
  private timer?: ReturnType<typeof setInterval>;
  private beat = 0;
  private lastClash = 0;
  private lastImpact = 0;
  private lastAbsorb = 0;
  private notes = [130.81, 155.56, 174.61, 196, 233.08, 261.63, 311.13, 349.23];
  async toggle() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      // Original synthesized ambience. No downloaded or copyrighted audio.
      const reverb = this.context.createConvolver();
      const length = this.context.sampleRate * 3;
      const impulse = this.context.createBuffer(
        2,
        length,
        this.context.sampleRate,
      );
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++)
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
      reverb.buffer = impulse;
      const wet = this.context.createGain();
      wet.gain.value = 0.24;
      reverb.connect(wet);
      wet.connect(this.master);
      for (const frequency of [65.406, 98, 130.81, 155.56]) {
        const osc = this.context.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        const gain = this.context.createGain();
        gain.gain.value = 0.019;
        osc.connect(gain);
        gain.connect(this.master);
        gain.connect(reverb);
        osc.start();
        const lfo = this.context.createOscillator(),
          depth = this.context.createGain();
        lfo.frequency.value = 0.06 + Math.random() * 0.08;
        depth.gain.value = 0.008;
        lfo.connect(depth);
        depth.connect(gain.gain);
        lfo.start();
      }
      this.timer = setInterval(() => {
        if (!this.enabled) return;
        const melody = [0, 4, 2, 6, 1, 4, 3, 7, 2, 5, 1, 4, 0, 3, 2, 6];
        this.tone(
          this.notes[melody[this.beat++ % melody.length]] * 2,
          0.045,
          2.8,
        );
      }, 760);
    }
    await this.context.resume();
    this.enabled = !this.enabled;
    this.master!.gain.setTargetAtTime(
      this.enabled ? 0.5 : 0,
      this.context.currentTime,
      0.4,
    );
    return this.enabled;
  }
  tone(frequency: number, volume = 0.08, duration = 0.7, delay = 0) {
    if (!this.enabled || !this.context || !this.master) return;
    const t = this.context.currentTime + delay,
      o = this.context.createOscillator(),
      g = this.context.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(frequency, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.1);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  select() {
    this.tone(523.25, 0.06, 0.25);
  }
  order() {
    this.tone(349.23, 0.08, 0.5);
    this.tone(523.25, 0.04, 0.7, 0.05);
  }
  capture(lost = false) {
    this.burst(0.14, 0.25, lost ? 350 : 1100);
    (lost ? [349.23, 293.66, 196] : [261.63, 349.23, 523.25, 698.46]).forEach(
      (f, i) => this.tone(f, 0.14, 1.5, i * 0.09),
    );
  }
  upgrade() {
    [523.25, 659.25, 1046.5].forEach((f, i) =>
      this.tone(f, 0.11, 0.7, i * 0.06),
    );
  }
  private burst(volume: number, duration: number, frequency: number) {
    if (!this.enabled || !this.context || !this.master) return;
    const ctx = this.context,
      t = ctx.currentTime;
    const buffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * duration),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  impact() {
    const now = performance.now();
    if (now - this.lastImpact < 90) return;
    this.lastImpact = now;
    this.burst(0.13, 0.09, 900);
    this.tone(196 + Math.random() * 30, 0.1, 0.12);
  }
  absorb() {
    const now = performance.now();
    if (now - this.lastAbsorb < 140) return;
    this.lastAbsorb = now;
    this.tone(784 + Math.random() * 50, 0.065, 0.16);
  }
  clash() {
    const now = performance.now();
    if (now - this.lastClash < 100) return;
    this.lastClash = now;
    this.burst(0.12, 0.08, 1800);
    this.tone(
      this.notes[Math.floor(Math.random() * this.notes.length)] * 4,
      0.075,
      0.18,
    );
  }
  dispose() {
    clearInterval(this.timer);
    this.context?.close();
  }
}
