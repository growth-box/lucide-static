# @gb/lucide-static

Scoped repackaging of `lucide-static` with the upstream SVG assets plus generated PNG and WEBP outputs.

## Installation

```sh
npm install @gb/lucide-static
```

## Contents

- `icons/*.svg`: upstream Lucide SVG icons
- `png/icons/*.png`: generated PNG icons
- `webp/icons/*.webp`: generated WEBP icons
- `sprite.svg`, `png/sprite.png`, `webp/sprite.webp`: SVG sprite source plus raster preview sheets
- `font/`: upstream icon font assets
- `png/font/*.png`, `webp/font/*.webp`: raster previews for the SVG font assets
- `dist/`: upstream JavaScript bundles from `lucide-static`
- `icon-nodes.json` and `tags.json`: upstream metadata

## Notes

- The package is based on `lucide-static@1.8.0`.
- `sprite.svg`, `font/lucide.symbol.svg`, and `font/lucide.svg` are container assets, so their PNG and WEBP outputs are generated as preview sheets.

## License

Lucide is licensed under the ISC license. See `LICENSE`.
