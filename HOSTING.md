# Hosting Kauri's game

Kauri's game runs in the player's browser. Production serves static files: no Node process, database, account service or multiplayer server is needed. A desktop keyboard and mouse are required. Saves, language and sound preferences belong to the browser and origin; moving from localhost to a public hostname starts a separate local world. Nothing transfers saves automatically.

## Build and package

Use Node 22.12+ (or 24+), npm and GNU tar on the build machine:

```sh
npm ci
npm test
npm run build
node scripts/package-static.mjs
```

The last command creates `artifacts/kauris-<content-id>/` containing:

- `site/`: only `dist` files and beneficial Brotli/gzip sidecars.
- `site.tar.gz` and its SHA-256 receipt: the same served files, ready to extract.
- `manifest.json`: per-file hashes, raw/compressed bytes and total cold-load sizes, including the landing hero and windmill.
- `cache.caddy`: content-hash ETags for every file and the exact hashed JS/CSS entry paths allowed to cache immutably.

Serve only `site/`, never the repository or the metadata directory. The packager rejects symlinks and unexpected build files. Repeating packaging of identical output preserves the same content ID and archive. Keep the manifest and cache fragment alongside the release, outside its web root.

## Stage with Caddy

Install a pinned official [Caddy release](https://github.com/caddyserver/caddy/releases), verifying its archive against that release's published checksum. The hosting configuration uses standard Caddy modules. Caddy is a static origin behind an existing HTTPS ingress; the example binds only to loopback and does not acquire certificates or expose an admin API.

Set these variables to the generated release (replace the example ID):

```sh
export KAURI_PORT=4180
export KAURI_STATIC_ROOT="$PWD/artifacts/kauris-<content-id>/site"
export KAURI_CACHE_CONFIG="$PWD/artifacts/kauris-<content-id>/cache.caddy"
caddy validate --config hosting/Caddyfile --adapter caddyfile
caddy run --config hosting/Caddyfile --adapter caddyfile
```

Open `http://127.0.0.1:4180` in an isolated browser profile. Verify the landing, Play/Continue, language selection, pause and reload. The normal local development save is on a different origin and must remain untouched. Stop this foreground staging process with Ctrl-C.

HTML and stable filenames, including the hero and `orchard-windmill.glb`, use `Cache-Control: no-cache` so clients revalidate. Only the manifest's hashed JS/CSS paths use a year of immutable caching. Content-hash ETags remain valid after extracting the reproducible archive, whose file timestamps are fixed. Caddy negotiates [precompressed sidecars](https://caddyserver.com/docs/caddyfile/directives/file_server); missing assets return 404, with no application fallback or directory listing.

Before release, check actual HTTP responses: Brotli/gzip body hashes against the manifest, correct MIME types, `Vary: Accept-Encoding`, HTML/hero/model revalidation, hashed-entry immutable caching, conditional 304 and missing-file 404. Test the packaged site, not Vite's development or preview server.

## Deploy behind HTTPS

Choose the hostname and confirm ownership, ingress routing, port availability, HTTPS and the machine's availability policy. For a locally managed Cloudflare tunnel, prepare one hostname-to-`http://127.0.0.1:4180` ingress entry before its catch-all. Validate the complete configuration while preserving every existing route. Then configure DNS, reload the ingress and enable the dedicated static service.

The optional `hosting/kauris-static.service` is a **user-service template**, not an installer. It expects a verified Caddy binary under the user's `.local/bin`, this Caddyfile under `.config/kauris-host`, and releases under `.local/share/kauris-host`. Adapt and inspect it before installing. Confirm whether the user service manager remains available after logout before relying on unattended uptime.

Keep each release immutable in `releases/<content-id>/{site,manifest.json,cache.caddy}`. Point `current` at the accepted release using a new symlink followed by an atomic rename on the same filesystem. Validate the selected config and restart this static service to load its exact cache fragment. Retain the prior release; rollback switches `current` back and restarts only this service. Never replace or restart unrelated sites. Retain prior hashed assets during a rollout if in-flight old HTML must finish loading; never give stable-name assets immutable caching.

After deployment, verify HTTPS, the exact published JS/CSS hashes, cache and compression headers, an ordinary first visit and the existing saved world on that same origin. Do not import, reset or rewrite a user's world as a hosting test.

## What 100 players means

The server sends the initial files; simulation, rendering, sound and saving run independently on each player's device. There is no continuous gameplay connection. One hundred active players therefore do not create a hundred server simulations, but a burst of cold visits still transfers roughly 100 times the manifest's negotiated compressed total (plus HTTP/TLS overhead). Repeat visits usually reuse hashed files and revalidate stable ones. A tunnel/CDN may reduce origin traffic only when its actual cache behavior is confirmed.

Use the packaged manifest and measured uplink to estimate a cold-start burst. Transfer-time lower bound is `8 × bytes / uplink-bits-per-second`; latency, contention and tunnel behavior add time. Loopback request checks cannot establish WAN capacity or native rendering speed. Server process limits, household uplink, device GPU performance, machine sleep and tunnel uptime still matter. This is a small static workload, not proof that a specific host has been tested with 100 real players.
