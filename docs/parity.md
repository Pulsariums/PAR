# libass parity

Behaviour re-implemented independently from reading libass (ISC) and measuring it with JASSUB as an oracle; no libass or
JASSUB code is used. Scope: logic and layout rules, not pixel-identical rasterisation (see `docs/accuracy.md`).

## Matches libass

| Area | Rule |
|---|---|
| ScaledBorderAndShadow default | Missing key = no; yes only with a non-standard `[V4+ Styles]` Format line (`custom_format_line_compatibility`); `parse_bool` = "yes" prefix or number > 0 |
| Border / shadow / blur base | `init_font_scale`: yes = PlayRes (1 in layout units); no = layout height / storage height; blur always layout / storage. Storage = script LayoutResX/Y, else the video's pixel size, else unknown (then 1, like libass without a storage size) |

## Intentionally different

| Area | PAR | libass | Why |
|---|---|---|---|
| Scripts without PlayRes | 1920x1080 (`defaultLayout`: `'1080p'`, `'720p'`, `'libass'`, `{width,height}`) | 384x288 | Modern players and encoders assume HD; `defaultLayout: 'libass'` restores it |
| One PlayRes side only | other side from the region aspect ratio (16:9 default) | 4:3 rule | Same, `'libass'` keeps the 4:3 rule |
| Timestamps | decimal fraction (`1.5` = 1500 ms) | `sscanf` quirk (`1.5` = 1050 ms) | libass quirk is not copied |
| Pixel raster | browser text and CSS/SVG filters | FreeType + own blur | see `docs/accuracy.md` |
