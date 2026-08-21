const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 北京时间 UTC+8：将 UTC Date 转为"北京时间视角"的 Date 对象
function toBJDate(val) {
  if (!val) return null
  const d = val instanceof Date ? val : new Date(val)
  if (isNaN(d.getTime())) return null
  return new Date(d.getTime() + 8 * 3600 * 1000)
}

const BJ_OFFSET = 8 * 3600 * 1000

function getPeriodRange(period) {
  const now = toBJDate(new Date())
  let start, end
  if (period === 'year') {
    start = new Date(Date.UTC(now.getFullYear(), 0, 1) - BJ_OFFSET)
    end = new Date(Date.UTC(now.getFullYear() + 1, 0, 1) - BJ_OFFSET)
  } else {
    start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1) - BJ_OFFSET)
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1) - BJ_OFFSET)
  }
  return { start, end }
}

function getPrevPeriodRange(period) {
  const now = toBJDate(new Date())
  let start, end
  if (period === 'year') {
    start = new Date(Date.UTC(now.getFullYear() - 1, 0, 1) - BJ_OFFSET)
    end = new Date(Date.UTC(now.getFullYear(), 0, 1) - BJ_OFFSET)
  } else {
    start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1) - BJ_OFFSET)
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1) - BJ_OFFSET)
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

  // 只读取需要的字段，减少数据传输
  const STATS_FIELDS = { chargeKwh: true, cost: true, startTime: true, duration: true, mileage: true, vehicleId: true, chargeType: true }
  const CALENDAR_FIELDS = { chargeKwh: true, startTime: true }
  const RECENT_FIELDS = { chargeKwh: true, startTime: true, chargeType: true, cost: true, duration: true, stationName: true, endTime: true }

  console.info('[stats] openid=%s, action=%s, period=%s', openid, action, periodVal)

  try {
    switch (action) {
      case 'overview': {
        if (filter) {
          let conditions = { _openid: openid }
          if (vehicleId) conditions.vehicleId = vehicleId

          const now = toBJDate(new Date())
          const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

          if (filter === 'week') {
            const dayOfWeek = now.getDay() || 7
            const weekStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1) - BJ_OFFSET)
            conditions.startTime = _.gte(weekStart)
          } else if (filter === 'month') {
            const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1) - BJ_OFFSET)
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
            .field(STATS_FIELDS)
            .get(),
          db.collection('records')
            .where(addVehicleFilter({ _openid: openid, startTime: _.gte(prevStart).and(_.lt(prevEnd)) }))
            .field(STATS_FIELDS)
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

        // 百公里电耗/成本
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
        const start = new Date(Date.UTC(yearVal, 0, 1) - BJ_OFFSET)
        const end = new Date(Date.UTC(yearVal + 1, 0, 1) - BJ_OFFSET)

        const res = await db.collection('records')
          .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
          .field({ chargeKwh: true, cost: true, startTime: true })
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
          .field({ startTime: true })
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
          .field({ chargeType: true })
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
          .field({ stationName: true, chargeKwh: true, cost: true })
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
        const start = new Date(Date.UTC(y, m - 1, 1) - BJ_OFFSET)
        const end = new Date(Date.UTC(y, m, 1) - BJ_OFFSET)

        const res = await db.collection('records')
          .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
          .field(CALENDAR_FIELDS)
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
          .field(RECENT_FIELDS)
          .get()
        return { code: 0, data: res.data }
      }

      // 首页组合接口：一次返回概览 + 最近记录 + 日历
      // 减少 3 次云函数调用为 1 次，大幅降低冷启动开销
      // 支持指定 year/month，默认当前月
      case 'dashboard': {
        const now = toBJDate(new Date())
        const y = event.year || now.getFullYear()
        const m = event.month || (now.getMonth() + 1)

        // 当前月范围
        const start = new Date(Date.UTC(y, m - 1, 1) - BJ_OFFSET)
        const end = new Date(Date.UTC(y, m, 1) - BJ_OFFSET)

        // 上月范围（用于环比）
        let prevY = y, prevM = m - 1
        if (prevM < 1) { prevM = 12; prevY-- }
        const prevStart = new Date(Date.UTC(prevY, prevM - 1, 1) - BJ_OFFSET)
        const prevEnd = new Date(Date.UTC(prevY, prevM, 1) - BJ_OFFSET)

        const [curRes, prevRes, recentRes] = await Promise.all([
          // 当前月记录（用于概览 + 日历）
          db.collection('records')
            .where(addVehicleFilter({ _openid: openid, startTime: _.gte(start).and(_.lt(end)) }))
            .field(STATS_FIELDS)
            .get(),
          // 上月记录（用于环比）
          db.collection('records')
            .where(addVehicleFilter({ _openid: openid, startTime: _.gte(prevStart).and(_.lt(prevEnd)) }))
            .field(STATS_FIELDS)
            .get(),
          // 最近 2 条记录
          db.collection('records')
            .where(addVehicleFilter({ _openid: openid }))
            .orderBy('startTime', 'desc')
            .limit(2)
            .field(RECENT_FIELDS)
            .get(),
        ])

        const cur = curRes.data
        const prev = prevRes.data
        const recent = recentRes.data

        // === 计算概览 ===
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

        function calcPer100(records) {
          const sorted = records.slice().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
          const milestones = []
          sorted.forEach((r, i) => { if (r.mileage > 0) milestones.push({ index: i, mileage: r.mileage }) })
          if (milestones.length < 2) return { perHundredKwh: 0, perHundredCost: 0 }
          let totalMileageDelta = 0, totalKwhInRange = 0, totalCostInRange = 0
          for (let m = 1; m < milestones.length; m++) {
            const delta = milestones[m].mileage - milestones[m - 1].mileage
            if (delta <= 0) continue
            totalMileageDelta += delta
            for (let i = milestones[m - 1].index; i < milestones[m].index; i++) {
              totalKwhInRange += sorted[i].chargeKwh || 0
              totalCostInRange += sorted[i].cost || 0
            }
          }
          return {
            perHundredKwh: totalMileageDelta > 0 ? Math.round(totalKwhInRange / totalMileageDelta * 100 * 10) / 10 : 0,
            perHundredCost: totalMileageDelta > 0 ? Math.round(totalCostInRange / totalMileageDelta * 100 * 100) / 100 : 0,
          }
        }

        function calcChange(curVal, prevVal, lowerIsBetter) {
          if (!prevVal || prevVal === 0) return { value: curVal, change: 0, direction: 'same' }
          const pct = ((curVal - prevVal) / prevVal * 100)
          let direction
          if (pct > 0) direction = lowerIsBetter ? 'negative' : 'positive'
          else if (pct < 0) direction = lowerIsBetter ? 'positive' : 'negative'
          else direction = 'same'
          return { value: curVal, change: Math.round(pct * 10) / 10, direction }
        }

        const curPer100 = calcPer100(cur)
        const prevPer100 = calcPer100(prev)

        const overview = {
          count: calcChange(cur.length, prev.length, false),
          kwh: calcChange(curKwh, prevKwh, false),
          cost: calcChange(curCost, prevCost, true),
          avgPrice: calcChange(curAvgPrice, prevAvgPrice, true),
          duration: calcChange(curDuration, prevDuration, false),
          avgDuration: calcChange(curAvgDuration, prevAvgDuration, true),
          avgKwh: calcChange(curAvgKwh, prevAvgKwh, false),
          perHundredKwh: calcChange(curPer100.perHundredKwh, prevPer100.perHundredKwh, true),
          perHundredCost: calcChange(curPer100.perHundredCost, prevPer100.perHundredCost, true),
        }

        // === 从当前月数据计算日历（免去一次 DB 查询） ===
        const days = []
        const kwh = {}
        cur.forEach(r => {
          const d = toBJDate(r.startTime).getDate()
          if (!days.includes(d)) days.push(d)
          kwh[d] = (kwh[d] || 0) + (r.chargeKwh || 0)
        })
        const totalKwh = Object.values(kwh).reduce((s, v) => s + v, 0)
        const calendar = {
          days: days.sort((a, b) => a - b),
          kwh: kwh,
          totalKwh: Math.round(totalKwh * 10) / 10,
          count: cur.length,
        }

        // === 最近记录 ===
        const recentRecords = recent

        return {
          code: 0,
          data: {
            overview: overview,
            recentRecords: recentRecords,
            calendar: calendar,
          },
        }
      }

      default:
        return { code: -1, msg: '未知action' }
    }
  } catch (err) {
    console.error('云函数执行异常', err)
    return { code: -1, msg: err.message }
  }
}