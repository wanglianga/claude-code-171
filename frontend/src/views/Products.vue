<template>
  <div>
    <div class="card">
      <div class="row wrap">
        <h3 style="margin:0">🍎 商品申报与批次</h3>
        <div class="spacer"></div>
        <select v-model="statusFilter" style="width:130px" @change="load">
          <option value="">全部状态</option>
          <option value="submitted">已申报待选品</option>
          <option value="selected">已选品</option>
          <option value="rejected">已退回</option>
        </select>
        <button v-if="isFarmer" @click="showCreate = true">＋ 申报新商品</button>
        <button class="ghost" @click="load">刷新</button>
      </div>
    </div>

    <div v-for="p in products" :key="p.id" class="card">
      <div class="row wrap" style="align-items:flex-start">
        <div style="flex:1;min-width:300px">
          <div class="row wrap">
            <h3 style="margin:0">{{ p.name }}</h3>
            <span class="tag green">{{ p.category }}</span>
            <span class="tag" :class="statusClass(p.status)">{{ statusLabel[p.status] }}</span>
            <span v-if="p.selection" class="tag blue">履约分 {{ p.selection.fulfillScore }}</span>
          </div>
          <div class="small muted" style="margin-top:6px;line-height:1.8">
            农户：{{ p.farmer?.name }}（{{ p.farmer?.region }}）｜产地：{{ p.origin }}<br />
            规格：{{ p.spec }}｜库存 {{ p.stockQty }}｜采摘 {{ p.harvestDate }}｜保质期 {{ p.shelfLifeDays }} 天｜冷链要求：{{ p.coldChainRequirement }}<br />
            检测报告：{{ p.testReportNo || '未提供' }}（有效期至 {{ p.testReportExpiry || '—' }}）｜样品试吃 {{ p.tastingScore || '未评' }}/10｜包装耐压 {{ p.packagingPressure }}/5
            <template v-if="p.coldChainCities">｜冷链可达 {{ p.coldChainCities }}</template>
          </div>
          <div class="small" style="margin-top:6px;background:var(--green-light);padding:7px 10px;border-radius:6px">
            商品承诺：{{ p.promiseText || '（未填写）' }}
          </div>
        </div>
        <div class="row wrap" style="gap:6px">
          <button class="ghost mini" @click="openEval(p)">🔍 履约能力评估</button>
          <button v-if="!isFarmer" class="ghost mini" @click="openTasting(p)">试吃记录</button>
          <button v-if="!isFarmer" class="ghost mini" @click="openReport(p)">复检报告</button>
          <button v-if="isFarmer" class="ghost mini" @click="openBatch(p)">＋ 批次</button>
          <button v-if="!isFarmer && p.status === 'submitted'" class="mini" @click="openSelect(p)">选品决策</button>
        </div>
      </div>

      <table style="margin-top:12px">
        <thead><tr><th>批次号</th><th>采摘</th><th>可供/锁定/已售</th><th>温区</th><th>坏果率</th><th>报告有效期</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="b in p.batches" :key="b.id">
            <td><router-link :to="`/trace?batchId=${b.id}`">{{ b.batchNo }}</router-link></td>
            <td class="small">{{ b.harvestDate }}</td>
            <td class="small">{{ b.qty }} / {{ b.qtyLocked }} / {{ b.qtySold }}</td>
            <td>{{ b.tempZone }}</td>
            <td>
              <span :style="Number(b.badRate) >= 8 ? 'color:var(--red);font-weight:700' : Number(b.badRate) >= 5 ? 'color:var(--amber);font-weight:700' : ''">
                {{ b.badRate }}%
              </span>
            </td>
            <td class="small">{{ b.testReportExpiry }}</td>
            <td><span class="tag" :class="b.status === 'short' ? 'red' : b.status === 'closed' ? 'gray' : 'green'">{{ batchStatus[b.status] }}</span></td>
            <td class="row" style="gap:5px">
              <button class="mini ghost" @click="openBatchEvent(b, 'badRate')">更新坏果率</button>
              <button v-if="b.status !== 'short'" class="mini danger" @click="batchEvent(b, { status: 'short' })">标记临时少供</button>
              <button v-else class="mini ghost" @click="batchEvent(b, { status: 'available' })">恢复供货</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="p.selection?.decisionNote" class="small" style="margin-top:8px">
        <b>选品结论：</b>{{ p.selection.decisionNote }}
      </div>
    </div>

    <!-- 申报商品 -->
    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <div class="modal" style="width:680px">
        <h3>申报农产品</h3>
        <div class="grid grid-2">
          <div class="field"><label>商品名称</label><input v-model="form.name" placeholder="如 云栖红心猕猴桃" /></div>
          <div class="field"><label>品类</label>
            <select v-model="form.category"><option v-for="c in cats" :key="c">{{ c }}</option></select>
          </div>
          <div class="field"><label>产地</label><input v-model="form.origin" /></div>
          <div class="field"><label>规格</label><input v-model="form.spec" placeholder="如 24枚装 净重4.5斤" /></div>
          <div class="field"><label>采摘时间</label><input type="date" v-model="form.harvestDate" /></div>
          <div class="field"><label>库存数量</label><input type="number" v-model.number="form.stockQty" /></div>
          <div class="field"><label>保质期（天）</label><input type="number" v-model.number="form.shelfLifeDays" /></div>
          <div class="field"><label>冷链要求</label>
            <select v-model="form.coldChainRequirement"><option>常温</option><option>冷藏</option><option>冷冻</option></select>
          </div>
          <div class="field"><label>检测报告编号</label><input v-model="form.testReportNo" /></div>
          <div class="field"><label>报告检测日期</label><input type="date" v-model="form.testReportDate" /></div>
          <div class="field"><label>报告有效期至</label><input type="date" v-model="form.testReportExpiry" /></div>
          <div class="field"><label>包装耐压等级（1-5）</label><input type="number" min="1" max="5" v-model.number="form.packagingPressure" /></div>
        </div>
        <div class="field"><label>冷链可达城市（逗号分隔）</label><input v-model="form.coldChainCities" placeholder="杭州,上海,南京…" /></div>
        <div class="field"><label>商品承诺（直播话术依据，将与真实履约能力逐项核对）</label>
          <textarea v-model="form.promiseText" placeholder="如：产地现摘冷藏直发，坏果包赔，48小时冷链发出，八分甜两分酸"></textarea>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="showCreate = false">取消</button><button @click="createProduct">提交申报</button></div>
      </div>
    </div>

    <!-- 批次登记 -->
    <div v-if="batchTarget" class="modal-mask" @click.self="batchTarget = null">
      <div class="modal">
        <h3>登记可供直播批次 — {{ batchTarget.name }}</h3>
        <div class="field"><label>批次号</label><input v-model="batchForm.batchNo" placeholder="如 MHT-20261008-B" /></div>
        <div class="grid grid-2">
          <div class="field"><label>采摘日期</label><input type="date" v-model="batchForm.harvestDate" /></div>
          <div class="field"><label>可供数量</label><input type="number" v-model.number="batchForm.qty" /></div>
          <div class="field"><label>温区</label><select v-model="batchForm.tempZone"><option>常温</option><option>冷藏</option><option>冷冻</option></select></div>
          <div class="field"><label>抽检坏果率%</label><input type="number" step="0.1" v-model.number="batchForm.badRate" /></div>
        </div>
        <div class="field"><label>检测报告有效期至</label><input type="date" v-model="batchForm.testReportExpiry" /></div>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="batchTarget = null">取消</button><button @click="createBatch">登记</button></div>
      </div>
    </div>

    <!-- 履约评估 -->
    <div v-if="evalTarget" class="modal-mask" @click.self="evalTarget = null">
      <div class="modal" style="width:720px">
        <h3>上架前履约能力评估 — {{ evalTarget.product.name }}</h3>
        <div class="row" style="align-items:center;margin-bottom:10px">
          <div style="font-size:34px;font-weight:800" :style="scoreColor(ev.score)">{{ ev.score }}</div>
          <div>
            <div class="tag" :class="ev.level === 'high' ? 'green' : ev.level === 'medium' ? 'amber' : 'red'">
              {{ ev.level === 'high' ? '履约能力强，可主推' : ev.level === 'medium' ? '基本可播，需控制口径与预售量' : '风险较高，建议暂缓上架' }}
            </div>
            <div class="small muted" style="margin-top:4px">建议预售量（已按农户稳定性与坏果率折算）：<b style="color:var(--green-dark)">{{ evalTarget.suggestedPresale ?? '—' }}</b> 件</div>
          </div>
        </div>
        <div v-for="part in ev.parts" :key="part.label" style="margin-bottom:10px">
          <div class="row small"><b style="width:110px">{{ part.label }}</b><span class="muted">{{ part.score }}/{{ part.max }}</span><div class="spacer"></div><span class="muted">{{ part.detail }}</span></div>
          <div class="bar" :class="part.score / part.max < 0.5 ? 'red' : part.score / part.max < 0.75 ? 'amber' : ''" style="margin-top:3px">
            <span :style="{ width: (part.score / part.max * 100) + '%' }"></span>
          </div>
        </div>
        <h4>❗ 商品承诺 vs 真实履约能力的差距</h4>
        <table v-if="ev.gaps.length">
          <thead><tr><th>承诺点</th><th>直播承诺</th><th>真实情况</th><th>整改建议</th></tr></thead>
          <tbody>
            <tr v-for="(g, i) in ev.gaps" :key="i"><td>{{ g.point }}</td><td class="small">{{ g.promise }}</td><td class="small">{{ g.reality }}</td><td class="small">{{ g.suggestion }}</td></tr>
          </tbody>
        </table>
        <div v-else class="small" style="color:var(--green)">当前承诺与履约能力未发现明显差距。</div>
        <h4>📌 综合建议</h4>
        <ul class="small" style="margin:4px 0;padding-left:18px;line-height:1.8"><li v-for="(s, i) in ev.suggestions" :key="i">{{ s }}</li></ul>
        <div class="row" style="justify-content:flex-end;margin-top:10px"><button @click="evalTarget = null">关闭</button></div>
      </div>
    </div>

    <!-- 选品决策 -->
    <div v-if="selectTarget" class="modal-mask" @click.self="selectTarget = null">
      <div class="modal">
        <h3>选品决策 — {{ selectTarget.name }}</h3>
        <p class="small muted">系统已留存履约评分项与承诺差距。选中后该商品可排入直播场次。</p>
        <div class="field"><label>决策说明（同步主播/仓库/售后）</label><textarea v-model="selectNote"></textarea></div>
        <div class="row" style="justify-content:flex-end">
          <button class="ghost danger" style="border-color:var(--red);color:var(--red)" @click="doSelect('rejected')">退回整改</button>
          <button @click="doSelect('selected')">确认选品</button>
        </div>
      </div>
    </div>

    <!-- 试吃 / 复检 / 坏果率 通用小弹窗 -->
    <div v-if="mini" class="modal-mask" @click.self="mini = null">
      <div class="modal">
        <h3>{{ mini.title }}</h3>
        <div v-if="mini.type === 'tasting'">
          <div class="field"><label>试吃评分（0-10）</label><input type="number" step="0.1" min="0" max="10" v-model.number="mini.v1" /></div>
          <div class="field"><label>口感备注（甜度/酸度/脆度等）</label><textarea v-model="mini.v2"></textarea></div>
        </div>
        <div v-else-if="mini.type === 'report'">
          <div class="field"><label>检测报告编号</label><input v-model="mini.v1" /></div>
          <div class="grid grid-2">
            <div class="field"><label>检测日期</label><input type="date" v-model="mini.v2" /></div>
            <div class="field"><label>有效期至</label><input type="date" v-model="mini.v3" /></div>
          </div>
        </div>
        <div v-else>
          <div class="field"><label>本批次实测坏果率%</label><input type="number" step="0.1" v-model.number="mini.v1" /></div>
          <p class="small muted">≥5% 预警、≥8% 触发红线并在结算中计品质违约金。</p>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="mini = null">取消</button><button @click="submitMini">保存</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { api, store } from '../api.js';

const isFarmer = computed(() => store.user.role === 'farmer');
const cats = ['水果', '米面', '菌菇', '蜂蜜', '腊味'];
const products = ref([]);
const statusFilter = ref('');
const statusLabel = { submitted: '已申报待选品', selected: '已选品', rejected: '已退回', draft: '草稿', on_shelf: '已上架' };
const batchStatus = { available: '可供', locked: '已锁库存', short: '临时少供', closed: '已结案' };
const statusClass = (s) => s === 'selected' ? 'green' : s === 'rejected' ? 'red' : 'amber';

const showCreate = ref(false);
const form = ref({});
const batchTarget = ref(null);
const batchForm = ref({});
const evalTarget = ref(null);
const ev = ref({ parts: [], gaps: [], suggestions: [], score: 0 });
const selectTarget = ref(null);
const selectNote = ref('');
const mini = ref(null);

async function load() {
  products.value = await api.get(`/products${statusFilter.value ? '?status=' + statusFilter.value : ''}`);
}
async function createProduct() {
  await api.post('/products', form.value);
  showCreate.value = false; form.value = {};
  window.$toast?.('商品已申报，等待运营选品');
  load();
}
function openBatch(p) {
  batchTarget.value = p;
  batchForm.value = { batchNo: '', harvestDate: p.harvestDate, qty: p.stockQty, tempZone: p.coldChainRequirement, badRate: 0, testReportExpiry: p.testReportExpiry };
}
async function createBatch() {
  await api.post('/batches', { productId: batchTarget.value.id, ...batchForm.value });
  batchTarget.value = null;
  window.$toast?.('批次已登记，系统已扫描报告有效期与坏果率风险');
  load();
}
async function openEval(p) {
  const b = p.batches?.[0];
  ev.value = await api.get(`/products/${p.id}/evaluation${b ? '?batchId=' + b.id : ''}`);
  evalTarget.value = { product: p, suggestedPresale: ev.value.suggestedPresale };
}
const scoreColor = (s) => `color:${s >= 80 ? 'var(--green-dark)' : s >= 60 ? 'var(--amber)' : 'var(--red)'}`;
function openSelect(p) { selectTarget.value = p; selectNote.value = ''; }
async function doSelect(status) {
  await api.post(`/products/${selectTarget.value.id}/select`, { status, decisionNote: selectNote.value });
  selectTarget.value = null;
  window.$toast?.(status === 'selected' ? '已选品，可排入直播' : '已退回农户整改');
  load();
}
function openTasting(p) { mini.value = { type: 'tasting', title: `样品试吃 — ${p.name}`, pid: p.id, v1: Number(p.tastingScore) || 8, v2: p.tastingNote }; }
function openReport(p) { mini.value = { type: 'report', title: `复检报告 — ${p.name}`, pid: p.id, v1: p.testReportNo, v2: p.testReportDate, v3: p.testReportExpiry }; }
function openBatchEvent(b, type) { mini.value = { type: 'badRate', title: `更新坏果率 — ${b.batchNo}`, batchId: b.id, v1: Number(b.badRate) }; }
async function batchEvent(b, payload) {
  await api.post(`/batches/${b.id}/event`, payload);
  window.$toast?.('批次状态已更新，风险已重新扫描');
  load();
}
async function submitMini() {
  const m = mini.value;
  if (m.type === 'tasting') await api.post(`/products/${m.pid}/tasting`, { tastingScore: m.v1, tastingNote: m.v2 });
  else if (m.type === 'report') await api.post(`/products/${m.pid}/report`, { testReportNo: m.v1, testReportDate: m.v2, testReportExpiry: m.v3 });
  else await batchEvent({ id: m.batchId }, { badRate: m.v1 });
  mini.value = null;
  load();
}
onMounted(load);
</script>
