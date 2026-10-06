<template>
  <router-view v-if="$route.meta.public" />
  <div v-else class="layout">
    <aside class="side">
      <div class="brand">
        <div class="logo">🌾</div>
        <div>
          <div class="brand-title">青溪农播平台</div>
          <div class="brand-sub">选品·质检·发货·售后全链路</div>
        </div>
      </div>
      <nav>
        <router-link v-for="m in menus" :key="m.path" :to="m.path">
          <span class="ico">{{ m.icon }}</span>{{ m.name }}
        </router-link>
      </nav>
      <div class="side-foot">
        <div class="small muted">县域公共品牌 · 批次链路可追溯</div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="muted small">{{ pageHint }}</div>
        <div class="spacer"></div>
        <span class="tag green">{{ roleLabel[store.user?.role] }}</span>
        <span class="small" style="margin-left:8px">{{ store.user?.name }}</span>
        <button class="ghost mini" style="margin-left:12px" @click="logout">退出</button>
      </header>
      <div class="content">
        <router-view />
      </div>
    </main>
    <div v-if="toast" class="toast" :class="{ err: toastErr }">{{ toast }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { store, ROLE_LABEL } from './api.js';

const router = useRouter();
const route = useRoute();
const roleLabel = ROLE_LABEL;

const allMenus = [
  { path: '/', icon: '📊', name: '总览预警' },
  { path: '/products', icon: '🍎', name: '商品与批次申报' },
  { path: '/live', icon: '🎬', name: '选品与直播排期' },
  { path: '/fulfill', icon: '📦', name: '订单发货与结算' },
  { path: '/after-sales', icon: '🛠️', name: '售后处置' },
  { path: '/trace', icon: '🔗', name: '批次链路追踪' },
  { path: '/insights', icon: '📈', name: '县域复盘分析', roles: ['county', 'operator'] },
  { path: '/brand', icon: '📢', name: '品牌风险说明', roles: ['county'] },
];
const menus = computed(() => allMenus.filter(m => !m.roles || m.roles.includes(store.user?.role)));
const pageHint = computed(() => allMenus.find(m => m.path === route.path)?.name || '');

import { ref } from 'vue';
const toast = ref('');
const toastErr = ref(false);
let timer;
window.$toast = (msg, err = false) => {
  toast.value = msg; toastErr.value = err;
  clearTimeout(timer);
  timer = setTimeout(() => (toast.value = ''), 2600);
};

function logout() {
  store.logout();
  router.push('/login');
}
</script>

<style scoped>
.layout { display: flex; min-height: 100vh; }
.side {
  width: 226px; background: #1f4d28; color: #dcecdb; display: flex; flex-direction: column;
  position: fixed; inset: 0 auto 0 0;
}
.brand { display: flex; gap: 10px; align-items: center; padding: 18px 16px; border-bottom: 1px solid rgba(255,255,255,.12); }
.logo { font-size: 26px; }
.brand-title { font-weight: 700; font-size: 16px; color: #fff; }
.brand-sub { font-size: 11px; color: #a9c6a8; margin-top: 2px; }
nav { flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; }
nav a {
  color: #cfe0ce; padding: 10px 12px; border-radius: 8px; font-size: 13.5px; display: flex; gap: 9px; align-items: center;
}
nav a:hover { background: rgba(255,255,255,.08); color: #fff; }
nav a.router-link-active { background: #2f7d3a; color: #fff; font-weight: 600; }
.ico { width: 18px; text-align: center; }
.side-foot { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,.12); }
.side-foot .small { color: #8fae8e; }
.main { flex: 1; margin-left: 226px; display: flex; flex-direction: column; min-width: 0; }
.topbar {
  background: #fff; border-bottom: 1px solid var(--line); padding: 10px 22px;
  display: flex; align-items: center;
}
.content { padding: 20px 22px 40px; max-width: 1280px; width: 100%; }
</style>
