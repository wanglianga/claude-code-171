<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>库存与包材锁定</span>
          <el-radio-group v-model="filter" size="small" @change="load">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="locked">锁定中</el-radio-button>
            <el-radio-button value="consumed">已消耗</el-radio-button>
            <el-radio-button value="released">已释放</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="list" size="small" v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="直播场次" min-width="150">
          <template #default="{ row }">{{ liveMap[row.livestreamId]?.title || `场次#${row.livestreamId}` }}</template>
        </el-table-column>
        <el-table-column label="批次" width="160">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="$router.push(`/chain/${row.batchId}`)">{{ batchMap[row.batchId] || row.batchId }}</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="lockedQty" label="锁定库存" width="90" />
        <el-table-column label="包材" min-width="140">
          <template #default="{ row }">{{ row.packagingMaterial }} × {{ row.packagingQty }}</template>
        </el-table-column>
        <el-table-column prop="warehouseName" label="发货仓" width="120" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ locked: 'warning', consumed: 'success', released: 'info' }[row.status]">
              {{ { locked: '锁定中', consumed: '已消耗', released: '已释放' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'locked'" size="small" link type="danger" @click="release(row)">释放</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '../api/request';

const list = ref([]);
const liveMap = ref({});
const batchMap = ref({});
const filter = ref('');
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    list.value = await request.get('/inventory/locks', { params: filter.value ? { status: filter.value } : {} });
    const lives = await request.get('/livestreams');
    liveMap.value = Object.fromEntries(lives.map((l) => [l.id, l]));
    const batches = await request.get('/batches');
    batchMap.value = Object.fromEntries(batches.map((b) => [b.id, b.batchNo]));
  } finally { loading.value = false; }
}

async function release(row) {
  await ElMessageBox.confirm(`释放锁定库存 ${row.lockedQty} 件？`, '释放锁定', { type: 'warning' });
  await request.post(`/inventory/locks/${row.id}/release`);
  ElMessage.success('已释放');
  load();
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
</style>
