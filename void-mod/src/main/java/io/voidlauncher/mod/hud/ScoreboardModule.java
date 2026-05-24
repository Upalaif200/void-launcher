package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.scores.DisplaySlot;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.PlayerScoreEntry;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

public class ScoreboardModule extends HudModule {
    public ScoreboardModule() {
        super(2, 112);
    }

    @Override
    public void render(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        var player = mc.player;
        if (player == null) return;
        var level = mc.level;
        if (level == null) return;

        var sb = level.getScoreboard();
        Objective obj = sb.getDisplayObjective(DisplaySlot.SIDEBAR);
        if (obj == null) return;

        var font = mc.font;
        String title = obj.getDisplayName().getString();
        gg.drawString(font, title, x, y, 0xFFFFFF);

        var allEntries = new java.util.ArrayList<>(sb.listPlayerScores(obj));
        allEntries.sort(Comparator.comparingInt(PlayerScoreEntry::value).reversed());
        if (allEntries.size() > 5) allEntries = new java.util.ArrayList<>(allEntries.subList(0, 5));

        int i = 1;
        for (PlayerScoreEntry e : allEntries) {
            String line = e.owner() + ": " + e.value();
            gg.drawString(font, line, x, y + i * font.lineHeight, 0xAAAAAA);
            i++;
        }
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("WWWWWWWWWWWWWWWWW"); }
    @Override public int getHeight() { return 6 * Minecraft.getInstance().font.lineHeight; }
}
