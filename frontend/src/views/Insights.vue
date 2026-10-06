<template>
  <div>
    <div class="card">
      <h3>📈 县域复盘分析</h3>
      <div class="small muted">数据沿批次链路自动汇总，回答三个问题：哪些农户稳定、哪些品类适合直播、哪些售后原因影响复购。</div>
    </div>

    <div class="card">
      <h3>🧑‍🌾 农户稳定性复盘（决定下一场是否继续合作 / 预售量系数）</h3>
      <table>
        <thead><tr><th>农户/合作社</th><th>稳定性</th><th>准时率</th><th>历史坏果率</th><th>复购率</th><th>订单/售后</th><th>销量</th><th>预测准确度</th><th>运营结论</th></tr></thead>
        <tbody>
          <tr v-for="f in farmers" :key="f.id">
            <td><div><b>{{ f.name }}</b></div><div class="small muted">{{ f.region }}</div></td>
            <td>
              <div class="small">{{ f.stabilityScore }}/100</div>
              <div class="bar" :class="f.stabilityScore < 70 ? 'red' : f.stabilityScore < 85 ? 'amber' : ''"><span :style="{ width: f.stabilityScore + '%' }"></span></div>
            </td>
            <td class="small">{{ f.onTimeRate }}%</td>
            <td :style="f.badRateAvg >= 5 ? 'color:var(--red);font-weight:700' : ''">{{ f.badRateAvg }}%</td>
            <td class="small">{{ f.repurchaseRate }}%</td>
            <td class="small">{{ f.orderCount }} / <span :style="f.afterSaleCount ? 'color:var(--red)' : ''">{{ f.afterSaleCount }}</span></td>
            <td>{{ f.sold }}</td>
            <td>{{ f.forecastAccuracy === null ? '—' : f.forecastAccuracy + '%' }}</td>
            <td><span class="tag" :class="f.stabilityScore >= 85 ? 'green' : f.stabilityScore >= 70 ? 'amber' : 'red'">{{ f.verdict }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3>🍯 品类直播适配度（GMV / 预估达成 / 售后结构）</h3>
        <div v-for="c in categories" :key="c.category" style="margin-bottom:14px">
          <div class="row small"><b style="width:44px">{{ c.category }}</b><span class="muted">售出 {{ c.sold }}｜GMV ¥{{ c.gmv }}｜达成预估 {{ c.achieveRate }}%</span></div>
          <div class="bar" :class="c.achieveRate < 60 ? 'red' : c.achieveRate < 100 ? 'amber' : ''"><span :style="{ width: Math.min(100, c.achieveRate) + '%' }"></span></div>
          <div class="small muted" style="margin-top:3px">售后 {{ c.afterCount }} 单（坏果 {{ c.badCount }} / 口味 {{ c.tasteCount }}）</div>
          <div class="small" style="color:var(--green-dark)">→ {{ c.verdict }}</div>
        </div>
      </div>

      <div class="card">
        <h3>🔁 售后原因 × 复购影响（决定口径调整与品牌说明）</h3>
        <div v-for="r in reasons" :key="r.reason" style="margin-bottom:12px">
          <div class="chart-row">
            <div class="name">{{ r.label }}</div>
            <div class="track">
              <div class="bar" :class="r.repurchaseHitRate >= 80 && r.count ? 'red' : r.repurchaseHitRate >= 40 ? 'amber' : ''">
                <span :style="{ width: r.share + '%' }"></span>
              </div>
            </div>
            <div class="val">{{ r.count }} 单（占 {{ r.share }}%）</div>
          </div>
          <div class="small" style="padding-left:100px">
            复购影响率 <b :style="r.repurchaseHitRate >= 80 && r.count ? 'color:var(--red)' : ''">{{ r.repurchaseHitRate }}%</b>
            ｜赔付成本 ¥{{ r.cost }}
            <span style="color:var(--green-dark)">｜{{ reasonAction[r.reason] }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>🕳️ 批次履约漏斗</h3>
      <div class="grid" style="grid-template-columns:repeat(6,1fr);gap:10px;text-align:center">
        <div class="kpi"><div class="num">{{ funnel.batches }}</div><div class="label">可供批次</div><div class="small muted">少供 {{ funnel.batchesShort }}</div></div>
        <div class="kpi"><div class="num">{{ funnel.liveItems }}</div><div class="label">直播排品</div></div>
        <div class="kpi"><div class="num">{{ funnel.lockedQty }}</div><div class="label">锁定库存（件）</div></div>
        <div class="kpi"><div class="num">{{ funnel.soldQty }}</div><div class="label">成交（件）</div></div>
        <div class="kpi"><div class="num">{{ funnel.deliveredOrders }}/{{ funnel.shippedOrders }}</div><div class="label">签收/已发订单</div></div>
        <div class="kpi"><div class="num" :class="funnel.afterSales ? 'red' : ''">{{ funnel.afterSales }}</div><div class="label">售后单</div></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const farmers = ref([]);
const categories = ref([]);
const reasons = ref([]);
const funnel = ref({});
const reasonAction = {
  bad_fruit: '降低该农户预售量，全检后再上架',
  short: '下一场按稳定性系数核减排期量',
  delay: '调整冷链城市承诺，加配备用车辆',
  wrong_address: '下单后 1 小时内客服核址',
  rejected: '优化派送时效，生鲜二次配送',
  taste_mismatch: '立即整改主播口径，脚本评审复核',
};
onMounted(async () => {
  [farmers.value, categories.value, reasons.value, funnel.value] = await Promise.all([
    api.get('/insights/farmers'),
    api.get('/insights/categories'),
    api.get('/insights/after-sale-reasons'),
    api.get('/insights/batch-funnel'),
  ]);
});
</script>
