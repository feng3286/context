# Risky Area: Updater And Packaging

## Main Files

- `src/main/core/updates/AutoUpdateService.ts`
- `src/main/core/updates/controller.ts`
- `electron-builder.config.ts`
- `scripts/release/` — Release build orchestration (build.ts, upload-r2.ts, notarize-mac.ts, verify-mac.ts, verify-win.ts)
- `.github/workflows/release.yml` — CI release pipeline (mac, win, linux parallel builds)
- `.github/workflows/nix-build.yml` — Nix-based build
- `.github/workflows/windows-beta-build.yml` — Windows beta CI

## Rules

- Avoid changing updater defaults casually
- Treat signing, notarization, packaging targets, and native rebuild flow as release-critical
- Keep build output directories and packaging config stable unless the task is explicitly about release behavior
- `UPDATE_CHANNEL` in `src/shared/app-identity.ts` must match the electron-builder publish `channel` config
- Release workflow creates a GitHub Release with `gh release create --latest` (first platform wins), then uploads assets

## Current Notes

- macOS, Linux, and Windows release jobs rebuild native modules for the target Electron version
- Release workflow includes 30-minute build timeouts and release existence checks to prevent duplicate releases
- CI uploads update manifests (`latest*.yml`) alongside platform binaries
- Native module rebuild: `scripts/release/rebuild-native.ts`
