-- JTL Super App Schema - PostgreSQL 13+ compatible
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS jtl;

CREATE TABLE IF NOT EXISTS jtl.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(150),
    password VARCHAR(200) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'developer' CHECK (role IN ('admin','senior_test_engineer','manager','tester','project_manager','developer')),
    is_active BOOLEAN DEFAULT true,
    profile_locked BOOLEAN DEFAULT false,
    pending_approval BOOLEAN DEFAULT false,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jtl.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_by UUID REFERENCES jtl.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jtl.scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    project_id UUID REFERENCES jtl.projects(id) ON DELETE CASCADE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(name, project_id)
);

CREATE TABLE IF NOT EXISTS jtl.runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID REFERENCES jtl.scenarios(id) ON DELETE CASCADE,
    test_name VARCHAR(200),
    environment VARCHAR(100),
    note TEXT,
    status VARCHAR(20) DEFAULT 'ready' CHECK (status IN ('ready','in_progress','error')),
    start_time TIMESTAMP,
    duration INTEGER,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jtl.run_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID UNIQUE REFERENCES jtl.runs(id) ON DELETE CASCADE,
    total_requests INTEGER,
    error_count INTEGER,
    error_rate NUMERIC(10,4),
    avg_response_time NUMERIC(10,2),
    min_response_time NUMERIC(10,2),
    max_response_time NUMERIC(10,2),
    p90_response_time NUMERIC(10,2),
    p95_response_time NUMERIC(10,2),
    p99_response_time NUMERIC(10,2),
    throughput NUMERIC(10,4),
    overview JSONB,
    per_label JSONB
);

CREATE TABLE IF NOT EXISTS jtl.samples (
    id BIGSERIAL,
    run_id UUID REFERENCES jtl.runs(id) ON DELETE CASCADE,
    ts BIGINT,
    elapsed INTEGER,
    label TEXT,
    response_code TEXT,
    success BOOLEAN,
    bytes INTEGER,
    sent_bytes INTEGER,
    latency INTEGER,
    all_threads INTEGER,
    grp_threads INTEGER,
    hostname TEXT
);

CREATE INDEX IF NOT EXISTS idx_samples_run_id ON jtl.samples(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_scenario ON jtl.runs(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_project ON jtl.scenarios(project_id);

-- AI analysis results per run
CREATE TABLE IF NOT EXISTS jtl.run_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID UNIQUE REFERENCES jtl.runs(id) ON DELETE CASCADE,
    health_score INTEGER,
    health_grade VARCHAR(2),
    health_label VARCHAR(50),
    summary TEXT,
    findings JSONB,
    analyzed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_insights_run_id ON jtl.run_insights(run_id);

-- Pre-built chart data per run (JMeter-style dashboard)
CREATE TABLE IF NOT EXISTS jtl.run_charts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID UNIQUE REFERENCES jtl.runs(id) ON DELETE CASCADE,
    apdex JSONB,
    statistics JSONB,
    request_summary JSONB,
    response_times_over_time JSONB,
    percentiles_over_time JSONB,
    active_threads_over_time JSONB,
    bytes_over_time JSONB,
    latency_over_time JSONB,
    hits_per_second JSONB,
    codes_per_second JSONB,
    response_time_distribution JSONB,
    percentiles_per_label JSONB,
    top_errors JSONB,
    built_at TIMESTAMP DEFAULT NOW()
);

-- Project membership: maps users to projects they can access
-- Admin and Senior Test Engineer bypass this (see all projects).
CREATE TABLE IF NOT EXISTS jtl.project_members (
    project_id UUID REFERENCES jtl.projects(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES jtl.users(id)    ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by UUID REFERENCES jtl.users(id)   ON DELETE SET NULL,
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON jtl.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON jtl.project_members(project_id);
