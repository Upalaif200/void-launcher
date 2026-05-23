package io.voidlauncher.mod.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

public class ModuleConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path CONFIG_PATH = FabricLoader.getInstance().getConfigDir().resolve("void-client.json");

    final Map<String, ModuleData> modules = new HashMap<>();

    public static class ModuleData {
        public int x, y;
        public boolean visible = true;
        public int color = 0xFFFFFFFF;
        public int style; // [VOID-CLIENT ADDITION] for CrosshairModule style
    }

    public ModuleData getOrCreate(String name) {
        return modules.computeIfAbsent(name, k -> new ModuleData());
    }

    public void save() {
        try {
            Files.createDirectories(CONFIG_PATH.getParent());
            Files.writeString(CONFIG_PATH, GSON.toJson(this));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public static ModuleConfig load() {
        if (Files.exists(CONFIG_PATH)) {
            try {
                var type = new TypeToken<Map<String, ModuleData>>(){}.getType();
                Map<String, ModuleData> map = GSON.fromJson(Files.readString(CONFIG_PATH), type);
                var cfg = new ModuleConfig();
                if (map != null) cfg.modules.putAll(map);
                return cfg;
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        return new ModuleConfig();
    }
}