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
    private final AnimationController animator = new AnimationController();
    private HudModule dragTarget;
    private int dragOffX, dragOffY;
    private boolean wasLeftDown;
    private CrosshairModule crosshairModule;

    private HudManager() {
        this.config = ModuleConfig.load();
    }

    public static HudManager getInstance() {
        if (instance == null) instance = new HudManager();
        return instance;
    }

    public AnimationController getAnimator() { return animator; }

    public void register(HudModule module) {
        var data = config.getOrCreate(module.getClass().getSimpleName());
        module.setX(data.x);
        module.setY(data.y);
        module.setVisible(data.visible);
        module.setColor(data.color);
        module.setScale(data.scale);
        module.setAlpha(data.alpha);
        module.setAnimation(data.animation);
        module.setForm(data.form);
        if (module instanceof CrosshairModule cm) {
            cm.setStyle(data.style);
            crosshairModule = cm;
        }
        modules.add(module);
    }

    public CrosshairModule getCrosshairModule() { return crosshairModule; }

    public void renderAll(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        if (mc.screen != null || mc.player == null) return;

        animator.tick();

        var win = mc.getWindow();
        long handle = win.handle();
        boolean left = GLFW.glfwGetMouseButton(handle, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean alt = GLFW.glfwGetKey(handle, GLFW.GLFW_KEY_LEFT_ALT) == GLFW.GLFW_PRESS;

        if (alt) {
            if (!left && wasLeftDown) {
                if (dragTarget != null) {
                    saveConfig();
                    dragTarget = null;
                }
            }
            if (left) {
                if (!wasLeftDown) {
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
                } else if (dragTarget != null) {
                    double mx = mc.mouseHandler.xpos() * win.getGuiScaledWidth() / win.getScreenWidth();
                    double my = mc.mouseHandler.ypos() * win.getGuiScaledHeight() / win.getScreenHeight();
                    dragTarget.setX((int) mx - dragOffX);
                    dragTarget.setY((int) my - dragOffY);
                }
            }
        }

        wasLeftDown = left;

        var anim = animator;
        var modList = modules;
        int size = modList.size();
        for (int i = 0; i < size; i++) {
            var mod = modList.get(i);
            if (!mod.isVisible()) continue;

            int ox = anim.getXOffset(mod.getAnimation());
            int oy = anim.getYOffset(mod.getAnimation());
            if (ox != 0 || oy != 0) {
                mod.setX(mod.getX() + ox);
                mod.setY(mod.getY() + oy);
                mod.render(gg);
                mod.setX(mod.getX() - ox);
                mod.setY(mod.getY() - oy);
            } else {
                mod.render(gg);
            }
        }
    }

    public void saveConfig() {
        for (var mod : modules) {
            var data = config.getOrCreate(mod.getClass().getSimpleName());
            data.x = mod.getX();
            data.y = mod.getY();
            data.visible = mod.isVisible();
            data.color = mod.getColor();
            data.scale = mod.getScale();
            data.alpha = mod.getAlpha();
            data.animation = mod.getAnimation();
            data.form = mod.getForm();
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
