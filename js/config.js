const KPOLICE_CONFIG = {
  svc:         'police',
  name:        'K-Police',
  version:     '2.0',
  gopangUrl:   'https://gopang.net',
  proxyUrl:    'https://gopang-proxy.tensor-city.workers.dev',
  model:       'deepseek-chat',
  maxTokens:   1200,
  temperature: 0.4,

  // 시뮬레이션: WebSocket 시뮬레이터 (실제 AV 없이 동작)
  wsSimulate:  true,

  // 위치 업데이트 간격 (ms)
  locationInterval: 30000,

  // 상황실 BroadcastChannel
  opsChannel: 'kpolice_ops',
};
