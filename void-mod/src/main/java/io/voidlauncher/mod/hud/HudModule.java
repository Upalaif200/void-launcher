package io.voidlauncher.mod.hud;

import net.minecraft.client.gui.GuiGraphics;

public abstract class HudModule {
    protected int x, y;
    protected boolean visible = true;
    protected int color = 0xFFFFFFFF;
    protected float scale = 1.0f;
    protected float alpha = 1.0f;
    protected int animation;
    protected int form;

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

    public float getScale() { return scale; }
    public void setScale(float s) { this.scale = s; }
    public float getAlpha() { return alpha; }
    public void setAlpha(float a) { this.alpha = a; }
    public int getAnimation() { return animation; }
    public void setAnimation(int a) { this.animation = a; }
    public int getForm() { return form; }
    public void setForm(int f) { this.form = f; }

    public float getRenderScale() {
        return scale * HudManager.getInstance().getAnimator().getScaleMultiplier(animation);
    }

    public float getRenderAlpha() {
        return alpha * HudManager.getInstance().getAnimator().getAlphaMultiplier(animation);
    }

    public String getDisplayName() {
        return getClass().getSimpleName().replace("Module", "");
    }

    public boolean isMouseOver(int mx, int my) {
        return mx >= x && mx < x + getWidth() && my >= y && my < y + getHeight();
    }

    protected int applyAlpha(int argb) {
        int a = (int) ((argb >> 24 & 0xFF) * getRenderAlpha());
        return (a << 24) | (argb & 0x00FFFFFF);
    }
}
