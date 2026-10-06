<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-head">
        <div class="logo">🌾</div>
        <h2>青溪县·农播一体化平台</h2>
        <p>选品 · 质检 · 直播 · 库存 · 发货 · 售后 · 结算 —— 一条商品批次链路</p>
      </div>
      <div class="field">
        <label>用户名</label>
        <input v-model="username" placeholder="如 admin" @keyup.enter="login" />
      </div>
      <div class="field">
        <label>密码</label>
        <input v-model="password" type="password" placeholder="123456" @keyup.enter="login" />
      </div>
      <button style="width:100%;padding:10px" @click="login">登 录</button>
      <div v-if="err" class="err-msg">{{ err }}</div>
      <div class="accounts">
        <div class="small muted" style="margin-bottom:6px">演示账号（密码均为 123456），点击可快速填充：</div>
        <div class="acc-list">
          <span v-for="a in accounts" :key="a.u" class="acc" @click="fill(a.u)">
            <b>{{ a.u }}</b> · {{ a.label }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, store } from '../api.js';

const router = useRouter();
const username = ref('admin');
const password = ref('123456');
const err = ref('');
const accounts = [
  { u: 'admin', label: '县域运营方' },
  { u: 'op', label: '选品运营' },
  { u: 'wh', label: '仓库主管' },
  { u: 'cs', label: '售后客服' },
  { u: 'farmer1', label: '猕猴桃合作社' },
  { u: 'farmer2', label: '菌菇农户' },
];
function fill(u) { username.value = u; password.value = '123456'; }
async function login() {
  err.value = '';
  try {
    const data = await api.post('/auth/login', { username: username.value, password: password.value });
    store.setAuth(data.token, data.user);
    router.push('/');
  } catch (e) {
    err.value = e.message;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #23602c 0%, #2f7d3a 55%, #4a9352 100%);
}
.login-card {
  width: 440px; background: #fff; border-radius: 14px; padding: 30px 32px;
  box-shadow: 0 18px 60px rgba(0,0,0,.25);
}
.login-head { text-align: center; margin-bottom: 20px; }
.logo { font-size: 40px; }
.login-head h2 { margin: 8px 0 6px; color: var(--green-dark); }
.login-head p { margin: 0; color: var(--muted); font-size: 12px; }
.err-msg { color: var(--red); font-size: 12.5px; margin-top: 10px; text-align: center; }
.accounts { margin-top: 18px; border-top: 1px dashed var(--line); padding-top: 12px; }
.acc-list { display: flex; flex-wrap: wrap; gap: 6px; }
.acc {
  font-size: 12px; background: var(--green-light); color: var(--green-dark);
  padding: 3px 9px; border-radius: 12px; cursor: pointer;
}
.acc:hover { background: #d8ead6; }
</style>
