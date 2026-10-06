<template>
  <div>
    <div class="card">
      <div class="row wrap">
        <h3 style="margin:0">🎬 直播排期与排品</h3>
        <div class="spacer"></div>
        <button v-if="canOps" @click="showSession = true">＋ 新建直播场次</button>
        <button class="ghost" @click="load">刷新</button>
      </div>
    </div>

    <div v-for="ls in sessions" :key="ls.id" class="card">
      <div class="row wrap">
        <h3 style="margin:0">{{ ls.title }}</h3>
        <span class="tag" :class="liveStatus[ls.status]?.cls">{{ liveStatus[ls.status]?.label }}</span>
        <span class="small muted">主播：{{ ls.anchorName }}｜{{ fmtTime(ls.scheduledStart) }}</span>
        <div class="spacer"></div>
        <button v-if="ls.status === 'planned' && canOps" class="mini" @click="goLive(ls)">开始直播</button>
        <button v-if="ls.status === 'live'" class="mini danger" @click="finish(ls)">截单结束</button>
      </div>
      <div class="small muted" style="margin:8px 0 4px">脚本：{{ ls.scriptSummary }}｜样品试吃：{{ ls.sampleTasting }}</div>

      <table>
        <thead>
          <tr><th>商品 / 批次</th><th>价格 / 券</th><th>预估销量</th><th>建议预售</th><th>实售</th><th>主播口径承诺</th><th>库存锁定</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="it in ls.items" :key="it.id">
            <td>
              <div><b>{{ it.product?.name }}</b></div>
              <div class="small muted">{{ it.batch?.batchNo }}｜可供余量 {{ it.availableQty }}</div>
            </td>
            <td class="small">¥{{ it.price }}<br /><span class="muted">券 ¥{{ it.coupon }}</span></td>
            <td>{{ it.estimatedSales }}</td>
            <td><b :style="it.presaleQty < it.estimatedSales ? 'color:var(--amber)' : ''">{{ it.presaleQty }}</b></td>
            <td>
              <b :style="it.actualSoldQty > it.estimatedSales ? 'color:var(--red)' : ''">{{ it.actualSoldQty }}</b>
              <span v-if="it.actualSoldQty > it.estimatedSales" class="tag red" style="margin-left:4px">超预估</span>
            </td>
            <td class="small" style="max-width:220px">{{ it.anchorPromise }}</td>
            <td class="small">
              <span v-if="it.lock">已锁 {{ it.lock.qtyLocked }}（{{ it.lock.packagingMaterial }}）</span>
              <span v-else class="muted">未锁定</span>
            </td>
            <td><span class="tag" :class="itemStatus[it.status]?.cls">{{ itemStatus[it.status]?.label }}</span></td>
            <td class="row wrap" style="gap:5px">
              <button v-if="canOps && ls.status === 'planned'" class="mini ghost" @click="openAddItem(ls)">＋排品</button>
              <button v-if="canOps" class="mini ghost" @click="openPromise(it)">口径</button>
              <button v-if="canWh && !it.lock && ls.status === 'planned'" class="mini" @click="lock(it)">锁库存</button>
              <button v-if="canWh && it.lock?.status === 'locked'" class="mini ghost" @click="release(it)">释放</button>
              <button v-if="ls.status === 'live'" class="mini ghost" @click="openSales(it)">录销量</button>
              <router-link class="mini ghost" :to="`/fulfill?liveItem=${it.id}`" style="border:1px solid var(--line);border-radius:6px">下单/发货</router-link>
              <button v-if="it.status === 'ended' && canOps" class="mini ghost" @click="settle(it)">生成结算</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!ls.items.length" class="small muted" style="padding:10px 0">本场暂无排品。</div>
    </div>

    <!-- 新建场次 -->
    <div v-if="showSession" class="modal-mask" @click.self="showSession = false">
      <div class="modal">
        <h3>新建直播场次</h3>
        <div class="field"><label>专场名称</label><input v-model="sessionForm.title" placeholder="如 10·8 金秋丰收节专场" /></div>
        <div class="grid grid-2">
          <div class="field"><label>主播</label><input v-model="sessionForm.anchorName" /></div>
          <div class="field"><label>开播时间</label><input type="datetime-local" v-model="sessionForm.scheduledStart" /></div>
        </div>
        <div class="field"><label>脚本要点</label><textarea v-model="sessionForm.scriptSummary"></textarea></div>
        <div class="field"><label>样品试吃安排</label><input v-model="sessionForm.sampleTasting" /></div>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="showSession = false">取消</button><button @click="createSession">创建</button></div>
      </div>
    </div>

    <!-- 添加排品 -->
    <div v-if="addTarget" class="modal-mask" @click.self="addTarget = null">
      <div class="modal">
        <h3>为《{{ addTarget.title }}》排品</h3>
        <div class="field">
          <label>选择已选品商品</label>
          <select v-model.number="addForm.productId" @change="onPick">
            <option :value="0">请选择</option>
            <option v-for="p in selectedProducts" :key="p.id" :value="p.id">
              {{ p.name }}（{{ p.farmer?.name }}｜履约分 {{ p.selection?.fulfillScore }}）
            </option>
          </select>
        </div>
        <div v-if="picked" class="small" style="background:var(--green-light);padding:8px 10px;border-radius:6px;margin-bottom:10px;line-height:1.8">
          批次可供 {{ pickedBatch?.qty }}（已锁 {{ pickedBatch?.qtyLocked }}）｜农户稳定性 {{ picked.farmer?.stabilityScore }}｜批次坏果率 {{ pickedBatch?.badRate }}%<br />
          <b>系统建议预售量：{{ suggested }} 件</b>（实际排品时将自动取 min(预估销量, 可供余量, 建议值)）
        </div>
        <div class="grid grid-3">
          <div class="field"><label>直播价（元）</label><input type="number" step="0.1" v-model.number="addForm.price" /></div>
          <div class="field"><label>优惠券（元）</label><input type="number" step="0.1" v-model.number="addForm.coupon" /></div>
          <div class="field"><label>预计销量</label><input type="number" v-model.number="addForm.estimatedSales" /></div>
        </div>
        <div class="field"><label>主播口径承诺（须与规格/检测/口感一致，售后会反向核对）</label>
          <textarea v-model="addForm.anchorPromise" placeholder="如：单果80-100g，八分甜两分酸，坏果包赔，48小时冷链发出"></textarea>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="addTarget = null">取消</button><button @click="addItem">确认排品</button></div>
      </div>
    </div>

    <!-- 口径调整 / 销量录入 -->
    <div v-if="dialog" class="modal-mask" @click.self="dialog = null">
      <div class="modal">
        <h3>{{ dialog.title }}</h3>
        <div v-if="dialog.type === 'promise'" class="field">
          <label>主播口径承诺</label><textarea v-model="dialog.value"></textarea>
          <p class="small muted">口径与真实规格不一致时，售后会触发“承诺与规格不符”预警并影响下一场选品。</p>
        </div>
        <div v-else>
          <div class="field"><label>当前实际销量</label><input type="number" v-model.number="dialog.value" /></div>
          <p class="small muted">超过预估销量会生成预警；超过批次可供量将被下单接口拦截。</p>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="dialog = null">取消</button><button @click="submitDialog">保存</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api, store } from '../api.js';

