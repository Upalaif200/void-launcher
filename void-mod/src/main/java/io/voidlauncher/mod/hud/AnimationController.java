package io.voidlauncher.mod.hud;

public class AnimationController {
    private int tick;
    private float cachedScale2, cachedAlpha1;
    private int cachedXOff3, cachedYOff4;

    public void tick() {
        tick++;
        float t05 = (float) Math.sin(tick * 0.05);
        float t1 = (float) Math.sin(tick * 0.1);
        float t08 = (float) Math.sin(tick * 0.08);
        cachedScale2 = 1.0f + t1 * 0.1f;
        cachedAlpha1 = 0.3f + 0.7f * (t05 + 1) * 0.5f;
        cachedXOff3 = (int) (t08 * 5);
        cachedYOff4 = (int) (Math.abs(t08) * 3);
    }

    public int getTick() { return tick; }

    public float getScaleMultiplier(int animType) {
        return animType == 2 ? cachedScale2 : 1.0f;
    }

    public float getAlphaMultiplier(int animType) {
        return animType == 1 ? cachedAlpha1 : 1.0f;
    }

    public int getXOffset(int animType) {
        return animType == 3 ? cachedXOff3 : 0;
    }

    public int getYOffset(int animType) {
        return animType == 4 ? cachedYOff4 : 0;
    }
}
