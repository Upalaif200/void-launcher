package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.scores.DisplaySlot;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.PlayerScoreEntry;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class ScoreboardModule extends HudModule {
    private static final Comparator<PlayerScoreEntry> SCORE_CMP = Comparator.comparingInt(PlayerScoreEntry::value).reversed();

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
        gg.drawString(font, obj.getDisplayName().getString(), x, y, 0xFFFFFF);

        var all = new ArrayList<>(sb.listPlayerScores(obj));
        all.sort(SCORE_CMP);
        int limit = Math.min(all.size(), 5);
        var sb = new StringBuilder(32);
        for (int i = 0; i < limit; i++) {
            var e = all.get(i);
            sb.setLength(0);
            sb.append(e.owner()).append(": ").append(e.value());
            gg.drawString(font, sb.toString(), x, y + (i + 1) * font.lineHeight, 0xAAAAAA);
        }
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("WWWWWWWWWWWWWWWWW"); }
    @Override public int getHeight() { return 6 * Minecraft.getInstance().font.lineHeight; }
}
