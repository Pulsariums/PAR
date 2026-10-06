# Time rule: when is a line visible

One rule, in one place (`src/core/time.ts`), used by the renderer, the timeline and the windowed sources.

## Visibility

```
visible  <=>  startMs <= tMs < endMs        (half-open)
```

- A line is gone at its end instant. When line A ends where line B starts (`1.00` / `1.00`, the usual case in released scripts) exactly one of them is visible at every instant: never both, never neither (a chain of contiguous lines always shows exactly one).
- `endMs <= startMs` (zero or negative duration) is never visible.
- This is the Aegisub / libass behaviour (libass: `start <= t < start + duration`).

## Integer milliseconds, never floats

ASS times are centiseconds, so event times become integers exactly: `msOf(seconds) = Math.round(seconds * 1000)` (1.15 s -> 1150, `0.1 + 0.2` -> 300). The media time is converted once:

| Situation | Conversion |
|---|---|
| no `videoFps` | `Math.round(t * 1000)` (what mpv passes to libass: `pts * 1000 + 0.5`, floored). `1.0004999 -> 1000`, `1.0005 -> 1001`. |
| `videoFps` set | frame `n = floor(t * fps + 1e-6)` (the epsilon absorbs float error such as `0.1 * 30`), evaluated at exactly `n / fps` and converted with ONE rounding: `Math.round(n * 1000 * den / num)`. |

NTSC rates are recognised (within 0.0005 of `n/1001`) and kept as fractions: `23.976 -> 24000/1001`, `29.97 -> 30000/1001`, `59.94 -> 60000/1001` (also 48000/1001, 120000/1001). Other rates: integers stay `fps/1`, a fractional rate `x` is `round(x * 1000) / 1000`. No time is accumulated by adding `1 / fps`.

`\fad`, `\t`, `\move`, `\k` use the same base: the time since the line start is `tMs - startMs`, an integer.

## Which frame shows a line (24 fps)

| line | frame at 1.000 s (n = 24) | frame at 1.042 s (n = 25) |
|---|---|---|
| start 1.02, end 1.50 | not yet | visible |
| start 1.00 | visible | visible |
| end 1.00 | gone | gone |
| end 1.50 (frame 36 = 1.500 s) | | gone on frame 36, visible on 35 |

A start between two frames shows on the next frame; an end between two frames is still visible on the earlier one. At 23.976 fps frame 24 is at 1.001 s, so a line starting at 1.00 is visible on it while one starting at 1.01 is not.

## `fps` vs `videoFps`

`fps` is how often PAR draws (10..200, or every video frame). `videoFps` is the frame grid time snaps to. They are independent: `fps: 120` with `videoFps: 24` draws 120 times per second but every drawing uses the 24 fps frame time. Without `videoFps` the time goes straight to ms, the boundary rule is the same.

## Windowed sources

A window `[t0, t1)` contains an event when `endMs > startMs && startMs < t1Ms && endMs > t0Ms`, on integer ms. Adjacent windows `[0, 1)` and `[1, 2)` never both contain, nor both miss, an event that starts or ends exactly at 1.000 s; events that span the border are in both (the renderer de-duplicates by `index`).

## Verify it yourself

Playground preset "Time boundaries" plus the Lab: pick 24 / 30 / 60 / 23.976 video fps and step frame by frame (arrow keys). Tests: `test/lab-time.test.ts` (table of fps x random centisecond boundaries, float traps, mid-frame starts / ends, window borders).
