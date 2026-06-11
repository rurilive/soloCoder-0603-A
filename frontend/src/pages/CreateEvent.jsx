import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const CreateEvent = () => {
  const navigate = useNavigate();
  const { isOrganizer } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [formFields, setFormFields] = useState([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const availableFields = [
    { type: 'text', label: '单行文本', icon: '📝' },
    { type: 'email', label: '邮箱', icon: '📧' },
    { type: 'phone', label: '手机号', icon: '📱' },
    { type: 'textarea', label: '多行文本', icon: '📄' },
    { type: 'select', label: '下拉选择', icon: '📋' },
    { type: 'checkbox', label: '复选框', icon: '☑️' },
  ];

  const handleDragStart = (e, fieldType) => {
    e.dataTransfer.setData('fieldType', JSON.stringify(fieldType));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const fieldData = JSON.parse(e.dataTransfer.getData('fieldType'));
    const newField = {
      id: Date.now(),
      type: fieldData.type,
      label: fieldData.label,
      placeholder: `请输入${fieldData.label}`,
      required: false,
      options: fieldData.type === 'select' ? [{ value: '1', label: '选项1' }, { value: '2', label: '选项2' }] : undefined,
    };
    setFormFields([...formFields, newField]);
  };

  const handleFieldChange = (index, key, value) => {
    const newFields = [...formFields];
    newFields[index][key] = value;
    setFormFields(newFields);
  };

  const handleAddOption = (index) => {
    const newFields = [...formFields];
    const optionCount = newFields[index].options?.length || 0;
    newFields[index].options = [
      ...(newFields[index].options || []),
      { value: String(optionCount + 1), label: `选项${optionCount + 1}` }
    ];
    setFormFields(newFields);
  };

  const handleRemoveOption = (index, optionIndex) => {
    const newFields = [...formFields];
    newFields[index].options = newFields[index].options.filter((_, i) => i !== optionIndex);
    setFormFields(newFields);
  };

  const handleRemoveField = (index) => {
    setFormFields(formFields.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isOrganizer()) {
      setMessage('您不是主办方，无法创建活动');
      return;
    }

    setSubmitting(true);
    try {
      await eventAPI.create({
        title,
        description,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        location,
        max_capacity: parseInt(maxCapacity),
        registration_form: formFields.length > 0 ? formFields : undefined,
      });
      setMessage('活动创建成功！');
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setMessage(err.response?.data?.detail || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">创建活动</h1>
      {message && (
        <div className={`mb-6 px-4 py-3 rounded-lg ${message.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message}
        </div>
      )}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-gray-700 mb-2">活动标题 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
              placeholder="请输入活动标题"
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-2">最大名额 *</label>
            <input
              type="number"
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
              min="1"
              placeholder="请输入最大名额"
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-2">开始时间 *</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-2">结束时间 *</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-gray-700 mb-2">地点 *</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
              placeholder="请输入活动地点"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-gray-700 mb-2">活动描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="请输入活动描述"
            />
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">报名表单设计（拖拽添加字段）</h2>
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-3">可用字段（拖拽到下方区域）：</p>
            <div className="field-palette">
              {availableFields.map((field) => (
                <div
                  key={field.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, field)}
                  className="field-card"
                >
                  <div className="text-2xl">{field.icon}</div>
                  <span className="text-sm text-gray-600">{field.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`drop-zone ${formFields.length === 0 ? '' : 'bg-white border-solid'}`}
          >
            {formFields.length === 0 ? (
              <p className="text-center text-gray-400 py-8">拖拽字段到此处</p>
            ) : (
              <div className="space-y-3">
                {formFields.map((field, index) => (
                  <div key={field.id} className="form-field-item">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-700">字段 {index + 1}</span>
                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded">
                          {field.type}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveField(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => handleFieldChange(index, 'label', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm"
                          placeholder="字段标签"
                        />
                      </div>
                      {field.type !== 'checkbox' && (
                        <input
                          type="text"
                          value={field.placeholder}
                          onChange={(e) => handleFieldChange(index, 'placeholder', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm"
                          placeholder="占位提示"
                        />
                      )}
                      <label className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => handleFieldChange(index, 'required', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-gray-600">必填字段</span>
                      </label>
                      {field.type === 'select' && field.options && (
                        <div>
                          {field.options.map((option, optIndex) => (
                            <div key={optIndex} className="flex items-center space-x-2 mb-1">
                              <input
                                type="text"
                                value={option.label}
                                onChange={(e) => {
                                  const newFields = [...formFields];
                                  newFields[index].options[optIndex].label = e.target.value;
                                  setFormFields(newFields);
                                }}
                                className="flex-1 px-3 py-1 border border-gray-200 rounded-md text-sm"
                                placeholder="选项名称"
                              />
                              {field.options.length > 1 && (
                                <button
                                  onClick={() => handleRemoveOption(index, optIndex)}
                                  className="text-red-400 hover:text-red-600"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => handleAddOption(index)}
                            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                          >
                            + 添加选项
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 text-lg font-semibold"
        >
          {submitting ? '创建中...' : '创建活动'}
        </button>
      </form>
    </div>
  );
};

export default CreateEvent;