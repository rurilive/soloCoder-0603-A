import { useEffect, useState } from 'react';
import { proxyApi } from '../services/api';
import type {
  Proxy,
  ProxyCreate,
  ProxyUpdate,
  ProxyStats,
  ProxySettings,
  ProxyCheckLog,
} from '../types';

const PROTOCOL_OPTIONS = ['http', 'https', 'socks5'];
const STATUS_OPTIONS = [
  { value: 'active', label: '可用', color: '#52c41a' },
  { value: 'inactive', label: '待检测', color: '#8c8c8c' },
  { value: 'checking', label: '检测中', color: '#faad14' },
  { value: 'failed', label: '不可用', color: '#ff4d4f' },
];

const STRATEGY_OPTIONS = [
  { value: 'random', label: '随机选择' },
  { value: 'round_robin', label: '轮询' },
  { value: 'by_response_time', label: '按响应时间优先' },
];

function getStatusMeta(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[1];
}

function getSuccessRate(proxy: Proxy) {
  const total = (proxy.success_count || 0) + (proxy.fail_count || 0);
  if (total === 0) return 0;
  return Math.round(((proxy.success_count || 0) / total) * 100);
}

function formatDateTime(str?: string) {
  if (!str) return '-';
  try {
    const d = new Date(str);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return str;
  }
}

