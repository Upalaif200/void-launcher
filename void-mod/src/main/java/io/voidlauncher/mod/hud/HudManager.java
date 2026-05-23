package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.List;

public class HudManager {
    private static HudManager instance;
    private final List<HudModule> modules = new ArrayList<>();
    private final ModuleConfig config;
    private HudModule dragTarget;
    private int dragOffX, dragOffY;
    private boolean wasLeftDown;

    private HudManager() {
        this.config = ModuleConfig.load();
    }

    public static HudManager getInstance() {
        if (instance == null) instance = new HudManager();
        return instance;
    }

    public void register(HudModule module) {
        var data = config.getOrCreate(module.getClass().getSimpleName());
        module.setX(data.x);
        module.setY(data.y);
        module.setVisible(data.visible);
        module.setColor(data.color);
        // [VOID-CLIENT ADDITION] restore style for CrosshairModule
        if (module instanceof CrosshairModule cm) {
            cm.setStyle(data.style);
        }
        modules.add(module);
    }

    public void renderAll(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        if (mc.screen != null || mc.player == null) return;

        var win = mc.getWindow();
        long handle = win.handle();
        boolean alt = GLFW.glfwGetKey(handle, GLFW.GLFW_KEY_LEFT_ALT) == GLFW.GLFW_PRESS;
        boolean left = GLFW.glfwGetMouseButton(handle, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;

        if (alt && !left && wasLeftDown) {
            if (dragTarget != null) {
                saveConfig();
                dragTarget = null;
            }
        }

        if (alt && left && !wasLeftDown) {
            double mx = mc.mouseHandler.xpos() * win.getGuiScaledWidth() / win.getScreenWidth();
            double my = mc.mouseHandler.ypos() * win.getGuiScaledHeight() / win.getScreenHeight();
            for (var mod : modules) {
                if (mod.isVisible() && mod.isMouseOver((int) mx, (int) my)) {
                    dragTarget = mod;
                    dragOffX = (int) mx - mod.getX();
                    dragOffY = (int) my - mod.getY();
                    break;
                }
            }
        }

        if (alt && left && dragTarget != null) {
            double mx = mc.mouseHandler.xpos() * win.getGuiScaledWidth() / win.getScreenWidth();
            double my = mc.mouseHandler.ypos() * win.getGuiScaledHeight() / win.getScreenHeight();
            dragTarget.setX((int) mx - dragOffX);
            dragTarget.setY((int) my - dragOffY);
        }

        wasLeftDown = left;

        for (var mod : modules) {
            if (mod.isVisible()) mod.render(gg);
        }
    }

    public void saveConfig() {
        for (var mod : modules) {
            var data = config.getOrCreate(mod.getClass().getSimpleName());
            data.x = mod.getX();
            data.y = mod.getY();
            data.visible = mod.isVisible();
            data.color = mod.getColor();
            // [VOID-CLIENT ADDITION] persist style for CrosshairModule
            if (mod instanceof CrosshairModule cm) {
                data.style = cm.getStyle();
            }
        }
        config.save();
    }

    public List<HudModule> getModules() { return modules; }

    public static void reload() {
        if (instance != null) instance.saveConfig();
        instance = new HudManager();
    }
}