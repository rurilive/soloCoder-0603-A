import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { eventAPI, registrationAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const EventDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const response = await eventAPI.getById(id);
        setEvent(response.data);
      } catch (err) {
        console.error('Failed to fetch event:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [id]);

  const handleInputChange = (fieldId, value) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }

    setSubmitting(true);
    try {
      await registrationAPI.create({
        event_id: parseInt(id),
        form_data: formData
      });
      setMessage('报名成功！');
      setTimeout(() => navigate('/my-events'), 2000);
    } catch (err) {
      setMessage(err.response?.data?.detail || '报名失败');
    } finally {
      setSubmitting(false);
    }
  };

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

  const renderFormField = (field) => {
    const fieldId = field.id || field.label;
    switch (field.type) {
      case 'text':
        return (
          <div key={fieldId} className="mb-4">
            <label className="block text-gray-700 mb-2">{field.label}</label>
            <input
              type="text"
              value={formData[fieldId] || ''}
              onChange={(e) => handleInputChange(fieldId, e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required={field.required}
              placeholder={field.placeholder}
            />
          </div>
        );
      case 'email':
        return (
          <div key={fieldId} className="mb-4">
            <label className="block text-gray-700 mb-2">{field.label}</label>
            <input
              type="email"
              value={formData[fieldId] || ''}
              onChange={(e) => handleInputChange(fieldId, e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required={field.required}
              placeholder={field.placeholder}
            />
          </div>
        );
      case 'phone':
        return (
          <div key={fieldId} className="mb-4">
            <label className="block text-gray-700 mb-2">{field.label}</label>
            <input
              type="tel"
              value={formData[fieldId] || ''}
              onChange={(e) => handleInputChange(fieldId, e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required={field.required}
              placeholder={field.placeholder}
            />
          </div>
        );
      case 'textarea':
        return (
          <div key={fieldId} className="mb-4">
            <label className="block text-gray-700 mb-2">{field.label}</label>
            <textarea
              value={formData[fieldId] || ''}
              onChange={(e) => handleInputChange(fieldId, e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={4}
              required={field.required}
              placeholder={field.placeholder}
            />
          </div>
        );
      case 'select':
        return (
          <div key={fieldId} className="mb-4">
            <label className="block text-gray-700 mb-2">{field.label}</label>
            <select
              value={formData[fieldId] || ''}
              onChange={(e) => handleInputChange(fieldId, e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required={field.required}
            >
              <option value="">请选择</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );
      case 'checkbox':
        return (
          <div key={fieldId} className="mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData[fieldId] || false}
                onChange={(e) => handleInputChange(fieldId, e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-gray-700">{field.label}</span>
            </label>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!event) {
    return <div className="text-center py-16">活动不存在</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">{event.title}</h1>
          <div className="space-y-4 mt-6 text-gray-600">
            <p>{event.description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">📍 地点</p>
                <p className="font-medium">{event.location}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">📅 时间</p>
                <p className="font-medium">{formatDate(event.start_time)} - {formatDate(event.end_time)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">👥 名额</p>
                <p className="font-medium">{event.registered_count}/{event.max_capacity}</p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">报名信息</h2>
            {message && (
              <div className={`mb-4 px-4 py-3 rounded-lg ${message.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {message}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              {event.registration_form?.map(renderFormField)}
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">姓名</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="请输入您的姓名"
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">手机号</label>
                <input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="请输入您的手机号"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
              >
                {submitting ? '提交中...' : '立即报名'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventDetail;