<script setup>
const babycatHost = import.meta.env.VITE_BABYCAT_HOST || '192.168.0.10'
const apiUrl = import.meta.env.VITE_BABYCAT_API_URL || `http://${babycatHost}:8000`
const appUrl = import.meta.env.VITE_BABYCAT_APP_URL || `http://${babycatHost}:8080`
const hlsUrl = import.meta.env.VITE_BABYCAT_HLS_URL || `http://${babycatHost}:8888/live/index.m3u8`
const mewlyUrl = `http://${babycatHost}:5177`

const serviceTargets = [
  { name: 'Mewly dev', url: mewlyUrl },
  { name: 'Babycat API', url: apiUrl },
  { name: 'Babycat App / SSE', url: `${appUrl}/events?token=<JWT>` },
  { name: 'Babycat HLS', url: hlsUrl },
]
</script>

<template>
  <main class="app-shell">
    <section class="intro">
      <p class="eyebrow">Mewly skeleton</p>
      <h1>Babycat 연결을 위한 최소 앱 골격</h1>
      <p class="summary">
        Docker 안에서 Vue 3, Vite, Capacitor가 함께 실행되도록 준비했습니다.
        호스트 IP는 <code>.env</code>에서 읽고, 다음 단계에서 로그인, JWT 저장,
        라이브 스트림, SSE, 클립 목록을 얹을 수 있습니다.
      </p>
    </section>

    <section class="panel" aria-labelledby="targets-title">
      <h2 id="targets-title">초기 연결 대상</h2>
      <ul class="target-list">
        <li v-for="target in serviceTargets" :key="target.name">
          <span>{{ target.name }}</span>
          <code>{{ target.url }}</code>
        </li>
      </ul>
    </section>
  </main>
</template>
