# TAUT Alpha 1.4.0 — Receiving attachments

- Graph `reference` attachments now render as file cards with HTTPS links.
- Hosted images referenced in message HTML can be loaded on demand through the Rust Graph adapter.
- Images use an 8 MB size limit and allow PNG, JPEG, GIF and WebP.
- No additional Microsoft Graph permissions requested.
- No files are written to disk and tokens stay in Rust. Images are held in memory until app exit.
- Sending attachments, images hosted outside Graph, and thumbnails are not implemented.
- Compilation and a live Teams image test are still needed.
