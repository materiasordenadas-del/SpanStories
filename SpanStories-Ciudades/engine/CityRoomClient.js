// Same-origin protocol for local simulation and an eventual HTTPS room relay.
// At most one state POST in flight; skipped samples are replaced, never queued.
export class CityRoomClient {
  constructor({room='principal',zone,state,onSnapshot=()=>{},fetch=(...args)=>globalThis.fetch(...args),EventSource=globalThis.EventSource,clock=()=>performance.now()}) {
    Object.assign(this,{room,zone,state,onSnapshot,fetch,EventSource,clock});
    this.status='connecting';this.playerId=null;this.token=null;this.sequence=0;this.lastBody='';this.lastSent=-Infinity;
    this.disposed=false;this.busy=false;this.timer=null;this.retry=null;this.stream=null;this.controller=new AbortController();this.cycle=new AbortController();this.generation=0;
  }
  async post(path,data,keepalive=false) {
    const response=await this.fetch('/api/room/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:keepalive?undefined:AbortSignal.any([this.controller.signal,this.cycle.signal,AbortSignal.timeout(5000)]),keepalive});
    if(!response.ok){const error=new Error((await response.json()).error||'Relay no disponible');error.status=response.status;throw error;}
    return response.json();
  }
  async start() {
    if(this.disposed)return;
    const generation=++this.generation;this.cycle.abort();this.cycle=new AbortController();
    try {
      const health=await this.fetch('/api/health',{signal:AbortSignal.any([this.controller.signal,this.cycle.signal,AbortSignal.timeout(5000)])});
      if(this.disposed||generation!==this.generation)return;
      if(!health.ok){this.status='unavailable';return;}
      const info=await health.json();if(info.protocol!==1||!this.EventSource){this.status='unavailable';return;}
      this.simulation=info.simulation;
      const joined=await this.post('join',{room:this.room,zone:this.zone});
      if(this.disposed||generation!==this.generation){await this.post('leave',{token:joined.token},true).catch(()=>{});return;}
      this.token=joined.token;this.playerId=joined.playerId;this.lastBody='';
      this.stream=new this.EventSource('/api/room/events?token='+encodeURIComponent(this.token));
      this.stream.onopen=()=>{if(generation===this.generation)this.status='connected';};
      this.stream.onmessage=event=>{
        if(generation!==this.generation||this.disposed)return;
        try {const data=JSON.parse(event.data);if(data.v!==1||!Array.isArray(data.players))return;
          this.lastReceived=this.clock();this.status='connected';this.onSnapshot(data,this.lastReceived,this.playerId);
        } catch { /* A malformed message must not interrupt rendering. */ }
      };
      this.stream.onerror=()=>{if(generation!==this.generation||this.disposed)return;this.status='reconnecting';if(this.stream?.readyState===2)this.reconnect();};
      this.tick(generation);
    } catch(error) {
      if(this.disposed||generation!==this.generation)return;
      this.status=error.status===409?'full':'reconnecting';this.error=error.message;
      this.retry=setTimeout(()=>this.start(),2000);
    }
  }
  async tick(generation=this.generation) {
    if(this.disposed||!this.token||generation!==this.generation)return;
    const started=this.clock();
    try {
      const state=this.state(),body=JSON.stringify(state),now=this.clock();
      if(body!==this.lastBody||now-this.lastSent>=1000){
        this.busy=true;
        await this.post('state',{...state,token:this.token,seq:this.sequence++});
        if(this.disposed||generation!==this.generation)return;
        this.rttMs=Math.max(0,this.clock()-now);this.lastPingAt=this.clock();
        this.lastSent=now;this.lastBody=body;this.error=null;
      }
    } catch(error) {
      if(this.disposed||generation!==this.generation)return;
      this.error=error.message;this.status='reconnecting';
      if(error.status===401){this.reconnect();return;}
    } finally {if(generation===this.generation)this.busy=false;}
    if(!this.disposed&&this.token&&generation===this.generation){clearTimeout(this.timer);this.timer=setTimeout(()=>this.tick(generation),Math.max(0,100-(this.clock()-started)));}
  }
  reconnect() {
    if(this.disposed)return;
    ++this.generation;this.cycle.abort();this.busy=false;
    clearTimeout(this.timer);this.stream?.close();this.stream=null;
    const token=this.token;this.token=null;
    if(token)this.post('leave',{token},true).catch(()=>{});
    clearTimeout(this.retry);this.retry=setTimeout(()=>this.start(),2000);
  }
  networkTiming(){const pingAgeMs=this.lastPingAt===undefined?null:Math.max(0,this.clock()-this.lastPingAt),valid=this.status==='connected'&&pingAgeMs!==null&&pingAgeMs<5000;return {pingMs:valid?this.rttMs:null,latencyEstimateMs:valid?this.rttMs/2:null,pingAgeMs,latencyMethod:'RTT HTTP de estado / 2; estimacion, no latencia unidireccional medida'};}
  snapshot(){return {status:this.status,room:this.room,zone:this.zone,playerId:this.playerId,simulation:this.simulation,...this.networkTiming(),lastReceiveAgeMs:this.lastReceived===undefined?null:this.clock()-this.lastReceived,error:this.error||null};}
  dispose() {
    if(this.disposed)return;this.disposed=true;++this.generation;this.status='closed';clearTimeout(this.timer);clearTimeout(this.retry);this.stream?.close();this.controller.abort();this.cycle.abort();
    if(this.token)this.post('leave',{token:this.token},true).catch(()=>{});this.token=null;
  }
}
