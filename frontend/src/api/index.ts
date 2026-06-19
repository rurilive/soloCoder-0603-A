import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

export interface PersonalStats {
  agent_id: number
  agent_name: string
  period: string
  ticket_count: number
  avg_response_time: number
  resolution_rate: number
  sla_compliance_rate: number
  avg_satisfaction: number | null
  resolved_count: number
}

export interface TrendPoint {
  date: string
  ticket_count: number
  avg_response_time: number
  resolution_rate: number
  sla_compliance_rate: number
}

export interface PersonalTrendResponse {
  agent_id: number
  period: string
  data: TrendPoint[]
}

export interface TeamOverview {
  period: string
  department: string
  total_tickets: number
  avg_response_time: number
  resolution_rate: number
  sla_compliance_rate: number
  agent_count: number
}

export interface TeamTrendResponse {
  period: string
  department: string
  data: TrendPoint[]
}

export interface AgentRankingItem {
  agent_id: number
  agent_name: string
  avatar: string | null
  ticket_count: number
  avg_response_time: number
  resolution_rate: number
  sla_compliance_rate: number
  rank: number
}

export interface TeamRankingResponse {
  period: string
  department: string
  ranking: AgentRankingItem[]
}

export interface AgentInfo {
  id: number
  name: string
  email: string
  department: string | null
  avatar: string | null
}

export const dashboardApi = {
  getPersonalStats: (agentId: number, period: string = 'month') =>
    api.get<PersonalStats>(`/dashboard/personal/${agentId}`, { params: { period } }),

  getPersonalTrend: (agentId: number, period: string = 'month') =>
    api.get<PersonalTrendResponse>(`/dashboard/personal/${agentId}/trend`, { params: { period } }),

  getTeamOverview: (period: string = 'month', department: string = 'all') =>
    api.get<TeamOverview>('/dashboard/team/overview', { params: { period, department } }),

  getTeamTrend: (period: string = 'month', department: string = 'all') =>
    api.get<TeamTrendResponse>('/dashboard/team/trend', { params: { period, department } }),

  getTeamRanking: (period: string = 'month', department: string = 'all', limit: number = 20) =>
    api.get<TeamRankingResponse>('/dashboard/team/ranking', { params: { period, department, limit } }),

  refreshViews: () =>
    api.post('/dashboard/refresh'),
}

export const agentsApi = {
  listAgents: (department?: string) =>
    api.get<AgentInfo[]>('/agents', { params: { department } }),

  listDepartments: () =>
    api.get<{ departments: string[] }>('/agents/departments'),

  getAgent: (agentId: number) =>
    api.get<AgentInfo>(`/agents/${agentId}`),
}

export default api
