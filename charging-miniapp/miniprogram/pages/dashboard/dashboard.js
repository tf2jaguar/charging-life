const { callCloud } = require('../../utils/cloud')
const { getGreeting, formatRelativeDate, formatDate, toFixed } = require('../../utils/util')
const auth = require('../../utils/auth')
const app = getApp()

const EMPTY_OVERVIEW = {
  count: { value: 0, change: 0, direction: 'same' },
  kwh: { value: 0, change: 0, direction: 'same' },
  cost: { value: 0, change: 0, direction: 'same' },
  avgPrice: { value: 0, change: 0, direction: 'same' },
  duration: { value: 0, change: 0, direction: 'same' },
  perHundredKwh: { value: 0, change: 0, direction: 'same' },
  perHundredCost: { value: 0, change: 0, direction: 'same' },
  kwhDisplay: '-',
  costDisplay: '-',
  avgPriceDisplay: '-',
  durationDisplay: '-',
  perHundredKwhDisplay: '-',
  perHundredCostDisplay: '-',
  countChangeText: '',
  kwhChangeText: '',
  costChangeText: '',
  avgPriceChangeText: '',
  durationChangeText: '',
  perHundredKwhChangeText: '',
  perHundredCostChangeText: '',
}

function formatOverview(overviewRes) {
  if (!overviewRes) return EMPTY_OVERVIEW
  const hasData = overviewRes.count && overviewRes.count.value > 0
  overviewRes.kwhDisplay = hasData ? toFixed(overviewRes.kwh.value) : '-'
  overviewRes.costDisplay = hasData ? toFixed(overviewRes.cost.value) : '-'
  overviewRes.avgPriceDisplay = hasData ? toFixed(overviewRes.avgPrice.value) : '-'
  overviewRes.durationDisplay = hasData && overviewRes.duration.value ? toFixed(overviewRes.duration.value / 60, 1) : '-'
  overviewRes.perHundredKwhDisplay = hasData && overviewRes.perHundredKwh.value > 0 ? toFixed(overviewRes.perHundredKwh.value, 1) : '-'
  overviewRes.perHundredCostDisplay = hasData && overviewRes.perHundredCost.value > 0 ? toFixed(overviewRes.perHundredCost.value) : '-'

  function fmtChange(field, invertArrow) {
    const v = field || {}
    const val = v.value
    const chg = v.change
    const dir = v.direction
    if (!val || val <= 0 || dir === 'same' || chg === undefined || chg === 0) return ''
    const absChg = Math.abs(chg)
    if (invertArrow) {
      return dir === 'positive' ? '↓' + absChg + '%' : '↑' + absChg + '%'
    }
    return dir === 'positive' ? '↑' + absChg + '%' : '↓' + absChg + '%'
  }
  overviewRes.countChangeText = fmtChange(overviewRes.count)
  overviewRes.countPositive = overviewRes.count && overviewRes.count.direction === 'positive'
  overviewRes.kwhChangeText = fmtChange(overviewRes.kwh)
  overviewRes.kwhPositive = overviewRes.kwh && overviewRes.kwh.direction === 'positive'
  overviewRes.costChangeText = fmtChange(overviewRes.cost, true)
  overviewRes.costPositive = overviewRes.cost && overviewRes.cost.direction === 'positive'
  overviewRes.avgPriceChangeText = hasData ? fmtChange(overviewRes.avgPrice, true) : ''
  overviewRes.avgPricePositive = overviewRes.avgPrice && overviewRes.avgPrice.direction === 'positive'
  overviewRes.durationChangeText = fmtChange(overviewRes.duration)
  overviewRes.durationPositive = overviewRes.duration && overviewRes.duration.direction === 'positive'
  overviewRes.perHundredKwhChangeText = hasData ? fmtChange(overviewRes.perHundredKwh, true) : ''
  overviewRes.perHundredKwhPositive = overviewRes.perHundredKwh && overviewRes.perHundredKwh.direction === 'negative'
  overviewRes.perHundredCostChangeText = hasData ? fmtChange(overviewRes.perHundredCost, true) : ''
  overviewRes.perHundredCostPositive = overviewRes.perHundredCost && overviewRes.perHundredCost.direction === 'negative'
  return overviewRes
}

