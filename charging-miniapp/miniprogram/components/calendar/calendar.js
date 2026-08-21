Component({
  properties: {
    year: { type: Number, value: 0 },
    month: { type: Number, value: 0 },
    chargedDays: { type: Array, value: [] },
    kwhMap: { type: Object, value: {} },
    totalCount: { type: Number, value: 0 },
    totalKwh: { type: Number, value: 0 },
  },

  data: {
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    grid: [],
    displayYear: 0,
    displayMonth: 0,
    today: '',
    todayMonth: 0,
    todayYear: 0,
  },

  lifetimes: {
    attached() {
      const now = new Date()
      this.setData({
        todayMonth: now.getMonth() + 1,
        todayYear: now.getFullYear(),
        today: now.getDate(),
      })
      if (!this.data.year) {
        this.setData({ displayYear: now.getFullYear(), displayMonth: now.getMonth() + 1 })
      } else {
        this.setData({ displayYear: this.data.year, displayMonth: this.data.month })
      }
      this.renderGrid()
    },
  },

  observers: {
    'chargedDays, kwhMap': function () {
      this.renderGrid()
    },
    'year, month': function (y, m) {
      if (y && m) {
        this.setData({ displayYear: y, displayMonth: m })
        this.renderGrid()
      }
    },
  },

  methods: {
    renderGrid() {
      const y = this.data.displayYear
      const m = this.data.displayMonth
      if (!y || !m) return

      const firstDay = new Date(y, m - 1, 1)
      const daysInMonth = new Date(y, m, 0).getDate()
      let startWeekday = firstDay.getDay()
      startWeekday = startWeekday === 0 ? 6 : startWeekday - 1

      const grid = []
      for (let i = 0; i < startWeekday; i++) {
        grid.push({ day: 0, empty: true })
      }

      const isCurrentMonth = (this.data.todayYear === y && this.data.todayMonth === m)

      for (let day = 1; day <= daysInMonth; day++) {
        const isCharged = this.data.chargedDays.includes(day)
        const isToday = isCurrentMonth && day === this.data.today
        const kwh = this.data.kwhMap[day] || 0
        grid.push({ day, empty: false, isCharged, isToday, kwh })
      }

      this.setData({ grid })
    },

    onPrevMonth() {
      let m = this.data.displayMonth - 1
      let y = this.data.displayYear
      if (m < 1) { m = 12; y-- }
      this.setData({ displayMonth: m, displayYear: y })
      this.renderGrid()
      this.triggerEvent('monthChange', { year: y, month: m })
    },

    onNextMonth() {
      let m = this.data.displayMonth + 1
      let y = this.data.displayYear
      if (m > 12) { m = 1; y++ }
      this.setData({ displayMonth: m, displayYear: y })
      this.renderGrid()
      this.triggerEvent('monthChange', { year: y, month: m })
    },

    onViewMore() {
      wx.switchTab({ url: '/pages/analytics/analytics' })
    },
  },
})
