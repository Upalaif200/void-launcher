package io.voidlauncher.mod.hud;

import net.minecraft.client.gui.GuiGraphics;

public abstract class HudModule {
    protected int x, y;
    protected boolean visible = true;
    protected int color = 0xFFFFFFFF;

    protected HudModule(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public abstract void render(GuiGraphics gg);
    public abstract int getWidth();
    public abstract int getHeight();

    public int getX() { return x; }
    public void setX(int x) { this.x = x; }
    public int getY() { return y; }
    public void setY(int y) { this.y = y; }
    public boolean isVisible() { return visible; }
    public void setVisible(boolean v) { this.visible = v; }
    public int getColor() { return color; }
    public void setColor(int c) { this.color = c; }
    public boolean isMouseOver(int mx, int my) {
        return mx >= x && mx < x + getWidth() && my >= y && my < y + getHeight();
    }
}