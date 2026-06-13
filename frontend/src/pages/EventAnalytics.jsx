import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { reportsAPI, downloadBlob, eventAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const COLORS_STATUS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const COLORS_ENTRANCE = ['#06B6D4', '#8B5CF6', '#F97316', '#14B8A6', '#EC4899'];
const COLORS_HOURLY = ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'];

const EventAnalytics = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isOrganizer } = useAuth();
  const [event, setEvent] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState({ type: '', loading: false });
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!user || !isOrganizer()) {
      navigate('/login');
      return;
    }
    const fetchData = async () => {
      try {
        const [eventRes, statsRes] = await Promise.all([
          eventAPI.getById(id),
          reportsAPI.getStatistics(id)
        ]);
        setEvent(eventRes.data);
        setStats(statsRes.data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
        setMessage('加载统计数据失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, user, navigate, isOrganizer]);

  const formatDate = (ds) => {
    if (!ds) return '';
    const d = new Date(ds);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const pct = v => `${(v * 100).toFixed(1)}%`;

  const handleExport = async (type) => {
    setExporting({ type, loading: true });
    setMessage('');
    try {
      let resp;
      let filename;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeTitle = (event?.title || '活动').replace(/[\\/:*?"<>|]/g, '_');
      if (type === 'registrations') {
        resp = await reportsAPI.exportRegistrations(id);
        filename = `活动报名数据_${safeTitle}_${dateStr}.xlsx`;
      } else if (type === 'checkins') {
        resp = await reportsAPI.exportCheckins(id);
        filename = `活动签到报告_${safeTitle}_${dateStr}.xlsx`;
      } else {
        resp = await reportsAPI.exportFullReport(id);
        filename = `活动完整报告_${safeTitle}_${dateStr}.xlsx`;
      }
      downloadBlob(resp.data, filename);
      setMessage(`导出成功！文件已下载：${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      setMessage('导出失败，请重试');
    } finally {
      setExporting({ type: '', loading: false });
    }
  };

  const isEventEnded = () => {
    if (!event?.end_time) return false;
    return new Date(event.end_time) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-16">统计数据暂不可用</div>;
  }

  const statusData = Object.entries(stats.status_distribution || {}).map(([k, v]) => {
    const nameMap = { confirmed: '已确认', waitlisted: '候补', cancelled: '已取消', pending_confirmation: '待确认' };
    return { name: nameMap[k] || k, value: v };
  }).filter(x => x.value > 0);

  const entranceData = Object.entries(stats.entrance_counts || {}).map(([k, v]) => ({ name: k, value: v }));
  const checkinTimeline = stats.checkin_timeline || [];
  const regTimeline = stats.registration_timeline || [];
  const hourlyData = stats.checkin_hourly_distribution || [];
  const formFieldStats = stats.form_field_stats || [];

  const kpiCards = [
    { label: '总报名', value: stats.total_registrations, icon: '👥', bg: 'bg-blue-500' },
    { label: '已确认报名', value: stats.confirmed_registrations, icon: '✅', bg: 'bg-green-500' },
    { label: '总签到', value: stats.total_checkins, icon: '✔️', bg: 'bg-cyan-500' },
    { label: '签到率', value: pct(stats.checkin_rate), icon: '📊', bg: 'bg-purple-500' },
    { label: '候补人数', value: stats.waitlisted_registrations, icon: '⏳', bg: 'bg-amber-500' },
    { label: '未签到', value: stats.no_show_count || 0, icon: '❌', bg: 'bg-rose-500' },
  ];

  const tabs = [
    { key: 'overview', label: '📊 总览' },
    { key: 'checkin', label: '🚪 签到分析' },
    { key: 'registration', label: '📋 报名分析' },
    { key: 'form', label: '📝 表单统计' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-2 text-sm text-blue-600 hover:text-blue-800 inline-flex items-center"
        >
          ← 返回
        </button>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-800">
                {event?.title || '活动'} - 统计分析
              </h1>
              {isEventEnded() && (
                <span className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                  活动已结束
                </span>
              )}
            </div>
            <p className="text-gray-500 mt-1">
              📍 {event?.location} | 📅 {formatDate(event?.start_time)} - {formatDate(event?.end_time)}
            </p>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleExport('registrations')}
                disabled={exporting.loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg transition text-sm font-medium"
              >
                {exporting.type === 'registrations' && exporting.loading ? '导出中...' : '📋 报名数据'}
              </button>
              <button
                onClick={() => handleExport('checkins')}
                disabled={exporting.loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg transition text-sm font-medium"
              >
                {exporting.type === 'checkins' && exporting.loading ? '导出中...' : '✅ 签到报告'}
              </button>
              <button
                onClick={() => handleExport('full')}
                disabled={exporting.loading}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition text-sm font-medium"
              >
                {exporting.type === 'full' && exporting.loading ? '导出中...' : '📦 完整报告'}
              </button>
            </div>
            {message && (
              <div className={`text-sm px-3 py-1.5 rounded ${message.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {message}
              </div>
            )}
          </div>
        </div>
      </div>

      {isEventEnded() && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-green-800">🎉 活动已结束</h3>
              <p className="text-sm text-green-600 mt-1">您可以下载完整的活动报告，包括签到数据、报名名单和统计分析</p>
            </div>
            <button
              onClick={() => handleExport('full')}
              disabled={exporting.loading}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-5 py-2.5 rounded-lg transition font-medium"
            >
              {exporting.type === 'full' && exporting.loading ? '导出中...' : '📥 下载完整报告'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {kpiCards.map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition">
            <div className="flex items-center justify-between mb-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{
                  backgroundColor: kpi.bg === 'bg-blue-500' ? '#3B82F6'
                    : kpi.bg === 'bg-green-500' ? '#10B981'
                    : kpi.bg === 'bg-cyan-500' ? '#06B6D4'
                    : kpi.bg === 'bg-purple-500' ? '#8B5CF6'
                    : kpi.bg === 'bg-amber-500' ? '#F59E0B'
                    : kpi.bg === 'bg-rose-500' ? '#F43F5E'
                    : '#3B82F6'
                }}
              >
                {kpi.icon}
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{kpi.value}</p>
              <p className="text-sm text-gray-500 mt-1">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 border-b border-gray-200">
        <div className="flex space-x-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">📊 报名状态分布</h3>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS_STATUS[index % COLORS_STATUS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">暂无数据</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">🚪 各入口签到分布</h3>
              {entranceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={entranceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" name="签到人次" radius={[6, 6, 0, 0]}>
                      {entranceData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS_ENTRANCE[index % COLORS_ENTRANCE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">暂无签到数据</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 详细统计数据</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">指标</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数值</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">活动容量</td>
                    <td className="px-4 py-3">{stats.max_capacity} 人</td>
                    <td className="px-4 py-3 text-gray-500">活动设定的最大参与人数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">总报名申请</td>
                    <td className="px-4 py-3">{stats.total_registrations} 人</td>
                    <td className="px-4 py-3 text-gray-500">所有提交的报名申请总数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">已确认报名</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{stats.confirmed_registrations} 人</td>
                    <td className="px-4 py-3 text-gray-500">报名成功并确认的人数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">候补名单</td>
                    <td className="px-4 py-3 text-amber-600 font-medium">{stats.waitlisted_registrations} 人</td>
                    <td className="px-4 py-3 text-gray-500">在候补队列中的人数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">已取消</td>
                    <td className="px-4 py-3 text-red-600 font-medium">{stats.cancelled_registrations} 人</td>
                    <td className="px-4 py-3 text-gray-500">取消报名的人数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">总签到数</td>
                    <td className="px-4 py-3 text-cyan-600 font-medium">{stats.total_checkins} 人</td>
                    <td className="px-4 py-3 text-gray-500">实际签到入场的人数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">未签到人数</td>
                    <td className="px-4 py-3 text-rose-600 font-medium">{stats.no_show_count || 0} 人</td>
                    <td className="px-4 py-3 text-gray-500">已确认但未签到的人数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">签到率</td>
                    <td className="px-4 py-3 font-bold text-purple-600">{pct(stats.checkin_rate)}</td>
                    <td className="px-4 py-3 text-gray-500">签到人数 / 已确认报名人数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">未签到率</td>
                    <td className="px-4 py-3 font-bold text-rose-600">{pct(stats.no_show_rate || 0)}</td>
                    <td className="px-4 py-3 text-gray-500">未签到人数 / 已确认报名人数</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">报名率</td>
                    <td className="px-4 py-3 font-bold text-blue-600">{pct(stats.registration_rate)}</td>
                    <td className="px-4 py-3 text-gray-500">已确认人数 / 活动容量</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'checkin' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">⏰ 签到时段分布（按小时）</h3>
              {hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="签到人次" fill="#10B981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">暂无签到数据</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">📈 签到趋势（按日）</h3>
              {checkinTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={checkinTimeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" name="签到人次" stroke="#10B981" strokeWidth={3} dot={{ fill: '#10B981', r: 5 }} activeDot={{ r: 7 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">暂无签到数据</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">🚪 各入口签到详情</h3>
            {entranceData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">入口名称</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">签到人次</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">占比</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">可视化</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {entranceData.map((item, idx) => {
                      const total = entranceData.reduce((sum, d) => sum + d.value, 0) || 1;
                      const percent = (item.value / total) * 100;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{item.name}</td>
                          <td className="px-4 py-3">{item.value} 人次</td>
                          <td className="px-4 py-3">{percent.toFixed(1)}%</td>
                          <td className="px-4 py-3 w-48">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: `${percent}%`,
                                  backgroundColor: COLORS_ENTRANCE[idx % COLORS_ENTRANCE.length]
                                }}
                              ></div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">暂无签到数据</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'registration' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📈 报名人数趋势（按日）</h3>
            {regTimeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={regTimeline}>
                  <defs>
                    <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" name="报名人数" stroke="#3B82F6" fill="url(#colorReg)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">暂无数据</div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">📊 报名状态分布</h3>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS_STATUS[index % COLORS_STATUS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">暂无数据</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 报名状态详情</h3>
              <div className="space-y-4">
                {statusData.map((item, idx) => {
                  const total = stats.total_registrations || 1;
                  const percent = (item.value / total) * 100;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{item.name}</span>
                        <span className="text-gray-500">{item.value} 人 ({percent.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="h-3 rounded-full transition-all"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: COLORS_STATUS[idx % COLORS_STATUS.length]
                          }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'form' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📝 报名表单字段统计</h3>
            {formFieldStats.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">字段名称</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">总回答数</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">已填写</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">未填写</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">填写率</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">热门值</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {formFieldStats.map((field, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{field.field_name}</td>
                        <td className="px-4 py-3">{field.total_responses}</td>
                        <td className="px-4 py-3 text-green-600">{field.filled_count}</td>
                        <td className="px-4 py-3 text-gray-400">{field.empty_count}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            field.fill_rate >= 0.8 ? 'bg-green-100 text-green-800'
                              : field.fill_rate >= 0.5 ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {(field.fill_rate * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs">
                          {field.top_values && field.top_values.length > 0
                            ? field.top_values.slice(0, 3).map((tv, i) => (
                                <span key={i} className="inline-block mr-2 mb-1 px-2 py-0.5 bg-gray-100 rounded text-xs">
                                  {tv.value} ({tv.count})
                                </span>
                              ))
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg mb-2">📝 暂无表单数据</p>
                <p className="text-sm">该活动的报名表单没有收集到字段数据</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventAnalytics;
