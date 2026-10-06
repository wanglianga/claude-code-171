<template>
  <div>
    <div class="card">
      <div class="row wrap">
        <h3 style="margin:0">📦 订单 · 发货任务 · 农户结算</h3>
        <div class="spacer"></div>
        <button class="ghost" :class="tab === 'order' ? '' : ''" @click="tab = 'order'">订单</button>
        <button class="ghost" @click="tab = 'ship'">发货任务</button>
        <button v-if="canOps" class="ghost" @click="tab = 'settle'">农户结算</button>
        <button class="ghost" @click="load">刷新</button>
      </div>
    </div>

    <!-- 订单 -->
    <div v-if="tab === 'order'">
      <div class="card">
        <div class="row wrap">
          <b>模拟直播下单（冷链可达城市会被校验，超卖会被拦截）</b>
          <div class="spacer"></div>
          <select v-model.number="orderForm.liveItemId" style="width:300px">
            <option :value="0">选择在售排品</option>
            <option v-for="it in sellableItems" :key="it.id" :value="it.id">
              {{ it.productName }}（批次 {{ it.batchNo }}｜已售 {{ it.actualSoldQty }}/{{ it.qty }}）
            </option>
          </select>
          <input v-model="orderForm.city" placeholder="收货城市" style="width:110px" />
          <input v-model="orderForm.address" placeholder="详细地址" style="width:220px" />
          <input type="number" v-model.number="orderForm.qty" placeholder="数量" style="width:80px" />
          <button @click="placeOrder">下单</button>
        </div>
      </div>
      <div class="card">
        <h3>订单列表</h3>
        <table>
          <thead><tr><th>订单号</th><th>商品</th><th>批次</th><th>城市</th><th>温区</th><th>数量</th><th>金额</th><th>状态</th><th>物流</th></tr></thead>
          <tbody>
            <tr v-for="o in orders" :key="o.id">
              <td class="small">{{ o.orderNo }}</td>
              <td>{{ o.productName }}</td>
              <td><router-link :to="`/trace?batchId=${o.batchId}`">#{{ o.batchId }}</router-link></td>
              <td>{{ o.city }}</td>
              <td><span class="tag blue">{{ o.tempZoneRequired }}</span></td>
              <td>{{ o.qty }}</td>
              <td>¥{{ o.amount }}</td>
              <td><span class="tag" :class="orderStatus[o.status]?.cls">{{ orderStatus[o.status]?.label }}</span></td>
              <td class="small">{{ o.courier }} {{ o.trackingNo }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 发货 -->
    <div v-if="tab === 'ship'">
      <div class="card">
        <div class="row">
          <b>按「订单 + 批次 + 发货仓 + 物流温区 + 售后承诺」批量生成发货任务</b>
          <div class="spacer"></div>
          <input v-model="shipWarehouse" placeholder="发货仓" style="width:130px" />
          <button @click="generate">生成发货任务</button>
        </div>
      </div>
      <div class="card">
        <h3>发货任务</h3>
        <table>
          <thead><tr><th>订单号/商品</th><th>批次</th><th>发货仓</th><th>温区</th><th>承运商/单号</th><th>售后承诺</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="s in shipments" :key="s.id">
              <td class="small"><div>{{ s.order?.orderNo }}</div><div class="muted">{{ s.order?.productName }}</div></td>
              <td><router-link :to="`/trace?batchId=${s.batchId}`">#{{ s.batchId }}</router-link></td>
              <td>{{ s.warehouse }}</td>
              <td><span class="tag blue">{{ s.tempZone }}</span></td>
              <td class="small">{{ s.carrier }}<br /><span class="muted">{{ s.trackingNo || '—' }}</span></td>
              <td class="small" style="max-width:180px">{{ s.promise }}</td>
              <td><span class="tag" :class="shipStatus[s.status]?.cls">{{ shipStatus[s.status]?.label }}</span></td>
              <td class="small" style="max-width:160px">{{ s.delayNote }}</td>
              <td class="row wrap" style="gap:4px">
                <button v-if="s.status === 'pending' && s.tempZone !== '常温'" class="mini ghost" @click="waitCold(s)">等冷链车</button>
                <button v-if="['pending','cold_wait'].includes(s.status)" class="mini" @click="shipIt(s)">发货</button>
                <button v-if="s.status === 'shipped'" class="mini ghost" @click="markDelay(s)">冷链晚到/延误</button>
                <button v-if="s.status === 'shipped'" class="mini ghost" @click="deliver(s)">签收</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 结算 -->
    <div v-if="tab === 'settle'">
      <div class="card">
        <h3>农户结算单（售后赔付与品质违约金自动核扣）</h3>
        <table>
          <thead><tr><th>农户</th><th>批次</th><th>销售数量</th><th>货款</th><th>售后扣减</th><th>品质违约金</th><th>应付净额</th><th>状态</th><th>说明</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in settlements" :key="s.id">
              <td>{{ s.farmerName }}</td>
              <td>{{ s.batchNo }}</td>
              <td>{{ s.qtySold }}</td>
              <td>¥{{ s.grossAmount }}</td>
              <td style="color:var(--red)">−¥{{ s.afterSaleDeduction }}</td>
              <td :style="Number(s.penalty) > 0 ? 'color:var(--red)' : ''">−¥{{ s.penalty }}</td>
              <td><b>¥{{ s.netAmount }}</b></td>
              <td><span class="tag" :class="s.status === 'settled' ? 'green' : 'amber'">{{ s.status === 'settled' ? '已结算' : '待确认' }}</span></td>
              <td class="small" style="max-width:280px">{{ s.note }}</td>
              <td><button v-if="s.status === 'pending' && canOps" class="mini" @click="confirmSettle(s)">确认打款</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, store } from '../api.js';

const route = useRoute();
const canOps = computed(() => ['county', 'operator'].includes(store.user.role));
const tab = ref(route.query.liveItem ? 'order' : 'order');
const orders = ref([]);
const shipments = ref([]);
const settlements = ref([]);
const sessions = ref([]);
const shipWarehouse = ref('中心仓');
const orderForm = ref({ liveItemId: 0, city: '杭州', address: '示例收货地址 88 号', qty: 1 });

const sellableItems = computed(() =>
  sessions.value.flatMap(ls => ls.items.filter(i => ['live', 'locked', 'planned'].includes(i.status)).map(i => ({
    id: i.id, productName: i.product?.name, batchNo: i.batch?.batchNo,
    actualSoldQty: i.actualSoldQty, qty: i.batch?.qty,
  }))),
);

const orderStatus = {
  paid: { label: '待发货', cls: 'amber' }, shipped: { label: '已发货', cls: 'blue' },
  delivered: { label: '已签收', cls: 'green' }, cancelled: { label: '已取消', cls: 'gray' },
};
const shipStatus = {
  pending: { label: '待发运', cls: 'amber' }, cold_wait: { label: '等冷链车', cls: 'red' },
  shipped: { label: '运输中', cls: 'blue' }, delayed: { label: '延误', cls: 'red' },
  delivered: { label: '已签收', cls: 'green' },
};

async function load() {
  const farmerQ = store.user.role === 'farmer' ? `?farmerId=${store.user.farmerId}` : '';
  orders.value = await api.get('/orders');
  shipments.value = await api.get('/shipments');
  settlements.value = await api.get('/settlements' + farmerQ);
  sessions.value = await api.get('/live-sessions');
}
onMounted(async () => {
  await load();
  if (route.query.liveItem) orderForm.value.liveItemId = Number(route.query.liveItem);
});
async function placeOrder() {
  if (!orderForm.value.liveItemId) return window.$toast?.('请选择在售排品', true);
  try {
    await api.post(`/live-items/${orderForm.value.liveItemId}/orders`, orderForm.value);
    window.$toast?.('下单成功，已生成待发货订单');
    load();
  } catch (e) { window.$toast?.(e.message, true); }
}
async function generate() {
  const r = await api.post('/shipments/generate', { warehouse: shipWarehouse.value });
  window.$toast?.(`已生成 ${r.created} 个发货任务（温区与售后承诺已带入）`);
  load();
}
async function waitCold(s) {
  await api.post(`/shipments/${s.id}/wait-cold`, { note: '冷链车未到仓，等待装车' });
  load();
}
async function shipIt(s) {
  const trackingNo = `SF${Date.now().toString().slice(-8)}`;
  await api.post(`/shipments/${s.id}/ship`, { carrier: s.tempZone === '常温' ? '中通快递' : '顺丰冷链', trackingNo });
  window.$toast?.('已发货');
  load();
}
async function markDelay(s) {
  const minutes = Number(prompt('冷链车/物流延误多少分钟？', '150') || 0);
  if (!minutes) return;
  const note = prompt('延误原因', '冷链车晚到/高速封路') || '';
  await api.post(`/shipments/${s.id}/delay`, { minutes, note });
  window.$toast?.('已登记延误并生成预警');
  load();
}
async function deliver(s) { await api.post(`/shipments/${s.id}/deliver`, {}); load(); }
async function confirmSettle(s) { await api.post(`/settlements/${s.id}/confirm`, {}); window.$toast?.('已确认打款'); load(); }
</script>
