const { callCloud } = require('../../utils/cloud')
const auth = require('../../utils/auth')

Page({
  data: {
    catalogLoading: true,
    brandGroups: [],     // [{category, brands}]
    brandNames: [],      // 所有品牌名平铺（供 picker range）
    brandCategories: [], // 每个品牌对应的 category（picker 分组提示）
    models: [],
    modelNames: [],
    styles: [],
    styleNames: [],
    batteryOptions: [],
    selectedBrand: '',
    selectedModel: '',
    selectedStyle: '',
    selectedCapacity: 0,
    brandIndex: -1,
    modelIndex: -1,
    styleIndex: -1,
    batteryIndex: -1,
    plateNumber: '',
    isDefault: true,
    submitting: false,
    batteryHint: false,
    currentModelInfo: null, // {energy_type, vehicle_type, price_range}
  },

  async onLoad() {
    try {
      const brandOptions = await callCloud('vehicleCatalog', { action: 'brands' })
      const brandNames = []
      const brandCategories = []
      brandOptions.forEach(group => {
        group.brands.forEach(name => {
          brandNames.push(name)
          brandCategories.push(group.category)
        })
      })
      this.setData({
        brandGroups: brandOptions,
        brandNames,
        brandCategories,
        catalogLoading: false,
      })
    } catch (err) {
      console.error('load catalog error', err)
      this.setData({ catalogLoading: false })
      wx.showToast({ title: '加载车型数据失败', icon: 'none' })
    }
  },

  onBrandChange(e) {
    const idx = e.detail.value
    const brandName = this.data.brandNames[idx]
    this.setData({
      brandIndex: idx,
      selectedBrand: brandName,
      models: [],
      modelNames: [],
      modelIndex: -1,
      styles: [],
      styleNames: [],
      styleIndex: -1,
      batteryOptions: [],
      batteryIndex: -1,
      batteryHint: false,
      currentModelInfo: null,
    })
    this.loadModels(brandName)
  },

  async loadModels(brandName) {
    try {
      const models = await callCloud('vehicleCatalog', { action: 'models', brandName })
      const modelNames = models.map(m => {
        let tag = ''
        if (m.energy_type === 'BEV') tag = '纯电'
        else if (m.energy_type === 'REEV') tag = '增程'
        else if (m.energy_type === 'PHEV') tag = '插混'
        return m.model_name + (tag ? ' · ' + tag : '')
      })
      this.setData({ models, modelNames })
    } catch (err) {
      console.error('load models error', err)
      wx.showToast({ title: '加载车型失败', icon: 'none' })
    }
  },

  onModelChange(e) {
    const idx = e.detail.value
    const model = this.data.models[idx]
    this.setData({
      modelIndex: idx,
      selectedModel: model.model_name,
      styles: [],
      styleNames: [],
      styleIndex: -1,
      batteryOptions: [],
      batteryIndex: -1,
      batteryHint: false,
      currentModelInfo: {
        energy_type: model.energy_type,
        vehicle_type: model.vehicle_type,
        price_range: model.price_range,
      },
    })
    this.loadStyles(this.data.selectedBrand, model.model_name)
  },

  async loadStyles(brandName, modelName) {
    try {
      const styles = await callCloud('vehicleCatalog', { action: 'styles', brandName, modelName })
      const styleNames = styles.map(s => s.style_name)
      this.setData({ styles, styleNames })
    } catch (err) {
      console.error('load styles error', err)
      wx.showToast({ title: '加载款式失败', icon: 'none' })
    }
  },

  onStyleChange(e) {
    const idx = e.detail.value
    const style = this.data.styles[idx]
    const defaultCapacity = style.capacity

    const alternatives = [50, 60, 70, 75, 80, 85, 90, 100].filter(v => v !== defaultCapacity)
    const batteryOptions = [defaultCapacity + ' kWh', ...alternatives.map(v => v + ' kWh')]

    this.setData({
      styleIndex: idx,
      selectedStyle: style.style_name,
      selectedCapacity: defaultCapacity,
      batteryOptions,
      batteryIndex: 0,
      batteryHint: true,
    })
  },

  onBatteryChange(e) {
    this.setData({ batteryIndex: e.detail.value })
  },

  onPlateInput(e) {
    this.setData({ plateNumber: e.detail.value })
  },

  onDefaultToggle(e) {
    this.setData({ isDefault: e.detail.value })
  },

  async onSubmit() {
    const d = this.data
    if (d.brandIndex < 0 || d.modelIndex < 0 || d.styleIndex < 0) {
      wx.showToast({ title: '请选择完整的车辆信息', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const batteryStr = d.batteryOptions[d.batteryIndex]
      const batteryCapacity = parseFloat(batteryStr)

      await callCloud('vehicle', {
        action: 'create',
        data: {
          brand: d.selectedBrand,
          model: d.selectedModel,
          trim: d.selectedStyle,
          batteryCapacity,
          plateNumber: d.plateNumber,
          isDefault: d.isDefault,
        },
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1000)
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ submitting: false })
    }
  },
})