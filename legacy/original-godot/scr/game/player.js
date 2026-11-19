class Player {
  constructor(data) {
    this.hp = data.hp;
    this.maxHp = data.hp;
    this.damage = data.damage;
    this.superDamage = data.superDamage;
  }

  attack() {
    this.shake();
  }

  useSuper() {
    this.shake();
    this.rotate();
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) MatchManager.playerDefeated();
  }

  shake() {
    console.log("tremer personagem");
  }

  rotate() {
    console.log("girar personagem");
  }
}
