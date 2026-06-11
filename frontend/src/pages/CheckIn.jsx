import { useState } from 'react';
import { registrationAPI } from '../api';

const CheckIn = () => {
  const [ticketCode, setTicketCode] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ticketCode.trim()) {
      setMessage('请输入票码');
      setStatus('error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await registrationAPI.checkIn(ticketCode.trim().toUpperCase());
      setMessage(response.data.message);
      setStatus('success');
    } catch (err) {
      setMessage(err.response?.data?.detail || '签到失败');
      setStatus('error');
    } finally {
      setSubmitting(false);
      setTicketCode('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-8">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">📱 扫码签到</h2>
        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-center ${status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
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
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 text-center">
            请使用活动报名时获得的电子票二维码进行签到，或手动输入票码
          </p>
        </div>
      </div>
    </div>
  );
};

export default CheckIn;