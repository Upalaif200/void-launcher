package io.voidlauncher.mod;

import io.voidlauncher.mod.gui.HudSettingsScreen;
import io.voidlauncher.mod.gui.ModuleEditorScreen;
import io.voidlauncher.mod.hud.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;

public class KeystrokesMod implements ClientModInitializer {
    private static KeyMapping settingsKey;
    private static KeyMapping editorKey;
    private static CpsModule cpsModule;
    private static boolean wasLeftDown, wasRightDown;

    @Override
    public void onInitializeClient() {
        System.out.println("[Void-Client] Mod loaded");

        var mgr = HudManager.getInstance();
        mgr.register(new KeystrokesModule());
        mgr.register(new ArmorStatusModule());
        mgr.register(new PotionStatusModule());
        mgr.register(new CrosshairModule());
        mgr.register(new FpsModule());
        cpsModule = new CpsModule();
        mgr.register(cpsModule);
        mgr.register(new CoordinatesModule());
        mgr.register(new DirectionModule());
        mgr.register(new SpeedModule());
        mgr.register(new PingModule());
        mgr.register(new TargetBlockModule());
        mgr.register(new TimeModule());
        mgr.register(new ScoreboardModule());
        mgr.register(new FullbrightModule());

        // [VOID-CLIENT ADDITION] CPS click capture via tick polling
        ClientTickEvents.START_CLIENT_TICK.register(client -> {
            if (client.player == null) { wasLeftDown = wasRightDown = false; return; }
            long handle = client.getWindow().handle();
            boolean left = GLFW.glfwGetMouseButton(handle, GLFW.GLFW_MOUSE_BUTTON_1) == GLFW.GLFW_PRESS;
            boolean right = GLFW.glfwGetMouseButton(handle, GLFW.GLFW_MOUSE_BUTTON_2) == GLFW.GLFW_PRESS;
            if (left && !wasLeftDown) cpsModule.addLeftClick();
            if (right && !wasRightDown) cpsModule.addRightClick();
            wasLeftDown = left;
            wasRightDown = right;
        });

        settingsKey = KeyBindingHelper.registerKeyBinding(new KeyMapping(
            "key.void-client.settings",
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            KeyMapping.Category.MISC
        ));

        editorKey = KeyBindingHelper.registerKeyBinding(new KeyMapping(
            "key.void-client.module-editor",
            GLFW.GLFW_KEY_RIGHT_CONTROL,
            KeyMapping.Category.MISC
        ));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (settingsKey.consumeClick() && client.screen == null) {
                client.setScreen(new HudSettingsScreen());
            }
            if (editorKey.consumeClick() && client.screen == null) {
                client.setScreen(new ModuleEditorScreen());
            }
        });
    }
}
