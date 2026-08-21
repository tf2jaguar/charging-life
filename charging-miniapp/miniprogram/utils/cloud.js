var cache = require('./cache')

const callCloud = function (name, data) {
  var action = data && data.action
  console.info('[callCloud] name=%s, action=%s', name, action || '')
  return wx.cloud.callFunction({
    name: name,
    data: data,
  }).then(function (res) {
    if (res.result && res.result.code === 0) {
      return res.result.data
    }
    return Promise.reject(res.result || { code: -1, msg: '调用失败' })
  })
}

/**
 * 带缓存的云函数调用
 * @param {string} name 云函数名
 * @param {object} data 参数
 * @param {number} ttl 缓存有效期（毫秒），默认 5 分钟
 * @param {boolean} forceRefresh 是否强制刷新（跳过缓存）
 * @returns {Promise}
 */
const callCloudCached = function (name, data, ttl, forceRefresh) {
  var key = cache.getCacheKey(name, data)
  var action = (data && data.action) || ''

  if (!forceRefresh) {
    var cached = cache.getCached(key)
    if (cached !== null) {
      console.info('[callCloudCached] cache hit: %s/%s', name, action)
      return Promise.resolve(cached)
    }
  }

  return callCloud(name, data).then(function (result) {
    cache.setCached(key, result, ttl)
    return result
  })
}

/**
 * 缓存-刷新模式：先返回缓存，再异步刷新
 * 适合 dashboard 等需要快速展示的场景
 * @param {string} name 云函数名
 * @param {object} data 参数
 * @param {number} ttl 缓存有效期
 * @param {function} onRefresh 刷新完成后的回调（可选）
 * @returns {Promise} 返回缓存数据（如果有），否则等待云函数
 */
const callCloudCacheFirst = function (name, data, ttl, onRefresh) {
  var key = cache.getCacheKey(name, data)
  var cached = cache.getCached(key)

  if (cached !== null) {
    // 有缓存：立即返回，同时后台刷新
    callCloud(name, data).then(function (result) {
      cache.setCached(key, result, ttl)
      if (typeof onRefresh === 'function') {
        onRefresh(result)
      }
      return result
    }).catch(function (err) {
      console.warn('[callCloudCacheFirst] refresh failed: %s/%s', name, (data && data.action) || '', err)
    })
    return Promise.resolve(cached)
  }

  // 无缓存：等待云函数
  return callCloud(name, data).then(function (result) {
    cache.setCached(key, result, ttl)
    return result
  })
}

const getCollection = function (name) {
  return wx.cloud.database().collection(name)
}

module.exports = {
  callCloud: callCloud,
  callCloudCached: callCloudCached,
  callCloudCacheFirst: callCloudCacheFirst,
  getCollection: getCollection,
}