public class ShopSystem {

    public static void buyMiniBox() {
        BoxSystem.openMiniBox();
    }

    public static void buyCyberBox() {
        BoxSystem.openCyberBox();
    }

    public static void buyMechaBox() {
        BoxSystem.openMechaBox();
    }

    public static void buyPass() {
        if (PlayerData.gems >= 70) {
            PlayerData.gems -= 70;
        }
    }
}
