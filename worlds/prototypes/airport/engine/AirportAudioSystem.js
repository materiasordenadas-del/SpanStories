export class AirportAudioSystem {
  constructor() { this.context = null; this.enabled = false; this.zoneId = null; }
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.ambient = this.context.createOscillator();
      this.ambient.type = 'sine'; this.ambient.frequency.value = 98;
      this.lowpass = this.context.createBiquadFilter(); this.lowpass.type = 'lowpass'; this.lowpass.frequency.value = 160;
      this.ambientGain = this.context.createGain(); this.ambientGain.gain.value = .011;
      this.ambient.connect(this.lowpass).connect(this.ambientGain).connect(this.context.destination);
      this.ambient.start();
    }
    await this.context.resume(); this.enabled = true;
    if (this.zoneId) this.setZone(this.zoneId);
  }
  async disable() {
    this.enabled = false;
    if (this.context) await this.context.suspend();
  }
  setZone(id) {
    this.zoneId = id;
    if (!this.context || !this.enabled) return;
    const airside = id.startsWith('D0') && Number(id.slice(1)) >= 4;
    this.ambient.frequency.setTargetAtTime(airside ? 132 : id === 'A02' ? 112 : 96, this.context.currentTime, .35);
    this.ambientGain.gain.setTargetAtTime(id === 'D06' ? .008 : .012, this.context.currentTime, .4);
  }
  beep() {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime, oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.065, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .12);
    oscillator.connect(gain).connect(this.context.destination); oscillator.start(now); oscillator.stop(now + .13);
    oscillator.addEventListener('ended', () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
  }
  async dispose() {
    if (!this.context) return;
    this.ambient.stop(); this.ambient.disconnect(); this.lowpass.disconnect(); this.ambientGain.disconnect();
    await this.context.close(); this.context = null; this.enabled = false;
  }
}
