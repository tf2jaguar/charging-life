/**
 * 本地缓存工具 — TTL 缓存，用于云函数调用结果
 * 策略：先展示缓存，后台刷新，减少白屏等待
 */
const CACHE_PREFIX = 'cc_'
const DEFAULT_TTL = 5 * 60 * 1000 // 5 分钟
const MAX_CACHE_KEYS = 30

function getCacheKey(name, data) {
  var action = (data && data.action) || ''
  var vid = (data && data.vehicleId) || ''
  // 包含筛选参数以区分不同查询
  var extra = ''
  var filter = (data && data.filter) || ''
  var period = (data && data.period) || ''
  var trendPeriod = (data && data.trendPeriod) || ''
  if (filter) extra += '_' + filter
  if (period) extra += '_' + period
  if (trendPeriod) extra += '_' + trendPeriod
  return CACHE_PREFIX + name + '_' + action + '_' + vid + extra
}

function getCached(key) {
  try {
    var cached = wx.getStorageSync(key)
    if (cached && cached.t > Date.now()) {
      return cached.d
    }
    // 过期则删除
    if (cached) {
      wx.removeStorageSync(key)
    }
    return null
  } catch (e) {
    return null
  }
}

function setCached(key, data, ttl) {
  try {
    wx.setStorageSync(key, {
      d: data,
      t: Date.now() + (ttl || DEFAULT_TTL),
    })
  } catch (e) {
    // storage 满，清理旧缓存
    cleanOldCaches()
    try {
      wx.setStorageSync(key, {
        d: data,
        t: Date.now() + (ttl || DEFAULT_TTL),
      })
    } catch (e2) {
      console.warn('[cache] setStorageSync failed twice', e2)
    }
  }
}

function cleanOldCaches() {
  try {
    var info = wx.getStorageInfoSync()
    var cacheKeys = info.keys.filter(function (k) {
      return k.indexOf(CACHE_PREFIX) === 0
    })
    // 如果缓存太多，删除最旧的
    if (cacheKeys.length > MAX_CACHE_KEYS) {
      // 按过期时间排序
      var keysWithTime = cacheKeys.map(function (k) {
        try {
          var v = wx.getStorageSync(k)
          return { key: k, time: v ? v.t : 0 }
        } catch (e) {
          return { key: k, time: 0 }
        }
      })
      keysWithTime.sort(function (a, b) { return a.time - b.time })
      // 删除最旧的一半
      var toRemove = Math.ceil(keysWithTime.length / 2)
      for (var i = 0; i < toRemove; i++) {
        wx.removeStorageSync(keysWithTime[i].key)
      }
    }
  } catch (e) {
    console.warn('[cache] cleanOldCaches error', e)
  }
}

module.exports = {
  getCacheKey: getCacheKey,
  getCached: getCached,
  setCached: setCached,
  DEFAULT_TTL: DEFAULT_TTL,
}