class Bot extends Player {
  think() {
    if (Math.random() > 0.7) this.attack();
    if (Math.random() > 0.95) this.useSuper();
  }
}
