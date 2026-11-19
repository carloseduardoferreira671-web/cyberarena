const BoxSystem = {
  openBox(type) {
    let coins = 0;
    let tokens = 0;

    if (type === "mini") {
      coins = 50;
      tokens = 10;
    }
    if (type === "cyber") {
      coins = 120;
      tokens = 30;
    }
    if (type === "mecha") {
      coins = 300;
      tokens = 80;
    }

    GameManager.coins += coins;
    GameManager.cyberTokens += tokens;
  }
};
