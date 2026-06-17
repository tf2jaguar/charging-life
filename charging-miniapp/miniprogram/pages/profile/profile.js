const { callCloud } = require('../../utils/cloud')
const { toFixed } = require('../../utils/util')
const auth = require('../../utils/auth')
const app = getApp()

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    nickName: '',
    vehicles: [],
    totalKwh: '-',
    totalCost: '-',
    totalDays: '-',
    settings: {
      notification: true,
      budgetLimit: 800,
      theme: 'light',
    },
    showAuthPopup: false,
    statusBarHeight: 0,
    statsLoading: true,
    vehicleLoading: true,
    _tapCountMap: {},
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
    this.loadData()
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight })
  },

  async loadData() {
    this.setData({ statsLoading: true, vehicleLoading: true })

    // auth 已登录则跳过
    if (!auth.isLoggedIn()) {
      try { await auth.initOpenId() } catch (e) { /* ignore */ }
    }

    const loggedIn = auth.isLoggedIn()
    const userInfo = auth.getUserInfo()

    if (!loggedIn) {
      this.setData({
        isLoggedIn: false, nickName: '', userInfo: null,
        vehicles: [], totalKwh: '-', totalCost: '-', totalDays: '-',
        statsLoading: false, vehicleLoading: false,
      })
      return
    }

    this.setData({
      userInfo,
      isLoggedIn: true,
      nickName: userInfo ? userInfo.nickName || '' : '',
      settings: userInfo && userInfo.settings ? userInfo.settings : this.data.settings,
    })

    const vehicleId = app.getCurrentVehicleId()

    // 并行加载车辆和统计数据，各自独立渲染
    const loadVehicles = callCloud('vehicle', { action: 'list' })
      .then(vehicles => {
        this.setData({ vehicles: vehicles || [], vehicleLoading: false })
      }).catch(err => {
        console.error('load vehicles error', err)
        this.setData({ vehicleLoading: false })
      })

    const loadStats = callCloud('stats', { action: 'overview', filter: 'all', vehicleId })
      .then(statsRes => {
        this.setData({
          totalKwh: statsRes && statsRes.kwh ? toFixed(statsRes.kwh.value, 1) : '-',
          totalCost: statsRes && statsRes.cost ? '¥' + toFixed(statsRes.cost.value) : '-',
          totalDays: statsRes && statsRes.days && statsRes.days.value > 0 ? statsRes.days.value : '-',
          statsLoading: false,
        })
      }).catch(err => {
        console.error('load stats error', err)
        this.setData({ statsLoading: false })
      })

    await Promise.all([loadVehicles, loadStats])
  },

  goToAuth() {
    if (!auth.isLoggedIn()) {
      this.setData({ showAuthPopup: true })
      return
    }
  },

  goToAddCar() {
    if (!auth.isLoggedIn()) {
      this.setData({ showAuthPopup: true })
      return
    }
    wx.navigateTo({ url: '/pages/add-car/add-car' })
  },

  onAuthSuccess(e) {
    const { nickName, avatarUrl } = e.detail
    this.setData({
      userInfo: { nickName, avatarUrl },
      isLoggedIn: true,
      nickName: nickName,
      showAuthPopup: false,
    })
    wx.showToast({ title: '授权成功', icon: 'success' })
    this.loadData()
  },

  onAuthClose() {
    this.setData({ showAuthPopup: false })
  },

  onExportData() {
    if (!auth.isLoggedIn()) {
      this.setData({ showAuthPopup: true })
      return
    }
    this.prepareExport()
  },

  async prepareExport() {
    wx.showLoading({ title: '准备中...', mask: true })
    try {
      const [vehicles, recordsRes] = await Promise.all([
        callCloud('vehicle', { action: 'list' }),
        callCloud('record', { action: 'list', data: { page: 1, pageSize: 1000 } }),
      ])

      const exportVehicles = (vehicles || []).map(v => ({
        brand: v.brand || '',
        model: v.model || '',
        trim: v.trim || '',
        batteryCapacity: v.batteryCapacity || 0,
        plateNumber: v.plateNumber || '',
        isDefault: v.isDefault || false,
      }))

      const exportRecords = (recordsRes && recordsRes.list || []).map(r => ({
        stationName: r.stationName || '',
        chargeType: r.chargeType || 'fast',
        startTime: r.startTime ? new Date(r.startTime).toISOString() : '',
        endTime: r.endTime ? new Date(r.endTime).toISOString() : '',
        startSOC: r.startSOC || 0,
        endSOC: r.endSOC || 0,
        chargeKwh: r.chargeKwh || 0,
        cost: r.cost || 0,
        mileage: r.mileage || 0,
        batteryCapacity: r.batteryCapacity || 0,
        remark: r.remark || '',
      }))

      if (exportVehicles.length === 0 && exportRecords.length === 0) {
        wx.hideLoading()
        wx.showToast({ title: '暂无数据可导出', icon: 'none' })
        return
      }

      const data = { vehicles: exportVehicles, records: exportRecords }
      const json = JSON.stringify(data, null, 2)

      const fs = wx.getFileSystemManager()
      const tempPath = wx.env.USER_DATA_PATH + '/charging_export_' + Date.now() + '.json'
      fs.writeFileSync(tempPath, json, 'utf-8')

      wx.hideLoading()

      const total = exportVehicles.length + exportRecords.length
      this._exportFilePath = tempPath
      this._exportFileName = '充电数据_' + new Date().toISOString().slice(0, 10) + '.json'

      wx.showModal({
        title: '导出数据',
        content: '共 ' + total + ' 条数据，确认发送到聊天？',
        confirmText: '发送',
        success: (res) => {
          if (res.confirm) {
            this.doShareFile()
          } else {
            this.cleanupExport()
          }
        },
      })
    } catch (err) {
      wx.hideLoading()
      console.error('export error', err)
      wx.showToast({ title: '导出失败', icon: 'none' })
    }
  },

  doShareFile() {
    const tempPath = this._exportFilePath
    const fileName = this._exportFileName
    if (!tempPath) return

    wx.shareFileMessage({
      filePath: tempPath,
      fileName: fileName,
      success: () => {
        wx.showToast({ title: '已发送到聊天', icon: 'success' })
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          console.error('shareFileMessage error', err)
          wx.showToast({ title: '导出失败', icon: 'none' })
        }
      },
      complete: () => {
        this.cleanupExport()
      },
    })
  },

  cleanupExport() {
    if (this._exportFilePath) {
      try { wx.getFileSystemManager().unlinkSync(this._exportFilePath) } catch (e) { }
      this._exportFilePath = null
      this._exportFileName = null
    }
  },

  onImportData() {
    if (!auth.isLoggedIn()) {
      this.setData({ showAuthPopup: true })
      return
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const filePath = res.tempFiles[0].path
        this.doImport(filePath)
      },
      fail: () => { },
    })
  },

  async doImport(filePath) {
    wx.showLoading({ title: '导入中...', mask: true })
    try {
      const fs = wx.getFileSystemManager()
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)

      const vehicles = data.vehicles || []
      const records = data.records || []
      if (vehicles.length === 0 && records.length === 0) {
        wx.hideLoading()
        wx.showToast({ title: '文件中无有效数据', icon: 'none' })
        return
      }

      wx.showLoading({ title: '导入车辆 0/' + vehicles.length, mask: true })
      const vehicleIdMap = {}
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i]
        wx.showLoading({ title: '导入车辆 ' + (i + 1) + '/' + vehicles.length, mask: true })
        try {
          const res = await callCloud('vehicle', {
            action: 'create',
            data: {
              brand: v.brand || '',
              model: v.model || '',
              trim: v.trim || '',
              batteryCapacity: v.batteryCapacity || 0,
              plateNumber: v.plateNumber || '',
              isDefault: v.isDefault || false,
            },
          })
          if (v._id) vehicleIdMap[v._id] = res.vehicleId
        } catch (e) {
          console.error('导入车辆失败', v, e)
        }
      }

      const validRecords = records.filter(r => r.chargeKwh > 0 && r.cost > 0)
      wx.showLoading({ title: '导入记录 0/' + validRecords.length, mask: true })
      for (let i = 0; i < validRecords.length; i++) {
        const r = validRecords[i]
        wx.showLoading({ title: '导入记录 ' + (i + 1) + '/' + validRecords.length, mask: true })
        try {
          await callCloud('record', {
            action: 'create',
            data: {
              vehicleId: (r.vehicleId && vehicleIdMap[r.vehicleId]) || r.vehicleId || '',
              stationName: r.stationName || '',
              chargeType: r.chargeType || 'fast',
              startTime: r.startTime || '',
              endTime: r.endTime || '',
              startSOC: r.startSOC || 0,
              endSOC: r.endSOC || 0,
              chargeKwh: r.chargeKwh || 0,
              cost: r.cost || 0,
              mileage: r.mileage || 0,
              batteryCapacity: r.batteryCapacity || 0,
              remark: r.remark || '',
            },
          })
        } catch (e) {
          console.error('导入记录失败', r, e)
        }
      }

      wx.hideLoading()
      wx.showModal({
        title: '导入完成',
        content: '成功导入 ' + vehicles.length + ' 辆车辆、' + validRecords.length + ' 条充电记录',
        showCancel: false,
        success: () => this.loadData(),
      })
    } catch (err) {
      wx.hideLoading()
      console.error('import error', err)
      wx.showToast({ title: '导入失败，请检查文件格式', icon: 'none' })
    }
  },

  onDeleteVehicle(e) {
    const { id, index } = e.currentTarget.dataset
    const tapCountMap = this.data._tapCountMap || {}
    const key = id
    const now = Date.now()
    const lastTap = tapCountMap[key] || { count: 0, time: 0 }

    if (now - lastTap.time < 2000) {
      lastTap.count += 1
    } else {
      lastTap.count = 1
    }
    lastTap.time = now
    tapCountMap[key] = lastTap
    this.setData({ _tapCountMap: tapCountMap })

    if (lastTap.count >= 3) {
      tapCountMap[key] = { count: 0, time: 0 }
      this.setData({ _tapCountMap: tapCountMap })
      wx.showModal({
        title: '车辆ID',
        content: id,
        confirmText: '复制',
        success: (res) => {
          if (res.confirm) {
            wx.setClipboardData({ data: id, success: () => wx.showToast({ title: '已复制', icon: 'success' }) })
          }
        },
      })
      return
    }

    const vehicle = this.data.vehicles[index]
    wx.showModal({
      title: '删除车辆',
      content: '确定删除 ' + (vehicle.brand || '') + ' ' + (vehicle.model || '') + ' 吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await callCloud('vehicle', { action: 'delete', data: { vehicleId: id } })
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadData()
          } catch (err) {
            console.error('delete vehicle error', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      },
    })
  },

  onNotificationToggle(e) {
    const val = e.detail.value
    this.setData({ 'settings.notification': val })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          auth.logout()
          this.setData({
            isLoggedIn: false,
            nickName: '',
            userInfo: null,
            vehicles: [],
            totalKwh: '-',
            totalCost: '-',
            totalDays: '-',
          })
        }
      },
    })
  },
})
