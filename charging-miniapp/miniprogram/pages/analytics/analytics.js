const { callCloud, callCloudCached, callCloudCacheFirst } = require('../../utils/cloud')
const { toFixed } = require('../../utils/util')
const auth = require('../../utils/auth')
const app = getApp()

Page({
  data: {
    period: 'month',
    periodOptions: ['本月', '本年'],
    coreStats: null,
    trend: [],
    timeDist: [],
    typeDist: null,
    topStations: [],
    loading: true,
    coreLoading: true,
    trendLoading: true,
    timeDistLoading: true,
    typeDistLoading: true,
    stationLoading: true,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }

    if (!auth.isLoggedIn()) {
      this.setData({ loading: false, coreLoading: false, trendLoading: false, timeDistLoading: false, typeDistLoading: false, stationLoading: false })
      return
    }
    this.loadAll()
  },

  async loadAll() {
    this.setData({
      loading: true,
      coreLoading: true, trendLoading: true,
      timeDistLoading: true, typeDistLoading: true, stationLoading: true,
    })

    const period = this.data.period
    const vehicleId = app.getCurrentVehicleId()

    // 各个模块独立加载，用缓存减少重复请求
    // 分析页数据变化不大，缓存设 5 分钟
    var ttl = 5 * 60 * 1000

    callCloudCacheFirst('stats', { action: 'overview', period, vehicleId }, ttl, function (overview) {
      if (overview) {
        overview.kwhDisplay = toFixed(overview.kwh.value, 2)
        overview.costDisplay = toFixed(overview.cost.value, 2)
        overview.avgPriceDisplay = toFixed(overview.avgPrice.value, 2)
        overview.durationDisplay = toFixed(overview.avgDuration.value / 60, 1)
        overview.avgKwhDisplay = toFixed(overview.avgKwh.value, 1)
      }
      this.setData({ coreStats: overview, coreLoading: false })
    }.bind(this)).then(function (overview) {
      if (overview) {
        overview.kwhDisplay = toFixed(overview.kwh.value, 2)
        overview.costDisplay = toFixed(overview.cost.value, 2)
        overview.avgPriceDisplay = toFixed(overview.avgPrice.value, 2)
        overview.durationDisplay = toFixed(overview.avgDuration.value / 60, 1)
        overview.avgKwhDisplay = toFixed(overview.avgKwh.value, 1)
      }
      this.setData({ coreStats: overview, coreLoading: false })
    }.bind(this)).catch(function (err) {
      console.error('load coreStats error', err)
      this.setData({ coreLoading: false })
    }.bind(this))

    callCloudCacheFirst('stats', { action: 'trend', vehicleId }, ttl, function (trend) {
      var trendData = trend || []
      this.setData({
        trend: trendData,
        maxKwh: Math.max.apply(null, trendData.map(function (m) { return m.kwh }), 1),
        maxCost: Math.max.apply(null, trendData.map(function (m) { return m.cost }), 1),
        trendLoading: false,
      })
    }.bind(this)).then(function (trend) {
      var trendData = trend || []
      this.setData({
        trend: trendData,
        maxKwh: Math.max.apply(null, trendData.map(function (m) { return m.kwh }), 1),
        maxCost: Math.max.apply(null, trendData.map(function (m) { return m.cost }), 1),
        trendLoading: false,
      })
    }.bind(this)).catch(function (err) {
      console.error('load trend error', err)
      this.setData({ trendLoading: false })
    }.bind(this))

    callCloudCacheFirst('stats', { action: 'timeDistribution', period, vehicleId }, ttl, function (timeDist) {
      this.setData({ timeDist: timeDist || [], timeDistLoading: false })
    }.bind(this)).then(function (timeDist) {
      this.setData({ timeDist: timeDist || [], timeDistLoading: false })
    }.bind(this)).catch(function (err) {
      console.error('load timeDist error', err)
      this.setData({ timeDistLoading: false })
    }.bind(this))

    callCloudCacheFirst('stats', { action: 'typeDistribution', period, vehicleId }, ttl, function (typeDist) {
      this.setData({ typeDist: typeDist, typeDistLoading: false })
    }.bind(this)).then(function (typeDist) {
      this.setData({ typeDist: typeDist, typeDistLoading: false })
    }.bind(this)).catch(function (err) {
      console.error('load typeDist error', err)
      this.setData({ typeDistLoading: false })
    }.bind(this))

    callCloudCacheFirst('stats', { action: 'topStations', period, vehicleId }, ttl, function (topStations) {
      if (topStations && topStations.length) {
        topStations.forEach(function (s) {
          s.kwh = toFixed(s.kwh, 1)
          s.cost = toFixed(s.cost)
        })
      }
      this.setData({ topStations: topStations || [], stationLoading: false })
    }.bind(this)).then(function (topStations) {
      if (topStations && topStations.length) {
        topStations.forEach(function (s) {
          s.kwh = toFixed(s.kwh, 1)
          s.cost = toFixed(s.cost)
        })
      }
      this.setData({ topStations: topStations || [], stationLoading: false })
    }.bind(this)).catch(function (err) {
      console.error('load topStations error', err)
      this.setData({ stationLoading: false })
    }.bind(this))
  },

  onPeriodChange(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ period: idx === 0 ? 'month' : 'year' })
    this.loadAll()
  },
})