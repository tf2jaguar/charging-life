const { callCloud } = require('./cloud')

let _userInfo = null
let _openid = null

const getUserInfo = function () {
  return _userInfo
}

const getOpenId = function () {
  return _openid
}

const isLoggedIn = function () {
  return !!_userInfo
}

// 获取用户角色列表
const getRoles = function () {
  return (_userInfo && _userInfo.roles) || []
}

// 判断当前用户是否为管理员（roles中包含admin）
const isAdmin = function () {
  return getRoles().indexOf('admin') !== -1
}

// Call cloud to get openid and check if user exists
const initOpenId = function () {
  return wx.cloud.callFunction({
    name: 'login',
    data: { action: 'getUser' },
  }).then(function (res) {
    if (res.result && res.result.code === 0) {
      _openid = res.result.data.openid
      _userInfo = res.result.data.userInfo || null
      var app = getApp()
      if (app) {
        app.globalData.userInfo = _userInfo
        app.globalData.openid = _openid
      }
      return res.result.data
    }
    return Promise.reject(res)
  })
}

// Save user info (nickName + avatarUrl) to cloud, called after auth popup
const saveUserInfo = function (nickName, avatarUrl) {
  return callCloud('login', {
    nickName: nickName,
    avatarUrl: avatarUrl,
  }).then(function (data) {
    _userInfo = data.userInfo
    _openid = data.openid || _openid
    var app = getApp()
    if (app) {
      app.globalData.userInfo = _userInfo
      app.globalData.openid = _openid
    }
    return data
  })
}

const logout = function () {
  _userInfo = null
  _openid = null
  var app = getApp()
  if (app) {
    app.globalData.userInfo = null
    app.globalData.openid = null
  }
}

module.exports = {
  getUserInfo: getUserInfo,
  getOpenId: getOpenId,
  isLoggedIn: isLoggedIn,
  getRoles: getRoles,
  isAdmin: isAdmin,
  initOpenId: initOpenId,
  saveUserInfo: saveUserInfo,
  logout: logout,
}
