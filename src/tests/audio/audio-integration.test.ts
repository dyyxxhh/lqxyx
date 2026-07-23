// src/tests/audio/audio-integration.test.ts
// Task 4: Verify audio preload constants and PauseMenu wiring.
import { describe, it, expect } from 'vitest';

describe('Audio integration constants', () => {
  it('AUDIO_KEYS export contains all 10 BGM keys', async () => {
    const { AUDIO_KEYS } = await import('../../audio/AudioManager');
    expect(AUDIO_KEYS).toHaveLength(10);
    expect(AUDIO_KEYS).toContain('menu_bgm');
    expect(AUDIO_KEYS).toContain('chase_bgm');
    expect(AUDIO_KEYS).toContain('fb_burst_sfx');
  });

  it('AUDIO_FILE_PATHS export maps keys to .ogg file paths', async () => {
    const { AUDIO_FILE_PATHS } = await import('../../audio/AudioManager');
    expect(AUDIO_FILE_PATHS['menu_bgm']).toContain('assets/audio/bgm/');
    expect(AUDIO_FILE_PATHS['menu_bgm']).toContain('.ogg');
    expect(AUDIO_FILE_PATHS['explore_fs_bgm']).toContain('explore_fs_bgm.ogg');
  });

  it('AUDIO_KEYS and AUDIO_FILE_PATHS have matching keys', async () => {
    const { AUDIO_KEYS, AUDIO_FILE_PATHS } = await import('../../audio/AudioManager');
    for (const key of AUDIO_KEYS) {
      expect(AUDIO_FILE_PATHS[key]).toBeDefined();
    }
  });
});

describe('PauseMenu audio toggle wiring', () => {
  it('PauseMenu has setAudioToggleCallback method', async () => {
    const { PauseMenu } = await import('../../forgottenSanity/ui/PauseMenu');
    expect(typeof PauseMenu.prototype.setAudioToggleCallback).toBe('function');
  });

  it('PauseMenu has setPixelFilterToggleCallback method', async () => {
    const { PauseMenu } = await import('../../forgottenSanity/ui/PauseMenu');
    expect(typeof PauseMenu.prototype.setPixelFilterToggleCallback).toBe('function');
  });
});
