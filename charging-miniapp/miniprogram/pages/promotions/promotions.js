const { callCloud } = require('../../utils/cloud')
const { formatDate, toFixed } = require('../../utils/util')
const auth = require('../../utils/auth')
const { PLATFORMS, PROMO_TAGS, PROMO_STATUS } = require('../../utils/constants')

Page({
  data: {
    sortBy: 'time',
    promotions: [],
    totalCount: 0,
    totalSaved: '0.00',
    page: 1,
    hasMore: true,
    loading: true,
    isAdmin: false,
  },

  onLoad() {
    this.setData({ isAdmin: auth.isAdmin() })
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(function () {
        wx.switchTab({ url: '/pages/profile/profile' })
      }, 1000)
      return
    }
    this.loadPromotions()
  },

  onShow() {
    // 每次显示时刷新列表（从详情/添加页返回时）
    if (this.data.promotions.length > 0 || !this.data.loading) {
      this.setData({ page: 1, promotions: [], hasMore: true })
      this.loadPromotions()
    }
  },

  async loadPromotions() {
    this.setData({ loading: true })
    try {
      const res = await callCloud('promotion', {
        action: 'list',
        data: {
          page: this.data.page,
          pageSize: 20,
          sortBy: this.data.sortBy,
        },
      })

      var list = this.data.page === 1 ? (res.list || []) : this.data.promotions.concat(res.list || [])

      list = list.map(function (p) {
        var platformInfo = PLATFORMS[p.platform] || { label: p.platformName || '未知', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' }
        var tagInfo = PROMO_TAGS[p.tag] || { color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' }
        var statusInfo = PROMO_STATUS[p.status] || PROMO_STATUS['pending']
        p.platformLabel = platformInfo.label
        p.platformColor = platformInfo.color
        p.platformBg = platformInfo.bg
        p.tagColor = tagInfo.color
        p.tagBg = tagInfo.bg
        p.statusLabel = statusInfo.label
        p.statusColor = statusInfo.color
        p.statusBg = statusInfo.bg
        p.dateRange = formatDate(p.startTime, 'yyyy-MM-dd') + ' ~ ' + formatDate(p.endTime, 'yyyy-MM-dd')
        p.amountText = '-¥' + toFixed(p.amount)
        return p
      })

      this.setData({
        promotions: list,
        totalCount: res.total,
        totalSaved: toFixed(res.totalSaved),
        hasMore: list.length < res.total,
        loading: false,
        isAdmin: auth.isAdmin(),
      })
    } catch (err) {
      console.error('[loadPromotions]', err)
      this.setData({ loading: false })
    }
  },

  onSwitchSort(e) {
    var type = e.currentTarget.dataset.type
    if (type === this.data.sortBy) return
    this.setData({ sortBy: type, page: 1, promotions: [], hasMore: true })
    this.loadPromotions()
  },

  onLoadMore() {
    if (!this.data.hasMore) return
    this.setData({ page: this.data.page + 1 })
    this.loadPromotions()
  },

  onPromotionTap(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/promotion-detail/promotion-detail?id=' + id })
  },

  onAddPromotion() {
    wx.navigateTo({ url: '/pages/promotion-add/promotion-add' })
  },

  onPullDownRefresh() {
    this.setData({ page: 1, promotions: [], hasMore: true })
    this.loadPromotions().then(function () {
      wx.stopPullDownRefresh()
    })
  },
})