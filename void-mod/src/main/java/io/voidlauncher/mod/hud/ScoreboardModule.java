package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.Score;
import net.minecraft.world.scores.Scoreboard;

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
        Scoreboard sb = player.getScoreboard();
        Objective obj = sb.getDisplayObjective(net.minecraft.world.scores.criteria.ObjectiveCriteria.RenderType.INTEGER);
        if (obj == null) obj = sb.getDisplayObjective(net.minecraft.world.scores.criteria.ObjectiveCriteria.RenderType.HEARTS);
        if (obj == null) return;

        var font = mc.font;
        String title = obj.getDisplayName().getString();
        gg.drawString(font, title, x, y, 0xFFFFFF);

        List<Score> scores = sb.getPlayerScores(obj)
            .stream()
            .sorted(Comparator.comparingInt(Score::value).reversed())
            .limit(5)
            .collect(Collectors.toList());

        int i = 1;
        for (Score s : scores) {
            String line = s.owner() + ": " + s.value();
            gg.drawString(font, line, x, y + i * font.lineHeight, 0xAAAAAA);
            i++;
        }
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("WWWWWWWWWWWWWWWWW"); }
    @Override public int getHeight() { return 6 * Minecraft.getInstance().font.lineHeight; }
}
