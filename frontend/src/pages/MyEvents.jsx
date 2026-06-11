import { useState, useEffect } from 'react';
import { registrationAPI, eventAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

const MyEvents = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState([]);
  const [events, setEvents] = useState({});
  const [qrCodes, setQrCodes] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchRegistrations = async () => {
      try {
        const response = await registrationAPI.getMine();
        setRegistrations(response.data);
        
        const eventMap = {};
        const qrMap = {};
        for (const reg of response.data) {
          const eventResponse = await eventAPI.getById(reg.event_id);
          eventMap[reg.event_id] = eventResponse.data;
          
          const qrResponse = await registrationAPI.getQRCode(reg.id);
          qrMap[reg.id] = qrResponse.data;
        }
        setEvents(eventMap);
        setQrCodes(qrMap);
      } catch (err) {
        console.error('Failed to fetch registrations:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRegistrations();
  }, [user, navigate]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">我的活动</h1>
      {registrations.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-xl">暂无报名记录</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {registrations.map((reg) => {
            const event = events[reg.event_id];
            const qrData = qrCodes[reg.id];
            return (
              <div key={reg.id} className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-800">
                        {event?.title || '未知活动'}
                      </h3>
                      <div className="mt-2 text-sm text-gray-500">
                        <p>📍 {event?.location}</p>
                        <p>📅 {event ? formatDate(event.start_time) : ''}</p>
                        <p className={`mt-1 ${reg.check_in ? 'text-green-600' : 'text-gray-400'}`}>
                          {reg.check_in ? '✅ 已签到' : '⏳ 未签到'}
                        </p>
                      </div>
                    </div>
                    {qrData && (
                      <div className="bg-white p-3 border border-gray-200 rounded-lg">
                        <QRCodeSVG value={`event://checkin/${qrData.ticket_code}`} size={100} />
                        <p className="text-xs text-center mt-2 font-mono">{qrData.ticket_code}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyEvents;