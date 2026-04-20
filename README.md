<picture>
  <img src="./public/logo.png" alt="babycat banner">
</picture>

<p align="center">
  <img src="https://img.shields.io/badge/Docker-2496ED.svg?&logo=Docker&logoColor=fff" alt="Docker">
  <img src="https://img.shields.io/badge/Vue.js-4FC08D.svg?&logo=Vue.js&logoColor=fff" alt="Vue.js">
  <img src="https://img.shields.io/badge/Vite-646CFF.svg?&logo=Vite&logoColor=fff" alt="Vite">
  <img src="https://img.shields.io/badge/Capacitor-119EFF.svg?&logo=Capacitor&logoColor=fff" alt="Capacitor">
  <img src="https://img.shields.io/badge/Node.js-5FA04E.svg?&logo=Node.js&logoColor=fff" alt="Node.js">
</p>

# Overview

`mewly` is a small Vue 3 + Vite + Capacitor skeleton for proving the Android app flow against a running `babycat` backend.

## Development

The dev environment follows the Docker-first setup used by `../wally`, with the host IP pattern from `../babycat`.

Create or update `.env`:

```sh
cp .env.example .env
```

```env
HOST_IP=172.27.1.205
MEWLY_WEB_PORT=5177
```

```sh
docker compose up --build
```

Open the Vite app at:

```text
http://172.27.1.205:5177
```

The app derives babycat service URLs from `HOST_IP` through Docker Compose:

- `VITE_BABYCAT_API_URL=http://<HOST_IP>:8000`
- `VITE_BABYCAT_APP_URL=http://<HOST_IP>:8080`
- `VITE_BABYCAT_HLS_URL=http://<HOST_IP>:8888/live/index.m3u8`

## Stack

- Vue 3
- Vite
- Capacitor
- Docker Compose development container
