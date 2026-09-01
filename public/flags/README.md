# Flag icons

Circular SVG flags vendored from [`circle-flags`](https://github.com/HatScripts/circle-flags) (MIT), pinned as a devDependency.

Files are copied verbatim from `node_modules/circle-flags/flags/<code>.svg` (ISO 3166-1 alpha-2, lowercase). Used by `app/_components/HeroQueen`.

To refresh / add a locale:

```sh
npm i -D circle-flags@latest
cp node_modules/circle-flags/flags/{jp,us,kr,cn,de,es,fr,ru}.svg public/flags/
```

Currently vendored: `jp`, `us`, `kr`, `cn`, `de`, `es`, `fr`, `ru`.
