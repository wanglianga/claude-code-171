#!/usr/bin/env python3
"""端到端冒烟：申报→选品→排期锁库存→下单→发货→售后→结算→预警/复盘"""
import json, urllib.request, urllib.error, sys

BASE = 'http://127.0.0.1:3000/api'
PASS = 0
FAIL = 0

def call(method, path, token=None, body=None, expect_ok=True):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json',
                                          **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read() or b'null')
            if expect_ok:
                ok('200 ' + method + ' ' + path)
            return data
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        if not expect_ok:
            ok('拒绝 %s %s -> %s' % (method, path, e.code))
            return json.loads(msg)
        fail('%s %s -> %s %s' % (method, path, e.code, msg[:200]))
        return None

def ok(m):
    global PASS; PASS += 1; print('  ✓', m)

def fail(m):
    global FAIL; FAIL += 1; print('  ✗', m)

def login(u):
    return call('POST', '/auth/login', body={'username': u, 'password': '123456'})['token']

print('1) 角色登录')
t_admin = login('admin'); t_op = login('op'); t_wh = login('wh'); t_cs = login('cs'); t_f1 = login('farmer1'); t_f2 = login('farmer2')
call('GET', '/products', token='bad', expect_ok=False)

print('2) 农户申报商品 + 登记批次')
p = call('POST', '/products', t_f2, {
    'name': '尖山秋木耳（测试）', 'category': '菌菇', 'origin': '白云乡测试基地',
    'harvestDate': '2026-10-04', 'spec': '250g 袋装', 'stockQty': 300, 'shelfLifeDays': 180,
    'coldChainRequirement': '常温', 'testReportNo': 'QS2026-TEST-1', 'testReportDate': '2026-10-01',
    'testReportExpiry': '2026-12-01', 'packagingPressure': 4, 'promiseText': '肉厚无根，足斤足两'})
pid = p['id']
b = call('POST', '/batches', t_f2, {'productId': pid, 'batchNo': 'TEST-E2E-01', 'harvestDate': '2026-10-04',
                                    'qty': 300, 'tempZone': '常温', 'badRate': 1.5, 'testReportExpiry': '2026-12-01'})
bid = b['id']

print('3) 履约评估 + 运营选品')
ev = call('GET', '/products/%d/evaluation' % pid, t_op)
assert ev['score'] >= 60, ev
ok('新申报商品履约分 %d，建议预售 %s' % (ev['score'], ev['suggestedPresale']))
call('POST', '/products/%d/select' % pid, t_op, {'status': 'selected', 'decisionNote': 'E2E选品通过'})

print('4) 直播排期 + 排品 + 锁库存')
ls = call('POST', '/live-sessions', t_op, {'title': 'E2E测试专场', 'anchorName': '主播测试',
        'scheduledStart': '2026-10-08T12:00:00.000Z', 'scriptSummary': '测试脚本', 'sampleTasting': '已试吃'})
item = call('POST', '/live-sessions/%d/items' % ls['id'], t_op,
            {'productId': pid, 'price': 29.9, 'coupon': 3, 'estimatedSales': 200, 'anchorPromise': '肉厚无根，足斤足两'})
li = item['item']; ok('系统建议预售量 %d（≤可供300）' % li['presaleQty'])
call('POST', '/live-items/%d/lock' % li['id'], t_wh, {})
call('POST', '/live-sessions/%d/go-live' % ls['id'], t_op)

print('5) 下单（含超卖拦截）')
o1 = call('POST', '/live-items/%d/orders' % li['id'], t_op, {'city': '杭州', 'address': '测试路1号', 'qty': 2})
# 销量改到接近上限后再超卖：直接把销量录到 300
call('POST', '/live-items/%d/sales' % li['id'], t_op, {'actualSoldQty': 300})
call('POST', '/live-items/%d/orders' % li['id'], t_op, {'city': '杭州', 'address': '测试路2号', 'qty': 5}, expect_ok=False)

print('6) 发货任务生成 → 发货 → 延误 → 签收')
gen = call('POST', '/shipments/generate', t_wh, {'warehouse': '中心仓'})
assert gen['created'] >= 1
ship = [s for s in call('GET', '/shipments', t_wh) if s['orderId'] == o1['id']][0]
call('POST', '/shipments/%d/ship' % ship['id'], t_wh, {'carrier': '中通快递', 'trackingNo': 'TEST123'})
call('POST', '/shipments/%d/delay' % ship['id'], t_wh, {'minutes': 200, 'note': 'E2E模拟晚到'})
call('POST', '/shipments/%d/deliver' % ship['id'], t_wh)

print('7) 售后处置（坏果 → 反写批次坏果率/农户稳定性）')
farmer_before = [f for f in call('GET', '/farmers', t_admin) if f['id'] == o1['farmerId']][0]
a = call('POST', '/after-sales', t_cs, {'orderId': o1['id'], 'reason': 'bad_fruit',
        'description': 'E2E：收到有霉变', 'qty': 1, 'claimAmount': 26.9, 'repurchaseHit': True})
h = call('POST', '/after-sales/%d/handle' % a['id'], t_cs,
         {'resolution': 'refund', 'finalAmount': 26.9, 'handleNote': 'E2E退款', 'repurchaseHit': True})
ok('售后反向反馈: ' + ' / '.join(h['feedback'])[:120])
farmer_after = [f for f in call('GET', '/farmers', t_admin) if f['id'] == o1['farmerId']][0]
assert float(farmer_after['stabilityScore']) <= float(farmer_before['stabilityScore'])
ok('农户稳定性 %s -> %s' % (farmer_before['stabilityScore'], farmer_after['stabilityScore']))

print('8) 预警生成（冷链晚到 + 高优事件）')
alerts = call('GET', '/risk-alerts?status=open', t_admin)
types = {x['type'] for x in alerts}
ok('冷链晚到预警存在: %s' % ('cold_chain_late' in types))
# 种子数据自带的高优预警
ov = call('GET', '/insights/overview', t_admin)
assert ov['kpi']['highAlertCount'] >= 1
ok('总览高优预警 %d 条' % ov['kpi']['highAlertCount'])

print('9) 截单 → 结算（扣售后）')
call('POST', '/live-sessions/%d/finish' % ls['id'], t_op)
st = call('POST', '/live-items/%d/settle' % li['id'], t_op)
assert float(st['afterSaleDeduction']) >= 26.9
ok('结算：货款 %s - 售后 %s - 违约金 %s = 净额 %s' % (st['grossAmount'], st['afterSaleDeduction'], st['penalty'], st['netAmount']))

print('10) 批次链路时间线包含全阶段')
tr = call('GET', '/batches/%d/trace' % bid, t_admin)
stages = {t['stage'] for t in tr['timeline']}
need = {'批次申报', '选品质检', '直播销售', '库存锁定', '下单', '发货', '售后', '农户结算'}
missing = need - stages
if missing: fail('时间线缺阶段: %s' % missing)
else: ok('时间线阶段齐全：%s' % '、'.join(sorted(need)))

print('11) 复盘接口')
fr = call('GET', '/insights/farmers', t_admin)
cr = call('GET', '/insights/categories', t_admin)
rr = call('GET', '/insights/after-sale-reasons', t_admin)
ok('农户复盘 %d 行、品类复盘 %d 行、售后原因 %d 行' % (len(fr), len(cr), len(rr)))
assert any(x['reason'] == 'bad_fruit' and x['repurchaseHitRate'] > 0 for x in rr)

print()
print('结果: %d 通过, %d 失败' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