export default function ProxyPool() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ProxyStats>({
    total: 0, active: 0, inactive: 0, checking: 0, failed: 0,
    by_protocol: {}, avg_success_rate: 0, avg_response_time: 0,
  });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [protocolFilter, setProtocolFilter] = useState<string>('');
  const [keyword, setKeyword] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null);
  const [detailProxy, setDetailProxy] = useState<Proxy | null>(null);
  const [checkLogs, setCheckLogs] = useState<ProxyCheckLog[]>([]);

  const [form, setForm] = useState<ProxyCreate>({
    ip: '', port: 8080, protocol: 'http', status: 'inactive', tags: [], remark: '',
  });
  const [formTagInput, setFormTagInput] = useState('');
  const [importText, setImportText] = useState('');
  const [settings, setSettings] = useState<ProxySettings>({
    proxy_check_enabled: true,
    proxy_check_interval: 30,
    proxy_check_url: 'https://httpbin.org/ip',
    proxy_check_timeout: 10,
    default_proxy_rotation_strategy: 'random',
    default_rate_limit_per_minute: 60,
    default_delay_min: 0.5,
    default_delay_max: 2.0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkingIds, setCheckingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadStats();
    loadProxies();
    loadSettings();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadProxies(), 300);
    return () => clearTimeout(t);
  }, [statusFilter, protocolFilter, keyword]);

  const loadStats = async () => {
    try {
      const res = await proxyApi.getStats();
      setStats(res.data);
    } catch (e) { console.error(e); }
  };

  const loadProxies = async () => {
    setLoading(true);
    try {
      const res = await proxyApi.list(0, 200, {
        status: statusFilter || undefined,
        protocol: protocolFilter || undefined,
        keyword: keyword || undefined,
      });
      setProxies(res.data.items);
      setTotal(res.data.total);
    } catch (e) {
      console.error('Failed to load proxies:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await proxyApi.getSettings();
      setSettings(res.data);
    } catch (e) { console.error(e); }
  };

  const toggleSelected = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === proxies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(proxies.map((p) => p.id)));
    }
  };

  const handleOpenCreate = () => {
    setEditingProxy(null);
    setForm({
      ip: '', port: 8080, protocol: 'http', username: undefined, password: undefined,
      status: 'inactive', tags: [], remark: '',
    });
    setFormTagInput('');
    setShowCreateModal(true);
  };

  const handleOpenEdit = (p: Proxy) => {
    setEditingProxy(p);
    setForm({
      ip: p.ip, port: p.port, protocol: p.protocol,
      username: p.username, password: p.password,
      status: p.status, tags: [...p.tags], remark: p.remark,
    });
    setFormTagInput('');
    setShowCreateModal(true);
  };

  const handleAddFormTag = () => {
    const t = formTagInput.trim();
    if (!t) return;
    if (!form.tags?.includes(t)) {
      setForm({ ...form, tags: [...(form.tags || []), t] });
    }
    setFormTagInput('');
  };

  const handleRemoveFormTag = (idx: number) => {
    setForm({ ...form, tags: form.tags?.filter((_, i) => i !== idx) || [] });
  };

  const handleSubmitForm = async () => {
    if (!form.ip.trim()) { alert('请输入 IP 地址'); return; }
    if (!form.port || form.port <= 0 || form.port > 65535) { alert('端口范围 1-65535'); return; }
    setSubmitting(true);
    try {
      if (editingProxy) {
        await proxyApi.update(editingProxy.id, form as ProxyUpdate);
      } else {
        await proxyApi.create(form);
      }
      setShowCreateModal(false);
      loadProxies();
      loadStats();
    } catch (e: any) {
      alert(`保存失败: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (p: Proxy) => {
    if (!confirm(`确认删除代理 ${p.ip}:${p.port} ?`)) return;
    try {
      await proxyApi.delete(p.id);
      loadProxies();
      loadStats();
    } catch (e: any) {
      alert(`删除失败: ${e.response?.data?.detail || e.message}`);
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) { alert('请先选择要删除的代理'); return; }
    if (!confirm(`确认删除选中的 ${selected.size} 个代理?`)) return;
    try {
      await proxyApi.batchDelete(Array.from(selected));
      setSelected(new Set());
      loadProxies();
      loadStats();
    } catch (e: any) {
      alert(`批量删除失败: ${e.response?.data?.detail || e.message}`);
    }
  };

  const handleCheckOne = async (p: Proxy) => {
    setCheckingIds((s) => new Set([...s, p.id]));
    try {
      await proxyApi.check(p.id);
      loadProxies();
      loadStats();
    } catch (e: any) {
      alert(`检测失败: ${e.response?.data?.detail || e.message}`);
    } finally {
      setCheckingIds((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  };

  const handleBatchCheck = async () => {
    const ids = selected.size > 0 ? Array.from(selected) : undefined;
    try {
      if (ids) ids.forEach((id) => setCheckingIds((s) => new Set([...s, id])));
      else proxies.forEach((p) => setCheckingIds((s) => new Set([...s, p.id])));
      const res = await proxyApi.batchCheck(ids ? { ids } : undefined);
      alert(`批量检测完成: 共 ${res.data.total} 个，成功 ${res.data.success}，失败 ${res.data.failed}`);
      loadProxies();
      loadStats();
    } catch (e: any) {
      alert(`批量检测失败: ${e.response?.data?.detail || e.message}`);
    } finally {
      setCheckingIds(new Set());
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) { alert('请输入代理文本'); return; }
    setSubmitting(true);
    try {
      const res = await proxyApi.batchImport(importText);
      alert(`导入完成：成功 ${res.data.imported} 个，跳过 ${res.data.skipped.length} 个`);
      setShowImportModal(false);
      setImportText('');
      loadProxies();
      loadStats();
    } catch (e: any) {
      alert(`导入失败: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSettings = async () => {
    setSubmitting(true);
    try {
      await proxyApi.updateSettings(settings);
      setShowSettingsModal(false);
      alert('设置保存成功');
    } catch (e: any) {
      alert(`保存设置失败: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetail = async (p: Proxy) => {
    setDetailProxy(p);
    setShowDetailDrawer(true);
    setCheckLogs([]);
    try {
      const res = await proxyApi.getCheckLogs(p.id, 0, 50);
      setCheckLogs(res.data.items);
    } catch (e) { console.error(e); }
  };

  const statusBadgeClass = (s: string) => {
    const m: Record<string, string> = {
      active: 'status-badge status-success',
      failed: 'status-badge status-danger',
      checking: 'status-badge status-warning',
      inactive: 'status-badge status-default',
    };
    return m[s] || m.inactive;
  };

  const protocolBadgeClass = (p: string) => {
    const m: Record<string, string> = {
      http: 'status-badge status-info',
      https: 'status-badge status-success',
      socks5: 'status-badge status-warning',
    };
    return m[p] || 'status-badge status-default';
  };

  const useCount = (p: Proxy) => (p.success_count || 0) + (p.fail_count || 0);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">代理池管理</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            + 新增代理
          </button>
          <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
            批量导入
          </button>
          <button className="btn btn-secondary" onClick={handleBatchCheck}>
            批量检测
          </button>
          <button className="btn btn-secondary" onClick={() => setShowSettingsModal(true)}>
            全局设置
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="stats-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px',
        }}>
          {[
            { label: '总数量', value: total, color: '#1890ff', icon: '📊' },
            { label: '可用', value: stats.active, color: '#52c41a', icon: '✅' },
            { label: '不可用', value: stats.failed, color: '#ff4d4f', icon: '❌' },
            { label: '平均成功率', value: `${stats.avg_success_rate}%`, color: '#722ed1', icon: '🎯' },
          ].map((s, i) => (
            <div key={i} className="card" style={{
              padding: '20px', margin: 0, display: 'flex', alignItems: 'center', gap: '16px',
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '12px',
                background: s.color + '22', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '24px',
              }}>
                {s.icon}
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '4px' }}>{s.label}</div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: s.color }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text" className="form-input" placeholder="搜索 IP / 备注"
              value={keyword} onChange={(e) => setKeyword(e.target.value)}
              style={{ maxWidth: '220px' }}
            />
            <select
              className="form-select" value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ maxWidth: '160px' }}
            >
              <option value="">全部状态</option>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              className="form-select" value={protocolFilter}
              onChange={(e) => setProtocolFilter(e.target.value)}
              style={{ maxWidth: '140px' }}
            >
              <option value="">全部协议</option>
              {PROTOCOL_OPTIONS.map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            {selected.size > 0 && (
              <>
                <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>
                  删除选中 ({selected.size})
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>
                  取消选择
                </button>
              </>
            )}
          </div>

          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ padding: '10px', textAlign: 'left', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={proxies.length > 0 && selected.size === proxies.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>ID</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>地址</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>协议</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>状态</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>成功率</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>响应时间</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>使用次数</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>标签</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>上次检测</th>
                  <th style={{ padding: '10px', textAlign: 'left', minWidth: '160px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      加载中...
                    </td>
                  </tr>
                ) : proxies.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      暂无代理数据，点击右上角「新增代理」开始添加
                    </td>
                  </tr>
                ) : (
                  proxies.map((p) => {
                    const rate = getSuccessRate(p);
                    const meta = getStatusMeta(p.status);
                    const isChecking = checkingIds.has(p.id);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px' }}>
                          <input
                            type="checkbox" checked={selected.has(p.id)}
                            onChange={() => toggleSelected(p.id)}
                          />
                        </td>
                        <td style={{ padding: '10px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                          #{p.id}
                        </td>
                        <td style={{ padding: '10px', fontWeight: 500 }}>
                          <a
                            href="javascript:void(0)"
                            onClick={() => handleOpenDetail(p)}
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {p.ip}:{p.port}
                          </a>
                          {p.username && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '11px', marginLeft: '8px' }}>
                              🔒 有认证
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span className={protocolBadgeClass(p.protocol)}>
                            {p.protocol?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span
                            className={statusBadgeClass(p.status)}
                            style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}
                          >
                            {isChecking ? '检测中…' : meta.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              flex: 1, height: '6px', background: '#eee',
                              borderRadius: '3px', overflow: 'hidden', minWidth: '60px',
                            }}>
                              <div style={{
                                width: `${rate}%`, height: '100%',
                                background: rate >= 60 ? '#52c41a' : rate >= 30 ? '#faad14' : '#ff4d4f',
                              }} />
                            </div>
                            <span style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{rate}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px' }}>
                          {p.response_time ? `${p.response_time} ms` : '-'}
                        </td>
                        <td style={{ padding: '10px' }}>{useCount(p)}</td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {p.tags?.length ? p.tags.map((t, i) => (
                              <span key={i} style={{
                                padding: '2px 8px', background: 'var(--bg-secondary)',
                                borderRadius: '10px', fontSize: '11px',
                              }}>
                                {t}
                              </span>
                            )) : <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>-</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {formatDateTime(p.last_check_at)}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary btn-sm" disabled={isChecking}
                              onClick={() => handleCheckOne(p)}
                            >
                              {isChecking ? '检测中' : '检测'}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(p)}>
                              编辑
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <Modal title={editingProxy ? '编辑代理' : '新增代理'} onClose={() => setShowCreateModal(false)}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">IP 地址 *</label>
              <input
                type="text" className="form-input" placeholder="如 127.0.0.1"
                value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">端口 *</label>
              <input
                type="number" min="1" max="65535" className="form-input"
                value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">协议</label>
              <select
                className="form-select" value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value })}
              >
                {PROTOCOL_OPTIONS.map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">初始状态</label>
              <select
                className="form-select" value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">用户名（可选）</label>
              <input
                type="text" className="form-input"
                value={form.username || ''}
                onChange={(e) => setForm({ ...form, username: e.target.value || undefined })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">密码（可选）</label>
              <input
                type="text" className="form-input"
                value={form.password || ''}
                onChange={(e) => setForm({ ...form, password: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">标签</label>
            <div className="rule-item">
              <input
                type="text" className="form-input" placeholder="输入标签后回车添加"
                value={formTagInput}
                onChange={(e) => setFormTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFormTag())}
              />
              <button className="btn btn-secondary" onClick={handleAddFormTag}>添加</button>
            </div>
            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {form.tags?.length === 0 ? (
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>暂无标签</span>
              ) : form.tags?.map((t, i) => (
                <span key={i} style={{
                  padding: '4px 10px', background: 'var(--bg-secondary)',
                  borderRadius: '16px', fontSize: '12px', display: 'inline-flex', gap: '6px', alignItems: 'center',
                }}>
                  {t}
                  <span onClick={() => handleRemoveFormTag(i)} style={{ cursor: 'pointer' }}>×</span>
                </span>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">备注</label>
            <textarea
              className="form-textarea" rows={2} placeholder="可选备注信息"
              value={form.remark || ''}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSubmitForm} disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </Modal>
      )}

      {showImportModal && (
        <Modal title="批量导入代理" onClose={() => setShowImportModal(false)} size="lg">
          <div style={{ marginBottom: '12px' }}>
            <div className="form-hint" style={{
              padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', lineHeight: 1.8,
            }}>
              每行一个代理，支持以下格式：<br />
              • <code>ip:port</code>（默认 HTTP）<br />
              • <code>protocol://ip:port</code>，如 <code>socks5://127.0.0.1:1080</code><br />
              • <code>protocol://user:pass@ip:port</code>，如 <code>http://admin:123456@10.0.0.1:8080</code>
            </div>
          </div>
          <textarea
            className="form-textarea" rows={12}
            placeholder={'127.0.0.1:8080\nhttps://192.168.1.1:3128\nsocks5://user:pass@10.0.0.1:1080'}
            value={importText} onChange={(e) => setImportText(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleImport} disabled={submitting}>
              {submitting ? '导入中...' : '开始导入'}
            </button>
          </div>
        </Modal>
      )}

      {showSettingsModal && (
        <Modal title="全局设置" onClose={() => setShowSettingsModal(false)}>
          <div className="form-group">
            <label className="form-label">
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                启用定时检测
                <label className="switch">
                  <input
                    type="checkbox" checked={settings.proxy_check_enabled}
                    onChange={(e) => setSettings({ ...settings, proxy_check_enabled: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </span>
            </label>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">检测间隔（分钟）</label>
              <input
                type="number" min="1" className="form-input"
                value={settings.proxy_check_interval}
                onChange={(e) => setSettings({ ...settings, proxy_check_interval: parseInt(e.target.value) || 30 })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">检测超时（秒）</label>
              <input
                type="number" min="1" className="form-input"
                value={settings.proxy_check_timeout}
                onChange={(e) => setSettings({ ...settings, proxy_check_timeout: parseInt(e.target.value) || 10 })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">检测 URL</label>
            <input
              type="text" className="form-input"
              value={settings.proxy_check_url}
              onChange={(e) => setSettings({ ...settings, proxy_check_url: e.target.value })}
            />
            <div className="form-hint">代理会通过 GET 请求访问该 URL 判断可用性，建议使用可稳定访问的地址</div>
          </div>
          <div style={{
            padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', marginTop: '12px',
          }}>
            <div style={{ fontWeight: 500, marginBottom: '12px' }}>任务默认配置</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">默认切换策略</label>
                <select
                  className="form-select" value={settings.default_proxy_rotation_strategy}
                  onChange={(e) => setSettings({ ...settings, default_proxy_rotation_strategy: e.target.value })}
                >
                  {STRATEGY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">默认每分钟请求数</label>
                <input
                  type="number" min="1" className="form-input"
                  value={settings.default_rate_limit_per_minute}
                  onChange={(e) => setSettings({ ...settings, default_rate_limit_per_minute: parseInt(e.target.value) || 60 })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">默认最小延迟（秒）</label>
                <input
                  type="number" step="0.1" min="0" className="form-input"
                  value={settings.default_delay_min}
                  onChange={(e) => setSettings({ ...settings, default_delay_min: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">默认最大延迟（秒）</label>
                <input
                  type="number" step="0.1" min="0" className="form-input"
                  value={settings.default_delay_max}
                  onChange={(e) => setSettings({ ...settings, default_delay_max: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button className="btn btn-secondary" onClick={() => setShowSettingsModal(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSaveSettings} disabled={submitting}>
              {submitting ? '保存中...' : '保存设置'}
            </button>
          </div>
        </Modal>
      )}

      {showDetailDrawer && detailProxy && (
        <Drawer title="代理详情" onClose={() => setShowDetailDrawer(false)}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>
                  {detailProxy.ip}:{detailProxy.port}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  ID: #{detailProxy.id} · 创建于 {formatDateTime(detailProxy.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span className={protocolBadgeClass(detailProxy.protocol)} style={{
                  padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                }}>
                  {detailProxy.protocol?.toUpperCase()}
                </span>
                <span className={statusBadgeClass(detailProxy.status)} style={{
                  padding: '4px 10px', borderRadius: '12px', fontSize: '12px',
                  background: getStatusMeta(detailProxy.status).color + '22',
                  color: getStatusMeta(detailProxy.status).color,
                }}>
                  {getStatusMeta(detailProxy.status).label}
                </span>
              </div>
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px',
              }}>
                {[
                  { k: '成功次数', v: detailProxy.success_count || 0 },
                  { k: '失败次数', v: detailProxy.fail_count || 0 },
                  { k: '成功率', v: `${getSuccessRate(detailProxy)}%` },
                  { k: '平均响应时间', v: detailProxy.response_time ? `${detailProxy.response_time} ms` : '-' },
                  { k: '上次检测', v: formatDateTime(detailProxy.last_check_at) },
                  { k: '上次使用', v: formatDateTime(detailProxy.last_used_at) },
                ].map((item, i) => (
                  <div key={i}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>{item.k}</div>
                    <div style={{ fontSize: '15px', fontWeight: 500 }}>{item.v}</div>
                  </div>
                ))}
              </div>
              {detailProxy.username && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>认证信息</div>
                  <div style={{ fontSize: '13px' }}>
                    用户名：<code>{detailProxy.username}</code>
                    {detailProxy.password && <> · 密码：<code>{detailProxy.password}</code></>}
                  </div>
                </div>
              )}
              {detailProxy.tags?.length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>标签</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {detailProxy.tags.map((t, i) => (
                      <span key={i} style={{
                        padding: '4px 10px', background: 'var(--bg-secondary)',
                        borderRadius: '12px', fontSize: '12px',
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {detailProxy.remark && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>备注</div>
                  <div style={{ fontSize: '13px' }}>{detailProxy.remark}</div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: 500, fontSize: '15px' }}>最近检测记录（共 {checkLogs.length} 条）</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleCheckOne(detailProxy)}
                disabled={checkingIds.has(detailProxy.id)}
              >
                立即检测
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>时间</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>结果</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>状态码</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>响应时间</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>错误信息</th>
                  </tr>
                </thead>
                <tbody>
                  {checkLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        暂无检测记录
                      </td>
                    </tr>
                  ) : (
                    checkLogs.map((l) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px', fontSize: '12px' }}>{formatDateTime(l.checked_at)}</td>
                        <td style={{ padding: '10px' }}>
                          <span className={l.success ? 'status-badge status-success' : 'status-badge status-danger'}>
                            {l.success ? '成功' : '失败'}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>{l.status_code || '-'}</td>
                        <td style={{ padding: '10px' }}>{l.response_time} ms</td>
                        <td style={{ padding: '10px', fontSize: '12px', color: l.error_message ? '#ff4d4f' : 'inherit', maxWidth: '300px' }}>
                          {l.error_message || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}

function Modal({
  title, children, onClose, size,
}: { title: string; children: React.ReactNode; onClose: () => void; size?: 'sm' | 'md' | 'lg' }) {
  const width = size === 'lg' ? '680px' : size === 'sm' ? '400px' : '520px';
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px',
    }} onClick={onClose}>
      <div
        className="card"
        style={{
          width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto',
          padding: '24px', margin: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px',
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '20px', color: 'var(--text-secondary)', padding: '4px 10px',
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Drawer({
  title, children, onClose,
}: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', zIndex: 1000, justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          width: '560px', maxWidth: '92vw', height: '100%',
          background: 'var(--bg-primary)', overflow: 'auto',
          padding: '24px', boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px',
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '20px', color: 'var(--text-secondary)', padding: '4px 10px',
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
