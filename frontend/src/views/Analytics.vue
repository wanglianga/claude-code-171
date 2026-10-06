<template>
  <div>
    <el-row :gutter="14">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header><span>农户稳定性复盘 —— 哪些农户稳定</span></template>
          <el-table :data="farmers" size="small">
            <el-table-column prop="name" label="农户/合作社" min-width="130" />
            <el-table-column label="稳定性" width="150">
              <template #default="{ row }">
                <el-progress :percentage="Math.round(row.stabilityScore * 100)" :stroke-width="10" :color="row.stabilityScore >= 0.85 ? '#67c23a' : row.stabilityScore >= 0.7 ? '#e6a23c' : '#f56c6c'" />
              </template>
            </el-table-column>
            <el-table-column label="履约批次" width="90">
              <template #default="{ row }">{{ row.fulfilledBatches }}/{{ row.totalBatches }}</template>
            </el-table-column>
            <el-table-column label="坏果率" width="80">
              <template #default="{ row }">{{ (row.avgDefectRate * 100).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column label="售后率" width="80">
              <template #default="{ row }">{{ (row.aftersalesRate * 100).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column label="GMV" width="100">
              <template #default="{ row }">¥{{ row.sales }}</template>
            </el-table-column>
            <el-table-column label="评级" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.grade === '稳定' ? 'success' : row.grade === '观察' ? 'warning' : 'danger'">{{ row.grade }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header><span>售后原因分布 —— 哪些原因在退款</span></template>
          <div ref="typeChart" style="height: 300px"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="14" style="margin-top: 14px">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header><span>品类适合度 —— 哪些品类适合直播</span></template>
          <div ref="catChart" style="height: 300px"></div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header><span>售后对复购的影响</span></template>
          <div ref="repChart" style="height: 210px"></div>
          <el-alert type="warning" :closable="false" style="margin-top: 6px">
            <template #title>
              有售后记录客户复购率 <b>{{ repurchase.withTicket?.rate ?? 0 }}%</b>（{{ repurchase.withTicket?.repurchased }}/{{ repurchase.withTicket?.customers }} 人），
              无售后客户复购率 <b>{{ repurchase.withoutTicket?.rate ?? 0 }}%</b> —— 售后体验直接影响复购
            </template>
          </el-alert>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" style="margin-top: 14px">
      <template #header><span>品类明细</span></template>
      <el-table :data="categories" size="small">
        <el-table-column prop="category" label="品类" width="100" />
        <el-table-column prop="orders" label="订单量" width="90" />
        <el-table-column label="GMV" width="110">
          <template #default="{ row }">¥{{ row.gmv }}</template>
        </el-table-column>
        <el-table-column label="售后率" width="90">
          <template #default="{ row }">{{ (row.refundRate * 100).toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column label="试吃均分" width="90">
          <template #default="{ row }">{{ row.tasteAvg ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="适合直播指数" width="160">
          <template #default="{ row }">
            <el-progress :percentage="Math.min(100, row.fitScore)" :stroke-width="10" :color="row.fitScore >= 65 ? '#67c23a' : row.fitScore >= 45 ? '#e6a23c' : '#f56c6c'" />
          </template>
        </el-table-column>
        <el-table-column label="结论" min-width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.suitable === '适合直播' ? 'success' : row.suitable === '谨慎排播' ? 'warning' : 'danger'">{{ row.suitable }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import * as echarts from 'echarts';
import request from '../api/request';

const farmers = ref([]);
const categories = ref([]);
const repurchase = ref({});
const typeChart = ref(null);
const catChart = ref(null);
const repChart = ref(null);

onMounted(async () => {
  const [f, c, a] = await Promise.all([
    request.get('/analytics/farmers'),
    request.get('/analytics/categories'),
    request.get('/analytics/aftersales'),
  ]);
  farmers.value = f;
  categories.value = c;
  repurchase.value = a.repurchase;

  echarts.init(typeChart.value).setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['40%', '65%'], center: ['50%', '45%'],
      label: { formatter: '{b}\n{c}单 ¥{d}', fontSize: 11 },
      data: a.byType.map((t) => ({ name: t.type, value: t.count, d: t.refund })),
    }],
  });

  echarts.init(catChart.value).setOption({
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 50, right: 50, top: 30, bottom: 50 },
    xAxis: { type: 'category', data: c.map((x) => x.category) },
    yAxis: [
      { type: 'value', name: 'GMV(元)' },
      { type: 'value', name: '售后率', axisLabel: { formatter: (v) => `${v * 100}%` } },
    ],
    series: [
      { name: 'GMV', type: 'bar', data: c.map((x) => x.gmv), itemStyle: { color: '#67c23a' } },
      { name: '售后率', type: 'line', yAxisIndex: 1, data: c.map((x) => x.refundRate), itemStyle: { color: '#f56c6c' } },
    ],
  });

  echarts.init(repChart.value).setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 30, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: ['有售后记录客户', '无售后记录客户'] },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' }, max: 100 },
    series: [{
      type: 'bar', barWidth: 60,
      data: [
        { value: a.repurchase.withTicket.rate, itemStyle: { color: '#f56c6c' } },
        { value: a.repurchase.withoutTicket.rate, itemStyle: { color: '#67c23a' } },
      ],
      label: { show: true, position: 'top', formatter: '{c}%' },
    }],
  });
});
</script>
