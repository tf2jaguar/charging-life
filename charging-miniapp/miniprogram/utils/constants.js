const CHARGE_TYPE = {
  super: { label: '超充', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  fast: { label: '快充', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  slow: { label: '慢充', color: '#0891B2', bg: 'rgba(8,145,178,0.1)' },
}

const PLATFORMS = {
  teld: { label: '特来电', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  starcharge: { label: '星星充电', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  xiaoju: { label: '小桔充电', color: '#F43F5E', bg: 'rgba(244,63,94,0.1)' },
  other: { label: '其他', color: '#64748B', bg: 'rgba(100,116,139,0.1)' },
}

const PLATFORM_LIST = Object.keys(PLATFORMS).map(function (key) {
  return { value: key, label: PLATFORMS[key].label, color: PLATFORMS[key].color, bg: PLATFORMS[key].bg }
})

const PROMO_TAGS = {
  '新人优惠': { color: '#D97706', bg: 'rgba(245,158,11,0.1)' },
  '日常活动': { color: '#0891B2', bg: 'rgba(8,145,178,0.1)' },
  '会员专享': { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  '周末特惠': { color: '#F43F5E', bg: 'rgba(244,63,94,0.1)' },
  '每日签到': { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
}

const TAG_LIST = Object.keys(PROMO_TAGS).map(function (key) {
  return { value: key, label: key, color: PROMO_TAGS[key].color, bg: PROMO_TAGS[key].bg }
})

const PROMO_STATUS = {
  pending: { label: '待审核', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  rejected: { label: '审核驳回', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  active: { label: '生效中', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  expired: { label: '已失效', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
}

const STATUS_LIST = Object.keys(PROMO_STATUS).map(function (key) {
  return { value: key, label: PROMO_STATUS[key].label, color: PROMO_STATUS[key].color, bg: PROMO_STATUS[key].bg }
})

module.exports = {
  CHARGE_TYPE: CHARGE_TYPE,
  PLATFORMS: PLATFORMS,
  PLATFORM_LIST: PLATFORM_LIST,
  PROMO_TAGS: PROMO_TAGS,
  TAG_LIST: TAG_LIST,
  PROMO_STATUS: PROMO_STATUS,
  STATUS_LIST: STATUS_LIST,
}