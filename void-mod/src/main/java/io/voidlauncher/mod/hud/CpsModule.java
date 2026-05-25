package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import java.util.ArrayDeque;
import java.util.Deque;

public class CpsModule extends HudModule {
    private final Deque<Long> leftClicks = new ArrayDeque<>();
    private final Deque<Long> rightClicks = new ArrayDeque<>();
    private int cachedLeftCps, cachedRightCps;
    private long lastCleanup;

    public CpsModule() {
        super(2, 14);
    }

    public void addLeftClick() {
        long now = System.currentTimeMillis();
        leftClicks.addLast(now);
        cleanup(leftClicks, now);
        cachedLeftCps = leftClicks.size();
    }

    public void addRightClick() {
        long now = System.currentTimeMillis();
        rightClicks.addLast(now);
        cleanup(rightClicks, now);
        cachedRightCps = rightClicks.size();
    }

    private static void cleanup(Deque<Long> clicks, long now) {
        long threshold = now - 1000;
        while (!clicks.isEmpty() && clicks.peekFirst() < threshold) {
            clicks.pollFirst();
        }
    }

    @Override
    public void render(GuiGraphics gg) {
        String text = "L:" + cachedLeftCps + " R:" + cachedRightCps;
        gg.drawString(Minecraft.getInstance().font, text, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("L:99 R:99"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
