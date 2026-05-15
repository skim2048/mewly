# Mewly Codex Rules

## Scope

- Treat `mewly` as a Vue/Vite/Capacitor Android client for the remote `babycat` backend.
- `babycat` is the runtime/API source of truth. `mewly` consumes `babycat`; it does not redefine backend contracts.
- Do not assume `../babycat` or `../wally` is available unless the user explicitly says so. If available, use `../babycat` for contract reference only.
- Do not read `tmp/` unless the user explicitly names the file. User-provided handoff files in `tmp/` are allowed only when requested.

## Hard Rules

- Do not create `.dockerignore` in this project.
- Do not propose or add `.dockerignore` as a routine Docker cleanup.
- If Docker build context becomes a real problem, first use narrow Dockerfile `COPY` instructions and `docker-compose.yml` volumes/named volumes. Explain the remaining risk before asking about any ignore-file approach.
- Do not delete or revert user changes to avoid an argument or quiet a warning. Explain the reason, impact, and alternatives first.
- Do not mix local npm and Docker npm workflows casually. If both are present, say which one owns `node_modules` for the current task.
- Do not add service-split backend env vars such as `VITE_BABYCAT_API_URL`, `VITE_BABYCAT_APP_URL`, `VITE_BABYCAT_HLS_URL`, or `VITE_BABYCAT_WHEP_URL` unless the user explicitly asks. Use one babycat host and derive ports.

## Project Model

- One editable babycat host drives runtime routing.
- Expected ports:
  - `:8000` for API/auth/camera/clips REST.
  - `:8080` for app runtime, SSE, prompt, PTZ, and VLM control.
  - `:8888` for HLS.
  - `:8889` for WHEP/WebRTC.
- Vite proxy can help PC dev, but Android installed apps do not have Vite proxy. Android must be validated as direct WebView networking.
- Capacitor Android uses `http://localhost` in this project to avoid mixed-content blocking with the current HTTP babycat services.

## Before Changing Code

- State which layer owns the problem: `mewly` UI/client, Capacitor Android wrapper, Docker build workflow, or `babycat`.
- State whether the change affects browser dev, Android APK, or both.
- State whether it changes routing, env vars, CORS, auth, stream transport, or Docker volume behavior.
- If the request follows a prior handoff/fix summary, read only the user-named file and honor its current direction.

## Docker Rules

- Existing Docker usage exists to reduce host development-environment pollution.
- `docker/dev/Dockerfile` and `mewly-web` are for Vite/web development.
- `docker/android/Dockerfile` and the `android` compose profile are for Android debug APK builds.
- Prefer Compose volumes/named volumes for runtime isolation:
  - bind mount the project at `/app`
  - isolate `/app/node_modules` with a named volume for container npm
  - add Gradle cache volumes only after explaining the effect
- Keep Dockerfile `COPY` scope narrow. Do not switch to `COPY . /app` without explaining build-context and leakage implications.

## Android Workflow Rules

- For first-device debugging, prefer `adb`, Chrome/WebView inspect, and concrete console/logcat errors over repeated blind APK rebuilds.
- When Android networking fails, check the exact DevTools error first:
  - mixed content
  - CORS
  - cleartext
  - address unreachable / timeout / refused
- Do not infer auth failure from the login UI alone. The UI may be masking network or CORS errors.
- Rebuild APK only when web assets, Capacitor config, native Android files, or Docker build scripts changed.

## Endpoint And Backend Rules

- Keep `src/endpoints.js` simple: stored host or `VITE_BABYCAT_HOST`, then derived service ports.
- Treat `/events`, `/prompt`, `/ptz`, and `/vlm/*` failures as likely `babycat-app(:8080)` contract/runtime issues until proven otherwise.
- Treat `/api/*`, `/camera`, and `/clips` failures as likely `babycat-api(:8000)` issues until proven otherwise.
- Treat HLS/WHEP failures separately from REST/SSE; MediaMTX can work while `api` or `app` fails.

## Communication Rules

- If adding a root-level config or policy file, explain why before doing it unless the user explicitly requested that exact file.
- If a file was added for a technical reason and the user challenges it, explain the reason, risks of keeping it, and risks of removing it before taking action.
- Avoid vague "pros and cons" when the user asks for a decision. Make a recommendation and name the cost.
- When wrong, state the concrete wrong action and the corrective action. Do not bury it in generalities.

