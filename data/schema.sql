-- ============================================================
-- K-Police v2 Supabase Schema
-- ============================================================

-- 경찰 상담 세션 로그
CREATE TABLE IF NOT EXISTS police_log (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  who             TEXT NOT NULL,
  when_ts         TIMESTAMPTZ NOT NULL,
  where_svc       TEXT DEFAULT 'police.hondi.net',
  what            JSONB NOT NULL,
  how             JSONB,
  why             JSONB,
  risk_level      TEXT CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  user_type       TEXT CHECK (user_type IN ('person','org','device')),
  session_minutes INT,
  message_count   INT
);

-- 사건 접수 테이블
CREATE TABLE IF NOT EXISTS police_incidents (
  id              TEXT PRIMARY KEY,             -- KP-YYYYMMDD-NNNN
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  reporter_ipv6   TEXT,
  crime_type      TEXT NOT NULL,
  crime_article   TEXT,
  severity        TEXT CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status          TEXT DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','DISPATCHED','ARRESTED','CLOSED','REFERRED')),
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  address         TEXT,
  description     TEXT,
  chat_summary    TEXT,
  dispatch_result JSONB,
  lawsuit_package JSONB,
  referred_to     TEXT DEFAULT '검찰청'
);

-- 출동 명령 테이블
CREATE TABLE IF NOT EXISTS police_dispatch_orders (
  id              TEXT PRIMARY KEY,             -- ORD-KP-...-001
  incident_id     TEXT REFERENCES police_incidents(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  agent_id        TEXT,
  agent_name      TEXT,
  role            TEXT,
  action          TEXT,
  eta_minutes     INT,
  vehicle_id      TEXT,
  status          TEXT DEFAULT 'ISSUED'
                  CHECK (status IN ('ISSUED','EN_ROUTE','ARRIVED','COMPLETED','CANCELLED')),
  autonomous_cmd  JSONB   -- 자율주행 차량 명령 내용
);

-- 소송 패키지 테이블
CREATE TABLE IF NOT EXISTS police_lawsuit_packages (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  case_number     TEXT UNIQUE NOT NULL,
  incident_id     TEXT REFERENCES police_incidents(id),
  crime_primary   TEXT,
  articles        TEXT[],
  plaintiff       TEXT DEFAULT '대한민국 검찰청',
  defendant       TEXT,
  prosecution_score INT,
  recommendation  TEXT,
  arrest_warrant  BOOLEAN DEFAULT FALSE,
  status          TEXT DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','SUBMITTED','ACCEPTED','REJECTED')),
  full_package    JSONB
);

-- 인덱스
CREATE INDEX idx_incidents_severity   ON police_incidents (severity);
CREATE INDEX idx_incidents_status     ON police_incidents (status);
CREATE INDEX idx_incidents_created    ON police_incidents (created_at DESC);
CREATE INDEX idx_dispatch_incident    ON police_dispatch_orders (incident_id);
CREATE INDEX idx_lawsuit_case         ON police_lawsuit_packages (case_number);

-- RLS
ALTER TABLE police_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE police_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE police_dispatch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE police_lawsuit_packages ENABLE ROW LEVEL SECURITY;
