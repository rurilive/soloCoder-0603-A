import { useState, useEffect } from 'react';
import { eventAPI, reportsAPI, downloadBlobWithHeaders } from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const OrganizerEvents = () => {
  const { user, isOrganizer } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState(null);
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => {
    if (!user || !isOrganizer()) {
      navigate('/login');
      return;
    }

    const fetchEvents = async () => {
      try {
        const response = await eventAPI.getMyEvents();
        setEvents(response.data);
      } catch (err) {
        console.error('Failed to fetch events:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [user, navigate, isOrganizer]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isEventEnded = (endTime) => {
    return new Date(endTime) < new Date();
  };

  const handleQuickExport = async (event, type) => {
    setExportingId(`${event.id}-${type}`);
    setExportMessage('');
    try {
      let resp;
      let fallbackFilename;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeTitle = (event.title || '活动').replace(/[\\/:*?"<>|]/g, '_');
      if (type === 'registrations') {
        resp = await reportsAPI.exportRegistrations(event.id);
        fallbackFilename = `活动报名数据_${safeTitle}_${dateStr}.xlsx`;
      } else if (type === 'checkins') {
        resp = await reportsAPI.exportCheckins(event.id);
        fallbackFilename = `活动签到报告_${safeTitle}_${dateStr}.xlsx`;
      } else {
        resp = await reportsAPI.exportFullReport(event.id);
        fallbackFilename = `活动完整报告_${safeTitle}_${dateStr}.xlsx`;
      }
      const finalFilename = downloadBlobWithHeaders(resp, fallbackFilename);
      setExportMessage(`导出成功：${finalFilename}`);
      setTimeout(() => setExportMessage(''), 3000);
    } catch (err) {
      console.error('Export error:', err);
      setExportMessage('导出失败，请重试');
    } finally {
      setExportingId(null);
    }
  };

  const endedEvents = events.filter(e => isEventEnded(e.end_time));
  const activeEvents = events.filter(e => !isEventEnded(e.end_time));

  const EventCard = ({ event }) => {
    const ended = isEventEnded(event.end_time);
    return (
      <div
        key={event.id}
        className={`bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition ${ended ? 'border-2 border-green-200' : ''}`}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-800">
                {event.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {ended && (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                    ✓ 活动已结束
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  event.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                    : event.status === 'active' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {event.status === 'pending' ? '待审核' : event.status === 'active' ? '进行中' : event.status}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm text-gray-500">
            <p>📍 {event.location}</p>
            <p>📅 {formatDate(event.start_time)} - {formatDate(event.end_time)}</p>
            <div className="flex items-center justify-between">
              <span>👥 {event.registered_count}/{event.max_capacity} 人已报名</span>
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${ended ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min((event.registered_count / event.max_capacity) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            <p className="text-gray-400 text-xs">活动ID: {event.id}</p>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/event/${event.id}`}
                className="text-sm text-gray-600 hover:text-blue-600 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                查看详情
              </Link>
              <Link
                to={`/event/${event.id}/analytics`}
                className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition"
              >
                📊 统计分析
              </Link>
              <div className="relative group">
                <button
                  disabled={exportingId !== null}
                  className="text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-3 py-1.5 rounded-lg transition"
                >
                  📥 导出 ▾
                </button>
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <button
                    onClick={() => handleQuickExport(event, 'registrations')}
                    disabled={exportingId !== null}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg disabled:opacity-50"
                  >
                    {exportingId === `${event.id}-registrations` ? '导出中...' : '📋 报名数据'}
                  </button>
                  <button
                    onClick={() => handleQuickExport(event, 'checkins')}
                    disabled={exportingId !== null}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {exportingId === `${event.id}-checkins` ? '导出中...' : '✅ 签到报告'}
                  </button>
                  <button
                    onClick={() => handleQuickExport(event, 'full')}
                    disabled={exportingId !== null}
                    className="w-full text-left px-4 py-2 text-sm text-emerald-600 font-medium hover:bg-emerald-50 rounded-b-lg disabled:opacity-50"
                  >
                    {exportingId === `${event.id}-full` ? '导出中...' : '📦 完整报告'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {ended && (
            <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-800">🎉 活动已结束</p>
                  <p className="text-xs text-green-600">下载完整报告进行复盘分析</p>
                </div>
                <button
                  onClick={() => handleQuickExport(event, 'full')}
                  disabled={exportingId !== null}
                  className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-3 py-1.5 rounded-lg transition font-medium"
                >
                  {exportingId === `${event.id}-full` ? '导出中...' : '下载报告'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">我的活动管理</h1>
          <p className="text-gray-500 mt-1">查看和管理您创建的所有活动</p>
        </div>
        <Link
          to="/create-event"
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg transition font-medium"
        >
          + 创建新活动
        </Link>
      </div>

      {exportMessage && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          exportMessage.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {exportMessage}
        </div>
      )}

      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-xl">暂无活动</p>
          <p className="text-sm mt-2">点击上方按钮创建您的第一个活动</p>
        </div>
      ) : (
        <div className="space-y-8">
          {endedEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-gray-800">🎉 已结束的活动</h2>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {endedEvents.length} 个
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {endedEvents.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}

          {activeEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-gray-800">📅 进行中的活动</h2>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {activeEvents.length} 个
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activeEvents.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrganizerEvents;
