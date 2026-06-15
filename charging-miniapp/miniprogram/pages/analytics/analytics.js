const { callCloud } = require('../../utils/cloud')
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

    const loadCore = callCloud('stats', { action: 'overview', period, vehicleId })
      .then(overview => {
        if (overview) {
          overview.kwhDisplay = toFixed(overview.kwh.value, 2)
          overview.costDisplay = toFixed(overview.cost.value, 2)
          overview.avgPriceDisplay = toFixed(overview.avgPrice.value, 2)
          overview.durationDisplay = toFixed(overview.avgDuration.value / 60, 1)
          overview.avgKwhDisplay = toFixed(overview.avgKwh.value, 1)
        }
        this.setData({ coreStats: overview, coreLoading: false })
      }).catch(err => {
        console.error('load coreStats error', err)
        this.setData({ coreLoading: false })
      })

    const loadTrend = callCloud('stats', { action: 'trend', vehicleId })
      .then(trend => {
        this.setData({
          trend: trend || [],
          maxKwh: Math.max(...(trend || []).map(m => m.kwh), 1),
          maxCost: Math.max(...(trend || []).map(m => m.cost), 1),
          trendLoading: false,
        })
      }).catch(err => {
        console.error('load trend error', err)
        this.setData({ trendLoading: false })
      })

    const loadTimeDist = callCloud('stats', { action: 'timeDistribution', period, vehicleId })
      .then(timeDist => {
        this.setData({ timeDist: timeDist || [], timeDistLoading: false })
      }).catch(err => {
        console.error('load timeDist error', err)
        this.setData({ timeDistLoading: false })
      })

    const loadTypeDist = callCloud('stats', { action: 'typeDistribution', period, vehicleId })
      .then(typeDist => {
        this.setData({ typeDist, typeDistLoading: false })
      }).catch(err => {
        console.error('load typeDist error', err)
        this.setData({ typeDistLoading: false })
      })

    const loadStations = callCloud('stats', { action: 'topStations', period, vehicleId })
      .then(topStations => {
        if (topStations && topStations.length) {
          topStations.forEach(s => {
            s.kwh = toFixed(s.kwh, 1)
            s.cost = toFixed(s.cost)
          })
        }
        this.setData({ topStations: topStations || [], stationLoading: false })
      }).catch(err => {
        console.error('load topStations error', err)
        this.setData({ stationLoading: false })
      })

    await Promise.all([loadCore, loadTrend, loadTimeDist, loadTypeDist, loadStations])
    this.setData({ loading: false })
  },

  onPeriodChange(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ period: idx === 0 ? 'month' : 'year' })
    this.loadAll()
  },
})
