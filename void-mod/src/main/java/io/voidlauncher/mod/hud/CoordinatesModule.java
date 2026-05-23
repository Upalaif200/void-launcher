package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class CoordinatesModule extends HudModule {
    public CoordinatesModule() {
        super(2, 28);
    }

    @Override
    public void render(GuiGraphics gg) {
        var player = Minecraft.getInstance().player;
        if (player == null) return;
        var pos = player.blockPosition();
        String text = "X:" + pos.getX() + " Y:" + pos.getY() + " Z:" + pos.getZ();
        gg.drawString(Minecraft.getInstance().font, text, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("X:-9999 Y:999 Z:-9999"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
