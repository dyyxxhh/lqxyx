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

  it('renders Qin Haorui body and Dan Yuxuan standing without blocking movement', () => {
    const entries = buildStoryEntityDebugEntries({
      qinHaoruiBodyBloodyOnGround: true,
      danYuxuanStandingVisible: true,
    });

    expect(entries).toEqual([
      expect.objectContaining({ id: 'danYuxuanStanding' }),
      expect.objectContaining({ id: 'qinHaoruiProneBloody', textureKey: 'sprite.qinHaorui.lyingBloody' }),
    ]);
    expect(entries.every((entry) => entry.blocksMovement === false)).toBe(true);
  });

  it('renders headless body parts after head pickup; suppresses Dan Yuxuan body when A-2 ate it', () => {
    const danYuxuanAfterPickup = buildStoryEntityDebugEntries({
      danYuxuanBodyProneAndBloody: true,
      danYuxuanHeadPickedUp: true,
    });
    expect(danYuxuanAfterPickup).toEqual([
      expect.objectContaining({ id: 'danYuxuanBodyOnly', textureKey: 'sprite.danYuxuan.bodyPart' }),
    ]);

    const danYuxuanAfterA2Pickup = buildStoryEntityDebugEntries({
      danYuxuanBodyGoneHeadOnly: true,
      danYuxuanHeadPickedUp: true,
    });
    expect(danYuxuanAfterA2Pickup).toEqual([]);

    const qinHaoruiAfterPickup = buildStoryEntityDebugEntries({
      qinHaoruiBodyBloodyOnGround: true,
      qinHaoruiHeadPickedUp: true,
    });
    expect(qinHaoruiAfterPickup).toEqual([
      expect.objectContaining({ id: 'qinHaoruiBodyOnly', textureKey: 'sprite.qinHaorui.bodyPart' }),
    ]);
  });

  it('replay pickup flags keep full bodies visible until Yang Yun reaches each replay pickup beat', () => {
    const beforeReplayPickup = buildStoryEntityDebugEntries({
      danYuxuanBodyProneAndBloody: true,
      qinHaoruiBodyBloodyOnGround: true,
      danYuxuanHeadPickedUp: true,
      qinHaoruiHeadPickedUp: true,
    }, undefined, { danYuxuan: false, qinHaorui: false });
    expect(beforeReplayPickup).toEqual([
      expect.objectContaining({ id: 'danYuxuanProneBloody', textureKey: 'sprite.danYuxuan.lyingBloody' }),
      expect.objectContaining({ id: 'qinHaoruiProneBloody', textureKey: 'sprite.qinHaorui.lyingBloody' }),
    ]);

    const afterDanReplayPickup = buildStoryEntityDebugEntries({
      danYuxuanBodyProneAndBloody: true,
      qinHaoruiBodyBloodyOnGround: true,
      danYuxuanHeadPickedUp: true,
      qinHaoruiHeadPickedUp: true,
    }, undefined, { danYuxuan: true, qinHaorui: false });
    expect(afterDanReplayPickup).toEqual([
      expect.objectContaining({ id: 'danYuxuanBodyOnly', textureKey: 'sprite.danYuxuan.bodyPart' }),
      expect.objectContaining({ id: 'qinHaoruiProneBloody', textureKey: 'sprite.qinHaorui.lyingBloody' }),
    ]);
  });

  it('hides room-owned story entities while rendering the corridor', () => {
    const entries = buildStoryEntityDebugEntries(
      {
        danYuxuanStandingVisible: true,
        danYuxuanBodyProneAndBloody: true,
        qinHaoruiBodyBloodyOnGround: true,
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
