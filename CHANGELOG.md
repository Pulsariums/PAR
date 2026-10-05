# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-05

First standalone release of PAR (Pulsar ASS Renderer), extracted from the
`PAR-pocket` engine of Pulsar Editor and rewritten as an independent library.

### Added
- Full `.ass` / `.ssa` file parser: `[Script Info]` (PlayResX/Y with libass fallbacks,
  LayoutResX/Y, ScaledBorderAndShadow, WrapStyle), `[V4+ Styles]` / `[V4 Styles]` and
  `[Events]` driven by their `Format:` lines; BOM, CRLF and missing sections handled;
  `Comment:` lines skipped; deterministic, index-based event ids.
- Parenthesis-aware override lexer; ordered tag operations so `\t` and static tags
  interact exactly in source order (libass semantics).
- `\t` with nested tags, optional times and acceleration, including rect `\clip` animation.
- Line-level tag precedence per libass (first `\pos`/`\move`, `\org`, `\an`/`\a`,
  `\fad`/`\fade`; last `\clip`/`\iclip`, `\q`).
- Karaoke `\k \K \kf \ko \kt` timing and rendering (colour switch, left-to-right sweep, outline reveal).
- DOM/SVG/CSS renderer: one CSS-scaled stage per overlay, line DOM built once and only
  animated properties updated per frame, clip-path clips, SVG drawings, BorderStyle 3,
  collision stacking for unpositioned lines.
- Plug-and-play API: `create({ video | container, subtitle, region, layout, fps, videoFps, clock, timeOffset, fontMap })`.
- Region modes: letterbox-aware video content rect (`object-fit` contain/cover/fill/none/scale-down),
  whole container, or explicit rect. Render FPS `'auto'` (requestVideoFrameCallback / rAF) or 10..200.
- ESM, CJS and IIFE (`window.PAR`) builds with TypeScript declarations; demo page.

### Fixed (compared to PAR-pocket)
- `\t` parsing with nested parentheses and acceleration.
- Vector drawings rendering empty.
- DOM rebuilt every frame; random line ids; comment lines rendered; video fps used as render fps.
- README claims that were not true (GPU acceleration, font crawler).
