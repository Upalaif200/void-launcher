package io.voidlauncher.mod.hud;

public class AnimationController {
    private long tick;

    public void tick() { tick++; }

    public long getTick() { return tick; }

    public float getScaleMultiplier(int animType) {
        return switch (animType) {
            case 2 -> (float) (1.0 + Math.sin(tick * 0.1) * 0.1);
            default -> 1.0f;
        };
    }

    public float getAlphaMultiplier(int animType) {
        return switch (animType) {
            case 1 -> (float) (0.3 + 0.7 * (Math.sin(tick * 0.05) + 1) / 2);
            default -> 1.0f;
        };
    }

    public int getXOffset(int animType) {
        return switch (animType) {
            case 3 -> (int) (Math.sin(tick * 0.08) * 5);
            default -> 0;
        };
    }

    public int getYOffset(int animType) {
        return switch (animType) {
            case 4 -> (int) (Math.abs(Math.sin(tick * 0.08)) * 3);
            default -> 0;
        };
    }
}
