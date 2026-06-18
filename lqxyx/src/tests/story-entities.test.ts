import { describe, expect, it } from 'vitest';

import { buildStoryEntityDebugEntries } from '../scenes/storyEntities';

describe('story entity visibility from flags', () => {
  it('renders Dan Yuxuan as a non-blocking standing story character before body flags', () => {
    expect(buildStoryEntityDebugEntries({ danYuxuanStandingVisible: true })).toEqual([
      expect.objectContaining({
        id: 'danYuxuanStanding',
        textureKey: 'sprite.danYuxuan.standRight',
        blocksMovement: false,
      }),
    ]);
    expect(buildStoryEntityDebugEntries({})).toEqual([]);
  });

  it('renders Dan Yuxuan prone bloody, prone clean, or head-only according to flags', () => {
    expect(buildStoryEntityDebugEntries({ danYuxuanBodyProneAndBloody: true })).toEqual([
      expect.objectContaining({ id: 'danYuxuanProneBloody', textureKey: 'sprite.danYuxuan.lyingBloody' }),
    ]);

    expect(buildStoryEntityDebugEntries({ danYuxuanBodyProneClean: true })).toEqual([
      expect.objectContaining({ id: 'danYuxuanProneClean', textureKey: 'sprite.danYuxuan.lyingClean' }),
    ]);

    expect(buildStoryEntityDebugEntries({ danYuxuanBodyProneAndBloody: true, danYuxuanBodyGoneHeadOnly: true })).toEqual([
      expect.objectContaining({ id: 'danYuxuanHeadOnly', textureKey: 'sprite.danYuxuan.headPart' }),
    ]);
  });

  it('renders Qin Haorui body and both head pickup parts without blocking movement', () => {
    const entries = buildStoryEntityDebugEntries({
      qinHaoruiBodyBloodyOnGround: true,
      headPickupPartsVisible: true,
      danYuxuanStandingVisible: true,
    });

    expect(entries).toEqual([
      expect.objectContaining({ id: 'danYuxuanStanding' }),
      expect.objectContaining({ id: 'qinHaoruiProneBloody', textureKey: 'sprite.qinHaorui.lyingBloody' }),
      expect.objectContaining({ id: 'danYuxuanHeadPickup', textureKey: 'sprite.danYuxuan.headPart' }),
      expect.objectContaining({ id: 'qinHaoruiHeadPickup', textureKey: 'sprite.qinHaorui.headPart' }),
    ]);
    expect(entries.every((entry) => entry.blocksMovement === false)).toBe(true);
  });

  it('hides room-owned story entities while rendering the corridor', () => {
    const entries = buildStoryEntityDebugEntries(
      {
        danYuxuanStandingVisible: true,
        danYuxuanBodyProneAndBloody: true,
        qinHaoruiBodyBloodyOnGround: true,
        headPickupPartsVisible: true,
      },
      { floorId: '4F', roomId: null },
    );

    expect(entries).toEqual([]);
  });

  it('renders only entities owned by the active room', () => {
    expect(buildStoryEntityDebugEntries({ danYuxuanStandingVisible: true }, { floorId: '4F', roomId: 'gt1-classroom' })).toEqual([
      expect.objectContaining({ id: 'danYuxuanStanding', roomId: 'gt1-classroom' }),
    ]);
    expect(buildStoryEntityDebugEntries({ qinHaoruiBodyBloodyOnGround: true }, { floorId: '4F', roomId: 'gt1-classroom' })).toEqual([]);
    expect(buildStoryEntityDebugEntries({ qinHaoruiBodyBloodyOnGround: true }, { floorId: '4F', roomId: 'gt2-classroom' })).toEqual([
      expect.objectContaining({ id: 'qinHaoruiProneBloody', roomId: 'gt2-classroom' }),
    ]);
  });
});
