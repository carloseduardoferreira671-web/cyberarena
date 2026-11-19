public class BoxSystem {

    static int rand(int max) {
        return (int)(Math.random() * max);
    }

    public static void openMiniBox() {
        int luck = rand(100);
        if (luck < 50) PlayerData.coins += 30;
        else if (luck < 80) PlayerData.cyberTokens += 5;
        else PlayerData.coins += 60;
    }

    public static void openCyberBox() {
        int luck = rand(100);
        if (luck < 40) PlayerData.coins += 80;
        else if (luck < 70) PlayerData.cyberTokens += 15;
        else Rewards.unlockCharacter();
    }

    public static void openMechaBox() {
        int luck = rand(100);
        if (luck < 30) PlayerData.coins += 150;
        else if (luck < 60) PlayerData.cyberTokens += 30;
        else Rewards.unlockRareCharacter();
    }
}