Page({
  data: {
    greeting: '',
    nickName: '未登录',
    defaultVehicle: null,
    vehicles: [],
    currentVehicleId: null,
    showVehiclePicker: false,
    lastChargeKwh: '',
    lastChargeTimeText: '',
    overview: EMPTY_OVERVIEW,
    recentRecords: [],
    calendarDays: [],
    calendarKwh: {},
    calendarCount: 0,
    calendarTotalKwh: 0,
    loading: true,
    headerLoading: true,
    overviewLoading: true,
    calendarLoading: true,
    recentLoading: true,
    statusBarHeight: 0,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadData()
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight })
  },

  async loadData() {
    this.setData({
      loading: true,
      greeting: getGreeting(),
      headerLoading: true,
      overviewLoading: true,
      calendarLoading: true,
      recentLoading: true,
    })

    // auth 已登录则跳过
    if (!auth.isLoggedIn()) {
      try { await auth.initOpenId() } catch (e) { /* ignore */ }
    }
    if (!auth.isLoggedIn()) {
      this.setData({
        loading: false, headerLoading: false, overviewLoading: false,
        calendarLoading: false, recentLoading: false,
        nickName: '未登录', defaultVehicle: null, vehicles: [],
        currentVehicleId: null, lastChargeKwh: '', lastChargeTimeText: '',
        overview: EMPTY_OVERVIEW, recentRecords: [],
        calendarDays: [], calendarKwh: {}, calendarCount: 0, calendarTotalKwh: 0,
      })
      return
    }

    const userInfo = auth.getUserInfo()
    if (userInfo && userInfo.nickName) {
      this.setData({ nickName: userInfo.nickName })
    }

    // 第一阶段：获取车辆列表（后续请求依赖 vehicleId）
    let vehicleId = app.getCurrentVehicleId()
    let vehicles = []
    try {
      vehicles = await callCloud('vehicle', { action: 'list' }) || []
    } catch (err) {
      console.error('load vehicles error', err)
    }
    const defaultVehicle = vehicleId
      ? vehicles.find(v => v._id === vehicleId) || vehicles.find(v => v.isDefault) || vehicles[0] || null
      : vehicles.find(v => v.isDefault) || vehicles[0] || null
    if (defaultVehicle) {
      vehicleId = defaultVehicle._id
    }
    this.setData({
      defaultVehicle, vehicles, currentVehicleId: vehicleId,
      headerLoading: false,
    })

    // 第二阶段：并行加载概览、最近记录、日历，各自独立更新
    const loadOverview = callCloud('stats', { action: 'overview', period: 'month', vehicleId })
      .then(res => {
        this.setData({ overview: formatOverview(res), overviewLoading: false })
      }).catch(err => {
        console.error('load overview error', err)
        this.setData({ overviewLoading: false })
      })

    const loadRecent = callCloud('stats', { action: 'recentRecords', limit: 2, vehicleId })
      .then(recentRes => {
        const lastRecord = (recentRes && recentRes[0]) || null
        const lastChargeKwh = lastRecord ? toFixed(lastRecord.chargeKwh, 1) : ''
        const lastChargeTimeText = lastRecord ? formatRelativeDate(lastRecord.startTime) : ''
        const records = (recentRes || []).map(r => {
          r.timeText = formatRelativeDate(r.startTime) + ' ' + formatDate(r.startTime, 'HH:mm') + ' · ' + (r.chargeType === 'fast' ? '快充' : r.chargeType === 'slow' ? '慢充' : '超充')
          return r
        })
        this.setData({
          lastChargeKwh, lastChargeTimeText,
          recentRecords: records, recentLoading: false,
        })
      }).catch(err => {
        console.error('load recent error', err)
        this.setData({ recentLoading: false })
      })

    const loadCalendar = callCloud('stats', { action: 'calendar', vehicleId })
      .then(calendarRes => {
        this.setData({
          calendarDays: calendarRes.days || [],
          calendarKwh: calendarRes.kwh || {},
          calendarCount: calendarRes.count || 0,
          calendarTotalKwh: calendarRes.totalKwh || 0,
          calendarLoading: false,
        })
      }).catch(err => {
        console.error('load calendar error', err)
        this.setData({ calendarLoading: false })
      })

    // 等全部完成再标记整体 loading 结束
    await Promise.all([loadOverview, loadRecent, loadCalendar])
    this.setData({ loading: false })
  },

  onCalendarMonthChange(e) {
    const { year, month } = e.detail
    const vehicleId = app.getCurrentVehicleId()
    callCloud('stats', { action: 'calendar', year, month, vehicleId }).then(res => {
      this.setData({
        calendarDays: res.days || [],
        calendarKwh: res.kwh || {},
        calendarCount: res.count || 0,
        calendarTotalKwh: res.totalKwh || 0,
      })
    })
  },

  onVehicleCardTap() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ show: false })
    }
    this.setData({ showVehiclePicker: true })
  },

  onVehiclePickerClose() {
    this.setData({ showVehiclePicker: false })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ show: true })
    }
  },

  onSelectVehicle(e) {
    const { id } = e.currentTarget.dataset
    app.setCurrentVehicleId(id)
    this.setData({ showVehiclePicker: false, currentVehicleId: id })

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ show: true })
    }

    const selVehicle = this.data.vehicles.find(v => v._id === id)
    wx.showToast({ title: selVehicle ? selVehicle.brand + ' ' + selVehicle.model : '已切换', icon: 'none' })
    this.loadData()
  },

  onPickerMaskTap() {
    this.setData({ showVehiclePicker: false })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ show: true })
    }
  },

  goToProfile() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  goToAnalytics() {
    wx.switchTab({ url: '/pages/analytics/analytics' })
  },

  goToPromotions() {
    wx.navigateTo({ url: '/pages/promotions/promotions' })
  },

  goToHistory() {
    wx.switchTab({ url: '/pages/history/history' })
  },

  goToAddRecord() {
    if (!auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/profile/profile' })
      return
    }
    wx.navigateTo({ url: '/pages/add-record/add-record' })
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/record-detail/record-detail?id=' + id })
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },
})
