const { callCloud } = require('../../utils/cloud')
const auth = require('../../utils/auth')
const { PLATFORM_LIST, TAG_LIST } = require('../../utils/constants')

Page({
  data: {
    platforms: PLATFORM_LIST,
    tags: TAG_LIST,
    selectedPlatform: 'teld',
    selectedTag: '新人优惠',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    content: '',
    amount: '',
    steps: '',
    link: '',
    submitting: false,
    otherPlatformName: '',
    stepsPlaceholder: '1. 打开APP\n2. 进入优惠中心\n3. 点击领取',
  },

  onLoad() {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(function () {
        wx.switchTab({ url: '/pages/profile/profile' })
      }, 1000)
      return
    }
    this.setDefaultTimes()
  },

  setDefaultTimes() {
    var now = new Date()
    var threeMonthsLater = new Date(now.getTime() + 90 * 24 * 3600000)
    this.setData({
      startDate: this.formatDatePart(now),
      startTime: this.formatTimePart(now),
      endDate: this.formatDatePart(threeMonthsLater),
      endTime: this.formatTimePart(threeMonthsLater),
    })
  },

  formatDatePart(date) {
    var pad = function (n) { return n < 10 ? '0' + n : '' + n }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
  },

  formatTimePart(date) {
    var pad = function (n) { return n < 10 ? '0' + n : '' + n }
    return pad(date.getHours()) + ':' + pad(date.getMinutes())
  },

  onPlatformTap(e) {
    var value = e.currentTarget.dataset.value
    this.setData({ selectedPlatform: value })
  },

  onOtherPlatformInput(e) {
    this.setData({ otherPlatformName: e.detail.value })
  },

  onTagTap(e) {
    var value = e.currentTarget.dataset.value
    this.setData({ selectedTag: value })
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value })
  },

  onStartTimeChange(e) {
    this.setData({ startTime: e.detail.value })
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value })
  },

  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value })
  },

  onStepsInput(e) {
    this.setData({ steps: e.detail.value })
  },

  onLinkInput(e) {
    this.setData({ link: e.detail.value })
  },

  async onSubmit() {
    var d = this.data
    if (d.selectedPlatform === 'other' && !d.otherPlatformName.trim()) {
      wx.showToast({ title: '请输入平台名称', icon: 'none' })
      return
    }
    if (!d.content) {
      wx.showToast({ title: '请输入优惠内容', icon: 'none' })
      return
    }
    if (!d.amount || parseFloat(d.amount) <= 0) {
      wx.showToast({ title: '请输入优惠金额', icon: 'none' })
      return
    }
    if (!d.startDate || !d.endDate) {
      wx.showToast({ title: '请选择优惠时间', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    var platformInfo = PLATFORM_LIST.find(function (p) { return p.value === d.selectedPlatform })
    var platformName = d.selectedPlatform === 'other' ? d.otherPlatformName.trim() : (platformInfo ? platformInfo.label : d.selectedPlatform)
    var startStr = d.startDate + 'T' + (d.startTime || '00:00')
    var endStr = d.endDate + 'T' + (d.endTime || '23:59')

    try {
      await callCloud('promotion', {
        action: 'create',
        data: {
          platform: d.selectedPlatform === 'other' ? 'other' : d.selectedPlatform,
          platformName: platformName,
          tag: d.selectedTag,
          content: d.content,
          amount: parseFloat(d.amount),
          startTime: startStr,
          endTime: endStr,
          steps: d.steps,
          link: d.link,
        },
      })
      wx.showToast({ title: '优惠上报成功！', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack({ delta: 1 })
      }, 1000)
    } catch (err) {
      wx.showToast({ title: '上报失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ submitting: false })
    }
  },
})