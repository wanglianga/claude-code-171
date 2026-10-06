import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/**
 * 售后反向决策：售后结论回流到选品/主播口径/预售量/品牌公告
 */
@Entity('feedback_decisions')
export class FeedbackDecision {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'aftersale_id', nullable: true })
  aftersaleId: number;

  @Column({ name: 'batch_id', nullable: true })
  batchId: number;

  /** continue_farmer(继续合作) / drop_farmer(暂停合作) / adjust_anchor(调整主播口径) / reduce_presale(降低预售量) / brand_notice(发布品牌风险说明) */
  @Column({ name: 'decision_type' })
  decisionType: string;

  @Column('text')
  decision: string;

  @Column({ name: 'created_by' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
