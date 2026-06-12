import { useState, useEffect } from 'react';
import { registrationAPI, deviceAPI, eventAPI } from '../api';

const CheckIn = () => {
  const [ticketCode, setTicketCode] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [checkInRecords, setCheckInRecords] = useState([]);
  const [eventId, setEventId] = useState('');
  const [loadingStats, setLoadingStats] = useState(false);
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [showCreateDevice, setShowCreateDevice] = useState(false);
  const [newDevice, setNewDevice] = useState({ device_id: '', name: '', entrance: '' });
  const [editingDevice, setEditingDevice] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const loadMyEvents = async () => {
    setLoadingEvents(true);
    try {
      const response = await eventAPI.getMyEvents();
      setMyEvents(response.data);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadMyEvents();
  }, []);

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

  const loadDevices = async () => {
    if (!eventId) return;
    setLoadingDevices(true);
    try {
      const response = await deviceAPI.getByEvent(eventId);
      setDevices(response.data);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      loadStatistics();
      loadCheckInRecords();
      loadDevices();
    } else {
      setDevices([]);
      setSelectedDevice('');
      setStatistics(null);
      setCheckInRecords([]);
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
    if (!selectedDevice) {
      setMessage('请选择签到设备');
      setStatus('error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await registrationAPI.checkIn(ticketCode.trim().toUpperCase(), selectedDevice);
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

  const handleCreateDevice = async () => {
    if (!newDevice.device_id || !newDevice.name || !newDevice.entrance) {
      setMessage('请填写完整设备信息');
      setStatus('error');
      return;
    }

    try {
      await deviceAPI.create({
        device_id: newDevice.device_id,
        name: newDevice.name,
        entrance: newDevice.entrance,
        event_id: parseInt(eventId)
      });
      setMessage('设备创建成功');
      setStatus('success');
      setShowCreateDevice(false);
      setNewDevice({ device_id: '', name: '', entrance: '' });
      loadDevices();
    } catch (err) {
      setMessage(err.response?.data?.detail || '设备创建失败');
      setStatus('error');
    }
  };

  const handleToggleDevice = async (device) => {
    try {
      await deviceAPI.update(device.id, {
        device_id: device.device_id,
        name: device.name,
        entrance: device.entrance,
        event_id: parseInt(eventId),
        is_active: !device.is_active
      });
      loadDevices();
    } catch (err) {
      console.error('Failed to update device:', err);
    }
  };

  const handleEditDevice = (device) => {
    setEditingDevice(device);
    setNewDevice({
      device_id: device.device_id,
      name: device.name,
      entrance: device.entrance
    });
    setShowCreateDevice(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDevice || !newDevice.name || !newDevice.entrance) {
      setMessage('请填写完整设备信息');
      setStatus('error');
      return;
    }

    try {
      await deviceAPI.update(editingDevice.id, {
        device_id: editingDevice.device_id,
        name: newDevice.name,
        entrance: newDevice.entrance,
        event_id: parseInt(eventId)
      });
      setMessage('设备更新成功');
      setStatus('success');
      setShowCreateDevice(false);
      setNewDevice({ device_id: '', name: '', entrance: '' });
      setEditingDevice(null);
      loadDevices();
    } catch (err) {
      setMessage(err.response?.data?.detail || '设备更新失败');
      setStatus('error');
    }
  };

  const handleDeleteDevice = async (device) => {
    if (!window.confirm(`确定要删除设备 "${device.name}" 吗？`)) return;
    
    try {
      await deviceAPI.delete(device.id);
      setMessage('设备删除成功');
      setStatus('success');
      loadDevices();
      if (selectedDevice === device.device_id) {
        setSelectedDevice('');
      }
    } catch (err) {
      setMessage(err.response?.data?.detail || '设备删除失败');
      setStatus('error');
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

  const formatEventTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">📱 扫码签到系统</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">签到操作</h3>
              
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">选择活动</label>
                {loadingEvents ? (
                  <div className="flex justify-center items-center py-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <select
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">请选择活动</option>
                    {myEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title} ({formatEventTime(event.start_time)})
                      </option>
                    ))}
                  </select>
                )}
                {myEvents.length === 0 && !loadingEvents && (
                  <p className="text-sm text-gray-500 mt-2">暂无活动，请先创建活动</p>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 mb-2">签到设备</label>
                <select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={!eventId}
                >
                  <option value="">请选择设备</option>
                  {devices.map((device) => (
                    <option key={device.device_id} value={device.device_id} disabled={!device.is_active}>
                      {device.name} ({device.entrance}) {!device.is_active && '(已停用)'}
                    </option>
                  ))}
                </select>
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
                    disabled={!eventId || !selectedDevice}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !eventId || !selectedDevice}
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

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-700">设备管理</h3>
                <button
                  onClick={() => {
                    if (!eventId) {
                      setMessage('请先选择活动');
                      setStatus('error');
                      return;
                    }
                    setEditingDevice(null);
                    setNewDevice({ device_id: '', name: '', entrance: '' });
                    setShowCreateDevice(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                >
                  + 新增设备
                </button>
              </div>

              {!eventId ? (
                <p className="text-center text-gray-400 py-4">请先选择活动</p>
              ) : loadingDevices ? (
                <div className="flex justify-center items-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : devices.length === 0 ? (
                <p className="text-center text-gray-400 py-4">暂无设备，请先添加</p>
              ) : (
                <div className="space-y-2">
                  {devices.map((device) => (
                    <div key={device.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-700">{device.name}</div>
                        <div className="text-sm text-gray-500">{device.entrance} · {device.device_id}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditDevice(device)}
                          className="px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-xs"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleToggleDevice(device)}
                          className={`px-2 py-1 rounded text-xs ${
                            device.is_active ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
                          } text-white`}
                        >
                          {device.is_active ? '停用' : '启用'}
                        </button>
                        <button
                          onClick={() => handleDeleteDevice(device)}
                          className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            {!eventId ? (
              <div className="bg-white rounded-xl shadow-lg p-6 text-center text-gray-400">
                请选择活动查看统计数据
              </div>
            ) : loadingStats ? (
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
                请选择活动查看统计数据
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

        {showCreateDevice && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">
                {editingDevice ? '编辑设备' : '新增设备'}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 mb-2">设备ID</label>
                  <input
                    type="text"
                    value={newDevice.device_id}
                    onChange={(e) => setNewDevice({ ...newDevice, device_id: e.target.value })}
                    className={`w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      editingDevice ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                    placeholder="输入设备ID"
                    disabled={editingDevice}
                  />
                  {editingDevice && (
                    <p className="text-sm text-gray-500 mt-1">设备ID创建后不可修改</p>
                  )}
                </div>
                <div>
                  <label className="block text-gray-700 mb-2">设备名称</label>
                  <input
                    type="text"
                    value={newDevice.name}
                    onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="输入设备名称"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-2">入口名称</label>
                  <input
                    type="text"
                    value={newDevice.entrance}
                    onChange={(e) => setNewDevice({ ...newDevice, entrance: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="输入入口名称（如：东门、西门）"
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => {
                    setShowCreateDevice(false);
                    setNewDevice({ device_id: '', name: '', entrance: '' });
                    setEditingDevice(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                >
                  取消
                </button>
                <button
                  onClick={editingDevice ? handleSaveEdit : handleCreateDevice}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  {editingDevice ? '保存修改' : '创建设备'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckIn;