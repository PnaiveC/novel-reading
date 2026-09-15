<script setup lang="ts">
/**
 * v2 骨架占位。
 *
 * v1 的界面（App.vue + components/）已按计划删除，需要参考时用 `git show v1-mvp:src/App.vue`。
 * v2 的界面在功能项 A2 / B4 / C1 中逐个实现，清单见 docs/v2-features.md。
 */
</script>

<template>
  <main class="app">
    <h1>小说阅读器</h1>
    <p class="hint">v2 骨架已就绪：按 docs/v2-features.md 的 A → B → C → D 顺序实现。</p>
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: #f7f5f0;
  color: #2b2b2b;
  font-family: 'Songti SC', 'Noto Serif CJK SC', serif;
}

.app h1 {
  margin: 0;
  font-size: 24px;
}

.hint {
  margin: 0;
  color: #8a8378;
  font-size: 14px;
}
</style>
