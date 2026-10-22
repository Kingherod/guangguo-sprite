(function (scope) {
'use strict';
class PetState {
  constructor(loopMs = 1600) { this.loopMs=loopMs; this.busy=false; this.attended=false; this.unread=false; this.failedUntil=0; this.waveUntil=0; this.lastError=false; this.lastErrorAt=undefined; this.phase=''; }
  activity(event, now = Date.now()) {
    if (event.busy && !this.busy) { this.attended=false; this.unread=false; }
    if (!event.busy && this.busy) this.unread=!this.attended;
    if (event.lastError && (!this.lastError || event.at !== this.lastErrorAt)) { this.failedUntil=now+15000; this.lastErrorAt=event.at; }
    this.lastError=event.lastError; this.busy=event.busy;
    // Codex 事件层推来的语义阶段：'think' | 'tool' | 'idle'（未接事件源的宿主不传，保持 ''）
    if (event.phase !== undefined) this.phase = (!event.phase || event.phase === 'idle') ? '' : event.phase;
  }
  attend() { this.attended=true; this.unread=false; }
  hover() { if (this.unread) this.attend(); }
  click(now = Date.now()) { this.attend(); this.failedUntil=0; this.waveUntil=now+this.loopMs; }
  // 优先级照 Hermes agent/pet 的顺序（error → 交互 → 推理 → 工具 → busy → idle）。
  // 区别只在语义：推理走 review（手托脸颊＝思考），工具执行走 waiting（坐等）。
  state(now = Date.now()) {
    if (now < this.waveUntil) return 'waving';
    if (now < this.failedUntil) return 'failed';
    if (this.phase === 'think') return 'review';
    if (this.phase === 'tool') return 'waiting';
    return this.busy ? 'waiting' : this.unread ? 'unread' : 'idle';
  }
}
scope.GuangguoState=PetState;
if (typeof module !== 'undefined') module.exports=PetState;
})(globalThis);
