package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class DirectionModule extends HudModule {
    private static final String[] DIRECTIONS = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};

    public DirectionModule() {
        super(2, 42);
    }

    @Override
    public void render(GuiGraphics gg) {
        var player = Minecraft.getInstance().player;
        if (player == null) return;
        float yaw = player.getYRot() % 360;
        if (yaw < 0) yaw += 360;
        int idx = ((int) ((yaw + 22.5) / 45)) % 8;
        String dir = DIRECTIONS[idx];
        gg.drawString(Minecraft.getInstance().font, dir, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("NNW"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
