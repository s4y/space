// reserve:hot_reload

export default class ServerClock {
  constructor(doPing) {
    this.doPing = doPing;
    this.pingInterval = setInterval(() => this.ping(), 1000 + Math.random() * 500);
    this.bestRtt = null;
    this.clockOffset = null;
  }
  async ping() {
    const pong = await this.doPing(performance.now());
    // console.log(pong);
    const { startTime, serverTime } = pong;
    const now = performance.now();
    const rtt = now - startTime;
    const proposedOffset = now - serverTime;
    if (this.bestRtt == null || (rtt <= this.bestRtt && proposedOffset >= this.clockOffset)) {
      this.clockOffset = proposedOffset;
      this.bestRtt = rtt;
    }
    // console.log(`rtt: ${rtt.toFixed(2)} (best: ${this.bestRtt.toFixed(2)})`);
    // console.log(`offset: ${(now - serverTime).toFixed(2)} (best: ${this.clockOffset.toFixed(2)})`);
  }
  now() {
    let now = performance.now();
    if (this.clockOffset)
      now -= this.clockOffset - this.bestRtt / 2;
    return now;
  }
}

