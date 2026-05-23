package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import java.util.ArrayDeque;
import java.util.Deque;

public class CpsModule extends HudModule {
    private final Deque<Long> leftClicks = new ArrayDeque<>();
    private final Deque<Long> rightClicks = new ArrayDeque<>();

    public CpsModule() {
        super(2, 14);
    }

    public void addLeftClick() {
        long now = System.currentTimeMillis();
        leftClicks.addLast(now);
    }

    public void addRightClick() {
        long now = System.currentTimeMillis();
        rightClicks.addLast(now);
    }

    private int getCps(Deque<Long> clicks) {
        long threshold = System.currentTimeMillis() - 1000;
        while (!clicks.isEmpty() && clicks.peekFirst() < threshold) {
            clicks.pollFirst();
        }
        return clicks.size();
    }

    @Override
    public void render(GuiGraphics gg) {
        int lCps = getCps(leftClicks);
        int rCps = getCps(rightClicks);
        String text = "L:" + lCps + " R:" + rCps;
        gg.drawString(Minecraft.getInstance().font, text, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("L:99 R:99"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
