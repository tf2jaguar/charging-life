const { callCloud } = require('../../utils/cloud')
const { formatRelativeDate, formatDate, formatDuration, toFixed } = require('../../utils/util')
const auth = require('../../utils/auth')
const app = getApp()

const FILTER_MAP = ['all', 'week', 'month', 'fast', 'slow']
const FILTER_LABELS = ['全部', '本周', '本月', '快充', '慢充']

Page({
  data: {
    filters: FILTER_LABELS,
    activeFilter: 0,
    records: [],
    groupedRecords: [],
    summaryCount: 0,
    summaryKwh: '0.0',
    summaryCost: '0.00',
    summaryLabel: '全部统计',
    page: 1,
    hasMore: true,
    loading: true,
    summaryLoading: true,
    listLoading: true,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.setData({ page: 1, records: [], hasMore: true })

    if (!auth.isLoggedIn()) {
      this.setData({ loading: false, summaryLoading: false, listLoading: false })
      return
    }
    this.loadSummary()
    this.loadRecords()
  },

  async loadSummary() {
    this.setData({ summaryLoading: true })
    try {
      const vehicleId = app.getCurrentVehicleId()
      const filter = FILTER_MAP[this.data.activeFilter]
      const res = await callCloud('stats', {
        action: 'overview',
        filter,
        vehicleId,
      })
      this.setData({
        summaryCount: res.count.value,
        summaryKwh: toFixed(res.kwh.value, 1),
        summaryCost: toFixed(res.cost.value),
        summaryLabel: FILTER_LABELS[this.data.activeFilter] + '统计',
        summaryLoading: false,
      })
    } catch (err) {
      console.error('[loadSummary]', err)
      this.setData({ summaryLoading: false })
    }
  },

  async loadRecords() {
    this.setData({ listLoading: true })
    try {
      const vehicleId = app.getCurrentVehicleId()
      const res = await callCloud('record', {
        action: 'list',
        data: { page: this.data.page, pageSize: 20, vehicleId },
      })

      let allRecords = this.data.page === 1 ? (res.list || []) : this.data.records.concat(res.list || [])

      allRecords = allRecords.map(r => {
        r.timeText = formatRelativeDate(r.startTime) + ' ' + formatDate(r.startTime, 'HH:mm') + ' · ' + formatDuration(r.duration)
        return r
      })

      let filtered = this.applyFilter(allRecords)

      this.setData({
        records: allRecords,
        groupedRecords: this.groupByDate(filtered),
        hasMore: allRecords.length < res.total,
        listLoading: false,
        loading: false,
      })
    } catch (err) {
      console.error(err)
      this.setData({ listLoading: false, loading: false })
    }
  },

  applyFilter(records) {
    const filter = this.data.activeFilter
    if (filter === 0) return records

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (filter === 1) {
      const weekStart = new Date(today)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
      return records.filter(r => new Date(r.startTime) >= weekStart)
    }
    if (filter === 2) {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      return records.filter(r => new Date(r.startTime) >= monthStart)
    }
    if (filter === 3) return records.filter(r => r.chargeType === 'fast' || r.chargeType === 'super')
    if (filter === 4) return records.filter(r => r.chargeType === 'slow')
    return records
  },

  groupByDate(records) {
    const groups = {}
    records.forEach(r => {
      const label = formatRelativeDate(r.startTime)
      if (!groups[label]) groups[label] = []
      groups[label].push(r)
    })
    return Object.keys(groups).map(label => ({ label, records: groups[label] }))
  },

  onFilterTap(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ activeFilter: idx })
    const filtered = this.applyFilter(this.data.records)
    this.setData({
      groupedRecords: this.groupByDate(filtered),
    })
    this.loadSummary()
  },

  onLoadMore() {
    if (!this.data.hasMore) return
    this.setData({ page: this.data.page + 1 })
    this.loadRecords()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, records: [] })
    this.loadRecords().then(() => wx.stopPullDownRefresh())
    this.loadSummary()
  },
})