const canOps = computed(() => ['county', 'operator'].includes(store.user.role));
const canWh = computed(() => ['county', 'warehouse', 'operator'].includes(store.user.role));
const sessions = ref([]);
const allProducts = ref([]);
const selectedProducts = computed(() => allProducts.value.filter(p => p.status === 'selected'));
const liveStatus = {
  planned: { label: '待播', cls: 'amber' }, live: { label: '直播中', cls: 'red' },
  finished: { label: '已结束', cls: 'gray' }, cancelled: { label: '已取消', cls: 'gray' },
};
const itemStatus = {
  planned: { label: '待锁库存', cls: 'amber' }, locked: { label: '库存已锁', cls: 'blue' },
  live: { label: '在售', cls: 'green' }, sold_out: { label: '售罄', cls: 'red' }, ended: { label: '已截单', cls: 'gray' },
};
const showSession = ref(false);
const sessionForm = ref({});
const addTarget = ref(null);
const addForm = ref({});
const dialog = ref(null);

const picked = computed(() => selectedProducts.value.find(p => p.id === addForm.value.productId));
const pickedBatch = computed(() => picked.value?.batches?.[0]);
const suggested = computed(() => {
  if (!picked.value || !pickedBatch.value) return 0;
  const f = picked.value.farmer;
  const stability = Number(f.stabilityScore), bad = Number(pickedBatch.value.badRate);
  const avail = pickedBatch.value.qty - pickedBatch.value.qtyLocked;
  return Math.floor(avail * Math.max(0.5, stability / 100) * Math.max(0.85, 1 - bad / 100));
});

async function load() {
  sessions.value = await api.get('/live-sessions');
  allProducts.value = await api.get('/products');
}
function fmtTime(t) { return t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }
async function createSession() {
  await api.post('/live-sessions', sessionForm.value);
  showSession.value = false; sessionForm.value = {};
  window.$toast?.('场次已创建');
  load();
}
function openAddItem(ls) {
  addTarget.value = ls;
  addForm.value = { productId: 0, price: 39.9, coupon: 5, estimatedSales: 500, anchorPromise: '' };
}
function onPick() {
  const p = picked.value;
  if (p) addForm.value.anchorPromise = p.promiseText;
}
async function addItem() {
  await api.post(`/live-sessions/${addTarget.value.id}/items`, addForm.value);
  addTarget.value = null;
  window.$toast?.('排品完成，预售量已按稳定性与坏果率自动折算');
  load();
}
async function lock(it) {
  await api.post(`/live-items/${it.id}/lock`, {});
  window.$toast?.('库存与包装材料已锁定');
  load();
}
async function release(it) {
  await api.post(`/live-items/${it.id}/release-lock`, {});
  window.$toast?.('库存已释放');
  load();
}
function openPromise(it) { dialog.value = { type: 'promise', id: it.id, title: '调整主播口径', value: it.anchorPromise }; }
function openSales(it) { dialog.value = { type: 'sales', id: it.id, title: '录入实时销量', value: it.actualSoldQty }; }
async function submitDialog() {
  const d = dialog.value;
  if (d.type === 'promise') await api.post(`/live-items/${d.id}/promise`, { anchorPromise: d.value });
  else await api.post(`/live-items/${d.id}/sales`, { actualSoldQty: Number(d.value) });
  dialog.value = null;
  window.$toast?.('已保存，风险已同步扫描');
  load();
}
async function goLive(ls) { await api.post(`/live-sessions/${ls.id}/go-live`, {}); load(); }
async function finish(ls) { await api.post(`/live-sessions/${ls.id}/finish`, {}); window.$toast?.('已截单，可生成发货任务与结算'); load(); }
async function settle(it) {
  const s = await api.post(`/live-items/${it.id}/settle`, {});
  window.$toast?.(`结算单已生成：应付农户 ¥${s.netAmount}`);
  load();
}
onMounted(load);
</script>
