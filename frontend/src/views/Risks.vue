<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>链路风险事件</span>
          <div>
            <el-button size="small" :icon="Refresh" @click="load">刷新</el-button>
            <el-button v-if="isOperator" size="small" type="warning" @click="scan">扫描检测报告过期</el-button>
          </div>
        </div>
      </template>
      <el-radio-group v-model="filter" size="small" style="margin-bottom: 12px" @change="load">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="open">开放中</el-radio-button>
        <el-radio-button value="acknowledged">已知晓</el-radio-button>
        <el-radio-button value="resolved">已处置</el-radio-button>
      </el-radio-group>
      <el-table :data="list" size="small" v-loading="loading">
        <el-table-column label="级别" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.level === 'critical' ? 'danger' : row.level === 'warning' ? 'warning' : 'info'">
              {{ { critical: '严重', warning: '预警', info: '提示' }[row.level] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="150">
          <template #default="{ row }">{{ types[row.type] || row.type }}</template>
        </el-table-column>
        <el-table-column prop="message" label="风险内容" min-width="320" show-overflow-tooltip />
        <el-table-column label="关联" width="110">
          <template #default="{ row }">
            <el-button v-if="row.batchId" link type="primary" size="small" @click="$router.push(`/chain/${row.batchId}`)">批次链路</el-button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ open: 'danger', acknowledged: 'warning', resolved: 'success' }[row.status]" effect="plain">
              {{ { open: '开放中', acknowledged: '已知晓', resolved: '已处置' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column v-if="isOperator" label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'open'" size="small" link type="warning" @click="setStatus(row, 'acknowledged')">知晓</el-button>
            <el-button v-if="row.status !== 'resolved'" size="small" link type="success" @click="setStatus(row, 'resolved')">处置完成</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const isOperator = computed(() => ['operator', 'admin'].includes(auth.role));
const list = ref([]);
const types = ref({});
const filter = ref('');
const loading = ref(false);

function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16) : ''; }

async function load() {
  loading.value = true;
  try {
    list.value = await request.get('/risks', { params: filter.value ? { status: filter.value } : {} });
    types.value = await request.get('/risks/types');
  } finally { loading.value = false; }
}

async function setStatus(row, status) {
  await request.patch(`/risks/${row.id}/status`, { status });
  ElMessage.success('已更新');
  load();
}

async function scan() {
  const res = await request.post('/batches/scan-expired-reports');
  ElMessage.warning(`扫描完成，发现 ${res.scanned} 个报告过期批次`);
  load();
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
</style>
