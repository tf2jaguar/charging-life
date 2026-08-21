const { callCloud, callCloudCacheFirst, callCloudCached } = require('../../utils/cloud')
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
    // 月份选择
    currentYear: 0,
    currentMonth: 0,
    // 日历懒加载
    calendarVisible: false,
    calendarRendered: false,
  },

  onLoad() {
    const now = new Date()
    this.setData({
      statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
    })
  },

  onReady() {
    // 设置 IntersectionObserver 监听日历触发区，下滑到时才渲染日历
    this._calendarObserver = wx.createIntersectionObserver(this)
    this._calendarObserver.relativeToViewport({ bottom: 100 }).observe('.calendar-trigger', (res) => {
      if (res.intersectionRatio > 0 && !this.data.calendarRendered) {
        this.setData({ calendarVisible: true, calendarRendered: true })
        this._calendarObserver.disconnect()
      }
    })
  },

  onUnload() {
    if (this._calendarObserver) {
      this._calendarObserver.disconnect()
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadData()
  },

  // 上个月
  onPrevMonth() {
    let m = this.data.currentMonth - 1
    let y = this.data.currentYear
    if (m < 1) { m = 12; y-- }
    // 不允许查看未来月份
    const now = new Date()
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) {
      wx.showToast({ title: '不能查看未来月份', icon: 'none' })
      return
    }
    this.setData({ currentYear: y, currentMonth: m })
    this.loadData()
  },

  // 下个月
  onNextMonth() {
    let m = this.data.currentMonth + 1
    let y = this.data.currentYear
    if (m > 12) { m = 1; y++ }
    // 不允许查看未来月份
    const now = new Date()
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) {
      wx.showToast({ title: '不能查看未来月份', icon: 'none' })
      return
    }
    this.setData({ currentYear: y, currentMonth: m })
    this.loadData()
  },

  async loadData() {
    this.setData({
      loading: true,
      greeting: getGreeting(),
    })

    // auth
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

    // 第一阶段：获取车辆列表
    let vehicleId = app.getCurrentVehicleId()
    let vehicles = []
    try {
      vehicles = await callCloudCached('vehicle', { action: 'list' }, 10 * 60 * 1000) || []
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

    // 第二阶段：加载指定月份数据（合并接口，1 次调用）
    const y = this.data.currentYear
    const m = this.data.currentMonth
    this.setData({ overviewLoading: true, calendarLoading: true, recentLoading: true })

    // 对当前月使用 cache-first，非当前月不缓存
    const now = new Date()
    const isCurrentMonth = (y === now.getFullYear() && m === now.getMonth() + 1)

    if (isCurrentMonth) {
      callCloudCacheFirst('stats', {
        action: 'dashboard', year: y, month: m, vehicleId,
      }, 2 * 60 * 1000, function (fresh) {
        this._applyDashboardData(fresh)
      }.bind(this)).then(function (res) {
        this._applyDashboardData(res)
      }.bind(this)).catch(function (err) {
        console.error('load dashboard error', err)
        this.setData({
          overviewLoading: false, recentLoading: false, calendarLoading: false,
        })
      }.bind(this))
    } else {
      // 非当前月不缓存，直接调用
      callCloud('stats', {
        action: 'dashboard', year: y, month: m, vehicleId,
      }).then(function (res) {
        this._applyDashboardData(res)
      }.bind(this)).catch(function (err) {
        console.error('load dashboard error', err)
        this.setData({
          overviewLoading: false, recentLoading: false, calendarLoading: false,
        })
      }.bind(this))
    }
  },

  _applyDashboardData: function (data) {
    if (!data) return
    var that = this

    if (data.overview) {
      that.setData({
        overview: formatOverview(data.overview),
        overviewLoading: false,
        loading: false,
      })
    }

    if (data.recentRecords) {
      that._updateRecentRecords(data.recentRecords)
    }

    if (data.calendar) {
      that.setData({
        calendarDays: data.calendar.days || [],
        calendarKwh: data.calendar.kwh || {},
        calendarCount: data.calendar.count || 0,
        calendarTotalKwh: data.calendar.totalKwh || 0,
        calendarLoading: false,
      })
    }
  },

  _updateRecentRecords: function (recentRes) {
    var lastRecord = (recentRes && recentRes[0]) || null
    var lastChargeKwh = lastRecord ? toFixed(lastRecord.chargeKwh, 1) : ''
    var lastChargeTimeText = lastRecord ? formatRelativeDate(lastRecord.startTime) : ''
    var records = (recentRes || []).map(function (r) {
      r.timeText = formatRelativeDate(r.startTime) + ' ' + formatDate(r.startTime, 'HH:mm') + ' · ' + (r.chargeType === 'fast' ? '快充' : r.chargeType === 'slow' ? '慢充' : '超充')
      return r
    })
    this.setData({
      lastChargeKwh: lastChargeKwh,
      lastChargeTimeText: lastChargeTimeText,
      recentRecords: records,
      recentLoading: false,
    })
  },

  // 日历组件内部月份切换时的回调
  onCalendarMonthChange(e) {
    const { year, month } = e.detail
    // 更新顶部月份选择器
    this.setData({ currentYear: year, currentMonth: month })
    // 重新加载数据（日历组件已有数据，这里重新获取概览和最近记录）
    this.loadData()
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
    // 重置回当前月
    const now = new Date()
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
    })
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },
})