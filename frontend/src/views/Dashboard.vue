<template>
  <div>
    <div class="grid grid-4">
      <div class="kpi"><div class="num">{{ kpi.productCount }}</div><div class="label">申报商品 / 已选品 {{ kpi.selectedCount }}</div></div>
      <div class="kpi"><div class="num">{{ kpi.liveCount }}</div><div class="label">直播场次（待播 {{ kpi.plannedLiveCount }}）</div></div>
      <div class="kpi"><div class="num">{{ kpi.orderCount }}</div><div class="label">订单数 · GMV ¥{{ fmt(kpi.gmv) }}</div></div>
      <div class="kpi"><div class="num" :class="kpi.highAlertCount ? 'red' : ''">{{ kpi.openAlertCount }}</div><div class="label">未处置预警（高优 {{ kpi.highAlertCount }}）</div></div>
    </div>
    <div class="grid grid-4" style="margin-top:14px">
      <div class="kpi"><div class="num amber">{{ kpi.afterSaleCount }}</div><div class="label">售后单 · 售后率 {{ kpi.afterRate }}%</div></div>
      <div class="kpi"><div class="num red">{{ kpi.repurchaseHitCount }}</div><div class="label">影响复购的售后</div></div>
      <div class="kpi"><div class="num">{{ kpi.farmerCount }}</div><div class="label">入驻农户/合作社</div></div>
      <div class="kpi"><div class="num muted" style="color:var(--muted)">同一条批次链路</div><div class="label">选品→直播→库存→发货→售后→结算</div></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>⚠️ 待处置风险预警</h3>
      <table>
        <thead><tr><th>级别</th><th>类型</th><th>预警内容</th><th>批次/农户</th><th>处置建议</th><th>状态</th><th></th></tr></thead>
        <tbody>
          <tr v-for="a in alerts" :key="a.id">
            <td><span class="tag" :class="a.severity === 'high' ? 'red' : 'amber'">{{ a.severity === 'high' ? '高' : '中' }}</span></td>
            <td>{{ typeLabel[a.type] || a.type }}</td>
            <td>{{ a.message }}</td>
            <td class="small"><div>{{ a.batchNo || '—' }}</div><div class="muted">{{ a.farmerName || '' }}</div></td>
            <td class="small" style="max-width:280px">{{ a.suggestion }}</td>
            <td><span class="tag" :class="a.status === 'open' ? 'red' : 'gray'">{{ a.status === 'open' ? '未处置' : '已处置' }}</span></td>
            <td>
              <button v-if="a.status === 'open'" class="mini ghost" @click="openHandle(a)">处置</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3>🔁 风险如何沿批次链路联动</h3>
        <ul class="small" style="line-height:1.9;padding-left:18px;margin:6px 0">
          <li>检测报告过期 → 选品评估归零分、暂停上架，复检后同步全部批次</li>
          <li>销量超预估/超供给 → 触发超卖预警，下单接口直接拦截超卖</li>
          <li>农户临时少供 → 批次置为少供，按已锁库存核减预售</li>
          <li>冷链车晚到 → 发货挂起、延误预警，客户补偿优惠券</li>
          <li>同批次坏果率 ≥8% → 红线预警、品质违约金、建议品牌风险说明</li>
          <li>主播承诺与规格不符 → 下一场调整口径、预售量按稳定性下调</li>
        </ul>
      </div>
      <div class="card">
        <h3>🧭 各角色工作台入口</h3>
        <div class="small" style="line-height:2">
          <div><b>农户/合作社</b>：商品与批次申报、上传检测报告、查看本社结算</div>
          <div><b>选品运营</b>：上架前履约评估、主播脚本口径、价格优惠券、预售量</div>
          <div><b>仓库</b>：按直播排期锁库存与包装材料、温区分拣、发货任务</div>
          <div><b>售后客服</b>：六类售后处置，结论反写批次坏果率与农户稳定性</div>
          <div><b>县域运营方</b>：农户/品类/售后复盘、公共品牌风险说明发布</div>
        </div>
      </div>
    </div>

    <div v-if="handling" class="modal-mask" @click.self="handling = null">
      <div class="modal">
        <h3>处置预警</h3>
        <p class="small muted">{{ handling.message }}</p>
        <div class="field"><label>处置说明</label><textarea v-model="note" placeholder="如：已联系农户复检，报告周三前补齐"></textarea></div>
        <div class="row" style="justify-content:flex-end">
          <button class="ghost" @click="handling = null">取消</button>
          <button @click="submit">确认处置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const kpi = ref({});
const alerts = ref([]);
const handling = ref(null);
const note = ref('');
const typeLabel = {
  report_expired: '检测报告过期', report_expiring: '报告即将到期', oversell_forecast: '销量超预估',
  oversell_supply: '销量超供给', short_supply: '农户临时少供', cold_chain_late: '冷链车晚到',
  batch_bad_rate: '批次坏果率升高', promise_mismatch: '承诺与规格不符',
};
const fmt = (n) => Number(n || 0).toLocaleString();

async function load() {
  const d = await api.get('/insights/overview');
  kpi.value = d.kpi;
  alerts.value = d.alerts;
}
function openHandle(a) { handling.value = a; note.value = ''; }
async function submit() {
  await api.post(`/risk-alerts/${handling.value.id}/handle`, { handleNote: note.value, status: 'handled' });
  handling.value = null;
  window.$toast?.('预警已处置');
  load();
}
onMounted(load);
</script>
