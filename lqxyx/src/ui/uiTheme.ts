import Phaser from 'phaser';

export const UI_THEME = {
  colors: {
    surface: 0x08070a,
    surfaceRaised: 0x141018,
    surfaceMuted: 0x211821,
    border: 0x6b1f2c,
    borderBlue: 0x1f3f6b,
    borderMuted: 0x49313a,
    accent: 0xb01724,
    accentHover: 0xd12a3a,
    accentPressed: 0x7f101a,
    gold: 0xd7b15c,
    text: '#f4efe6',
    textMuted: '#c9b9a6',
    textDanger: '#ff7a72',
    textGold: '#d7b15c',
    shadow: '#050305',
  },
  alpha: {
    panel: 0.88,
    panelStrong: 0.94,
    control: 0.68,
    controlActive: 0.86,
    ghost: 0.18,
  },
  font: {
    ui: 'monospace',
  },
  stroke: {
    thin: 2,
    medium: 3,
  },
} as const;

export function applyPixelTextStyle(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  if (typeof text.setShadow === 'function') {
    return text.setShadow(2, 2, UI_THEME.colors.shadow, 0, false, true);
  }
  return text;
}

interface PixelStrokeTarget {
  setStrokeStyle?: (lineWidth: number, color: number, alpha?: number) => unknown;
}

export function applyPixelStrokeStyle<T extends PixelStrokeTarget>(
  object: T,
  lineWidth: number,
  color: number,
  alpha = 1,
): T {
  if (typeof object.setStrokeStyle === 'function') {
    object.setStrokeStyle(lineWidth, color, alpha);
  }
  return object;
}
