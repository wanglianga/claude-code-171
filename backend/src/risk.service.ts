import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Product, Farmer, Batch, LiveItem, RiskAlert, AfterSale,
} from './entities';

export interface ScorePart { label: string; score: number; max: number; detail: string }
export interface Evaluation {
  score: number;
  level: 'high' | 'medium' | 'low';
  parts: ScorePart[];
  gaps: { point: string; promise: string; reality: string; suggestion: string }[];
  suggestions: string[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * 选品风控核心：把“商品承诺”和“真实履约能力”放在一起评估，
 * 并在售中/售后事件发生时生成批次级风险预警。
 */
@Injectable()
export class RiskService {
  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Farmer) private farmerRepo: Repository<Farmer>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(RiskAlert) private alertRepo: Repository<RiskAlert>,
    @InjectRepository(LiveItem) private liveItemRepo: Repository<LiveItem>,
  ) {}

  daysBetween(a: string | Date, b: string | Date = new Date()): number {
    const da = new Date(a).getTime();
    const db = new Date(b).getTime();
    return Math.round((db - da) / DAY);
  }

  /** 上架前履约能力评估（满分100） */
  evaluate(product: Product, farmer: Farmer, batch?: Batch): Evaluation {
    const parts: ScorePart[] = [];
    const gaps: Evaluation['gaps'] = [];
    const suggestions: string[] = [];

    // 1. 检测报告（20）
    const expiry = batch?.testReportExpiry || product.testReportExpiry;
    if (!product.testReportNo || !expiry) {
      parts.push({ label: '检测报告', score: 0, max: 20, detail: '未提供检测报告编号或有效期' });
    } else {
      const daysLeft = this.daysBetween(new Date(), expiry);
      if (daysLeft < 0) {
        parts.push({ label: '检测报告', score: 0, max: 20, detail: `检测报告已过期 ${-daysLeft} 天（编号 ${product.testReportNo}）` });
      } else if (daysLeft <= 15) {
        parts.push({ label: '检测报告', score: 10, max: 20, detail: `报告剩余 ${daysLeft} 天到期，需尽快复检` });
      } else {
        parts.push({ label: '检测报告', score: 20, max: 20, detail: `报告有效，剩余 ${daysLeft} 天` });
      }
    }

    // 2. 采摘窗口 / 新鲜度（15）
    if (product.harvestDate) {
      const age = this.daysBetween(product.harvestDate);
      const ratio = 1 - age / Math.max(product.shelfLifeDays, 1);
      const score = Math.max(0, Math.round(ratio * 15));
      parts.push({
        label: '采摘窗口', score, max: 15,
        detail: `采摘 ${age} 天 / 保质期 ${product.shelfLifeDays} 天，直播窗口${ratio > 0.5 ? '充裕' : ratio > 0.2 ? '偏紧' : '危险'}`,
      });
    } else {
      parts.push({ label: '采摘窗口', score: 8, max: 15, detail: '未填写采摘日期，按中性分处理' });
    }

    // 3. 样品口感（15）
    const tasting = Number(product.tastingScore) || 0;
    parts.push({
      label: '样品口感', score: Math.round(tasting / 10 * 15), max: 15,
      detail: tasting ? `试吃评分 ${tasting}/10：${product.tastingNote || '无备注'}` : '尚未安排样品试吃',
    });

    // 4. 包装耐压（15）
    const pressure = product.packagingPressure;
    parts.push({
      label: '包装耐压', score: pressure * 3, max: 15,
      detail: `耐压等级 ${pressure}/5${pressure <= 2 ? '，远距离运输挤压坏果风险高' : ''}`,
    });

    // 5. 冷链可达（15）
    const needCold = product.coldChainRequirement !== '常温';
    const cityCount = product.coldChainCities ? product.coldChainCities.split(/[,，]/).filter(Boolean).length : 0;
    if (!needCold) {
      parts.push({ label: '冷链可达', score: 15, max: 15, detail: '常温品，无冷链限制' });
    } else if (cityCount >= 10) {
      parts.push({ label: '冷链可达', score: 15, max: 15, detail: `冷链覆盖 ${cityCount} 个城市` });
    } else if (cityCount > 0) {
      parts.push({ label: '冷链可达', score: 8, max: 15, detail: `冷链仅覆盖 ${cityCount} 个城市，跨区订单有风险` });
    } else {
      parts.push({ label: '冷链可达', score: 0, max: 15, detail: `${product.coldChainRequirement}品但未登记冷链可达城市` });
    }

    // 6. 农户交货稳定性（20）
    const stability = Number(farmer.stabilityScore) || 0;
    parts.push({
      label: '农户交货稳定性', score: Math.round(stability / 100 * 20), max: 20,
      detail: `稳定性 ${stability}/100，准时率 ${farmer.onTimeRate}%，历史坏果率 ${farmer.badRateAvg}%`,
    });

    const score = parts.reduce((s, p) => s + p.score, 0);

    // 承诺 vs 现实差距
    const promise = product.promiseText || '';
    if (/包甜|纯甜|无酸/.test(promise) && tasting < 8) {
      gaps.push({ point: '甜度承诺', promise: '“包甜/纯甜”', reality: `样品试吃 ${tasting}/10，甜度不稳定`, suggestion: '主播口径改为“八分甜两分酸”等区间表述，并按批次复测甜度' });
    }
    if (/有机|绿色|零农残/.test(promise)) {
      const daysLeft = expiry ? this.daysBetween(new Date(), expiry) : null;
      if (daysLeft === null || daysLeft < 0) {
        gaps.push({ point: '品质认证承诺', promise: '“有机/零农残”', reality: daysLeft === null ? '无检测报告佐证' : '检测报告已过期', suggestion: '补齐有效期内检测报告后方可按“有机”口径宣传' });
      }
    }
    if (/次日达|48小时|隔天到/.test(promise)) {
      if (needCold && cityCount < 10) {
        gaps.push({ point: '时效承诺', promise: '“次日达/48小时达”', reality: `冷链仅覆盖 ${cityCount} 城`, suggestion: '按城市分区承诺时效，非覆盖区下架“次日达”话术' });
      }
      if (pressure <= 2) {
        gaps.push({ point: '包装履约', promise: '“完好送达”', reality: '包装耐压等级偏低', suggestion: '升级缓冲包装后再承诺时效与完好率' });
      }
    }
    if (/坏果包赔|坏一赔/.test(promise)) {
      const bad = batch ? Number(batch.badRate) : Number(farmer.badRateAvg);
      if (bad >= 5) {
        gaps.push({ point: '售后承诺成本', promise: '“坏果包赔”', reality: `当前批次坏果率约 ${bad}%`, suggestion: '承诺可保留但需提高预售价格覆盖赔付，并降低预售量' });
      }
    }
    if (/净重|足斤足两/.test(promise) && !product.spec) {
      gaps.push({ point: '规格承诺', promise: '“足斤足两”', reality: '未登记明确规格', suggestion: '补填净重规格并与主播脚本一致' });
    }

    if (parts.find(p => p.label === '检测报告')!.score === 0) suggestions.push('暂停上架：先补齐/复检检测报告');
    if (tasting < 8) suggestions.push('安排第二轮样品试吃，统一主播口感口径');
    if (pressure <= 2) suggestions.push('更换耐压包装或限制远距离销售');
    if (stability < 70) suggestions.push(`农户“${farmer.name}”交货稳定性偏低，预售量按稳定性系数下调`);
    if (needCold && cityCount < 10) suggestions.push('直播前确认冷链车排期，仅对可达城市开放下单');

    return {
      score,
      level: score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low',
      parts, gaps, suggestions,
    };
  }

