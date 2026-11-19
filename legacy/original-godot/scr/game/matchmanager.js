const MatchManager = {
  time: 60,
  botsAlive: 9,

  startSolo() {
    this.time = 60;
    setTimeout(() => this.checkDraw(), 60000);
  },

  botDefeated() {
    this.botsAlive--;
    if (this.botsAlive === 0) GameManager.endMatch("win");
  },

  playerDefeated() {
    GameManager.endMatch("lose");
  },

  checkDraw() {
    if (this.botsAlive > 0) GameManager.endMatch("draw");
  }
};
