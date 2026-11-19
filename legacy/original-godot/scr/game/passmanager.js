const PassManager = {
  level: 1,
  xp: 0,

  addXP(amount) {
    this.xp += amount;
    if (this.xp >= 200) {
      this.level++;
      this.xp = 0;
    }
  }
};
