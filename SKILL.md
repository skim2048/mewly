# Mewly Working Procedures

Use this file for repeatable procedures. Permanent behavior rules belong in `AGENTS.md`.

## Android Debug APK Build

Goal: build an installable debug APK without installing Android Studio on the host.

Commands:

```sh
docker compose --profile android build mewly-android
docker compose --profile android run --rm mewly-android
```

Expected APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Notes:

- The Android build container owns container-side `node_modules` through the `android_node_modules` named volume.
- Do not add `.dockerignore` for this workflow.
- If Docker build context becomes slow, first inspect Dockerfile `COPY` scope and compose volumes.

## Install APK With adb

Goal: install the current debug APK on a connected Android phone.

Commands:

```sh
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

If the device is `unauthorized`, approve the USB debugging prompt on the phone.

## WebView Debugging

Goal: inspect the running Capacitor WebView like a browser page.

Steps:

1. Connect the phone over USB.
2. Confirm `adb devices` shows the phone as `device`.
3. Open Chromium/Chrome/Brave on the Ubuntu host.
4. Visit:

```text
chrome://inspect/#devices
```

5. Select the `com.mewly.app` WebView inspect target.
6. Use Console and Network before changing code.

Important errors:

```text
Mixed Content
No 'Access-Control-Allow-Origin'
ERR_CLEARTEXT_NOT_PERMITTED
ERR_ADDRESS_UNREACHABLE
ERR_CONNECTION_TIMED_OUT
ERR_CONNECTION_REFUSED
Failed to fetch
```

## Android Network Triage

Use this order:

1. Confirm app origin in WebView inspect. This project should show `http://localhost`, not `https://localhost`.
2. Confirm the host field in the login screen is the babycat host, for example `172.27.1.205`.
3. Check DevTools Console/Network for the exact failing URL and reason.
4. From Ubuntu, reproduce with `curl` and the same Origin header.

Examples:

```sh
curl -sS -i http://172.27.1.205:8000/health \
  -H 'Origin: http://localhost' \
  --max-time 5
```

```sh
curl -sS -i -X OPTIONS http://172.27.1.205:8080/ptz \
  -H 'Origin: http://localhost' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type' \
  --max-time 5
```

## Routing Expectations

Use one babycat host. Derive ports:

```text
http://<host>:8000  API
http://<host>:8080  App/SSE/PTZ/VLM
http://<host>:8888  HLS
http://<host>:8889  WHEP
```

Do not split host configuration into service-specific URL env vars unless the user explicitly requests that architecture.

