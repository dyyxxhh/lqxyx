import { describe, it, expectTypeOf } from 'vitest';
import type { ForgottenSanityTestHooks } from '../../../forgottenSanity/ForgottenSanityScene';

describe('window globals — forgotten sanity', () => {
  it('__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__ 类型为 ForgottenSanityTestHooks | undefined', () => {
    expectTypeOf(window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__).toEqualTypeOf<ForgottenSanityTestHooks | undefined>();
  });
  it('__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__ 类型为 boolean | undefined', () => {
    expectTypeOf(window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__).toEqualTypeOf<boolean | undefined>();
  });
});
