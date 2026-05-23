package io.voidlauncher.mod.gui;

import io.voidlauncher.mod.hud.HudManager;
import io.voidlauncher.mod.hud.HudModule;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class ModuleEditorScreen extends Screen {
    private HudModule selectedModule;
    private boolean dragging;
    private int dragOffX, dragOffY;

    public ModuleEditorScreen() {
        super(Component.literal("Module Editor"));
    }

    @Override
    protected void init() {
        super.init();
        addRenderableWidget(Button.builder(
            Component.literal("Done"),
            btn -> {
                HudManager.getInstance().saveConfig();
                onClose();
            })
            .bounds(width / 2 - 30, height - 30, 60, 20)
            .build());
    }

    @Override
    public boolean mouseClicked(double mx, double my, int button) {
        if (button == 0) {
            for (var mod : HudManager.getInstance().getModules()) {
                if (mod.isVisible() && mod.isMouseOver((int) mx, (int) my)) {
                    selectedModule = mod;
                    dragging = true;
                    dragOffX = (int) mx - mod.getX();
                    dragOffY = (int) my - mod.getY();
                    return true;
                }
            }
            selectedModule = null;
        }
        return super.mouseClicked(mx, my, button);
    }

    @Override
    public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
        if (dragging && selectedModule != null) {
            selectedModule.setX((int) mx - dragOffX);
            selectedModule.setY((int) my - dragOffY);
            return true;
        }
        return super.mouseDragged(mx, my, button, dx, dy);
    }

    @Override
    public boolean mouseReleased(double mx, double my, int button) {
        if (button == 0) dragging = false;
        return super.mouseReleased(mx, my, button);
    }

    @Override
    public void render(GuiGraphics gg, int mx, int my, float delta) {
        // Dark semi-transparent background
        gg.fill(0, 0, width, height, 0x88000000);

        // Render all visible modules in their real positions
        var mc = Minecraft.getInstance();
        for (var mod : HudManager.getInstance().getModules()) {
            if (mod.isVisible()) {
                mod.render(gg);
                // Draw selection highlight
                if (mod == selectedModule) {
                    int bx = mod.getX() - 2;
                    int by = mod.getY() - 2;
                    int bw = mod.getWidth() + 4;
                    int bh = mod.getHeight() + 4;
                    gg.fill(bx, by, bx + bw, by + 1, 0xFFFFFFFF);
                    gg.fill(bx, by + bh - 1, bx + bw, by + bh, 0xFFFFFFFF);
                    gg.fill(bx, by, bx + 1, by + bh, 0xFFFFFFFF);
                    gg.fill(bx + bw - 1, by, bx + bw, by + bh, 0xFFFFFFFF);
                }
            }
        }

        // Hint text
        gg.drawString(font, "Click a module to select, drag to reposition, ESC or Done to save", width / 2 - 180, height - 50, 0x808080);

        super.render(gg, mx, my, delta);
    }

    @Override
    public void onClose() {
        HudManager.getInstance().saveConfig();
        super.onClose();
    }
}
