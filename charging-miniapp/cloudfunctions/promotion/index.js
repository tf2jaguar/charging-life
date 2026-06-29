const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 从 users 表查询用户角色，判断是否为管理员
async function isAdmin(openid) {
  try {
    const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    if (userRes.data.length > 0) {
      const roles = userRes.data[0].roles || []
      return roles.indexOf('admin') !== -1
    }
    return false
  } catch (e) {
    console.error('[promotion] isAdmin check failed:', e)
    return false
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event
  console.info('[promotion] openid=%s, action=%s', openid, action)

  const admin = await isAdmin(openid)

  try {
    switch (action) {
      case 'create': {
        const promotion = {
          _openid: openid,
          platform: data.platform || '',
          platformName: data.platformName || '',
          tag: data.tag || '',
          content: data.content || '',
          amount: data.amount || 0,
          startTime: data.startTime ? new Date(data.startTime + '+08:00') : db.serverDate(),
          endTime: data.endTime ? new Date(data.endTime + '+08:00') : db.serverDate(),
          steps: data.steps || '',
          link: data.link || '',
          status: 'pending', // 待审核
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        }
        const res = await db.collection('promotions').add({ data: promotion })
        return { code: 0, data: { promotionId: res._id } }
      }

      case 'update': {
        if (!data.promotionId) return { code: -1, msg: '缺少promotionId' }
        const existRes = await db.collection('promotions').doc(data.promotionId).get()
        const doc = existRes.data
        if (doc._openid !== openid && !admin) {
          return { code: -1, msg: '无权修改' }
        }
        const updateData = {
          platform: data.platform,
          platformName: data.platformName,
          tag: data.tag,
          content: data.content,
          amount: data.amount,
          steps: data.steps,
          link: data.link,
          updatedAt: db.serverDate(),
        }
        if (data.startTime) updateData.startTime = new Date(data.startTime + '+08:00')
        if (data.endTime) updateData.endTime = new Date(data.endTime + '+08:00')
        // 管理员可更新状态
        if (data.status !== undefined) updateData.status = data.status
        // remove undefined fields
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) delete updateData[key]
        })
        await db.collection('promotions').doc(data.promotionId).update({ data: updateData })
        return { code: 0, data: {} }
      }

      case 'delete': {
        if (!data.promotionId) return { code: -1, msg: '缺少promotionId' }
        const existRes = await db.collection('promotions').doc(data.promotionId).get()
        const doc = existRes.data
        if (doc._openid !== openid) {
          return { code: -1, msg: '只能删除自己创建的记录' }
        }
        await db.collection('promotions').doc(data.promotionId).remove()
        return { code: 0, data: {} }
      }

      case 'list': {
        const page = data.page || 1
        const pageSize = data.pageSize || 20
        const sortBy = data.sortBy || 'time' // 'time' or 'amount'

        let conditions = {}
        if (admin) {
          // 管理员可查看全部
          conditions = {}
        } else {
          // 普通用户：自己创建的 + 生效中/已失效的他人数据
          conditions = _.or([
            { _openid: openid },
            { status: _.in(['active', 'expired']) },
          ])
        }

        // 如果有状态筛选条件
        if (data.statusFilter) {
          conditions.status = data.statusFilter
        }

        let query = db.collection('promotions').where(conditions)
        const countRes = await query.count()

        const orderField = sortBy === 'amount' ? 'amount' : 'createdAt'
        const promotions = await query
          .orderBy(orderField, 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        // calculate total saved amount
        let totalSaved = 0
        const allPromotions = await db.collection('promotions').where(conditions).get()
        allPromotions.data.forEach(p => {
          totalSaved += (p.amount || 0)
        })

        return {
          code: 0,
          data: {
            list: promotions.data,
            total: countRes.total,
            page: page,
            pageSize: pageSize,
            totalSaved: Math.round(totalSaved * 100) / 100,
          },
        }
      }

      case 'detail': {
        if (!data.promotionId) return { code: -1, msg: '缺少promotionId' }
        const res = await db.collection('promotions').doc(data.promotionId).get()
        const doc = res.data
        // 普通用户只能看自己创建的或生效中的数据
        if (!admin && doc._openid !== openid && doc.status !== 'active') {
          return { code: -1, msg: '无权查看' }
        }
        // 查询发布者昵称
        try {
          const userRes = await db.collection('users').where({ _openid: doc._openid }).field({ nickName: true }).get()
          if (userRes.data && userRes.data.length > 0) {
            doc.nickName = userRes.data[0].nickName || '匿名用户'
          } else {
            doc.nickName = '匿名用户'
          }
        } catch (e) {
          doc.nickName = '匿名用户'
        }
        return { code: 0, data: doc }
      }

      default:
        return { code: -1, msg: '未知action' }
    }
  } catch (err) {
    return { code: -1, msg: err.message }
  }
}