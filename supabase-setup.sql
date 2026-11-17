-- Supabase SQL Editor에서 실행하세요
-- 기존 테이블이 있으면 먼저 DROP 후 재실행

CREATE TABLE IF NOT EXISTS sync_data (
  code        TEXT        PRIMARY KEY,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_data_created_at_idx ON sync_data (created_at);

-- Row Level Security 활성화
ALTER TABLE sync_data ENABLE ROW LEVEL SECURITY;

-- anon 키로 프론트엔드에서 직접 접근 허용
DROP POLICY IF EXISTS "allow_select" ON sync_data;
DROP POLICY IF EXISTS "allow_insert" ON sync_data;
DROP POLICY IF EXISTS "allow_update" ON sync_data;
DROP POLICY IF EXISTS "allow_delete" ON sync_data;

CREATE POLICY "allow_select" ON sync_data FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON sync_data FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update" ON sync_data FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete" ON sync_data FOR DELETE USING (true);
