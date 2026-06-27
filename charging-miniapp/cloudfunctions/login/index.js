const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (event.action === 'getUser') {
    try {
      const userRes = await db.collection('users').where({ _openid: openid }).get()
      if (userRes.data.length === 0) {
        return { code: 0, data: { openid, userInfo: null } }
      }
      const user = userRes.data[0]
      let defaultVehicle = null
      if (user.defaultVehicleId) {
        try {
          const vehicleRes = await db.collection('vehicles').doc(user.defaultVehicleId).get()
          defaultVehicle = vehicleRes.data
        } catch (e) { /* vehicle may be deleted */ }
      }
      return { code: 0, data: { openid, userInfo: user, defaultVehicle } }
    } catch (err) {
      return { code: -1, msg: err.message }
    }
  }

  // action: saveUser — save or update user info
  console.info('[login] openid=%s, nickName=%s, avatarUrl=%s', openid, event.nickName || '', event.avatarUrl || '')

  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()

    if (userRes.data.length === 0) {
      await db.collection('users').add({
        data: {
          _openid: openid,
          nickName: event.nickName || '充电达人',
          avatarUrl: event.avatarUrl || '',
          phone: '',
          defaultVehicleId: '',
          roles: [],
          settings: {
            notification: true,
            budgetLimit: 800,
            theme: 'light',
          },
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    } else if (event.nickName || event.avatarUrl) {
      const updateData = { updatedAt: db.serverDate() }
      if (event.nickName) updateData.nickName = event.nickName
      if (event.avatarUrl) updateData.avatarUrl = event.avatarUrl
      await db.collection('users').doc(userRes.data[0]._id).update({ data: updateData })
    }

    const user = (await db.collection('users').where({ _openid: openid }).get()).data[0]

    let defaultVehicle = null
    if (user.defaultVehicleId) {
      try {
        const vehicleRes = await db.collection('vehicles').doc(user.defaultVehicleId).get()
        defaultVehicle = vehicleRes.data
      } catch (e) { /* vehicle may be deleted */ }
    }

    return {
      code: 0,
      data: {
        openid: openid,
        userInfo: user,
        defaultVehicle: defaultVehicle,
      },
    }
  } catch (err) {
    return { code: -1, msg: err.message }
  }
}
