package io.voidlauncher.mod.gui;

import io.voidlauncher.mod.hud.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class VoidCustomizationScreen extends Screen {
    private static final int PANEL_W = 210;
    private static final HudManager HUD = HudManager.getInstance();

    private HudModule selectedModule;
    private boolean dragging;
    private int dragOffX, dragOffY;
    private final Map<HudModule, int[]> originalPositions = new HashMap<>();
    private final List<GuiEventListener> panelWidgets = new ArrayList<>();
    private int panelX, panelY;
    private boolean saved;

    public VoidCustomizationScreen() {
        super(Component.literal("Editor de Void Client"));
        saveOriginalPositions();
    }

    private void saveOriginalPositions() {
        originalPositions.clear();
        for (var mod : HUD.getModules()) {
            originalPositions.put(mod, new int[]{mod.getX(), mod.getY()});
        }
    }

    @Override
    protected void init() {
        super.init();
        panelX = width - PANEL_W - 8;
        panelY = 10;
        saved = false;

        addRenderableWidget(Button.builder(
            Component.literal("Guardar y Salir"),
            btn -> onClose())
            .bounds(8, height - 28, 90, 20).build());

        addRenderableWidget(Button.builder(
            Component.literal("Restablecer Todo"),
            btn -> {
                for (var mod : HUD.getModules()) {
                    int[] pos = originalPositions.get(mod);
                    if (pos != null) { mod.setX(pos[0]); mod.setY(pos[1]); }
                }
                if (selectedModule != null) rebuildPanel();
            })
            .bounds(104, height - 28, 90, 20).build());
    }

    private void selectModule(HudModule mod) {
        selectedModule = mod;
        rebuildPanel();
    }

    private void rebuildPanel() {
        for (var w : panelWidgets) removeWidget(w);
        panelWidgets.clear();
        if (selectedModule == null) return;

        int y = panelY + 24;

        EditBox xBox = new EditBox(font, panelX + 24, y, 50, 16, Component.literal("X"));
        xBox.setValue(String.valueOf(selectedModule.getX()));
        xBox.setMaxLength(5);
        xBox.setFilter(s -> s.matches("-?\\d*"));
        xBox.setResponder(s -> { try { selectedModule.setX(Integer.parseInt(s)); } catch (NumberFormatException ignored) {} });
        addRenderableWidget(xBox);
        panelWidgets.add(xBox);

        EditBox yBox = new EditBox(font, panelX + 98, y, 50, 16, Component.literal("Y"));
        yBox.setValue(String.valueOf(selectedModule.getY()));
        yBox.setMaxLength(5);
        yBox.setFilter(s -> s.matches("-?\\d*"));
        yBox.setResponder(s -> { try { selectedModule.setY(Integer.parseInt(s)); } catch (NumberFormatException ignored) {} });
        addRenderableWidget(yBox);
        panelWidgets.add(yBox);

        y += 22;

        EditBox scaleBox = new EditBox(font, panelX + 60, y, 45, 16, Component.literal("Scale"));
        scaleBox.setValue(String.format("%.2f", selectedModule.getScale()));
        scaleBox.setMaxLength(5);
        scaleBox.setFilter(s -> s.matches("\\d*\\.?\\d*"));
        scaleBox.setResponder(s -> {
            try { float v = Float.parseFloat(s); if (v >= 0.1f && v <= 5f) selectedModule.setScale(v); } catch (NumberFormatException ignored) {}
        });
        addRenderableWidget(scaleBox);
        panelWidgets.add(scaleBox);

        Button scaleMinus = addRenderableWidget(Button.builder(Component.literal("-"),
            btn -> { selectedModule.setScale(Math.max(0.25f, selectedModule.getScale() - 0.25f)); scaleBox.setValue(String.format("%.2f", selectedModule.getScale())); })
            .bounds(panelX + 110, y, 20, 16).build());
        panelWidgets.add(scaleMinus);
        Button scalePlus = addRenderableWidget(Button.builder(Component.literal("+"),
            btn -> { selectedModule.setScale(Math.min(5f, selectedModule.getScale() + 0.25f)); scaleBox.setValue(String.format("%.2f", selectedModule.getScale())); })
            .bounds(panelX + 134, y, 20, 16).build());
        panelWidgets.add(scalePlus);

        y += 22;

        EditBox alphaBox = new EditBox(font, panelX + 72, y, 45, 16, Component.literal("Alpha"));
        alphaBox.setValue(String.format("%.2f", selectedModule.getAlpha()));
        alphaBox.setMaxLength(5);
        alphaBox.setFilter(s -> s.matches("\\d*\\.?\\d*"));
        alphaBox.setResponder(s -> {
            try { float v = Float.parseFloat(s); if (v >= 0f && v <= 1f) selectedModule.setAlpha(v); } catch (NumberFormatException ignored) {}
        });
        addRenderableWidget(alphaBox);
        panelWidgets.add(alphaBox);

        Button alphaMinus = addRenderableWidget(Button.builder(Component.literal("-"),
            btn -> { selectedModule.setAlpha(Math.max(0f, selectedModule.getAlpha() - 0.1f)); alphaBox.setValue(String.format("%.2f", selectedModule.getAlpha())); })
            .bounds(panelX + 122, y, 16, 16).build());
        panelWidgets.add(alphaMinus);
        Button alphaPlus = addRenderableWidget(Button.builder(Component.literal("+"),
            btn -> { selectedModule.setAlpha(Math.min(1f, selectedModule.getAlpha() + 0.1f)); alphaBox.setValue(String.format("%.2f", selectedModule.getAlpha())); })
            .bounds(panelX + 140, y, 16, 16).build());
        panelWidgets.add(alphaPlus);

        y += 22;

        Button colorBtn = Button.builder(
            Component.literal("Color"),
            btn -> minecraft.setScreen(new VoidColorPickerScreen(selectedModule, this)))
            .bounds(panelX + 5, y, PANEL_W - 30, 18).build();
        addRenderableWidget(colorBtn);
        panelWidgets.add(colorBtn);

        y += 22;

        if (selectedModule instanceof CrosshairModule cm) {
            Button styleBtn = Button.builder(
                Component.literal("Estilo: " + styleName(cm.getStyle())),
                btn -> {
                    int next = (cm.getStyle() + 1) % 4;
                    cm.setStyle(next);
                    btn.setMessage(Component.literal("Estilo: " + styleName(next)));
                })
                .bounds(panelX + 5, y, PANEL_W - 10, 18).build();
            addRenderableWidget(styleBtn);
            panelWidgets.add(styleBtn);
        } else {
            Button formBtn = Button.builder(
                Component.literal("Diseño: " + formName(selectedModule)),
                btn -> {
                    int max = formMax(selectedModule);
                    int next = (selectedModule.getForm() + 1) % max;
                    selectedModule.setForm(next);
                    btn.setMessage(Component.literal("Diseño: " + formName(selectedModule)));
                })
                .bounds(panelX + 5, y, PANEL_W - 10, 18).build();
            addRenderableWidget(formBtn);
            panelWidgets.add(formBtn);
        }

        y += 22;

        Button animBtn = Button.builder(
            Component.literal("Animación: " + animName(selectedModule.getAnimation())),
            btn -> {
                int next = (selectedModule.getAnimation() + 1) % 5;
                selectedModule.setAnimation(next);
                btn.setMessage(Component.literal("Animación: " + animName(next)));
            })
            .bounds(panelX + 5, y, PANEL_W - 10, 18).build();
        addRenderableWidget(animBtn);
        panelWidgets.add(animBtn);

        y += 24;

        Button resetBtn = Button.builder(
            Component.literal("Restablecer módulo"),
            btn -> {
                int[] pos = originalPositions.get(selectedModule);
                if (pos != null) { selectedModule.setX(pos[0]); selectedModule.setY(pos[1]); }
                selectedModule.setScale(1);
                selectedModule.setAlpha(1);
                selectedModule.setAnimation(0);
                selectedModule.setForm(0);
                if (selectedModule instanceof CrosshairModule cm) cm.setStyle(0);
                rebuildPanel();
            })
            .bounds(panelX + 5, y, PANEL_W - 10, 18).build();
        addRenderableWidget(resetBtn);
        panelWidgets.add(resetBtn);
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
            for (var mod : HUD.getModules()) {
                if (mod.isVisible() && mod.isMouseOver((int) mx, (int) my)) {
                    selectModule(mod);
                    dragging = true;
                    dragOffX = (int) mx - mod.getX();
                    dragOffY = (int) my - mod.getY();
                    break;
                }
            }
        }
        if (!leftDown) dragging = false;
        if (dragging && selectedModule != null) {
            selectedModule.setX((int) mx - dragOffX);
            selectedModule.setY((int) my - dragOffY);
        }
    }

    @Override
    public void render(GuiGraphics gg, int mx, int my, float delta) {
        gg.fill(0, 0, width, height, 0x88000000);

        for (var mod : HUD.getModules()) {
            if (!mod.isVisible()) continue;
            mod.render(gg);
            if (mod == selectedModule) {
                int bx = mod.getX() - 2, by = mod.getY() - 2;
                int bw = mod.getWidth() + 4, bh = mod.getHeight() + 4;
                gg.fill(bx, by, bx + bw, by + 1, 0xFFFFFFFF);
                gg.fill(bx, by + bh - 1, bx + bw, by + bh, 0xFFFFFFFF);
                gg.fill(bx, by, bx + 1, by + bh, 0xFFFFFFFF);
                gg.fill(bx + bw - 1, by, bx + bw, by + bh, 0xFFFFFFFF);
            }
        }

        if (selectedModule != null) {
            int py = panelY;
            int ph = height - 20 - py;
            gg.fill(panelX, py, panelX + PANEL_W, py + ph, 0xCC111122);
            gg.fill(panelX, py, panelX + 1, py + ph, 0xFF666688);
            gg.fill(panelX, py + ph - 1, panelX + PANEL_W, py + ph, 0xFF666688);

            gg.drawString(font, selectedModule.getDisplayName(), panelX + 6, py + 6, 0xFFCC88);

            int ly = py + 24;
            gg.drawString(font, "X:", panelX + 5, ly + 3, 0xAAAAAA);
            gg.drawString(font, "Y:", panelX + 80, ly + 3, 0xAAAAAA);
            ly += 22;
            gg.drawString(font, "Escala:", panelX + 5, ly + 3, 0xAAAAAA);
            ly += 22;
            gg.drawString(font, "Opacidad:", panelX + 5, ly + 3, 0xAAAAAA);
            ly += 22;

            int swatchX = panelX + PANEL_W - 28;
            int swatchY = ly - 18;
            gg.fill(swatchX, swatchY, swatchX + 20, swatchY + 18, 0xFF000000);
            gg.fill(swatchX + 1, swatchY + 1, swatchX + 19, swatchY + 17,
                0xFF000000 | (selectedModule.getColor() & 0x00FFFFFF));
        }

        gg.drawString(font, "Haz clic en un módulo para seleccionarlo, arrastra para moverlo.",
            width / 2 - 160, height - 50, 0x808080);

        super.render(gg, mx, my, delta);
    }

    @Override
    public void onClose() {
        if (!saved) {
            HUD.saveConfig();
            saved = true;
        }
        super.onClose();
    }

    private static String styleName(int s) {
        return switch (s) {
            case 0 -> "4 Líneas";
            case 1 -> "Cruz";
            case 2 -> "Punto";
            case 3 -> "Círculo";
            default -> "?";
        };
    }

    private static String formName(HudModule mod) {
        if (mod instanceof KeystrokesModule) {
            return switch (mod.getForm()) {
                case 0 -> "Por defecto";
                case 1 -> "Horizontal";
                case 2 -> "Compacto";
                case 3 -> "Mínimo";
                default -> "?";
            };
        }
        if (mod instanceof ArmorStatusModule) {
            return switch (mod.getForm()) {
                case 0 -> "Vertical";
                case 1 -> "Horizontal";
                case 2 -> "Compacto";
                default -> "?";
            };
        }
        return "?";
    }

    private static int formMax(HudModule mod) {
        if (mod instanceof KeystrokesModule) return 4;
        if (mod instanceof ArmorStatusModule) return 3;
        return 1;
    }

    private static String animName(int a) {
        return switch (a) {
            case 0 -> "Ninguna";
            case 1 -> "Desvanecer";
            case 2 -> "Pulso";
            case 3 -> "Deslizar";
            case 4 -> "Rebotar";
            default -> "?";
        };
    }
}
