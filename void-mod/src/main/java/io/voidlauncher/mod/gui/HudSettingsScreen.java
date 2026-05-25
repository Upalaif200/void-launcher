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
    private static final int PAD = 8, ROW_H = 22;
    private final List<ModuleRow> rows = new ArrayList<>();

    private record ModuleRow(Button toggleBtn, Button colorBtn, EditBox xBox, EditBox yBox, Button resetBtn, Button styleBtn, HudModule module) {}

    public HudSettingsScreen() {
        super(Component.literal("Void Client Settings"));
    }

    @Override
    protected void init() {
        super.init();
        rows.clear();

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
                .bounds(20, y, 18, 18)
                .build());

            Button colorBtn = addRenderableWidget(Button.builder(
                Component.literal("Color"),
                btn -> minecraft.setScreen(new ColorPickerScreen(mod, this)))
                .bounds(130, y, 46, 18)
                .build());

            EditBox xBox = new EditBox(font, 210, y + 1, 36, 16, Component.literal("X"));
            xBox.setValue(String.valueOf(mod.getX()));
            xBox.setMaxLength(5);
            xBox.setFilter(s -> s.matches("-?\\d*"));
            addRenderableWidget(xBox);

            EditBox yBox = new EditBox(font, 260, y + 1, 36, 16, Component.literal("Y"));
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
                .bounds(310, y, 46, 18)
                .build());

            Button styleBtn = null;
            if (mod instanceof CrosshairModule cm) {
                styleBtn = addRenderableWidget(Button.builder(
                    Component.literal("Style:" + cm.getStyle()),
                    btn -> {
                        int next = (cm.getStyle() + 1) % 5;
                        cm.setStyle(next);
                        btn.setMessage(Component.literal("Style:" + next));
                    })
                    .bounds(364, y, 52, 18)
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
    public void render(GuiGraphics gg, int mx, int my, float delta) {
        renderBackground(gg, mx, my, delta);

        gg.drawString(font, "On", 20, PAD - 12, 0x808080);
        gg.drawString(font, "Module", 48, PAD - 12, 0x808080);
        gg.drawString(font, "Color", 130, PAD - 12, 0x808080);
        gg.drawString(font, "X", 210, PAD - 12, 0x808080);
        gg.drawString(font, "Y", 260, PAD - 12, 0x808080);

        super.render(gg, mx, my, delta);

        for (int i = 0; i < rows.size(); i++) {
            var r = rows.get(i);
            int rowY = PAD + i * ROW_H;
            String name = r.module.getClass().getSimpleName().replace("Module", "");
            gg.drawString(font, name, 48, rowY + 4, 0xFFFFFF);
            int swatchColor = r.module.getColor();
            gg.fill(48 + font.width(name) + 4, rowY + 2, 48 + font.width(name) + 20, rowY + 18, 0xFF000000 | (swatchColor & 0x00FFFFFF));
        }

        gg.drawString(font, "Use mouse wheel to scroll | RSHIFT to open", PAD, height - font.lineHeight - PAD, 0x808080);
    }
}
