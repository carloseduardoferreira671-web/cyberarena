public class FreeRewards {

    public static boolean canShow() {
        return PlayerData.freeBoxesCollected < 3;
    }

    public static void collect() {
        if (PlayerData.freeBoxesCollected < 3) {
            BoxSystem.openMiniBox();
            PlayerData.freeBoxesCollected++;
        }
    }
}
