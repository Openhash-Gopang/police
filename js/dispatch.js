/**
 * K-Police Dispatch Engine
 * 사건 분석 → 자원 배치 → 출동 지시 생성
 * 자율주행 차량: WebSocket 시뮬레이션
 */

const DispatchEngine = (() => {

  let _agents   = [];
  let _vehicles = [];
  let _equipment= [];
  let _activeOrders = []; // 현재 진행 중인 출동 명령
  let _wsConnections = {}; // 시뮬레이션 WebSocket 맵

  // ── 자원 데이터 로드 ──────────────────────────────────
  async function loadResources() {
    try {
      const [av, veh] = await Promise.all([
        fetch('/data/dummy-agents.json').then(r => r.json()),
        fetch('/data/dummy-vehicles.json').then(r => r.json()),
      ]);
      _agents    = av;
      _vehicles  = veh.vehicles;
      _equipment = veh.equipment;
    } catch(e) {
      console.warn('[Dispatch] 자원 로드 실패, 더미 사용:', e.message);
      _agents   = FALLBACK_AGENTS;
      _vehicles = FALLBACK_VEHICLES;
    }
  }

  // ── 거리 계산 (Haversine, km) ─────────────────────────
  function distance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180)
            * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ETA 계산 (분) — 평균 시속 40km 가정
  function calcETA(dist) {
    return Math.ceil((dist / 40) * 60);
  }

  // ── 최적 요원 선택 ────────────────────────────────────
  function selectAgents(incident) {
    const available = _agents.filter(a => a.status === '대기');

    // 전문 분야 매칭 점수
    function score(agent) {
      let s = 0;
      const specialtyMatch = incident.requiredSpecialties?.some(sp =>
        agent.specialty.some(as => as.includes(sp) || sp.includes(as))
      );
      if (specialtyMatch) s += 50;
      const dist = distance(incident.lat, incident.lng, agent.lat, agent.lng);
      s += Math.max(0, 30 - dist * 10); // 거리 역점수
      return { agent, score: s, dist };
    }

    return available
      .map(score)
      .sort((a, b) => b.score - a.score)
      .slice(0, incident.severity === 'CRITICAL' ? 3 : 2);
  }

  // ── 최적 차량 선택 ────────────────────────────────────
  function selectVehicles(incident) {
    const available = _vehicles.filter(v => v.status === '대기');
    return available
      .map(v => ({ v, dist: distance(incident.lat, incident.lng, v.lat, v.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, incident.requiredVehicles || 1)
      .map(x => x.v);
  }

  // ── WebSocket 시뮬레이션 (자율주행 차량 명령) ──────────
  function sendAutonomousCommand(vehicle, destination, mission) {
    if (!KPOLICE_CONFIG.wsSimulate) {
      // 실제 환경: WebSocket 연결
      const ws = new WebSocket(vehicle.wsEndpoint);
      _wsConnections[vehicle.id] = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({
          cmd:         'NAVIGATE',
          vehicleId:   vehicle.id,
          destination: destination,
          mission:     mission,
          priority:    'HIGH',
          timestamp:   new Date().toISOString(),
        }));
      };
      return;
    }

    // 시뮬레이션 모드: 이벤트 발행
    console.log(`[AV SIM] ${vehicle.id} → ${destination.address} | ${mission}`);
    window.dispatchEvent(new CustomEvent('kpolice_av_command', {
      detail: {
        vehicleId:   vehicle.id,
        vehicleType: vehicle.type,
        destination,
        mission,
        timestamp:   new Date().toISOString(),
        simulated:   true,
      }
    }));
  }

  // ── 출동 명령 생성 (AI 없이 규칙 기반) ───────────────
  function generateDispatchOrders(incident, selectedAgents, selectedVehicles) {
    const orders = [];

    selectedAgents.forEach((item, idx) => {
      const { agent, dist } = item;
      const eta = calcETA(dist);
      orders.push({
        orderId:   `ORD-${incident.id}-${String(idx+1).padStart(3,'0')}`,
        agentId:   agent.id,
        agentName: agent.name,
        rank:      agent.rank,
        role:      idx === 0 ? '현장 지휘' : agent.specialty[0],
        action:    buildAction(incident, agent, idx),
        eta,
        vehicle:   selectedVehicles[idx]?.id || null,
        priority:  idx + 1,
        status:    'ISSUED', // ISSUED → EN_ROUTE → ARRIVED → COMPLETED
      });
    });

    return orders;
  }

  function buildAction(incident, agent, idx) {
    const base = `[${incident.address}] 즉시 출동. `;
    if (idx === 0) return base + `현장 지휘 및 초동 조치. 피의자 확인 후 상황실 보고.`;
    if (agent.specialty.includes('과학수사')) return base + `현장 보존 및 증거 수집 착수.`;
    if (agent.specialty.includes('협상'))     return base + `피해자 격리 및 상황 안정화.`;
    return base + `${agent.specialty[0]} 업무 수행. 현장 지휘관 지시 따를 것.`;
  }

  // ── 메인: 출동 지시 실행 ─────────────────────────────
  async function dispatch(incident) {
    const selectedAgents   = selectAgents(incident);
    const selectedVehicles = selectVehicles(incident);

    const orders = generateDispatchOrders(incident, selectedAgents, selectedVehicles);

    // 차량 명령
    const vehicleOrders = selectedVehicles.map(v => {
      const order = {
        vehicleId:   v.id,
        type:        v.type,
        autonomous:  v.autonomous,
        destination: { lat: incident.lat, lng: incident.lng, address: incident.address },
        mission:     incident.type + ' 출동',
        status:      'DISPATCHED',
      };

      if (v.autonomous) {
        sendAutonomousCommand(v, order.destination, order.mission);
      }

      return order;
    });

    // 요원 상태 업데이트 (시뮬레이션)
    selectedAgents.forEach(({ agent }) => {
      const a = _agents.find(x => x.id === agent.id);
      if (a) a.status = '출동중';
    });
    selectedVehicles.forEach(v => {
      const found = _vehicles.find(x => x.id === v.id);
      if (found) found.status = '출동중';
    });

    const result = {
      incidentId:    incident.id,
      decisionTime:  new Date().toISOString(),
      riskLevel:     incident.severity,
      autoDispatch:  incident.severity === 'CRITICAL',
      summary:       `${incident.type} — ${incident.address} — 요원 ${orders.length}명, 차량 ${vehicleOrders.length}대 출동`,
      dispatchOrders: orders,
      vehicleOrders,
      agents:  _agents,
      vehicles: _vehicles,
    };

    _activeOrders.push(result);

    // BroadcastChannel → 상황실 전송
    try {
      const bc = new BroadcastChannel(KPOLICE_CONFIG.opsChannel);
      bc.postMessage({ type: 'DISPATCH_ORDER', payload: result });
      bc.close();
    } catch(e) { console.warn('[BC]', e.message); }

    return result;
  }

  // ── 요원 상태 조회 ────────────────────────────────────
  function getAgents()   { return _agents; }
  function getVehicles() { return _vehicles; }
  function getActiveOrders() { return _activeOrders; }

  // ── 더미 폴백 데이터 ──────────────────────────────────
  const FALLBACK_AGENTS = [
    { id:'AGT-001', name:'김민준', rank:'경감', specialty:['강도','무장범죄'], status:'대기', lat:33.4996, lng:126.5312 },
    { id:'AGT-002', name:'이서연', rank:'경사', specialty:['사이버범죄'],      status:'대기', lat:33.5005, lng:126.5270 },
  ];
  const FALLBACK_VEHICLES = [
    { id:'VEH-001', type:'순찰차',          autonomous:false, status:'대기', lat:33.4996, lng:126.5312 },
    { id:'VEH-003', type:'자율주행_이송차', autonomous:true,  status:'대기', lat:33.5010, lng:126.5290 },
  ];

  return { loadResources, dispatch, getAgents, getVehicles, getActiveOrders, distance, calcETA };
})();
