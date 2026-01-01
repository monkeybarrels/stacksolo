<template>
  <div class="app">
    <h1>StackSolo Full Stack Demo</h1>
    <p>Running locally with Kubernetes</p>
    <div class="status">
      <h2>API Response:</h2>
      <pre v-if="apiData">{{ JSON.stringify(apiData, null, 2) }}</pre>
      <p v-else-if="error" class="error">{{ error }}</p>
      <p v-else>Loading...</p>
    </div>
    <button @click="fetchApi">Refresh</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const apiData = ref(null);
const error = ref(null);

async function fetchApi() {
  try {
    error.value = null;
    const res = await fetch('/api/');
    apiData.value = await res.json();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(fetchApi);
</script>

<style>
.app {
  font-family: system-ui, sans-serif;
  max-width: 600px;
  margin: 2rem auto;
  padding: 1rem;
}
.status {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem 0;
}
pre {
  white-space: pre-wrap;
  word-break: break-word;
}
.error {
  color: red;
}
button {
  padding: 0.5rem 1rem;
  cursor: pointer;
}
</style>
