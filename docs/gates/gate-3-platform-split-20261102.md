# Gate 3 platform split

Owner decision, 2026-11-02. Gate 3 is recorded separately for macOS and Windows. A platform may pass and
start Phase 4 work that does not depend on the other. V1 is still done only when every completion item
works on both platforms. This records no gate approval.

## Why

The plan requires both platforms for V1 but gives no reason for moving them through each gate together.
Windows is now blocked by live transcription speed on its own hardware, which does not block Mac work.

If a Windows fix changes shared live code, rerun the affected Mac checks.

## Live speed evidence

| Check                      | Mac, real call, 10 min | Windows, one busy track | Windows, two busy tracks |
| -------------------------- | ---------------------- | ----------------------- | ------------------------ |
| Build                      | `fb2d96c`              | `8d3045b`               | `8d3045b`                |
| Live/final meeting words   | 1,081/1,093            | 697/725                 | 436/726                  |
| Overflow frames, per track | 0 and 0                | 0 and 0                 | 629 and 642              |
| Slowest hop, ms, per track | 324 and 459            | 1,874 and 2,172         | 5,661 and 4,218          |
| Median delay               | not measured           | 3.944 s, estimated      | 12.59 s, calibrated      |

## Open before a platform can pass

- Both: calibrated live delay with both tracks busy.
- Both: the worker-kill, format import and cancelled or failed import checks on the final build.
- Mac: the 15% word-error comparison on the candidate build, because the Teams run had no reference text.
- Windows: a live setup that keeps up with two busy tracks. `speechLive`, `threads` and `audioContext` are
  configuration, so testing them needs no code change.
