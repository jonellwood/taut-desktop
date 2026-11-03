# TAUT Alpha 1.1.1 — Graph runtime panic fix

The previous build declared Graph Tauri commands `async` and called `reqwest::blocking` directly inside them. That can panic during shutdown of the internal blocking HTTP client runtime. The Graph commands are now **synchronous Tauri commands**, which Tauri runs on its blocking command pool. The OAuth token exchange remains in `spawn_blocking`.

## Update

Replace `src-tauri/src/lib.rs` and `src/App.svelte` in your existing TAUT project, or use the full source bundle. Restart `npm run tauri dev`. No dependency reinstall or Entra change is required.

The localhost browser page confirms receipt of the authorization code, *not* that the token exchange and Graph requests succeeded. The new copy reflects that.

If `Signing in` persists, use the app window's developer console for JavaScript errors or run `RUST_BACKTRACE=1 npm run tauri dev` for Rust backtraces. Do not paste access tokens or callback query codes.

This patch has not been tested with a live tenant or compiled on macOS here.
