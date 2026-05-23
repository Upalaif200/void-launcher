package io.voidlauncher.mod.gui;

import io.voidlauncher.mod.hud.HudManager;
import io.voidlauncher.mod.hud.HudModule;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class HudSettingsScreen extends Screen {
    private static final int PAD = 8, LINE = 22;

    public HudSettingsScreen() {
        super(Component.literal("Void Client Settings"));
    }

    @Override
    protected void init() {
        super.init();
        int y = PAD;
        for (var mod : HudManager.getInstance().getModules()) {
            int x = PAD;
            String name = mod.getClass().getSimpleName().replace("Module", "");

            addRenderableWidget(Button.builder(
                Component.literal(mod.isVisible() ? "[x] " + name : "[ ] " + name),
                btn -> {
                    mod.setVisible(!mod.isVisible());
                    btn.setMessage(Component.literal(mod.isVisible() ? "[x] " + name : "[ ] " + name));
                })
                .bounds(x, y, 110, 18)
                .build());

            addRenderableWidget(Button.builder(
                Component.literal("Color"),
                btn -> minecraft.setScreen(new ColorPickerScreen(mod, this)))
                .bounds(x + 114, y, 50, 18)
                .build());

            y += LINE;
        }

        int by = y + PAD;
        addRenderableWidget(Button.builder(
            Component.literal("Save & Close"),
            btn -> {
                HudManager.getInstance().saveConfig();
                onClose();
            })
            .bounds(width / 2 - 50, by, 100, 20)
            .build());
    }

    @Override
    public void render(GuiGraphics gg, int mx, int my, float delta) {
        renderBackground(gg, mx, my, delta);
        super.render(gg, mx, my, delta);
        gg.drawString(font, "Hold LALT + drag in-game to reposition", PAD, height - font.lineHeight - PAD, 0x808080);
    }
}