# Build resources

electron-builder reads this directory (`directories.buildResources`).

| File                     | Used by                                     |
| ------------------------ | ------------------------------------------- |
| `entitlements.mac.plist` | macOS hardened runtime (`mac.entitlements`) |
| `icon.svg`               | Source of the icon (edit this one)          |
| `icon.png`               | 1024×1024 render of `icon.svg`; Linux icon  |
| `icon.icns`              | macOS icon (`mac.icon`)                     |
| `icon.ico`               | Windows icon (`win.icon`)                   |

The icon is a vector fallback refined from `apps/web/public/favicon.svg`. Replace `icon.svg`
(and regenerate the three binaries) when final artwork exists.

## Regenerating the icons (macOS; no network, no new dependencies)

```sh
cd apps/desktop/build
inkscape icon.svg --export-type=png --export-filename=icon.png -w 1024 -h 1024
T=$(mktemp -d); mkdir "$T/icon.iconset"
for s in 16 24 32 48 64 128 256 512; do sips -z $s $s icon.png --out "$T/p$s.png"; done
cd "$T/icon.iconset"
cp ../p16.png icon_16x16.png;   cp ../p32.png icon_16x16@2x.png
cp ../p32.png icon_32x32.png;   cp ../p64.png icon_32x32@2x.png
cp ../p128.png icon_128x128.png; cp ../p256.png icon_128x128@2x.png
cp ../p256.png icon_256x256.png; cp ../p512.png icon_256x256@2x.png
cp ../p512.png icon_512x512.png
cd -; cp icon.png "$T/icon.iconset/icon_512x512@2x.png"
iconutil -c icns "$T/icon.iconset" -o icon.icns
```

`icon.ico` is a PNG-compressed ICO of the 16, 24, 32, 48, 64, 128 and 256 px renders, written
with a few lines of standard-library Python (an ICO header, one 16-byte directory entry per
size, then the PNG bytes).