  /** 据库存、农户稳定性、批次坏果率给出建议预售量 */
  suggestPresale(item: Partial<LiveItem> & { availableQty: number; stability: number; badRate: number }): number {
    const factor = Math.max(0.5, item.stability / 100) * Math.max(0.85, 1 - item.badRate / 100);
    return Math.floor(item.availableQty * factor);
  }

  private async alert(type: string, severity: RiskAlert['severity'], message: string, suggestion: string,
                      refs: { batchId?: number; liveItemId?: number; farmerId?: number }) {
    const exist = await this.alertRepo.findOne({ where: { type, status: 'open', batchId: refs.batchId ?? null } });
    if (exist) return exist;
    return this.alertRepo.save(this.alertRepo.create({ type, severity, message, suggestion, ...refs }));
  }

  async checkBatch(batch: Batch) {
    // 检测报告过期
    if (batch.testReportExpiry) {
      const left = this.daysBetween(new Date(), batch.testReportExpiry);
      if (left < 0) {
        await this.alert('report_expired', 'high',
          `批次 ${batch.batchNo} 检测报告已过期 ${-left} 天`, '立即复检；未出报告前暂停该批次发货并暂缓直播上架',
          { batchId: batch.id });
      } else if (left <= 7) {
        await this.alert('report_expiring', 'medium',
          `批次 ${batch.batchNo} 检测报告 ${left} 天后到期`, '联系农户安排复检，避免直播档期内报告失效',
          { batchId: batch.id });
      }
    }
    // 批次坏果率升高
    const bad = Number(batch.badRate);
    if (bad >= 8) {
      await this.alert('batch_bad_rate', 'high',
        `批次 ${batch.batchNo} 坏果率升至 ${bad}%，超过 8% 红线`, '暂停发货、全检库存；已发订单主动赔付；评估是否发布县域品牌风险说明',
        { batchId: batch.id });
    } else if (bad >= 5) {
      await this.alert('batch_bad_rate', 'medium',
        `批次 ${batch.batchNo} 坏果率 ${bad}%，高于常规水平`, '加密抽检，下调该批次后续预售量',
        { batchId: batch.id });
    }
    // 临时少供
    if (batch.status === 'short') {
      await this.alert('short_supply', 'high',
        `农户临时少供：批次 ${batch.batchNo} 可供量下调`, '按已锁库存核减预售量，超卖部分启动改派/退款，复盘农户交货稳定性',
        { batchId: batch.id });
    }
  }

