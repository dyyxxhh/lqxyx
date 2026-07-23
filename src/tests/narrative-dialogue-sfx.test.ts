import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { NarrativeUIManager } from '../ui/NarrativeUIManager';

function chainableUiObject(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const object: Record<string, unknown> = { visible: false, ...extra };
  object.setOrigin = vi.fn(() => object);
  object.setScrollFactor = vi.fn(() => object);
  object.setDepth = vi.fn(() => object);
  object.setVisible = vi.fn((visible: boolean) => {
    object.visible = visible;
    return object;
  });
  object.setStrokeStyle = vi.fn(() => object);
  object.setShadow = vi.fn(() => object);
  object.setText = vi.fn((text: string) => {
    object.text = text;
    return object;
  });
  object.setDisplaySize = vi.fn(() => object);
  object.setTexture = vi.fn(() => object);
  object.setScale = vi.fn(() => object);
  object.setFillStyle = vi.fn(() => object);
  object.setInteractive = vi.fn(() => object);
  object.on = vi.fn(() => object);
  object.width = 100;
  object.height = 100;
  return object;
}

function createMockScene() {
  return {
    add: {
      rectangle: vi.fn(() => chainableUiObject()),
      text: vi.fn(() => chainableUiObject()),
      image: vi.fn(() => chainableUiObject({ originX: 0.5, originY: 0.5 })),
    },
  };
}

describe('NarrativeUIManager dialogue SFX', () => {
  it('setOnSfxCallback is defined on the prototype', () => {
    expect(NarrativeUIManager.prototype.setOnSfxCallback).toBeDefined();
  });

  it('setOnSfxCallback registers a callback that fires on dialogue advance', () => {
    const mockScene = createMockScene();
    const ui = new NarrativeUIManager(mockScene as unknown as Phaser.Scene);
    const cb = vi.fn();
    ui.setOnSfxCallback(cb);

    // Trigger dialogue advance
    ui.setDialogue('speaker1', 'text', undefined, true);

    // The callback should be called with 'dialogueAdvance' and 'speakerChange'
    expect(cb).toHaveBeenCalledWith('speakerChange');
    expect(cb).toHaveBeenCalledWith('dialogueAdvance');
  });

  it('speakerChange SFX only fires when speaker changes', () => {
    const mockScene = createMockScene();
    const ui = new NarrativeUIManager(mockScene as unknown as Phaser.Scene);
    const cb = vi.fn();
    ui.setOnSfxCallback(cb);

    // First call with speaker A
    ui.setDialogue('Alice', 'hello', undefined, true);
    const speakerChangeCalls1 = cb.mock.calls.filter(c => c[0] === 'speakerChange').length;
    expect(speakerChangeCalls1).toBe(1);

    // Second call with same speaker — no speakerChange
    ui.setDialogue('Alice', 'world', undefined, true);
    const speakerChangeCalls2 = cb.mock.calls.filter(c => c[0] === 'speakerChange').length;
    expect(speakerChangeCalls2).toBe(1); // still 1, not 2

    // Third call with different speaker — speakerChange fires
    ui.setDialogue('Bob', 'hi', undefined, true);
    const speakerChangeCalls3 = cb.mock.calls.filter(c => c[0] === 'speakerChange').length;
    expect(speakerChangeCalls3).toBe(2);
  });

  it('dialogueAdvance fires on every visible dialogue set', () => {
    const mockScene = createMockScene();
    const ui = new NarrativeUIManager(mockScene as unknown as Phaser.Scene);
    const cb = vi.fn();
    ui.setOnSfxCallback(cb);

    ui.setDialogue('Alice', 'line1', undefined, true);
    ui.setDialogue('Alice', 'line2', undefined, true);
    ui.setDialogue('Alice', 'line3', undefined, true);

    const advanceCalls = cb.mock.calls.filter(c => c[0] === 'dialogueAdvance').length;
    expect(advanceCalls).toBe(3);
  });

  it('setRolePrompt fires realityTear SFX', () => {
    const mockScene = createMockScene();
    const ui = new NarrativeUIManager(mockScene as unknown as Phaser.Scene);
    const cb = vi.fn();
    ui.setOnSfxCallback(cb);

    ui.setRolePrompt('yangYunBlue');

    expect(cb).toHaveBeenCalledWith('realityTear');
  });

  it('emitSfx is no-op when no callback registered', () => {
    const mockScene = createMockScene();
    const ui = new NarrativeUIManager(mockScene as unknown as Phaser.Scene);
    // Should not throw
    expect(() => ui.setDialogue('Alice', 'hello', undefined, true)).not.toThrow();
  });
});
