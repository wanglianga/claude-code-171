<template>
  <div class="login-page">
    <div class="panel">
      <div class="brand">
        <el-icon :size="40" color="#67c23a"><Platform /></el-icon>
        <h1>县域农产品直播带货平台</h1>
        <p>选品 · 质检 · 直播 · 库存 · 发货 · 售后 · 结算 全链路管理</p>
      </div>
      <el-form :model="form" @submit.prevent="doLogin">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" :prefix-icon="Lock" show-password @keyup.enter="doLogin" />
        </el-form-item>
        <el-button type="success" size="large" style="width: 100%" :loading="loading" @click="doLogin">登 录</el-button>
      </el-form>
      <el-divider content-position="left">演示账号（点击填充）</el-divider>
      <div class="accounts">
        <el-tag v-for="a in accounts" :key="a.u" class="acc" :type="a.tag" @click="fill(a)">
          {{ a.label }} {{ a.u }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({ username: 'admin', password: 'admin123' });

const accounts = [
  { label: '管理员', u: 'admin', p: 'admin123', tag: 'danger' },
  { label: '运营', u: 'ops', p: '123456', tag: 'success' },
  { label: '农户-青山果园', u: 'farmer1', p: '123456', tag: 'primary' },
  { label: '农户-刘记腊味', u: 'farmer4', p: '123456', tag: 'primary' },
  { label: '仓储', u: 'warehouse', p: '123456', tag: 'warning' },
  { label: '售后', u: 'aftersales', p: '123456', tag: 'info' },
];

function fill(a) {
  form.username = a.u;
  form.password = a.p;
}

async function doLogin() {
  if (!form.username || !form.password) return ElMessage.warning('请输入用户名和密码');
  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1d2b1f 0%, #2f5233 60%, #67c23a 130%); }
.panel { width: 420px; background: #fff; border-radius: 12px; padding: 36px 36px 28px; box-shadow: 0 12px 40px rgba(0,0,0,.25); }
.brand { text-align: center; margin-bottom: 24px; }
.brand h1 { font-size: 20px; color: #2c3e2d; margin: 10px 0 6px; }
.brand p { font-size: 12px; color: #909399; }
.accounts { display: flex; flex-wrap: wrap; gap: 8px; }
.acc { cursor: pointer; }
</style>
