import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cleaningApi } from '../services/api';
import type { RuleTypeInfo, CleaningRuleCreate } from '../types';

const defaultSampleData = [
  {
    title: '  示例标题 - 测试数据  ',
    price: '￥199.99 ',
    category: '电子产品/手机/智能手机',
    tags: '热门,推荐,新品,热门',
    in_stock: 'yes',
    rating: '4.5',
  },
  {
    title: '另一个示例标题',
    price: ' 299 ',
    category: '服装/男装',
    tags: '特价,清仓',
    in_stock: 'no',
    rating: '3.8',
  },
];

export default function CleaningPipelineEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id && id !== 'new';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<CleaningRuleCreate[]>([]);
  const [ruleTypes, setRuleTypes] = useState<RuleTypeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState<{ original: any[]; cleaned: any[] } | null>(null);
  const [sampleInput, setSampleInput] = useState(JSON.stringify(defaultSampleData, null, 2));
  const [selectedRuleType, setSelectedRuleType] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    loadRuleTypes();
    if (isEditing) {
      loadPipeline();
    }
  }, [id]);

  useEffect(() => {
    if (rules.length > 0) {
      runPreview();
    }
  }, [rules]);

  const loadRuleTypes = async () => {
    try {
      const res = await cleaningApi.listRuleTypes();
      setRuleTypes(res.data);
      if (res.data.length > 0) {
        setSelectedRuleType(res.data[0].type);
      }
    } catch (error) {
      console.error('Failed to load rule types:', error);
    }
  };

  const loadPipeline = async () => {
    if (!id || id === 'new') return;
    setLoading(true);
    try {
      const res = await cleaningApi.getPipeline(parseInt(id));
      const pipeline = res.data;
      setName(pipeline.name);
      setDescription(pipeline.description);
      setRules(pipeline.rules.map((r) => ({
        rule_type: r.rule_type,
        field_name: r.field_name,
        params: r.params,
        order_index: r.order_index,
      })));
    } catch (error) {
      console.error('Failed to load pipeline:', error);
      alert('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const getRuleTypeInfo = (type: string): RuleTypeInfo | undefined => {
    return ruleTypes.find((r) => r.type === type);
  };

  const addRule = () => {
    if (!selectedRuleType) return;
    const ruleInfo = getRuleTypeInfo(selectedRuleType);
    if (!ruleInfo) return;

    const params: Record<string, any> = {};
    for (const param of ruleInfo.params) {
      if (param.default !== undefined) {
        params[param.name] = param.default;
      } else if (param.type === 'checkbox') {
        params[param.name] = false;
      } else if (param.type === 'number') {
        params[param.name] = 0;
      } else {
        params[param.name] = '';
      }
    }

    const newRule: CleaningRuleCreate = {
      rule_type: selectedRuleType,
      field_name: ruleInfo.has_field ? '' : '',
      params,
      order_index: rules.length,
    };
    setRules([...rules, newRule]);
  };

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    newRules.forEach((r, i) => {
      r.order_index = i;
    });
    setRules(newRules);
  };

  const moveRule = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === rules.length - 1) return;

    const newRules = [...rules];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newRules[index], newRules[swapIndex]] = [newRules[swapIndex], newRules[index]];
    newRules.forEach((r, i) => {
      r.order_index = i;
    });
    setRules(newRules);
  };

  const updateRuleField = (index: number, field: string, value: any) => {
    const newRules = [...rules];
    (newRules[index] as any)[field] = value;
    setRules(newRules);
  };

  const updateRuleParam = (ruleIndex: number, paramName: string, value: any) => {
    const newRules = [...rules];
    newRules[ruleIndex].params = {
      ...newRules[ruleIndex].params,
      [paramName]: value,
    };
    setRules(newRules);
  };

  const runPreview = useCallback(async () => {
    try {
      let sampleData;
      try {
        sampleData = JSON.parse(sampleInput);
        if (!Array.isArray(sampleData)) {
          throw new Error('必须是数组');
        }
      } catch (e) {
        return;
      }

      const res = await cleaningApi.preview(rules, sampleData);
      setPreviewData({
        original: res.data.original,
        cleaned: res.data.cleaned,
      });
    } catch (error) {
      console.error('Preview failed:', error);
    }
  }, [rules, sampleInput]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('请输入管道名称');
      return;
    }

    setSaving(true);
    try {
      const pipelineData = {
        name,
        description,
        rules,
      };

      if (isEditing) {
        await cleaningApi.updatePipeline(parseInt(id!), pipelineData);
      } else {
        const res = await cleaningApi.createPipeline(pipelineData);
        navigate(`/cleaning/${res.data.id}`);
        return;
      }
      alert('保存成功');
    } catch (error: any) {
      console.error('Failed to save:', error);
      alert(`保存失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const groupedRuleTypes = ruleTypes.reduce((acc, rule) => {
    if (!acc[rule.category]) {
      acc[rule.category] = [];
    }
    acc[rule.category].push(rule);
    return acc;
  }, {} as Record<string, RuleTypeInfo[]>);

  if (loading) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-title">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{isEditing ? '编辑清洗管道' : '新建清洗管道'}</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/cleaning')}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="page-content" style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '20px' }}>基本信息</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">管道名称 *</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入管道名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">描述</label>
            <textarea
              className="form-textarea"
              placeholder="输入管道描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: '60px' }}
            />
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '20px' }}>
            清洗规则
            <span style={{ marginLeft: '10px', fontWeight: 'normal', fontSize: '14px', color: 'var(--text-secondary)' }}>
              （按顺序执行，共 {rules.length} 条规则）
            </span>
          </h3>

          <div className="rule-add-section" style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">添加规则</label>
              <select
                className="form-select"
                value={selectedRuleType}
                onChange={(e) => setSelectedRuleType(e.target.value)}
              >
                {Object.entries(groupedRuleTypes).map(([category, types]) => (
                  <optgroup key={category} label={category}>
                    {types.map((rule) => (
                      <option key={rule.type} value={rule.type}>
                        {rule.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={addRule}>
              + 添加规则
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">暂无清洗规则</div>
              <p>从上方选择规则类型并添加到管道中</p>
            </div>
          ) : (
            <div className="rules-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {rules.map((rule, index) => {
                const ruleInfo = getRuleTypeInfo(rule.rule_type);
                return (
                  <div key={index} className="rule-card" style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '16px',
                    background: 'var(--bg-secondary)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'var(--primary)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '13px',
                          fontWeight: '600',
                        }}>
                          {index + 1}
                        </span>
                        <span className="font-medium">{ruleInfo?.label || rule.rule_type}</span>
                        <span className="status-badge" style={{ fontSize: '11px' }}>
                          {ruleInfo?.category}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => moveRule(index, 'up')}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => moveRule(index, 'down')}
                          disabled={index === rules.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removeRule(index)}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      {ruleInfo?.has_field && (
                        <div className="form-group" style={{ minWidth: '200px', marginBottom: 0 }}>
                          <label className="form-label">字段名</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="输入字段名"
                            value={rule.field_name}
                            onChange={(e) => updateRuleField(index, 'field_name', e.target.value)}
                          />
                        </div>
                      )}

                      {ruleInfo?.params.map((param) => (
                        <div key={param.name} className="form-group" style={{ minWidth: '180px', marginBottom: 0 }}>
                          <label className="form-label">{param.label}</label>
                          {param.type === 'select' ? (
                            <select
                              className="form-select"
                              value={rule.params[param.name] ?? param.default ?? ''}
                              onChange={(e) => updateRuleParam(index, param.name, e.target.value)}
                            >
                              {param.options?.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : param.type === 'checkbox' ? (
                            <label className="switch" style={{ marginTop: '8px' }}>
                              <input
                                type="checkbox"
                                checked={rule.params[param.name] ?? param.default ?? false}
                                onChange={(e) => updateRuleParam(index, param.name, e.target.checked)}
                              />
                              <span className="slider"></span>
                            </label>
                          ) : param.type === 'number' ? (
                            <input
                              type="number"
                              className="form-input"
                              value={rule.params[param.name] ?? param.default ?? 0}
                              onChange={(e) => updateRuleParam(index, param.name, parseFloat(e.target.value) || 0)}
                            />
                          ) : (
                            <input
                              type="text"
                              className="form-input"
                              placeholder={`输入${param.label}`}
                              value={rule.params[param.name] ?? ''}
                              onChange={(e) => updateRuleParam(index, param.name, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3 className="card-title" style={{ marginBottom: 0 }}>数据预览</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={runPreview}
              >
                刷新预览
              </button>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showPreview}
                  onChange={(e) => setShowPreview(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>显示预览</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">样例数据（JSON 数组）</label>
            <textarea
              className="form-textarea"
              value={sampleInput}
              onChange={(e) => setSampleInput(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '12px', minHeight: '120px' }}
            />
            <div className="form-hint">输入 JSON 格式的样例数据，用于预览清洗效果</div>
          </div>

          {showPreview && previewData && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  原始数据
                </div>
                <div className="results-preview" style={{ maxHeight: '400px', overflow: 'auto' }}>
                  {previewData.original.map((item, idx) => (
                    <div key={idx} className="result-item">
                      <div className="result-url">#{idx + 1}</div>
                      <div className="result-data">{JSON.stringify(item, null, 2)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--success)' }}>
                  清洗后数据
                </div>
                <div className="results-preview" style={{ maxHeight: '400px', overflow: 'auto' }}>
                  {previewData.cleaned.map((item, idx) => (
                    <div key={idx} className="result-item">
                      <div className="result-url">#{idx + 1}</div>
                      <div className="result-data">{JSON.stringify(item, null, 2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
