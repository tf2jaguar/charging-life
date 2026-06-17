const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 将无时区的时间字符串补上 +08:00，确保北京时间被正确解析
function fixTimezone(str) {
  if (!str || typeof str !== 'string') return str
  // 已经带时区信息（Z 或 +HH:MM）的，不处理
  if (/Z|[+-]\d{2}:\d{2}$/.test(str)) return str
  return str + '+08:00'
}

function toDate(val) {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'string') return new Date(fixTimezone(val))
  if (typeof val === 'number') return new Date(val)
  return new Date(val)
}

function calcDerived(data) {
  const derived = {}

  const startTime = toDate(data.startTime)
  const endTime = toDate(data.endTime)
  if (startTime && endTime) {
    const startMs = startTime.getTime()
    const endMs = endTime.getTime()
    if (!isNaN(startMs) && !isNaN(endMs)) {
      derived.duration = Math.max(0, Math.round((endMs - startMs) / 60000))
    }
  }

  if (data.cost && data.chargeKwh && data.chargeKwh > 0) {
    derived.unitPrice = Math.round((data.cost / data.chargeKwh) * 100) / 100
  }

  if (data.chargeKwh && derived.duration && derived.duration > 0) {
    derived.avgPower = Math.round((data.chargeKwh / (derived.duration / 60)) * 10) / 10
  }

  if (data.startSOC != null && data.endSOC != null && data.startSOC !== 0 && data.endSOC !== 0) {
    derived.socDelta = data.endSOC - data.startSOC
  }

  if (data.batteryCapacity && data.startSOC != null && data.endSOC != null && data.startSOC !== 0 && data.endSOC !== 0 && data.chargeKwh > 0) {
    const socDelta = (data.endSOC - data.startSOC) / 100
    const expectedKwh = data.batteryCapacity * socDelta
    if (expectedKwh > 0) {
      derived.chargeLoss = Math.round(((expectedKwh - data.chargeKwh) / expectedKwh) * 1000) / 10
    }
  }

  derived.updatedAt = db.serverDate()
  return derived
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event
  console.info('[record] openid=%s, action=%s', openid, action)

  try {
    switch (action) {
      case 'create': {
        const derived = calcDerived(data)
        const record = {
          _openid: openid,
          vehicleId: data.vehicleId || '',
          stationName: data.stationName || '',
          chargeType: data.chargeType || 'fast',
          startTime: data.startTime ? toDate(data.startTime) : db.serverDate(),
          endTime: data.endTime ? toDate(data.endTime) : db.serverDate(),
          startSOC: data.startSOC || 0,
          endSOC: data.endSOC || 0,
          chargeKwh: data.chargeKwh || 0,
          cost: data.cost || 0,
          mileage: data.mileage || 0,
          remark: data.remark || '',
          ...derived,
          createdAt: db.serverDate(),
        }
        const res = await db.collection('records').add({ data: record })
        return { code: 0, data: { recordId: res._id } }
      }

      case 'update': {
        if (!data.recordId) return { code: -1, msg: '缺少recordId' }
        const recordRes = await db.collection('records').doc(data.recordId).get()
        if (recordRes.data._openid !== openid) {
          return { code: -1, msg: '无权修改' }
        }
        if (data.startTime) data.startTime = toDate(data.startTime)
        if (data.endTime) data.endTime = toDate(data.endTime)
        const derived = calcDerived(data)
        const updateData = { ...data, ...derived }
        delete updateData.recordId
        delete updateData._id
        delete updateData._openid
        await db.collection('records').doc(data.recordId).update({ data: updateData })
        return { code: 0, data: {} }
      }

      case 'delete': {
        if (!data.recordId) return { code: -1, msg: '缺少recordId' }
        const recordRes = await db.collection('records').doc(data.recordId).get()
        if (recordRes.data._openid !== openid) {
          return { code: -1, msg: '无权删除' }
        }
        await db.collection('records').doc(data.recordId).remove()
        return { code: 0, data: {} }
      }

      case 'list': {
        const page = data.page || 1
        const pageSize = data.pageSize || 20
        let conditions = { _openid: openid }

        if (data.vehicleId) {
          conditions.vehicleId = data.vehicleId
        }

        if (data.chargeType) {
          conditions.chargeType = data.chargeType
        }

        let query = db.collection('records').where(conditions)

        if (data.startTime && data.endTime) {
          query = query.where({
            startTime: _.gte(toDate(data.startTime)).and(_.lte(toDate(data.endTime)))
          })
        }

        const countRes = await query.count()
        const records = await query
          .orderBy('startTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return {
          code: 0,
          data: {
            list: records.data,
            total: countRes.total,
            page: page,
            pageSize: pageSize,
          },
        }
      }

      case 'detail': {
        if (!data.recordId) return { code: -1, msg: '缺少recordId' }
        const recordRes = await db.collection('records').doc(data.recordId).get()
        if (recordRes.data._openid !== openid) {
          return { code: -1, msg: '无权查看' }
        }

        const record = recordRes.data
        if (record.vehicleId) {
          try {
            const vehicle = (await db.collection('vehicles').doc(record.vehicleId).get()).data
            record.vehicleInfo = vehicle
          } catch (e) { /* vehicle may be deleted */ }
        }
        return { code: 0, data: record }
      }

      default:
        return { code: -1, msg: '未知action' }
    }
  } catch (err) {
    return { code: -1, msg: err.message }
  }
}
