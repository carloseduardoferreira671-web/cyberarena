const ShopManager = {
  freeBoxesCollected: false,

  collectWelcomeBoxes() {
    if (this.freeBoxesCollected) return;
    BoxSystem.openBox("mini");
    BoxSystem.openBox("mini");
    BoxSystem.openBox("mini");
    this.freeBoxesCollected = true;
  }
};
