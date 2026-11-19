const GameManager = {
  playerXP: 0,
  gems: 0,
  coins: 0,
  cyberTokens: 0,
  firstMatch: true,

  endMatch(result) {
    let xp = 0;
    if (result === "win") xp = 90;
    if (result === "draw") xp = 50;
    if (result === "lose") xp = 30;

    this.playerXP += xp;
    PassManager.addXP(xp);
    UIManager.showResult(result, xp);

    if (this.firstMatch) {
      UIManager.askPlayerName();
      this.firstMatch = false;
    }
  }
};
