# Mewly

`mewly` is the Android-oriented client project for a pet abnormal-behavior recognition flow backed by `babycat`.

The current baseline is a full copy of `../babycat/client/android/src` taken at `babycat` commit `02e63c9` (the Capacitor Android client with the Nocturne UI). `mewly` keeps its own toolchain and packaging on top of that copy.

## Project Relationship

- `../babycat` owns the edge-AI backend: RTSP camera input, VLM inference, event detection, clip recording, API, and streaming services.
- `../babycat/client/android` is the upstream Capacitor Android client. `mewly` re-forks from it and customizes.
- `babycat` remains the source of truth for runtime API behavior.

## Current Baseline

Copied from upstream at `babycat` `02e63c9`:

- `src/`, `index.html`, and the `fonts/` and `icons/` public assets
- Nocturne design system, sheet-based mobile UI (`MainView`, `LiveMobile`, `ClipsMobile`)
- host resolution from the login screen (session -> stored -> browser); no build-time host injection in app code

Kept as `mewly` customizations:

- toolchain: Capacitor 8, Vite 7, vue-router 5, hls.js 1.6 (upstream uses Capacitor 7 / Vite 6 / vue-router 4)
- `capacitor.config.json` (`com.mewly.app`), the Capacitor 8 `android/` project, and the Docker Android build
- `src/composables/useAndroidStatusBar.js`, wired app-wide in `App.vue`
- `mewly` branding: `index.html` title and banner images in `public/`

## Development

Create or update `.env`:

```sh
cp .env.example .env
```

```env
HOST_IP=172.27.1.205
MEWLY_WEB_PORT=5177
```

`HOST_IP` should be reachable from the browser or Android device that will run `mewly`.

Run locally:

```sh
npm install
npm run dev -- --host 0.0.0.0
```

Open:

```text
http://<HOST_IP>:5177/
```

Docker development is also available:

```sh
docker compose up --build
```

## Babycat Routing

The app builds every request from the host entered on the login screen, resolved as session -> stored -> browser host. The `babycat` router (port 8000) is the single entry point for control, SSE/MJPEG relays, and the HLS/WHEP streaming relays; only WebRTC media (UDP 8189) bypasses it.

The Vite dev proxy in `vite.config.js` predates this contract: the app issues absolute URLs to port 8000, so the proxy carries no traffic and its port map (8000/8080) no longer matches the backend. It is kept for now and is a candidate for removal.

## Stack

- Vue 3
- Vite
- Vue Router
- hls.js
- Capacitor
- Docker Compose development container

## Temporary Android Device Notes

Install ADB on Ubuntu:

```sh
sudo apt update
sudo apt install android-tools-adb
adb version
```

Prepare the Android device:

- Enable Developer options.
- Enable USB debugging.
- Connect the device over USB.
- Approve the USB debugging prompt on the device.

Check that ADB can see the device:

```sh
adb devices
```

A working device appears as `device`. If it appears as `unauthorized`, approve the prompt on the phone. If the prompt does not appear, restart ADB:

```sh
adb kill-server
adb start-server
adb devices
```

Build the debug APK:

```sh
docker compose --profile android run --rm mewly-android
```

Install the debug APK over USB:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

If a clean reinstall is needed:

```sh
adb uninstall com.mewly.app
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Inspect the Android WebView from desktop Chrome or Brave:

```text
chrome://inspect/#devices
```

Then:

- Run `adb devices` and confirm the device is listed as `device`.
- Launch the Mewly app on the Android device.
- Open `chrome://inspect/#devices` on the desktop browser.
- Find the `com.mewly.app` or `localhost/...` target.
- Click `inspect` and check Console/Network errors.

If the app does not appear in `chrome://inspect`, restart ADB and relaunch the app:

```sh
adb kill-server
adb start-server
adb devices
```
