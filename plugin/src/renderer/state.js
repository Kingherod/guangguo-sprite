(function (scope) {
'use strict';
class PetState {
  constructor(loopMs = 1600) { this.loopMs=loopMs; this.busy=false; this.attended=false; this.unread=false; this.failedUntil=0; this.waveUntil=0; this.lastError=false; this.lastErrorAt=undefined; }
  activity(event, now = Date.now()) {
    if (event.busy && !this.busy) { this.attended=false; this.unread=false; }
    if (!event.busy && this.busy) this.unread=!this.attended;
    if (event.lastError && (!this.lastError || event.at !== this.lastErrorAt)) { this.failedUntil=now+15000; this.lastErrorAt=event.at; }
    this.lastError=event.lastError; this.busy=event.busy;
  }
  attend() { this.attended=true; this.unread=false; }
  hover() { if (this.unread) this.attend(); }
  click(now = Date.now()) { this.attend(); this.failedUntil=0; this.waveUntil=now+this.loopMs; }
  state(now = Date.now()) { return now < this.waveUntil ? 'waving' : now < this.failedUntil ? 'failed' : this.busy ? 'waiting' : this.unread ? 'unread' : 'idle'; }
}
scope.GuangguoState=PetState;
if (typeof module !== 'undefined') module.exports=PetState;
})(globalThis);
