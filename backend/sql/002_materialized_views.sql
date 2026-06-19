-- 客服日统计物化视图
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_daily_stats AS
SELECT
    ROW_NUMBER() OVER () AS id,
    t.agent_id,
    DATE(t.created_at) AS stat_date,
    COUNT(*)::integer AS ticket_count,
    COALESCE(
        ROUND(
            AVG(
                CASE
                WHEN t.first_response_at IS NOT NULL AND t.assigned_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (t.first_response_at - t.assigned_at))
                ELSE NULL
            END
        )::numeric,
        2
    )::float AS avg_response_time,
    COALESCE(
        ROUND(
            COUNT(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END)::numeric /
            NULLIF(COUNT(*), 0)::numeric * 100,
            2
        )::float,
        0.0
    ) AS resolution_rate,
    COALESCE(
        ROUND(
            COUNT(CASE WHEN t.sla_breached = 0 AND t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END)::numeric /
            NULLIF(COUNT(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END), 0)::numeric * 100,
            2
        )::float,
        0.0
    ) AS sla_compliance_rate,
    COUNT(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END)::integer AS resolved_count,
    COALESCE(
        ROUND(AVG(t.satisfaction_score)::numeric, 2)::float,
        0.0
    ) AS avg_satisfaction
FROM tickets t
WHERE t.agent_id IS NOT NULL
GROUP BY t.agent_id, DATE(t.created_at)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_agent_date ON mv_agent_daily_stats(agent_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_mv_agent_stat_date ON mv_agent_daily_stats(stat_date);


-- 团队日统计物化视图
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_team_daily_stats AS
SELECT
    ROW_NUMBER() OVER () AS id,
    DATE(t.created_at) AS stat_date,
    'all'::varchar(100) AS department,
    COUNT(*)::integer AS ticket_count,
    COALESCE(
        ROUND(
            AVG(
                CASE
                WHEN t.first_response_at IS NOT NULL AND t.assigned_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (t.first_response_at - t.assigned_at))
                ELSE NULL
            END
        )::numeric,
        2
    )::float AS avg_response_time,
    COALESCE(
        ROUND(
            COUNT(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END)::numeric /
            NULLIF(COUNT(*), 0)::numeric * 100,
            2
        )::float,
        0.0
    ) AS resolution_rate,
    COALESCE(
        ROUND(
            COUNT(CASE WHEN t.sla_breached = 0 AND t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END)::numeric /
            NULLIF(COUNT(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END), 0)::numeric * 100,
            2
        )::float,
        0.0
    ) AS sla_compliance_rate,
    COUNT(DISTINCT t.agent_id)::integer AS agent_count
FROM tickets t
WHERE t.agent_id IS NOT NULL
GROUP BY DATE(t.created_at)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_team_date ON mv_team_daily_stats(stat_date, department);
CREATE INDEX IF NOT EXISTS idx_mv_team_stat_date ON mv_team_daily_stats(stat_date);


-- 按部门的团队统计物化视图
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_team_dept_daily_stats AS
SELECT
    ROW_NUMBER() OVER () AS id,
    DATE(t.created_at) AS stat_date,
    a.department,
    COUNT(*)::integer AS ticket_count,
    COALESCE(
        ROUND(
            AVG(
                CASE
                WHEN t.first_response_at IS NOT NULL AND t.assigned_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (t.first_response_at - t.assigned_at))
                ELSE NULL
            END
        )::numeric,
        2
    )::float AS avg_response_time,
    COALESCE(
        ROUND(
            COUNT(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END)::numeric /
            NULLIF(COUNT(*), 0)::numeric * 100,
            2
        )::float,
        0.0
    ) AS resolution_rate,
    COALESCE(
        ROUND(
            COUNT(CASE WHEN t.sla_breached = 0 AND t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END)::numeric /
            NULLIF(COUNT(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE NULL END), 0)::numeric * 100,
            2
        )::float,
        0.0
    ) AS sla_compliance_rate,
    COUNT(DISTINCT t.agent_id)::integer AS agent_count
FROM tickets t
JOIN agents a ON t.agent_id = a.id
WHERE t.agent_id IS NOT NULL
GROUP BY a.department, DATE(t.created_at)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_team_dept_date ON mv_team_dept_daily_stats(department, stat_date);
