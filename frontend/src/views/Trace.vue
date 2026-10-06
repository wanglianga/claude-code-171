<template>
  <div>
    <div class="card">
      <div class="row wrap">
        <h3 style="margin:0">🔗 商品批次全链路追踪</h3>
        <div class="spacer"></div>
        <select v-model.number="batchId" style="width:360px" @change="load">
          <option v-for="b in batches" :key="b.id" :value="b.id">
            {{ b.batchNo }}（{{ b.productName }} · {{ b.farmerName }}）
          </option>
        </select>
      </div>
    </div>

    <div v-if="data" class="grid grid-2" style="grid-template-columns: 340px 1fr">
      <div>
        <div class="card">
          <h3>{{ data.product?.name }}</h3>
          <div class="small" style="line-height:2">
            <div>批次号：<b>{{ data.batch.batchNo }}</b></div>
            <div>农户：{{ data.farmer?.name }}（稳定性 {{ data.farmer?.stabilityScore }}）</div>
            <div>可供 {{ data.batch.qty }}｜锁定 {{ data.batch.qtyLocked }}｜已售 {{ data.batch.qtySold }}</div>
            <div>温区：{{ data.batch.tempZone }}｜采摘 {{ data.batch.harvestDate }}</div>
            <div>批次坏果率：<b :style="Number(data.batch.badRate) >= 8 ? 'color:var(--red)' : ''">{{ data.batch.badRate }}%</b></div>
            <div>状态：{{ batchStatus[data.batch.status] }}</div>
            <div>订单 {{ data.ordersCount }} 单｜售后 {{ data.afterSalesCount }} 单</div>
          </div>
        </div>
        <div class="card">
          <h3>链路阶段</h3>
          <div class="small" style="line-height:2.1">
            <div>① 农户申报批次与检测报告</div>
            <div>② 运营选品 + 履约能力评估</div>
            <div>③ 直播排期（主播/脚本/试吃/价格券/预估）</div>
            <div>④ 仓库锁定库存与包装材料</div>
            <div>⑤ 直播下单（温区与冷链城市校验）</div>
            <div>⑥ 发货任务（仓库/温区/售后承诺）</div>
            <div>⑦ 售后处置（六类原因）</div>
            <div>⑧ 风险预警贯穿全程</div>
            <div>⑨ 农户结算（扣售后与违约金）</div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>批次时间线</h3>
        <div class="timeline">
          <div v-for="(t, i) in data.timeline" :key="i" class="tl-item" :class="t.tone">
            <div class="tl-stage">{{ fmt(t.at) }} · {{ t.stage }}</div>
            <div class="tl-text">{{ t.text }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api.js';

const route = useRoute();
const batches = ref([]);
const batchId = ref(Number(route.query.batchId) || 0);
const data = ref(null);
const batchStatus = { available: '可供', locked: '已锁库存', short: '临时少供', closed: '已结案' };
const fmt = (t) => new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

async function loadBatches() {
  const [products, bs] = await Promise.all([api.get('/products'), api.get('/batches')]);
  const pmap = new Map(products.map(p => [p.id, p]));
  batches.value = bs.map(b => ({
    id: b.id, batchNo: b.batchNo,
    productName: pmap.get(b.productId)?.name,
    farmerName: pmap.get(b.productId)?.farmer?.name,
  })).sort((a, b2) => b2.id - a.id);
  if (!batchId.value && batches.value.length) batchId.value = Number(route.query.batchId) || batches.value.find(x => x.batchNo.includes('0920'))?.id || batches.value[0].id;
  await load();
}
async function load() {
  if (!batchId.value) return;
  data.value = await api.get(`/batches/${batchId.value}/trace`);
}
onMounted(loadBatches);
</script>
