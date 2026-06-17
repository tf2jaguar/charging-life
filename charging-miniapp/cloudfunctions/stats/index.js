const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 北京时间 UTC+8：将 UTC Date 转为"北京时间视角"的 Date 对象
// 转后 getHours/getMonth/getDate 等返回的即北京时间值
function toBJDate(val) {
  if (!val) return null
  const d = val instanceof Date ? val : new Date(val)
  if (isNaN(d.getTime())) return null
  // 用 UTC 时间 +8h 构造新 Date，使其本地方法返回北京时间
  return new Date(d.getTime() + 8 * 3600 * 1000)
}

function getPeriodRange(period) {
  const now = toBJDate(new Date())
  let start, end
  if (period === 'year') {
    start = new Date(Date.UTC(now.getFullYear(), 0, 1))
    end = new Date(Date.UTC(now.getFullYear() + 1, 0, 1))
  } else {
    start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
  }
  return { start, end }
}

function getPrevPeriodRange(period) {
  const now = toBJDate(new Date())
  let start, end
  if (period === 'year') {
    start = new Date(Date.UTC(now.getFullYear() - 1, 0, 1))
    end = new Date(Date.UTC(now.getFullYear(), 0, 1))
  } else {
    start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1))
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
  }
  return { start, end }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, period, year, month, vehicleId, filter } = event
  const periodVal = period || 'month'

  function addVehicleFilter(conditions) {
    if (vehicleId) conditions.vehicleId = vehicleId
    return conditions
  }
  console.info('[stats] openid=%s, action=%s, period=%s', openid, action, periodVal)

  try {
    switch (action) {
      case 'overview': {
        // filter 模式：按时间/类型筛选，返回绝对值（供 history 页使用）
        // period 模式：按月/年统计，含环比（供 dashboard/analytics/profile 使用）
        if (filter) {
          let conditions = { _openid: openid }
          if (vehicleId) conditions.vehicleId = vehicleId

          const now = toBJDate(new Date())
          const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

          if (filter === 'week') {
            const weekStart = new Date(today)
            weekStart.setDate(weekStart.getDate() - now.getDay() + 1)
            conditions.startTime = _.gte(weekStart)
          } else if (filter === 'month') {
            const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
            conditions.startTime = _.gte(monthStart)
          } else if (filter === 'fast') {
            conditions.chargeType = _.in(['fast', 'super'])
          } else if (filter === 'slow') {
            conditions.chargeType = 'slow'
          }

          const res = await db.collection('records')
            .where(conditions)
            .field({ chargeKwh: true, cost: true, startTime: true })
            .get()

          const list = res.data
          const count = list.length
          const totalKwh = list.reduce((s, r) => s + (r.chargeKwh || 0), 0)
          const totalCost = list.reduce((s, r) => s + (r.cost || 0), 0)
          const days = new Set(list.map(r => {
            const d = toBJDate(r.startTime)
            return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
          })).size

          return {
            code: 0,
            data: {
              count: { value: count, change: 0, direction: 'same' },
              kwh: { value: totalKwh, change: 0, direction: 'same' },
              cost: { value: totalCost, change: 0, direction: 'same' },
              days: { value: days, change: 0, direction: 'same' },
            },
          }
        }

        const { start, end } = getPeriodRange(periodVal)
        const { start: prevStart, end: prevEnd } = getPrevPeriodRange(periodVal)

        const [curRes, prevRes] = await Promise.all([
          db.collection('records')
            .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
            .get(),
          db.collection('records')
            .where(addVehicleFilter({ _openid: openid, startTime: _.gte(prevStart).and(_.lt(prevEnd)) }))
            .get(),
        ])

        const cur = curRes.data
        const prev = prevRes.data

        const sumField = (arr, field) => arr.reduce((s, r) => s + (r[field] || 0), 0)
        const curKwh = sumField(cur, 'chargeKwh')
        const curCost = sumField(cur, 'cost')
        const curDuration = sumField(cur, 'duration')
        const prevKwh = sumField(prev, 'chargeKwh')
        const prevCost = sumField(prev, 'cost')
        const prevDuration = sumField(prev, 'duration')

        const curAvgPrice = curKwh > 0 ? Math.round((curCost / curKwh) * 100) / 100 : 0
        const prevAvgPrice = prevKwh > 0 ? Math.round((prevCost / prevKwh) * 100) / 100 : 0

        const curAvgDuration = cur.length > 0 ? Math.round(curDuration / cur.length) : 0
        const prevAvgDuration = prev.length > 0 ? Math.round(prevDuration / prev.length) : 0

        const curAvgKwh = cur.length > 0 ? Math.round(curKwh / cur.length * 10) / 10 : 0
        const prevAvgKwh = prev.length > 0 ? Math.round(prevKwh / prev.length * 10) / 10 : 0

        // 百公里电耗/成本：按时间排序全部记录，用相邻有里程记录之间的所有充电量计算
        function calcPer100(records) {
          const sorted = records
            .slice()
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
          const milestones = []
          sorted.forEach((r, i) => {
            if (r.mileage > 0) milestones.push({ index: i, mileage: r.mileage })
          })
          if (milestones.length < 2) return { perHundredKwh: 0, perHundredCost: 0 }

          let totalMileageDelta = 0
          let totalKwhInRange = 0
          let totalCostInRange = 0
          for (let m = 1; m < milestones.length; m++) {
            const delta = milestones[m].mileage - milestones[m - 1].mileage
            if (delta <= 0) continue
            totalMileageDelta += delta
            // 累加两次里程读数之间（含前端点，不含后端点）所有记录的充电量和费用
            for (let i = milestones[m - 1].index; i < milestones[m].index; i++) {
              totalKwhInRange += sorted[i].chargeKwh || 0
              totalCostInRange += sorted[i].cost || 0
            }
          }
          const perHundredKwh = totalMileageDelta > 0 ? Math.round(totalKwhInRange / totalMileageDelta * 100 * 10) / 10 : 0
          const perHundredCost = totalMileageDelta > 0 ? Math.round(totalCostInRange / totalMileageDelta * 100 * 100) / 100 : 0
          return { perHundredKwh, perHundredCost }
        }

        const curPer100 = calcPer100(cur)
        const prevPer100 = calcPer100(prev)

        function calcChange(curVal, prevVal, lowerIsBetter) {
          if (!prevVal || prevVal === 0) return { value: curVal, change: 0, direction: 'same' }
          const pct = ((curVal - prevVal) / prevVal * 100)
          let direction
          if (pct > 0) direction = lowerIsBetter ? 'negative' : 'positive'
          else if (pct < 0) direction = lowerIsBetter ? 'positive' : 'negative'
          else direction = 'same'
          return { value: curVal, change: Math.round(pct * 10) / 10, direction }
        }

        return {
          code: 0,
          data: {
            count: calcChange(cur.length, prev.length, false),
            kwh: calcChange(curKwh, prevKwh, false),
            cost: calcChange(curCost, prevCost, true),
            avgPrice: calcChange(curAvgPrice, prevAvgPrice, true),
            duration: calcChange(curDuration, prevDuration, false),
            avgDuration: calcChange(curAvgDuration, prevAvgDuration, true),
            avgKwh: calcChange(curAvgKwh, prevAvgKwh, false),
            perHundredKwh: calcChange(curPer100.perHundredKwh, prevPer100.perHundredKwh, true),
            perHundredCost: calcChange(curPer100.perHundredCost, prevPer100.perHundredCost, true),
          },
        }
      }

      case 'trend': {
        const now = toBJDate(new Date())
        const yearVal = year || now.getFullYear()
        const start = new Date(Date.UTC(yearVal, 0, 1))
        const end = new Date(Date.UTC(yearVal + 1, 0, 1))

        const res = await db.collection('records')
          .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
          .get()

        const months = Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          kwh: 0,
          cost: 0,
          count: 0,
        }))
        res.data.forEach(r => {
          const m = toBJDate(r.startTime).getMonth()
          months[m].kwh += r.chargeKwh || 0
          months[m].cost += r.cost || 0
          months[m].count++
        })

        return { code: 0, data: months }
      }

      case 'timeDistribution': {
        const { start, end } = getPeriodRange(periodVal)
        const res = await db.collection('records')
          .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
          .get()
        const slots = [
          { label: '0-7点', range: [0, 7], count: 0 },
          { label: '7-12点', range: [7, 12], count: 0 },
          { label: '12-17点', range: [12, 17], count: 0 },
          { label: '17-22点', range: [17, 22], count: 0 },
          { label: '22-24点', range: [22, 24], count: 0 },
        ]

        res.data.forEach(r => {
          const h = toBJDate(r.startTime).getHours()
          for (const s of slots) {
            if (h >= s.range[0] && h < s.range[1]) { s.count++; break }
          }
        })

        const total = res.data.length || 1
        slots.forEach(s => { s.pct = Math.round(s.count / total * 100) })

        return { code: 0, data: slots }
      }

      case 'typeDistribution': {
        const { start, end } = getPeriodRange(periodVal)
        const res = await db.collection('records')
          .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
          .get()

        const types = { super: 0, fast: 0, slow: 0 }
        res.data.forEach(r => { if (types[r.chargeType] !== undefined) types[r.chargeType]++ })
        const total = res.data.length || 1

        return {
          code: 0,
          data: {
            super: { count: types.super, pct: Math.round(types.super / total * 100) },
            fast: { count: types.fast, pct: Math.round(types.fast / total * 100) },
            slow: { count: types.slow, pct: Math.round(types.slow / total * 100) },
            total: res.data.length,
          },
        }
      }

      case 'topStations': {
        const { start, end } = getPeriodRange(periodVal)
        const res = await db.collection('records')
          .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
          .get()

        const stationMap = {}
        res.data.forEach(r => {
          const name = r.stationName || '未知'
          if (!stationMap[name]) stationMap[name] = { name, count: 0, kwh: 0, cost: 0 }
          stationMap[name].count++
          stationMap[name].kwh += r.chargeKwh || 0
          stationMap[name].cost += r.cost || 0
        })

        const stations = Object.values(stationMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)

        return { code: 0, data: stations }
      }

      case 'calendar': {
        const now = toBJDate(new Date())
        const y = year || now.getFullYear()
        const m = month || (now.getMonth() + 1)
        const start = new Date(Date.UTC(y, m - 1, 1))
        const end = new Date(Date.UTC(y, m, 1))

        const res = await db.collection('records')
          .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
          .get()

        const days = []
        const kwh = {}
        res.data.forEach(r => {
          const d = toBJDate(r.startTime).getDate()
          if (!days.includes(d)) days.push(d)
          kwh[d] = (kwh[d] || 0) + (r.chargeKwh || 0)
        })

        const totalKwh = Object.values(kwh).reduce((s, v) => s + v, 0)

        return {
          code: 0,
          data: {
            days: days.sort((a, b) => a - b),
            kwh: kwh,
            totalKwh: Math.round(totalKwh * 10) / 10,
            count: res.data.length,
          },
        }
      }

      case 'recentRecords': {
        const limit = event.limit || 2
        const res = await db.collection('records')
          .where(addVehicleFilter({ _openid: openid }))
          .orderBy('startTime', 'desc')
          .limit(limit)
          .get()
        return { code: 0, data: res.data }
      }

      default:
        return { code: -1, msg: '未知action' }
    }
  } catch (err) {
    console.error('云函数执行异常', err); // 新增：打印完整错误栈
    return { code: -1, msg: err.message }
  }
}
