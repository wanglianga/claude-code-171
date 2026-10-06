<template>
  <div>
    <div class="card">
      <div class="row wrap">
        <h3 style="margin:0">📢 县域公共品牌 · 风险说明</h3>
        <div class="spacer"></div>
        <button @click="showCreate = true">＋ 起草风险说明</button>
        <button class="ghost" @click="load">刷新</button>
      </div>
      <div class="small muted" style="margin-top:6px">
        当同批次坏果率超红线、主播承诺与规格不一致等事件发生时，县域运营方可对外发布统一风险说明，保护公共品牌信誉。
      </div>
    </div>

    <div v-for="n in notices" :key="n.id" class="card">
      <div class="row wrap">
        <h3 style="margin:0">{{ n.title }}</h3>
        <span class="tag" :class="n.status === 'published' ? 'green' : 'amber'">{{ n.status === 'published' ? '已发布' : '草稿' }}</span>
        <div v-if="n.batchId"><router-link class="small" :to="`/trace?batchId=${n.batchId}`">关联批次 #{{ n.batchId }}</router-link></div>
        <div class="spacer"></div>
        <span v-if="n.publishedAt" class="small muted">发布于 {{ fmt(n.publishedAt) }}</span>
        <button v-if="n.status === 'draft'" class="mini" @click="publish(n)">发布说明</button>
      </div>
      <p class="small" style="line-height:1.9;margin-bottom:0">{{ n.content }}</p>
    </div>

    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <div class="modal">
        <h3>起草品牌风险说明</h3>
        <div class="field"><label>标题</label><input v-model="form.title" /></div>
        <div class="field">
          <label>关联批次（可选）</label>
          <select v-model.number="form.batchId">
            <option :value="null">不关联</option>
            <option v-for="b in batches" :key="b.id" :value="b.id">{{ b.batchNo }} - {{ b.productName }}</option>
          </select>
        </div>
        <div class="field"><label>说明内容（事实、赔付方案、后续整改）</label><textarea v-model="form.content" style="min-height:120px"></textarea></div>
        <div class="row" style="justify-content:flex-end"><button class="ghost" @click="showCreate = false">取消</button><button @click="create">保存草稿</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const notices = ref([]);
const batches = ref([]);
const showCreate = ref(false);
const form = ref({ title: '', content: '', batchId: null });
const fmt = (t) => new Date(t).toLocaleString('zh-CN');

async function load() {
  notices.value = await api.get('/brand-notices');
  const bs = await api.get('/batches');
  const products = await api.get('/products');
  const pmap = new Map(products.map(p => [p.id, p]));
  batches.value = bs.map(b => ({ id: b.id, batchNo: b.batchNo, productName: pmap.get(b.productId)?.name }));
}
async function create() {
  await api.post('/brand-notices', form.value);
  showCreate.value = false; form.value = { title: '', content: '', batchId: null };
  window.$toast?.('草稿已保存，确认后可发布');
  load();
}
async function publish(n) {
  await api.post(`/brand-notices/${n.id}/publish`, {});
  window.$toast?.('风险说明已对外发布');
  load();
}
onMounted(load);
</script>
