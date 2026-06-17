Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    step: 1,
    tempNickName: '',
    tempAvatarUrl: '',
    saving: false,
  },

  observers: {
    'show': function (val) {
      if (val) {
        this.setData({ step: 1, tempNickName: '', tempAvatarUrl: '', saving: false })
        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
          this.getTabBar().setData({ show: false })
        }
      }
    },
  },

  methods: {
    onNickNameInput(e) {
      this.setData({ tempNickName: e.detail.value })
    },

    onNickNameConfirm() {
      if (!this.data.tempNickName.trim()) {
        wx.showToast({ title: '请输入昵称', icon: 'none' })
        return
      }
      this.setData({ step: 2 })
    },

    onChooseAvatar(e) {
      const avatarUrl = e.detail.avatarUrl || ''
      this.setData({ tempAvatarUrl: avatarUrl })
      this.doSave()
    },

    onSkipAvatar() {
      this.doSave()
    },

    async uploadAvatar(tempPath) {
      if (!tempPath) return ''
      const res = await wx.cloud.uploadFile({
        cloudPath: 'avatars/' + Date.now() + '-' + Math.random().toString(36).substr(2, 8) + '.png',
        filePath: tempPath,
      })
      return res.fileID
    },

    async doSave() {
      if (this.data.saving) return
      const nickName = this.data.tempNickName.trim()
      const tempAvatarUrl = this.data.tempAvatarUrl

      this.setData({ saving: true })

      try {
        let avatarUrl = tempAvatarUrl
        if (tempAvatarUrl) {
          avatarUrl = await this.uploadAvatar(tempAvatarUrl)
        }

        const auth = require('../../utils/auth')
        await auth.saveUserInfo(nickName, avatarUrl)
        this.triggerEvent('success', { nickName, avatarUrl })
      } catch (err) {
        console.error('saveUserInfo error', err)
        wx.showToast({ title: '授权失败', icon: 'none' })
      } finally {
        this.setData({ saving: false })
      }
    },

    onClose() {
      this.triggerEvent('close')
    },

    onMaskClick() {
      this.triggerEvent('close')
    },

    onStopBubble() {
      // prevent click from propagating to mask
    },
  },
})
