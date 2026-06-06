# Problems: ying-zhong-jiu-game

## 2026-06-06 Task: start-work
- Risk: agents may accidentally scan/use `其他/`; every delegation must forbid it explicitly.
- Risk: agents may show `杨云红边`/`杨云蓝边` in UI text; every relevant delegation must enforce display name `杨云`.

## 2026-06-06 Task 3: script ambiguities
- Script defines `F-B` as closing countdown and executing `F-A`, then entering major ending `臊子`; `F-A` itself is not separately defined in the provided first-act script. Manifest records `F-B` directly as the trigger for `臊子`.
- B-1 says black-screen dialogue/portraits display normally; manifest models the required black-screen dialogue wait as a 500ms command while preserving the subsequent 3s/1s waits separately.
