import { useState, useEffect } from 'react';
import { registrationAPI, deviceAPI } from '../api';

const CheckIn = () => {
  const [ticketCode, setTicketCode] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [checkInRecords, setCheckInRecords] = useState([]);
  const [eventId, setEventId] = useState('');
  const [loadingStats, setLoadingStats] = useState(false);

  const loadStatistics = async () => {
    if (!eventId) return;
    setLoadingStats(true);
    try {
      const response = await deviceAPI.getCheckInStatistics(eventId);
      setStatistics(response.data);
    } catch (err) {
      console.error('Failed to load statistics:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadCheckInRecords = async () => {
    if (!eventId) return;
    try {
      const response = await deviceAPI.getCheckInRecords(eventId);
      setCheckInRecords(response.data);
    } catch (err) {
      console.error('Failed to load check-in records:', err);
    }
  };

  useEffect(() => {
    if (eventId) {
      loadStatistics();
      loadCheckInRecords();
    }
  }, [eventId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (eventId && !submitting) {
        loadStatistics();
        loadCheckInRecords();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [eventId, submitting]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ticketCode.trim()) {
      setMessage('请输入票码');
      setStatus('error');
      return;
    }
    if (!deviceId.trim()) {
      setMessage('请输入设备ID');
      setStatus('error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await registrationAPI.checkIn(ticketCode.trim().toUpperCase(), deviceId.trim());
      setMessage(response.data.message);
      setStatus(response.data.already_checked_in ? 'warning' : 'success');
      
      loadStatistics();
      loadCheckInRecords();
    } catch (err) {
      setMessage(err.response?.data?.detail || '签到失败');
      setStatus('error');
    } finally {
      setSubmitting(false);
      setTicketCode('');
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">📱 扫码签到系统</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">签到操作</h3>
              
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">活动ID</label>
                <input
                  type="text"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="输入活动ID"
                />
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 mb-2">设备ID</label>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="输入设备ID"
                />
              </div>

              {message && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-center ${
                  status === 'success' ? 'bg-green-100 text-green-700' : 
                  status === 'warning' ? 'bg-yellow-100 text-yellow-700' : 
                  'bg-red-100 text-red-700'
                }`}>
                  {message}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-gray-700 mb-2">票码</label>
                  <input
                    type="text"
                    value={ticketCode}
                    onChange={(e) => setTicketCode(e.target.value)}
                    className="w-full px-4 py-3 text-lg text-center font-mono border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="请输入票码"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 text-lg font-semibold"
                >
                  {submitting ? '签到中...' : '确认签到'}
                </button>
              </form>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  请使用活动报名时获得的电子票二维码进行签到，或手动输入票码
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {loadingStats ? (
              <div className="bg-white rounded-xl shadow-lg p-6 flex justify-center items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              </div>
            ) : statistics ? (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">📊 实时统计</h3>
                <div className="text-center mb-6">
                  <div className="text-5xl font-bold text-blue-600">{statistics.total_checkins}</div>
                  <div className="text-gray-500 mt-2">总签到人数</div>
                </div>
                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold text-gray-600 mb-3">各入口签到统计</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {Object.entries(statistics.entrance_counts).map(([entrance, count]) => (
                      <div key={entrance} className="bg-gray-50 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">{count}</div>
                        <div className="text-sm text-gray-500">{entrance}</div>
                      </div>
                    ))}
                    {Object.keys(statistics.entrance_counts).length === 0 && (
                      <div className="col-span-full text-center text-gray-400">暂无签到数据</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-6 text-center text-gray-400">
                请输入活动ID查看统计数据
              </div>
            )}

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">📝 签到记录</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-gray-600">时间</th>
                      <th className="px-4 py-2 text-left text-gray-600">入口</th>
                      <th className="px-4 py-2 text-left text-gray-600">报名ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkInRecords.length > 0 ? (
                      checkInRecords.map((record) => (
                        <tr key={record.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">{formatTime(record.check_in_time)}</td>
                          <td className="px-4 py-3">{record.entrance}</td>
                          <td className="px-4 py-3 font-mono">{record.registration_id}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" className="px-4 py-8 text-center text-gray-400">
                          暂无签到记录
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckIn;