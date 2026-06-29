const { callCloud } = require('../../utils/cloud')
const { PLATFORMS, PROMO_TAGS, PLATFORM_LIST, TAG_LIST, PROMO_STATUS, STATUS_LIST } = require('../../utils/constants')
const auth = require('../../utils/auth')

Page({
  data: {
    promotionId: '',
    promotion: null,
    isEditMode: false,
    showDeleteModal: false,
    loading: true,
    isOwner: false,
    isAdmin: false,
    // 编辑字段
    editPlatform: '',
    editTag: '',
    editContent: '',
    editAmount: '',
    editStartDate: '',
    editStartTime: '',
    editEndDate: '',
    editEndTime: '',
    editSteps: '',
    editLink: '',
    editOtherPlatformName: '',
    editStatus: '',
    editStatusIndex: 0,
    platforms: PLATFORM_LIST,
    tags: TAG_LIST,
    statusList: STATUS_LIST,
    stepsPlaceholder: '1. 打开APP\n2. 进入优惠中心\n3. 点击领取',
  },

  onLoad(options) {
    this.setData({ isAdmin: auth.isAdmin() })
    if (options.id) {
      this.setData({ promotionId: options.id })
      this.loadDetail(options.id)
    }
  },

  async loadDetail(id) {
    try {
      const res = await callCloud('promotion', { action: 'detail', data: { promotionId: id } })
      const promotion = res.result || res

      // 格式化显示
      promotion.platformInfo = PLATFORMS[promotion.platform] || { label: promotion.platformName || promotion.platform, color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' }
      if (promotion.platform === 'other' && promotion.platformName) {
        promotion.platformInfo.label = '其他-' + promotion.platformName
      }
      promotion.tagInfo = PROMO_TAGS[promotion.tag] || { color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' }
      promotion.statusInfo = PROMO_STATUS[promotion.status] || PROMO_STATUS.pending

      const pad = n => (n < 10 ? '0' + n : '' + n)
      if (promotion.startTime) {
        const s = new Date(promotion.startTime)
        promotion.startDateText = s.getFullYear() + '.' + pad(s.getMonth() + 1) + '.' + pad(s.getDate())
        promotion.startTimeText = pad(s.getHours()) + ':' + pad(s.getMinutes())
      }
      if (promotion.endTime) {
        const e = new Date(promotion.endTime)
        promotion.endDateText = e.getFullYear() + '.' + pad(e.getMonth() + 1) + '.' + pad(e.getDate())
        promotion.endTimeText = pad(e.getHours()) + ':' + pad(e.getMinutes())
      }
      promotion.dateRange = (promotion.startDateText || '--') + ' - ' + (promotion.endDateText || '--')

      // 步骤解析
      if (promotion.steps) {
        promotion.stepList = promotion.steps.split('\n').filter(s => s.trim())
      } else {
        promotion.stepList = []
      }

      // 金额格式化
      promotion.amountText = promotion.amount ? '¥' + Number(promotion.amount).toFixed(2) : '¥0.00'

      // 发布信息格式化
      promotion.publisherName = promotion.nickName || '匿名用户'
      if (promotion.createdAt) {
        const c = new Date(promotion.createdAt)
        promotion.publishTimeText = c.getFullYear() + '-' + pad(c.getMonth() + 1) + '-' + pad(c.getDate()) + ' ' + pad(c.getHours()) + ':' + pad(c.getMinutes())
      } else {
        promotion.publishTimeText = '--'
      }

      this.setData({
        promotion,
        loading: false,
        isOwner: promotion._openid === auth.getOpenId(),
        // 初始化编辑字段
        editPlatform: promotion.platform,
        editTag: promotion.tag,
        editContent: promotion.content,
        editAmount: promotion.amount ? String(promotion.amount) : '',
        editStartDate: this.formatDatePart(promotion.startTime),
        editStartTime: this.formatTimePart(promotion.startTime),
        editEndDate: this.formatDatePart(promotion.endTime),
        editEndTime: this.formatTimePart(promotion.endTime),
        editSteps: promotion.steps || '',
        editLink: promotion.link || '',
        editOtherPlatformName: promotion.platform === 'other' ? (promotion.platformName || '') : '',
        editStatus: promotion.status || 'pending',
        editStatusIndex: STATUS_LIST.findIndex(function(s) { return s.value === (promotion.status || 'pending') }),
      })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  formatDatePart(date) {
    if (!date) return ''
    var d = new Date(date)
    var pad = function (n) { return n < 10 ? '0' + n : '' + n }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  },

  formatTimePart(date) {
    if (!date) return ''
    var d = new Date(date)
    var pad = function (n) { return n < 10 ? '0' + n : '' + n }
    return pad(d.getHours()) + ':' + pad(d.getMinutes())
  },

  // ===== 编辑模式 =====
  onEditTap() {
    this.setData({ isEditMode: true })
  },

  onCancelEdit() {
    var p = this.data.promotion
    this.setData({
      isEditMode: false,
      editPlatform: p.platform,
      editTag: p.tag,
      editContent: p.content,
      editAmount: p.amount ? String(p.amount) : '',
      editStartDate: this.formatDatePart(p.startTime),
      editStartTime: this.formatTimePart(p.startTime),
      editEndDate: this.formatDatePart(p.endTime),
      editEndTime: this.formatTimePart(p.endTime),
      editSteps: p.steps || '',
      editLink: p.link || '',
      editOtherPlatformName: p.platform === 'other' ? (p.platformName || '') : '',
      editStatus: p.status || 'pending',
      editStatusIndex: STATUS_LIST.findIndex(function(s) { return s.value === (p.status || 'pending') }),
    })
  },

  // ===== 编辑字段处理 =====
  onEditPlatformTap(e) {
    this.setData({ editPlatform: e.currentTarget.dataset.value })
  },
  onEditOtherPlatformInput(e) {
    this.setData({ editOtherPlatformName: e.detail.value })
  },
  onEditTagTap(e) {
    this.setData({ editTag: e.currentTarget.dataset.value })
  },
  onEditContentInput(e) {
    this.setData({ editContent: e.detail.value })
  },
  onEditAmountInput(e) {
    this.setData({ editAmount: e.detail.value })
  },
  onEditStartDateChange(e) {
    this.setData({ editStartDate: e.detail.value })
  },
  onEditStartTimeChange(e) {
    this.setData({ editStartTime: e.detail.value })
  },
  onEditEndDateChange(e) {
    this.setData({ editEndDate: e.detail.value })
  },
  onEditEndTimeChange(e) {
    this.setData({ editEndTime: e.detail.value })
  },
  onEditStepsInput(e) {
    this.setData({ editSteps: e.detail.value })
  },
  onEditLinkInput(e) {
    this.setData({ editLink: e.detail.value })
  },

  // ===== 状态选择 =====
  onStatusPickerChange(e) {
    var idx = e.detail.value
    var status = this.data.statusList[idx]
    if (status) {
      this.setData({ editStatus: status.value, editStatusIndex: idx })
    }
  },

  // ===== 保存修改 =====
  async onSave() {
    var d = this.data
    if (d.editPlatform === 'other' && !d.editOtherPlatformName.trim()) {
      wx.showToast({ title: '请输入平台名称', icon: 'none' })
      return
    }
    if (!d.editContent || !d.editAmount) {
      wx.showToast({ title: '请填写优惠内容和金额', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '保存中...' })
      var platformInfo = PLATFORM_LIST.find(function (p) { return p.value === d.editPlatform })
      var platformName = d.editPlatform === 'other' ? d.editOtherPlatformName.trim() : (platformInfo ? platformInfo.label : d.editPlatform)
      var updateData = {
        promotionId: d.promotionId,
        platform: d.editPlatform,
        platformName: platformName,
        tag: d.editTag,
        content: d.editContent,
        amount: parseFloat(d.editAmount) || 0,
        steps: d.editSteps,
        link: d.editLink,
      }
      if (d.editStartDate && d.editStartTime) {
        updateData.startTime = d.editStartDate + 'T' + d.editStartTime
      }
      if (d.editEndDate && d.editEndTime) {
        updateData.endTime = d.editEndDate + 'T' + d.editEndTime
      }
      // 管理员可修改状态
      if (d.isAdmin && d.editStatus) {
        updateData.status = d.editStatus
      }
      await callCloud('promotion', { action: 'update', data: updateData })
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.setData({ isEditMode: false })
      this.loadDetail(d.promotionId)
    } catch (err) {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // ===== 删除 =====
  onDeleteTap() {
    this.setData({ showDeleteModal: true })
  },

  onHideDeleteModal() {
    this.setData({ showDeleteModal: false })
  },

  async onConfirmDelete() {
    try {
      await callCloud('promotion', { action: 'delete', data: { promotionId: this.data.promotionId } })
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack()
      }, 800)
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },

  // ===== 跳转链接 =====
  onGoLink() {
    var link = this.data.promotion.link
    if (!link) {
      wx.showToast({ title: '暂无链接', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: link,
      success: function () {
        wx.showToast({ title: '链接已复制', icon: 'success' })
      }
    })
  },
})