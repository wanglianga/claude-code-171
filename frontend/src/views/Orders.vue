<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>订单管理</span>
          <div>
            <el-select v-model="liveFilter" placeholder="全部场次" clearable size="small" style="width: 200px; margin-right: 8px" @change="load">
              <el-option v-for="l in lives" :key="l.id" :value="l.id" :label="l.title" />
            </el-select>
            <el-select v-model="statusFilter" placeholder="全部状态" clearable size="small" style="width: 130px" @change="load">
              <el-option v-for="s in ['paid', 'shipped', 'delivered', 'refunded']" :key="s" :value="s" :label="statusText(s)" />
            </el-select>
          </div>
        </div>
      </template>
      <el-table :data="list" size="small" v-loading="loading" max-height="620">
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column label="场次" min-width="130">
          <template #default="{ row }">{{ row.livestream?.title || row.livestreamId }}</template>
        </el-table-column>
        <el-table-column label="客户" width="130">
          <template #default="{ row }">{{ row.customerName }}<div class="sub">{{ row.phone }}</div></template>
        </el-table-column>
        <el-table-column prop="city" label="城市" width="90" />
        <el-table-column prop="quantity" label="数量" width="60" />
        <el-table-column label="金额" width="90">
          <template #default="{ row }">¥{{ row.amount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ paid: 'warning', shipped: 'primary', delivered: 'success', refunded: 'danger' }[row.status] || 'info'">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="批次" width="80">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="$router.push(`/chain/${row.batchId}`)">链路</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import request from '../api/request';

const list = ref([]);
const lives = ref([]);
const liveFilter = ref(null);
const statusFilter = ref('');
const loading = ref(false);

function statusText(s) {
  return { paid: '已支付', shipped: '已发货', delivered: '已送达', refunded: '已退款', completed: '已完成' }[s] || s;
}
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16) : ''; }

async function load() {
  loading.value = true;
  try {
    const params = {};
    if (liveFilter.value) params.livestreamId = liveFilter.value;
    if (statusFilter.value) params.status = statusFilter.value;
    list.value = await request.get('/orders', { params });
  } finally { loading.value = false; }
}

onMounted(async () => {
  lives.value = await request.get('/livestreams');
  load();
});
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.sub { font-size: 12px; color: #909399; }
</style>
