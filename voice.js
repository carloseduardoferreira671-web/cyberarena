/* CyberArena · chat de voz do grupo (WebRTC em malha, só áudio, até 4 jogadores).
   O áudio vai direto entre os aparelhos; o servidor só repassa as mensagens de conexão (offer/answer/ice)
   junto com o polling do grupo (online-server/social.mjs). Quem tem o ID menor é quem "liga" (envia o offer),
   assim os dois lados nunca ligam ao mesmo tempo. */
const rnd = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();

export class VoiceMesh {
  /* o = { myId, send(to, data), getIce() -> iceServers, onSpeak(id, bool), onChange() } */
  constructor(o) {
    this.o = o; this.stream = null; this.muted = false; this.peers = new Map(); this.remoteMuted = new Set();
    this.meters = new Map(); this.ctx = null; this.timer = 0; this.q = Promise.resolve();
  }
  get joined() { return !!this.stream; }
  /* 'none' | 'connecting' | 'connected' */
  statusOf(id) { const e = this.peers.get(id); return !e ? 'none' : e.pc.connectionState === 'connected' ? 'connected' : 'connecting'; }
  get connecting() { for (const e of this.peers.values()) if (e.pc.connectionState !== 'connected') return true; return false; }

  async join() {
    if (this.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Este navegador não liberou o microfone (precisa de HTTPS).');
    let s;
    try { s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Permita o microfone para usar a voz.' : 'Não consegui abrir o microfone.'); }
    this.stream = s; s.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    try { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = this.ctx || new AC(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (_) { this.ctx = null; }
    this._meter(this.o.myId, s);
    this.timer = setInterval(() => this._levels(), 120);
  }
  leave() {
    for (const id of [...this.peers.keys()]) this._close(id);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; clearInterval(this.timer); this.timer = 0; this._unmeter(this.o.myId);
    for (const id of [...this.meters.keys()]) this._unmeter(id);
    try { this.ctx && this.ctx.close(); } catch (_) { } this.ctx = null; this.o.onChange && this.o.onChange();
  }
  setMuted(m) { this.muted = !!m; if (this.stream) this.stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; }); if (this.muted) this.o.onSpeak(this.o.myId, false); }
  setRemoteMuted(id, m) { m ? this.remoteMuted.add(id) : this.remoteMuted.delete(id); const e = this.peers.get(id); if (e && e.audio) e.audio.muted = !!m; }

  /* ids dos outros jogadores que estão na voz agora (vem do servidor a cada sync) */
  update(ids) {
    if (!this.stream) return;
    const want = new Set(ids);
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this._close(id);
    for (const id of want) if (!this.peers.has(id)) { const e = this._make(id); if (e.offerer) this._offer(e); }
    this._tick();
  }
  signal(from, d) { this.q = this.q.then(() => this._handle(from, d)).catch(err => console.warn('voz', err)); }

  /* ---------- conexões ---------- */
  _make(id) {
    const pc = new RTCPeerConnection({ iceServers: this.o.getIce() });
    const e = { id, pc, offerer: this.o.myId < id, epoch: null, pending: [], born: now(), tries: 0, audio: null, gotOffer: false, answered: false, discAt: 0 };
    this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream));
    pc.onicecandidate = ev => { if (ev.candidate && e.epoch) this.o.send(id, { k: 'ice', e: e.epoch, c: ev.candidate.toJSON() }); };
    pc.ontrack = ev => this._attach(e, ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]));
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'disconnected') e.discAt = e.discAt || now(); else e.discAt = 0; this.o.onChange && this.o.onChange(); };
    this.peers.set(id, e); return e;
  }
  async _offer(e) {
    e.epoch = rnd();
    try {
      const offer = await e.pc.createOffer(); if (this.peers.get(e.id) !== e) return;
      await e.pc.setLocalDescription(offer); if (this.peers.get(e.id) !== e) return;
      this.o.send(e.id, { k: 'offer', e: e.epoch, sdp: e.pc.localDescription.sdp });
    } catch (err) { console.warn('voz offer', err); }
  }
  async _handle(from, d) {
    if (!this.stream || !d || typeof d !== 'object') return;
    let e = this.peers.get(from);
    if (d.k === 'offer') {
      if (!e || e.offerer) return;                        // só quem tem o ID maior responde
      if (e.gotOffer && e.epoch === d.e) return;          // repetido
      if (e.gotOffer) { this._close(from); e = this._make(from); }   // o outro lado recomeçou: conexão nova
      e.epoch = d.e; e.gotOffer = true;
      await e.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp }); await this._flush(e);
      const ans = await e.pc.createAnswer(); if (this.peers.get(from) !== e) return;
      await e.pc.setLocalDescription(ans);
      this.o.send(from, { k: 'answer', e: d.e, sdp: e.pc.localDescription.sdp });
    } else if (d.k === 'answer') {
      if (!e || !e.offerer || e.epoch !== d.e || e.answered) return;
      e.answered = true; await e.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp }); await this._flush(e);
    } else if (d.k === 'ice') {
      if (!e || e.epoch !== d.e || !d.c) return;
      if (e.pc.remoteDescription) { try { await e.pc.addIceCandidate(d.c); } catch (_) { } } else e.pending.push(d.c);
    }
  }
  async _flush(e) { const p = e.pending.splice(0); for (const c of p) { try { await e.pc.addIceCandidate(c); } catch (_) { } } }
  /* conexão que falhou ou ficou presa: quem liga tenta de novo; quem responde espera a nova oferta */
  _tick() {
    const t = now();
    for (const e of [...this.peers.values()]) {
      const st = e.pc.connectionState, bad = st === 'failed' || st === 'closed' || (e.discAt && t - e.discAt > 6000) || (st !== 'connected' && t - e.born > 15000 + e.tries * 4000);
      if (!bad) continue;
      const tries = e.tries + 1; this._close(e.id);
      if (this.stream && e.offerer) { const n = this._make(e.id); n.tries = tries; this._offer(n); }
      else if (this.stream) { const n = this._make(e.id); n.tries = tries; }
    }
  }
  _close(id) {
    const e = this.peers.get(id); if (!e) return; this.peers.delete(id);
    try { e.pc.onicecandidate = e.pc.ontrack = e.pc.onconnectionstatechange = null; e.pc.close(); } catch (_) { }
    if (e.audio) { try { e.audio.pause(); e.audio.srcObject = null; e.audio.remove(); } catch (_) { } }
    this._unmeter(id); this.o.onSpeak(id, false); this.o.onChange && this.o.onChange();
  }
  _attach(e, stream) {
    if (!e.audio) { const a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); a.style.display = 'none'; document.body.appendChild(a); e.audio = a; }
    e.audio.srcObject = stream; e.audio.muted = this.remoteMuted.has(e.id);
    const p = e.audio.play(); if (p && p.catch) p.catch(() => { const r = () => { e.audio && e.audio.play().catch(() => { }); removeEventListener('pointerdown', r); }; addEventListener('pointerdown', r); });
    this._meter(e.id, stream); this.o.onChange && this.o.onChange();
  }

  /* ---------- quem está falando ---------- */
  _meter(id, stream) {
    if (!this.ctx || this.meters.has(id)) return;
    try { const src = this.ctx.createMediaStreamSource(stream), an = this.ctx.createAnalyser(); an.fftSize = 512; src.connect(an); this.meters.set(id, { src, an, buf: new Uint8Array(an.fftSize), on: false, hold: 0 }); } catch (_) { }
  }
  _unmeter(id) { const m = this.meters.get(id); if (!m) return; try { m.src.disconnect(); } catch (_) { } this.meters.delete(id); }
  _levels() {
    const t = now();
    for (const [id, m] of this.meters) {
      m.an.getByteTimeDomainData(m.buf); let s = 0; for (let i = 0; i < m.buf.length; i++) { const x = (m.buf[i] - 128) / 128; s += x * x; }
      const loud = Math.sqrt(s / m.buf.length) > .03 && !(id === this.o.myId && this.muted) && !(id !== this.o.myId && this.remoteMuted.has(id));
      if (loud) m.hold = t + 350;
      const on = t < m.hold; if (on !== m.on) { m.on = on; this.o.onSpeak(id, on); }
    }
  }
}
