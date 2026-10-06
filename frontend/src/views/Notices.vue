<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>县域公共品牌公告</span>
          <el-button size="small" type="primary" :icon="Plus" @click="dlg = true">起草公告</el-button>
        </div>
      </template>
      <div v-for="n in list" :key="n.id" class="notice">
        <div class="notice-head">
          <el-tag size="small" :type="n.level === 'critical' ? 'danger' : n.level === 'warning' ? 'warning' : 'info'" effect="dark">
            {{ { critical: '严重风险', warning: '风险提示', info: '情况说明' }[n.level] }}
          </el-tag>
          <b>{{ n.title }}</b>
          <el-tag size="small" :type="n.status === 'published' ? 'success' : 'info'" effect="plain">{{ n.status === 'published' ? '已发布' : '草稿' }}</el-tag>
        </div>
        <div class="notice-body">{{ n.content }}</div>
        <div class="notice-foot">
          <span>{{ fmtTime(n.createdAt) }}</span>
          <el-button v-if="n.batchId" link type="primary" size="small" @click="$router.push(`/chain/${n.batchId}`)">关联批次链路</el-button>
          <el-button v-if="n.status === 'draft'" link type="success" size="small" @click="publish(n)">发布</el-button>
        </div>
      </div>
      <el-empty v-if="!list.length" description="暂无公告" :image-size="80" />
    </el-card>

    <el-dialog v-model="dlg" title="起草品牌公告" width="520px">
      <el-form label-width="90px">
        <el-form-item label="标题" required><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="级别">
          <el-radio-group v-model="form.level">
            <el-radio value="info">情况说明</el-radio>
            <el-radio value="warning">风险提示</el-radio>
            <el-radio value="critical">严重风险</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="内容" required><el-input v-model="form.content" type="textarea" :rows="4" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">保存草稿</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';

const list = ref([]);
const dlg = ref(false);
const saving = ref(false);
const form = reactive({ title: '', content: '', level: 'warning' });

function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16) : ''; }

async function load() {
  list.value = await request.get('/notices');
}

async function create() {
  if (!form.title || !form.content) return ElMessage.warning('请填写标题与内容');
  saving.value = true;
  try {
    await request.post('/notices', form);
    ElMessage.success('草稿已保存');
    dlg.value = false;
    load();
  } finally { saving.value = false; }
}

async function publish(n) {
  await request.post(`/notices/${n.id}/publish`);
  ElMessage.success('已发布');
  load();
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.notice { border: 1px solid #ebeef5; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; }
.notice-head { display: flex; align-items: center; gap: 10px; }
.notice-body { color: #606266; font-size: 13px; line-height: 1.7; margin: 10px 0; }
.notice-foot { display: flex; align-items: center; gap: 14px; color: #909399; font-size: 12px; }
</style>
