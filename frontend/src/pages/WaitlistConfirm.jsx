import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const WaitlistConfirm = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offerData, setOfferData] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);

  useEffect(() => {
    fetchOfferStatus();
  }, [token]);

  const fetchOfferStatus = async () => {
    try {
      const response = await fetch(`/api/registrations/waitlist/confirm/${token}`);
      const data = await response.json();
      
      if (response.ok) {
        setOfferData(data);
      } else {
        setError(data.message || '获取递补信息失败');
      }
    } catch (err) {
      setError('网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (accept) => {
    setConfirming(true);
    try {
      const response = await fetch('/api/registrations/waitlist/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, accept }),
      });
      const data = await response.json();
      
      if (response.ok) {
        setConfirmResult(data);
        setConfirmed(true);
      } else {
        setError(data.detail || data.message || '操作失败');
      }
    } catch (err) {
      setError('网络请求失败');
    } finally {
      setConfirming(false);
    }
  };

  const formatTimeRemaining = (hours) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}小时${m}分钟`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">操作失败</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (confirmed) {
    const success = confirmResult?.success;
    const hasTicket = confirmResult?.registration?.ticket_code;
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className={`text-4xl mb-4 ${success ? 'text-green-500' : 'text-red-500'}`}>
            {success ? '✅' : '❌'}
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {success ? '操作成功' : '操作失败'}
          </h2>
          <p className="text-gray-600 mb-4">{confirmResult?.message}</p>
          {success && hasTicket && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-500">您的票码</p>
              <p className="text-lg font-mono font-bold text-blue-600">
                {confirmResult.registration.ticket_code}
              </p>
            </div>
          )}
          <button
            onClick={() => navigate('/')}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800">恭喜获得递补资格！</h2>
          <p className="text-gray-600 mt-2">您已从候补名单中递补获得活动名额</p>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-2">活动信息</h3>
          <p className="text-blue-600 text-lg font-medium">{offerData?.event_title}</p>
        </div>

        <div className="bg-orange-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-orange-800 mb-2">⚠️ 注意事项</h3>
          <p className="text-orange-600 text-sm">
            请在 <span className="font-bold">{formatTimeRemaining(offerData?.time_remaining_hours)}</span> 内确认是否接受名额
          </p>
          <p className="text-orange-600 text-sm mt-1">
            超时未确认将自动视为放弃，名额将顺延给下一位候补人员
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleConfirm(true)}
            disabled={confirming}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming ? '处理中...' : '接受名额'}
          </button>
          <button
            onClick={() => handleConfirm(false)}
            disabled={confirming}
            className="w-full bg-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-300 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming ? '处理中...' : '拒绝名额'}
          </button>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          如有疑问，请联系活动主办方
        </p>
      </div>
    </div>
  );
};

export default WaitlistConfirm;