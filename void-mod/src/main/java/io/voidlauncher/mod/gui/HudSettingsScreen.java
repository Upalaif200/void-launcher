package io.voidlauncher.mod.gui;

import io.voidlauncher.mod.hud.CrosshairModule;
import io.voidlauncher.mod.hud.HudManager;
import io.voidlauncher.mod.hud.HudModule;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

public class HudSettingsScreen extends Screen {
    private static final int PAD = 8, ROW_H = 22, COL1 = 20, COL2 = 90, COL3 = 50, COL4 = 50, COL5 = 50, COL6 = 60;
    private int scrollY;
    private final List<ModuleRow> rows = new ArrayList<>();

    private record ModuleRow(Button toggleBtn, Button colorBtn, EditBox xBox, EditBox yBox, Button resetBtn, Button styleBtn, HudModule module) {}

    public HudSettingsScreen() {
        super(Component.literal("Void Client Settings"));
    }

    @Override
    protected void init() {
        super.init();
        rows.clear();
        scrollY = 0;

        int baseY = PAD;
        for (var mod : HudManager.getInstance().getModules()) {
            int row = rows.size();
            int y = baseY + row * ROW_H;

            Button toggleBtn = addRenderableWidget(Button.builder(
                Component.literal(mod.isVisible() ? "[x]" : "[ ]"),
                btn -> {
                    mod.setVisible(!mod.isVisible());
                    btn.setMessage(Component.literal(mod.isVisible() ? "[x]" : "[ ]"));
                })
                .bounds(COL1, y, 18, 18)
                .build());

            String name = mod.getClass().getSimpleName().replace("Module", "");

            Button colorBtn = addRenderableWidget(Button.builder(
                Component.literal("🎨"),
                btn -> minecraft.setScreen(new ColorPickerScreen(mod, this)))
                .bounds(COL2 + 40, y, 22, 18)
                .build());

            EditBox xBox = new EditBox(font, COL3 + 80, y + 1, 36, 16, Component.literal("X"));
            xBox.setValue(String.valueOf(mod.getX()));
            xBox.setMaxLength(5);
            xBox.setFilter(s -> s.matches("-?\\d*"));
            addRenderableWidget(xBox);

            EditBox yBox = new EditBox(font, COL4 + 118, y + 1, 36, 16, Component.literal("Y"));
            yBox.setValue(String.valueOf(mod.getY()));
            yBox.setMaxLength(5);
            yBox.setFilter(s -> s.matches("-?\\d*"));
            addRenderableWidget(yBox);

            Button resetBtn = addRenderableWidget(Button.builder(
                Component.literal("Reset"),
                btn -> {
                    mod.setX(2);
                    mod.setY(2 + rows.indexOf(rows.stream().filter(r -> r.module == mod).findFirst().orElse(null)) * 14);
                    xBox.setValue(String.valueOf(mod.getX()));
                    yBox.setValue(String.valueOf(mod.getY()));
                })
                .bounds(COL5 + 158, y, 46, 18)
                .build());

            // [VOID-CLIENT ADDITION] Style cycle button for CrosshairModule
            Button styleBtn = null;
            if (mod instanceof CrosshairModule cm) {
                styleBtn = addRenderableWidget(Button.builder(
                    Component.literal("Style:" + cm.getStyle()),
                    btn -> {
                        int next = (cm.getStyle() + 1) % 4;
                        cm.setStyle(next);
                        btn.setMessage(Component.literal("Style:" + next));
                    })
                    .bounds(COL5 + 208, y, 52, 18)
                    .build());
            }

            rows.add(new ModuleRow(toggleBtn, colorBtn, xBox, yBox, resetBtn, styleBtn, mod));
        }

        int by = baseY + rows.size() * ROW_H + PAD;
        addRenderableWidget(Button.builder(
            Component.literal("Save & Close"),
            btn -> {
                applyPositionEdits();
                HudManager.getInstance().saveConfig();
                onClose();
            })
            .bounds(width / 2 - 80, by, 70, 20)
            .build());

        addRenderableWidget(Button.builder(
            Component.literal("Reset All"),
            btn -> {
                for (int i = 0; i < rows.size(); i++) {
                    var r = rows.get(i);
                    r.module.setX(2);
                    r.module.setY(2 + i * 14);
                    r.xBox.setValue(String.valueOf(r.module.getX()));
                    r.yBox.setValue(String.valueOf(r.module.getY()));
                }
            })
            .bounds(width / 2 + 10, by, 70, 20)
            .build());
    }

    private void applyPositionEdits() {
        for (var r : rows) {
            try { r.module.setX(Integer.parseInt(r.xBox.getValue())); } catch (NumberFormatException ignored) {}
            try { r.module.setY(Integer.parseInt(r.yBox.getValue())); } catch (NumberFormatException ignored) {}
        }
    }

    @Override
    public boolean mouseScrolled(double mx, double my, double scrollX, double scrollY) {
        this.scrollY = (int) Math.clamp(this.scrollY - scrollY * 10, -(rows.size() * ROW_H - height + 60), 0);
        return true;
    }

    @Override
    public void render(GuiGraphics gg, int mx, int my, float delta) {
        renderBackground(gg, mx, my, delta);
        gg.pose().pushPose();
        gg.pose().translate(0, scrollY, 0);

        gg.drawString(font, "On", COL1, PAD - 12 + scrollY, 0x808080);
        gg.drawString(font, "Module", COL2, PAD - 12 + scrollY, 0x808080);
        gg.drawString(font, "Color", COL2 + 42, PAD - 12 + scrollY, 0x808080);
        gg.drawString(font, "X", COL3 + 80, PAD - 12 + scrollY, 0x808080);
        gg.drawString(font, "Y", COL4 + 118, PAD - 12 + scrollY, 0x808080);

        super.render(gg, mx, my, delta);

        for (int i = 0; i < rows.size(); i++) {
            var r = rows.get(i);
            int y = PAD + i * ROW_H + scrollY;
            String name = r.module.getClass().getSimpleName().replace("Module", "");
            gg.drawString(font, name, COL2, y + 4, 0xFFFFFF);
            int swatchColor = r.module.getColor();
            gg.fill(COL2 + 62, y + 2, COL2 + 80, y + 18, 0xFF000000 | (swatchColor & 0x00FFFFFF));
        }

        gg.pose().popPose();

        gg.drawString(font, "Use mouse wheel to scroll | RSHIFT to open", PAD, height - font.lineHeight - PAD, 0x808080);
    }
}
