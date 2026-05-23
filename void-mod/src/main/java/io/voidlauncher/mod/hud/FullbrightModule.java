package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class FullbrightModule extends HudModule {
    private boolean wasEnabled;
    private double originalGamma;

    public FullbrightModule() {
        super(-200, -200);
        setVisible(false);
    }

    @Override
    public void render(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        if (mc.player != null) {
            if (visible && !wasEnabled) {
                originalGamma = mc.options.gamma().get();
                mc.options.gamma().set(100.0);
                wasEnabled = true;
            } else if (!visible && wasEnabled) {
                mc.options.gamma().set(originalGamma);
                wasEnabled = false;
            } else if (visible) {
                mc.options.gamma().set(100.0);
            }
        }
    }

    @Override
    public void setVisible(boolean v) {
        if (!v && wasEnabled) {
            var mc = Minecraft.getInstance();
            mc.options.gamma().set(originalGamma);
            wasEnabled = false;
        }
        super.setVisible(v);
    }

    @Override public int getWidth() { return 0; }
    @Override public int getHeight() { return 0; }
}
