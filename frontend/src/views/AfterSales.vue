<template>
  <div>
    <div class="card">
      <div class="row wrap">
        <h3 style="margin:0">🛠️ 售后处置（结论反向影响选品 / 主播口径 / 预售量 / 品牌公告）</h3>
        <div class="spacer"></div>
        <select v-model="statusFilter" style="width:130px" @change="load">
          <option value="">全部</option><option value="open">待处理</option><option value="handled">已处理</option>
        </select>
        <button v-if="store.user.role !== 'farmer'" class="ghost" @click="showCreate = true">＋ 登记售后</button>
        <button class="ghost" @click="load">刷新</button>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="kpi"><div class="num red">{{ stats.bad }}</div><div class="label">坏果售后（直接拉低农户稳定性）</div></div>
      <div class="kpi"><div class="num amber">{{ stats.taste }}</div><div class="label">口味不符（触发主播口径整改）</div></div>
      <div class="kpi"><div class="num">{{ stats.hit }}/{{ list.length }}</div><div class="label">售后中反馈“影响复购”占比</div></div>
    </div>

    <div v-for="a in list" :key="a.id" class="card">
      <div class="row wrap" style="align-items:flex-start">
        <div style="flex:1;min-width:320px">
          <div class="row wrap">
            <span class="tag red">{{ reasonLabel[a.reason] }}</span>
            <b>{{ a.productName }}</b>
            <span class="small muted">{{ a.orderNo }}｜批次 {{ a.batchNo }}</span>
            <span class="tag" :class="a.status === 'open' ? 'amber' : 'gray'">{{ a.status === 'open' ? '待处理' : '已处理' }}</span>
            <span v-if="a.repurchaseHit" class="tag red">影响复购</span>
          </div>
          <div class="small" style="margin-top:6px;line-height:1.7">
            用户诉求：{{ a.description }}｜数量 {{ a.qty }}｜索赔 ¥{{ a.claimAmount }}
            <template v-if="a.status === 'handled'"><br />处置：{{ resolutionLabel[a.resolution] }} ¥{{ a.finalAmount }}｜{{ a.handleNote }}</template>
          </div>
          <div v-if="a.status === 'handled' && a.feedback" class="small" style="margin-top:8px;background:var(--amber-light);border-radius:6px;padding:8px 10px;line-height:1.8">
            <b>🔁 反向影响：</b>
            <div v-for="(f, i) in a.feedback" :key="i">· {{ f }}</div>
          </div>
        </div>
        <button v-if="a.status === 'open'" class="mini" @click="openHandle(a)">处置</button>
      </div>
    </div>

    <!-- 登记售后 -->
    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <div class="modal">
        <h3>登记售后单</h3>
        <div class="field">
          <label>选择订单</label>
          <select v-model.number="createForm.orderId">
            <option :value="0">请选择</option>
            <option v-for="o in orders" :key="o.id" :value="o.id">{{ o.orderNo }} - {{ o.productName }}（{{ o.city }}）</option>
          </select>
        </div>
        <div class="field">
          <label>售后原因</label>
          <select v-model="createForm.reason">
            <option v-for="(label, key) in reasonLabel" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div class="grid grid-2">
          <div class="field"><label>数量</label><input type="number" v-model.number="createForm.qty" /></div>
          <div class="field"><label>索赔金额</label><input type="number" step="0.1" v-model.number="createForm.claimAmount" /></div>
        </div>
        <div class="field"><label>问题描述</label><textarea v-model="createForm.description"></textarea></div>
        <label class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:12px">
          <input type="checkbox" style="width:auto" v-model="createForm.repurchaseHit" /> 该问题会影响用户复购
        </label>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="showCreate = false">取消</button><button @click="createAfter">提交</button></div>
      </div>
    </div>

    <!-- 处置 -->
    <div v-if="target" class="modal-mask" @click.self="target = null">
      <div class="modal">
        <h3>售后处置 — {{ reasonLabel[target.reason] }}</h3>
        <p class="small muted">{{ target.productName }}｜{{ target.orderNo }}｜用户索赔 ¥{{ target.claimAmount }}</p>
        <div class="field">
          <label>处置方式</label>
          <select v-model="form.resolution">
            <option value="refund">退款（坏果/口味不符）</option>
            <option value="resend">补发（少发/漏发）</option>
            <option value="discount">折价补偿/优惠券（物流延误）</option>
            <option value="reject">驳回（非平台责任）</option>
          </select>
        </div>
        <div class="field"><label>最终金额（元）</label><input type="number" step="0.1" v-model.number="form.finalAmount" /></div>
        <div class="field"><label>处置说明（同步农户与下一场运营）</label><textarea v-model="form.handleNote"></textarea></div>
        <label class="row" style="display:flex;gap:6px;align-items:center;margin-bottom:12px">
          <input type="checkbox" style="width:auto" v-model="form.repurchaseHit" /> 该售后会影响复购（计入复盘分析）
        </label>
        <div class="small" style="background:var(--red-light);border-radius:6px;padding:8px 10px;margin-bottom:10px;line-height:1.8">
          处置后系统将自动：
          <div v-if="target.reason === 'bad_fruit'">· 更新该批次估算坏果率，≥8% 触发红线并计 2% 品质违约金；农户稳定性下调</div>
          <div v-if="target.reason === 'short'">· 下调农户交货稳定性与准时率</div>
          <div v-if="target.reason === 'taste_mismatch'">· 生成“承诺与规格不符”预警，下一场调整主播口径</div>
          <div v-if="target.reason === 'delay'">· 计入温区/城市履约表现，影响后续预售节奏</div>
          <div>· 计入县域复盘：是否继续选择该农户 / 是否降低预售量 / 是否发布品牌风险说明</div>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="target = null">取消</button><button @click="submit">完成处置</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api, store, REASON_LABEL } from '../api.js';

const reasonLabel = REASON_LABEL;
const resolutionLabel = { refund: '退款', resend: '补发', discount: '折价补偿', reject: '驳回' };
const list = ref([]);
const orders = ref([]);
const statusFilter = ref('open');
const showCreate = ref(false);
const target = ref(null);
const form = ref({});
const createForm = ref({ reason: 'bad_fruit', qty: 1, claimAmount: 20, description: '', repurchaseHit: true });

const stats = computed(() => ({
  bad: list.value.filter(a => a.reason === 'bad_fruit').length,
  taste: list.value.filter(a => a.reason === 'taste_mismatch').length,
  hit: list.value.filter(a => a.repurchaseHit).length,
}));

async function load() {
  const qs = [];
  if (statusFilter.value) qs.push('status=' + statusFilter.value);
  if (store.user.role === 'farmer') qs.push('farmerId=' + store.user.farmerId);
  list.value = await api.get(`/after-sales${qs.length ? '?' + qs.join('&') : ''}`);
  orders.value = await api.get('/orders');
}
function openHandle(a) {
  target.value = a;
  form.value = { resolution: a.reason === 'short' ? 'resend' : a.reason === 'delay' ? 'discount' : 'refund', finalAmount: Number(a.claimAmount), handleNote: '', repurchaseHit: a.repurchaseHit };
}
async function submit() {
  const r = await api.post(`/after-sales/${target.value.id}/handle`, form.value);
  target.value = null;
  window.$toast?.('处置完成，已反向更新批次与农户数据');
  await load();
  const item = list.value.find(x => x.id === r.afterSale.id);
  if (item) item.feedback = r.feedback;
}
async function createAfter() {
  if (!createForm.value.orderId) return window.$toast?.('请选择订单', true);
  await api.post('/after-sales', createForm.value);
  showCreate.value = false;
  statusFilter.value = 'open';
  window.$toast?.('售后单已登记');
  load();
}
onMounted(load);
</script>
