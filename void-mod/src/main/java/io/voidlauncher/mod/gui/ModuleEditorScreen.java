package io.voidlauncher.mod.gui;

import io.voidlauncher.mod.hud.HudManager;
import io.voidlauncher.mod.hud.HudModule;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.HashMap;
import java.util.Map;

public class ModuleEditorScreen extends Screen {
    private HudModule selectedModule;
    private boolean dragging;
    private int dragOffX, dragOffY;
    private final Map<HudModule, int[]> originalPositions = new HashMap<>();

    public ModuleEditorScreen() {
        super(Component.literal("Module Editor"));
        saveOriginalPositions();
    }

    private void saveOriginalPositions() {
        originalPositions.clear();
        for (var mod : HudManager.getInstance().getModules()) {
            originalPositions.put(mod, new int[]{mod.getX(), mod.getY()});
        }
    }

    @Override
    protected void init() {
        super.init();

        addRenderableWidget(Button.builder(
            Component.literal("Save & Close"),
            btn -> {
                HudManager.getInstance().saveConfig();
                onClose();
            })
            .bounds(width / 2 - 85, height - 28, 78, 20)
            .build());

        addRenderableWidget(Button.builder(
            Component.literal("Reset"),
            btn -> {
                for (var mod : HudManager.getInstance().getModules()) {
                    int[] pos = originalPositions.get(mod);
                    if (pos != null) {
                        mod.setX(pos[0]);
                        mod.setY(pos[1]);
                    }
                }
            })
            .bounds(width / 2 + 7, height - 28, 60, 20)
            .build());
    }

    @Override
    public void tick() {
        super.tick();
        var mc = Minecraft.getInstance();
        if (mc.mouseHandler == null) return;
        double mx = mc.mouseHandler.xpos() * (double) width / mc.getWindow().getWidth();
        double my = mc.mouseHandler.ypos() * (double) height / mc.getWindow().getHeight();

        boolean leftDown = mc.mouseHandler.isLeftPressed();
        if (leftDown && !dragging) {
            for (var mod : HudManager.getInstance().getModules()) {
                if (mod.isVisible() && mod.isMouseOver((int) mx, (int) my)) {
                    selectedModule = mod;
                    dragging = true;
                    dragOffX = (int) mx - mod.getX();
                    dragOffY = (int) my - mod.getY();
                    break;
                }
            }
        }
        if (!leftDown) {
            dragging = false;
        }
        if (dragging && selectedModule != null) {
            selectedModule.setX((int) mx - dragOffX);
            selectedModule.setY((int) my - dragOffY);
        }
    }

    @Override
    public void render(GuiGraphics gg, int mx, int my, float delta) {
        gg.fill(0, 0, width, height, 0x88000000);

        for (var mod : HudManager.getInstance().getModules()) {
            if (mod.isVisible()) {
                mod.render(gg);
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

        gg.drawString(font, "Click a module to select, drag to move. Save & Close or press ESC.", width / 2 - 170, height - 50, 0x808080);

        super.render(gg, mx, my, delta);
    }

    @Override
    public void onClose() {
        HudManager.getInstance().saveConfig();
        super.onClose();
    }
}
