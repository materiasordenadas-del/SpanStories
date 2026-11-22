// Interpolate authoritative snapshots using an arrival-relative local clock.
// Never extrapolate indefinitely, apply stale sequences, or interpolate a leave.
export class CityRemoteTrack {
  constructor({delayMs=150,staleMs=3000}={}) {this.delayMs=delayMs;this.staleMs=staleMs;this.samples=[];this.sequence=-1;this.lastArrival=-Infinity;}
  push(state,serverTime,arrival) {
    if(state.seq<=this.sequence||!Array.isArray(state.p)||state.p.length!==3||!state.p.every(Number.isFinite)||!Number.isFinite(state.yaw)||!Number.isFinite(state.t)||!Number.isFinite(serverTime))return false;
    this.sequence=state.seq;this.lastArrival=arrival;
    const sample={...state,p:[...state.p],time:arrival-Math.max(0,serverTime-state.t)};
    if(!state.active||this.samples.at(-1)?.active===false||sample.time-(this.samples.at(-1)?.time??sample.time)>this.staleMs)this.samples.length=0;
    // Jitter cannot reorder the presentation timeline of increasing sequences.
    sample.time=Math.max(sample.time,(this.samples.at(-1)?.time??-Infinity)+.001);
    this.samples.push(sample);if(this.samples.length>12)this.samples.shift();return true;
  }
  sample(now,out) {
    const samples=this.samples,last=samples.at(-1);if(!last||!last.active||now-this.lastArrival>this.staleMs){out.active=false;return out;}
    const target=now-this.delayMs;
    while(samples.length>2&&samples[1].time<=target)samples.shift();
    const a=samples[0],b=samples[1]||a,t=b.time>a.time?Math.max(0,Math.min(1,(target-a.time)/(b.time-a.time))):1;
    out.active=true;out.moving=(t<1?a:b).moving;
    for(let i=0;i<3;i++)out.p[i]=a.p[i]+(b.p[i]-a.p[i])*t;
    const turn=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw));out.yaw=a.yaw+turn*t;
    return out;
  }
}
