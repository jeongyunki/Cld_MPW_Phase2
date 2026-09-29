-- MPW Plus 2차 개발 PostgreSQL DDL
--
-- 이 파일은 docs/6-erd.md의 Mermaid ERD(4개 테이블: deliverables, imgagong_plans,
-- master_items, users)를 실제 실행 가능한 SQL로 옮긴 것이다. ERD가 내린 결정
-- (테이블 4개만, FK 범위, 유니크 제약, "느슨한 참조" 등)을 그대로 따르며
-- 이 파일에서 새로 결정하지 않는다.
--
-- 이 파일의 성격: 스키마를 검토/확정하기 위한 "참고용" DDL이다.
-- 실제 구현 단계에서는 이 SQL을 그대로 실행하지 않고, 이 내용을 바탕으로
-- Knex.js migration 파일(server/src/db/migrations/)을 작성해 적용한다
-- (docs/4-project-structure-principles.md 5.1절 참조 — 마이그레이션 도구
-- 최종 선택은 PRD 9절에서 여전히 미정이므로, Knex.js가 최종 확정이 아니어도
-- 이 파일 자체는 유효한 참고 자료로 남는다).

-- UUID 자동 생성을 위한 extension.
-- pgcrypto의 gen_random_uuid()를 사용한다 (PostgreSQL 13+ 코어 확장이라 별도 빌드
-- 없이 대부분 환경에서 바로 쓸 수 있고, uuid-ossp보다 최신 권장 방식이라 uuid-ossp
-- 대신 이것을 선택했다 — ERD/PRD가 둘 중 하나를 지정하지 않아 직접 판단함).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- users
-- PRD 3.5절 데이터 모델("이름, 이메일, 권한, 가입일") + PRD 5절
-- (인증 방식 — 자체 구현 1단계, password_hash 보유) 근거.
-- ============================================================
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255),
  email varchar(255),
  password_hash varchar(255),
  role varchar(50),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp,
  version integer NOT NULL DEFAULT 1
);

-- users.email만 UNIQUE (로그인 ID). 그 외 업무 컬럼은 NOT NULL을 걸지 않는다
-- (실행계획 단계에서 필수 필드 확정 후 ALTER TABLE ... SET NOT NULL로 추가 예정).
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);

-- ============================================================
-- deliverables
-- PRD FR-DL-01/02/03/04, 3.5절 데이터 모델
-- ("차수, 공정명, 파일경로, 등록일시, 등록자") 근거.
-- 같은 (mpw_round, process_name) 조합의 중복 등록을 허용해야 하므로
-- (FR-DL-02 수용기준) 이 두 컬럼에는 유니크 제약을 두지 않는다.
-- ============================================================
CREATE TABLE deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mpw_round varchar(255),
  process_name varchar(255),
  file_path varchar(1024),
  registered_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp,
  version integer NOT NULL DEFAULT 1
);

-- FR-DL-02 "차수 또는 공정명으로 검색" 조회를 지원하는 비-유니크 인덱스.
CREATE INDEX idx_deliverables_mpw_round_process_name ON deliverables (mpw_round, process_name);

-- ============================================================
-- imgagong_plans
-- PRD FR-IM-01~06, 3.5절 데이터 모델 근거.
-- version은 PRD 4.2절 낙관적 잠금 요구사항을 직접 반영한다.
-- owner는 "과제 담당자"이자 "등록자" 역할을 겸하며(ERD 결정), FK가 아니라
-- key-in 자유 텍스트 컬럼이다(ERD가 이미 이렇게 결정함).
-- ============================================================
CREATE TABLE imgagong_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp NOT NULL DEFAULT now(),
  status varchar(50),
  category varchar(255),
  assembler varchar(255),
  chip_size varchar(255),
  module varchar(255),
  project_name varchar(255),
  gcm_code varchar(255),
  pkg_type varchar(255),
  customer varchar(255),
  lot_count integer,
  pkg_qty integer,
  owner varchar(255),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamp,
  version integer NOT NULL DEFAULT 1
);

-- FR-IM-02 기간 필터(생성일시 기준 조회)를 지원하는 인덱스.
CREATE INDEX idx_imgagong_plans_created_at ON imgagong_plans (created_at);

-- ============================================================
-- master_items
-- PRD FR-MS-01/02/03, 3.5절("필드명, 항목명, 순서로 구성된 범용 테이블") 근거.
-- 필드별로 테이블을 쪼개지 않고 field_name 컬럼으로 구분한다.
-- ============================================================
CREATE TABLE master_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name varchar(50),
  item_name varchar(255),
  sort_order integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp,
  version integer NOT NULL DEFAULT 1
);

-- master_items.field_name 조회(dropdown 옵션을 필드별로 가져오는 조회)를 지원하는 인덱스.
CREATE INDEX idx_master_items_field_name ON master_items (field_name);

-- ============================================================
-- (선택사항) updated_at 자동 갱신 트리거
-- 실무에서 흔히 쓰는 관례라 참고용으로 포함했지만, 강제 사항은 아니다.
-- 없어도 애플리케이션(서비스) 코드에서 UPDATE 시 updated_at을 직접 채우면 동일하게
-- 동작하며, 오버엔지니어링 금지 원칙에 따라 실제 채택 여부는 구현 단계에서 결정한다.
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_deliverables_set_updated_at
BEFORE UPDATE ON deliverables
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_imgagong_plans_set_updated_at
BEFORE UPDATE ON imgagong_plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_master_items_set_updated_at
BEFORE UPDATE ON master_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
