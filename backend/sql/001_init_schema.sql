CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    department VARCHAR(100),
    avatar VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'normal',
    category VARCHAR(50),
    agent_id INTEGER REFERENCES agents(id),
    customer_name VARCHAR(100),
    customer_email VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP,
    first_response_at TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    satisfaction_score INTEGER,
    sla_breached INTEGER DEFAULT 0,
    sla_deadline TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_agent_id ON tickets(agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_agent_created ON tickets(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_status_created ON tickets(status, created_at);
