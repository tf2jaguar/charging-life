const { callCloud } = require('../../utils/cloud')
const { formatDate, formatDuration, toFixed } = require('../../utils/util')
const auth = require('../../utils/auth')

Page({
  data: {
    recordId: '',
    record: null,
    isEditMode: false,
    showDeleteModal: false,
    // 编辑字段
    editStationName: '',
    editChargeType: 'fast',
    editStartDate: '',
    editStartTime: '',
    editEndDate: '',
    editEndTime: '',
    editChargeKwh: '',
    editCost: '',
    editStartSOC: 0,
    editEndSOC: 0,
    editMileage: '',
    editRemark: '',
    editDurationText: '--',
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ recordId: options.id })
      this.loadDetail(options.id)
    }
  },

  async loadDetail(id) {
    try {
      const record = await callCloud('record', { action: 'detail', data: { recordId: id } })

      const startDate = this.formatDatePart(record.startTime)
      const startTime = this.formatTimePart(record.startTime)
      const endDate = this.formatDatePart(record.endTime)
      const endTime = this.formatTimePart(record.endTime)

      // 格式化查看模式的显示字段
      const start = new Date(record.startTime)
      const end = new Date(record.endTime)
      const pad = n => (n < 10 ? '0' + n : '' + n)
      record.startTimeText = pad(start.getHours()) + ':' + pad(start.getMinutes())
      record.dateText = start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate())
      const minutes = !isNaN(start.getTime()) && !isNaN(end.getTime())
        ? Math.max(0, Math.round((end - start) / 60000))
        : 0
      record.durationText = formatDuration(minutes) || '--'

      this.setData({
        record,
        editStationName: record.stationName,
        editChargeType: record.chargeType,
        editStartDate: startDate,
        editStartTime: startTime,
        editEndDate: endDate,
        editEndTime: endTime,
        editChargeKwh: record.chargeKwh,
        editCost: record.cost,
        editStartSOC: record.startSOC,
        editEndSOC: record.endSOC,
        editMileage: record.mileage,
        editRemark: record.remark,
      })
      this.calcEditDuration()
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  formatDatePart(date) {
    if (!date) return ''
    const d = new Date(date)
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  },

  formatTimePart(date) {
    if (!date) return ''
    const d = new Date(date)
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return pad(d.getHours()) + ':' + pad(d.getMinutes())
  },

  getFullTimeStr(dateStr, timeStr) {
    if (!dateStr) return ''
    return dateStr + 'T' + (timeStr || '00:00')
  },

  enterEditMode() {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(function () {
        wx.switchTab({ url: '/pages/profile/profile' })
      }, 1000)
      return
    }
    this.setData({ isEditMode: true })
  },

  exitEditMode() {
    this.setData({ isEditMode: false })
  },

  calcEditDuration() {
    const d = this.data
    const startStr = this.getFullTimeStr(d.editStartDate, d.editStartTime)
    const endStr = this.getFullTimeStr(d.editEndDate, d.editEndTime)
    if (!startStr || !endStr) {
      this.setData({ editDurationText: '--' })
      return
    }
    const start = new Date(startStr)
    const end = new Date(endStr)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      this.setData({ editDurationText: '--' })
      return
    }
    const minutes = Math.max(0, Math.round((end - start) / 60000))
    this.setData({ editDurationText: formatDuration(minutes) || '--' })
  },

  onEditStationInput(e) { this.setData({ editStationName: e.detail.value }) },
  onEditChargeTypeChange(e) { this.setData({ editChargeType: e.detail.value }) },
  onEditStartDateChange(e) { this.setData({ editStartDate: e.detail.value }); this.calcEditDuration() },
  onEditStartTimeChange(e) { this.setData({ editStartTime: e.detail.value }); this.calcEditDuration() },
  onEditEndDateChange(e) { this.setData({ editEndDate: e.detail.value }); this.calcEditDuration() },
  onEditEndTimeChange(e) { this.setData({ editEndTime: e.detail.value }); this.calcEditDuration() },
  onEditStartSOCChange(e) { this.setData({ editStartSOC: parseInt(e.detail.value) }) },
  onEditEndSOCChange(e) { this.setData({ editEndSOC: parseInt(e.detail.value) }) },
  onEditChargeKwhInput(e) { this.setData({ editChargeKwh: e.detail.value }) },
  onEditCostInput(e) { this.setData({ editCost: e.detail.value }) },
  onEditMileageInput(e) { this.setData({ editMileage: e.detail.value }) },
  onEditRemarkInput(e) { this.setData({ editRemark: e.detail.value }) },

  async saveRecord() {
    const d = this.data
    try {
      await callCloud('record', {
        action: 'update',
        data: {
          recordId: d.recordId,
          stationName: d.editStationName,
          chargeType: d.editChargeType,
          startTime: this.getFullTimeStr(d.editStartDate, d.editStartTime),
          endTime: this.getFullTimeStr(d.editEndDate, d.editEndTime),
          startSOC: d.editStartSOC,
          endSOC: d.editEndSOC,
          chargeKwh: parseFloat(d.editChargeKwh) || 0,
          cost: parseFloat(d.editCost) || 0,
          mileage: parseFloat(d.editMileage) || 0,
          remark: d.editRemark,
          batteryCapacity: d.record.vehicleInfo ? d.record.vehicleInfo.batteryCapacity : 0,
        },
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      await this.loadDetail(d.recordId)
      this.setData({ isEditMode: false })
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  confirmDelete() {
    this.setData({ showDeleteModal: true })
  },

  onCancelDelete() {
    this.setData({ showDeleteModal: false })
  },

  async onDeleteConfirm() {
    try {
      await callCloud('record', { action: 'delete', data: { recordId: this.data.recordId } })
      wx.showToast({ title: '记录已删除', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack({ delta: 1 })
      }, 1000)
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
    this.setData({ showDeleteModal: false })
  },
})
