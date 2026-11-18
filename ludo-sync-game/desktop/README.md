# Ludo Sync for desktop

The same bundle as the Android app in an Electron window, so every game works offline. Online play and friends use the deployed site.

```
cd ludo-sync-game
npm ci && npm run build:native      # builds the shared bundle into out/
cd desktop
npm install
node prepare.mjs                    # copies out/ into app/
npm start                           # run it
npm run dist:linux                  # AppImage, deb, pacman (.pkg.tar.xz), tar.gz  (needs bsdtar + zstd)
npm run dist:win                    # NSIS installer, portable exe, zip  (installer needs Windows or Wine)
```

Install: AppImage `chmod +x` and run; Debian/Ubuntu `sudo apt install ./ludo-sync-*.deb`; Arch `sudo pacman -U ludo-sync-*.pkg.tar.xz`.