  async checkLiveItem(item: LiveItem) {
    const batch = await this.batchRepo.findOne({ where: { id: item.batchId } });
    if (!batch) return;
    // 直播销量超过预估/可供给
    const sold = item.actualSoldQty;
    if (sold > item.estimatedSales && item.estimatedSales > 0) {
      await this.alert('oversell_forecast', 'medium',
        `直播销量 ${sold} 已超过预估 ${item.estimatedSales}`, '核对批次可供量，不足时提前与农户确认补货或关闭下单入口',
        { batchId: batch.id, liveItemId: item.id });
    }
    if (sold > batch.qty - batch.qtyLocked + item.presaleQty && batch.status !== 'short') {
      // 已售超出本排品锁定之外的余量
    }
    if (sold > batch.qty || (batch.status === 'short' && sold > batch.qty)) {
      await this.alert('oversell_supply', 'high',
        `直播销量 ${sold} 超过批次 ${batch.batchNo} 可供 ${batch.qty}`, '立即停止下单，按付款顺序发货，余量退款或改批次，同步主播口径',
        { batchId: batch.id, liveItemId: item.id });
    }
  }

  async coldChainLate(batchId: number, note: string, minutes: number, farmerId?: number) {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    await this.alert('cold_chain_late', minutes > 120 ? 'high' : 'medium',
      `冷链车晚到 ${minutes} 分钟（批次 ${batch?.batchNo || batchId}）${note ? '：' + note : ''}`,
      '优先发运短保品，向客户推送延误告知，必要时启动延误补偿',
      { batchId, farmerId });
  }

  async promiseMismatch(batchId: number, farmerId: number, detail: string) {
    await this.alert('promise_mismatch', 'high',
      `主播承诺与实际规格不一致（批次 ${batchId}）：${detail}`,
      '统一主播口径与商品规格，已下单客户主动告知差异并提供补偿选项',
      { batchId, farmerId });
  }
}
