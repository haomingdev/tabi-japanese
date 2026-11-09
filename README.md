# Tabi — Japanese for the journey

Learn practical Japanese with Tabi, an offline-ready PWA featuring progressive lessons, A1–B2 stories, flashcards, pronunciation support, and travel conversation practice. No login required.

Buildless, public Japanese travel-learning PWA. Everything under `dist/` is shipped. Learning progress, favourites and review scheduling retain the `tabi.learning.v1` localStorage key. No login or server-side learner data is required.

## Updating the app

After any change in `dist/`, run:

```sh
node scripts/prepare-pwa.mjs
node --test tests/offline.test.cjs
node --check dist/app.js
node --check dist/pwa.js
node --check dist/sw.js
```

The preparation script fingerprints the app files and service-worker template to create a new cache version automatically. Edit `scripts/sw-template.js`, rather than the generated `dist/sw.js`. Publish the exact prepared tree using the Sites workflow.

## Offline behavior

The worker precaches all 30 lessons, 120 phrases, kana, practice scenes, CSS, scripts, manifest and icons. It only intercepts the app shell and explicit same-origin assets. The app reports Ready offline only after checking every required cached response. A failed or interrupted download never reports ready. The Settings page can verify files without fetching from the network, and repair missing files while online; repair checks file hashes to avoid mixing releases.

Updates remain waiting until the visitor chooses Update app. App updates leave progress storage untouched. Old Tabi caches are removed after the new complete release activates; other apps' caches are preserved.

Japanese speech prefers local system voices. When offline, remote-only voices are excluded and reading exercises are offered. Speech synthesis is not an audio asset download: users need a downloaded Japanese system voice for offline playback. Optional microphone recording stays on the device.

## Install on a phone

On iPhone, open the public URL in Safari, Share → Add to Home Screen (Open as Web App if offered). On Android, use Chrome's Install app or Add to Home screen action. Open the installed app once while connected and wait for Ready offline. Then test reopening and a lesson in airplane mode. Browser and installed app storage may be separate, so export/import progress when switching.

No external fonts or runtime dependencies are needed. External reference links require a connection. Device storage can be cleared by the user or the browser; progress export remains available for backups.

## Run locally

The app uses plain HTML, CSS and JavaScript. No package installation is needed. With Python 3 installed, run from the project folder:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. Serve the contents of `dist/` at the domain root when deploying to another static host. PWA installation and service workers require HTTPS in production.

Node.js 20 or later is needed only for the maintenance script and tests listed above. The exported source includes all 13 chaptered A1–B2 stories and the app icons.

The `.openai/hosting.json` file records the original ChatGPT Sites project and its static directory. Other static hosts only need the `dist/` folder.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 haomingdev.
