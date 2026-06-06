# Problems: ying-zhong-jiu-game

## 2026-06-06 Task: start-work
- Risk: agents may accidentally scan/use `其他/`; every delegation must forbid it explicitly.
- Risk: agents may show `杨云红边`/`杨云蓝边` in UI text; every relevant delegation must enforce display name `杨云`.

## 2026-06-06 Task 3: script ambiguities
- Script defines `F-B` as closing countdown and executing `F-A`, then entering major ending `臊子`; `F-A` itself is not separately defined in the provided first-act script. Manifest records `F-B` directly as the trigger for `臊子`.
- B-1 says black-screen dialogue/portraits display normally; manifest models the required black-screen dialogue wait as a 500ms command while preserving the subsequent 3s/1s waits separately.

## 2026-06-06 Task 5: map schema ambiguities
- Exact pixel coordinates for the near-1:1 corridor remain placeholders because Task 5 is schema/tests only; T11 should visually tune coordinates against `设计/楼道.jpg` while preserving the tested door identities, order, and non-interaction guardrails.

## 2026-06-06 Task 6: runtime shell follow-up risks
- Downstream tasks should treat the Task 6 `menu` debug state as shell readiness only; it is not a final UI manager or input contract.
- Future UI/input work should preserve preload failure blocking: failed preload must leave `currentScene` as `PreloadScene` and keep `preload.canEnterGame` false.
