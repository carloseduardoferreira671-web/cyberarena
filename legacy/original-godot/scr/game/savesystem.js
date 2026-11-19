const SaveSystem = {
  save() {
    const data = {
      xp: GameManager.playerXP,
      coins: GameManager.coins,
      gems: GameManager.gems,
      cyberTokens: GameManager.cyberTokens,
      passLevel: PassManager.level,
      passXP: PassManager.xp,
      firstMatch: GameManager.firstMatch
    };

    localStorage.setItem("CYBER_ARENA_SAVE", JSON.stringify(data));
    console.log("Progresso salvo");
  },

  load() {
    const data = localStorage.getItem("CYBER_ARENA_SAVE");
    if (!data) return;

    const save = JSON.parse(data);
    GameManager.playerXP = save.xp;
    GameManager.coins = save.coins;
    GameManager.gems = save.gems;
    GameManager.cyberTokens = save.cyberTokens;
    PassManager.level = save.passLevel;
    PassManager.xp = save.passXP;
    GameManager.firstMatch = save.firstMatch;

    console.log("Progresso carregado");
  }
};
