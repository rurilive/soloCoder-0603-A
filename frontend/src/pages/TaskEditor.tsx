import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { taskApi, scriptApi, cleaningApi } from '../services/api';
import type { SpiderScript, ScrapeRules, CleaningPipeline } from '../types';

const defaultRules: ScrapeRules = {
  start_urls: ['https://example.com'],
  allowed_domains: [],
  follow_links: false,
  max_pages: 10,
  delay: 0.5,
  user_agent: 'Mozilla/5.0 (compatible; SpiderPlatform/1.0)',
  custom_headers: {},
  extract_patterns: {},
};

export default function TaskEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scriptId, setScriptId] = useState<number | ''>('');
  const [cleaningPipelineId, setCleaningPipelineId] = useState<number | ''>('');
  const [cronExpression, setCronExpression] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [timeout, setTimeout] = useState(60);
  const [maxRetries, setMaxRetries] = useState(3);
  const [scrapeRules, setScrapeRules] = useState<ScrapeRules>(defaultRules);
  const [scripts, setScripts] = useState<SpiderScript[]>([]);
  const [cleaningPipelines, setCleaningPipelines] = useState<CleaningPipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startUrl, setStartUrl] = useState('');
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [patternKey, setPatternKey] = useState('');
  const [patternValue, setPatternValue] = useState('');

  useEffect(() => {
    loadScripts();
    loadCleaningPipelines();
    if (isEditing) {
      loadTask();
    }
  }, [id]);

  const loadScripts = async () => {
    try {
      const res = await scriptApi.list();
      setScripts(res.data);
    } catch (error) {
      console.error('Failed to load scripts:', error);
    }
  };

  const loadCleaningPipelines = async () => {
    try {
      const res = await cleaningApi.listPipelines();
      setCleaningPipelines(res.data);
    } catch (error) {
      console.error('Failed to load cleaning pipelines:', error);
    }
  };

  const loadTask = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await taskApi.get(parseInt(id));
      const task = res.data;
      setName(task.name);
      setDescription(task.description);
      setScriptId(task.script_id);
      setCleaningPipelineId(task.cleaning_pipeline_id ?? '');
      setCronExpression(task.cron_expression);
      setIsEnabled(task.is_enabled);
      setTimeout(task.timeout);
      setMaxRetries(task.max_retries);
      setScrapeRules(task.scrape_rules);
    } catch (error) {
      console.error('Failed to load task:', error);
      alert('加载任务失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('请输入任务名称');
      return;
    }
    if (!scriptId) {
      alert('请选择关联脚本');
      return;
    }

    setSaving(true);
    try {
      const taskData = {
        name,
        description,
        script_id: Number(scriptId),
        cleaning_pipeline_id: cleaningPipelineId ? Number(cleaningPipelineId) : undefined,
        cron_expression: cronExpression,
        is_enabled: isEnabled,
        scrape_rules: scrapeRules,
        timeout,
        max_retries: maxRetries,
      };

      if (isEditing) {
        await taskApi.update(parseInt(id!), taskData);
      } else {
        await taskApi.create(taskData);
      }
      navigate('/tasks');
    } catch (error: any) {
      console.error('Failed to save task:', error);
      alert(`保存失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const addStartUrl = () => {
    if (startUrl.trim()) {
      setScrapeRules({ ...scrapeRules, start_urls: [...scrapeRules.start_urls, startUrl.trim()] });
      setStartUrl('');
    }
  };

  const removeStartUrl = (index: number) => {
    setScrapeRules({
      ...scrapeRules,
      start_urls: scrapeRules.start_urls.filter((_, i) => i !== index),
    });
  };

  const addHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      setScrapeRules({
        ...scrapeRules,
        custom_headers: { ...scrapeRules.custom_headers, [headerKey.trim()]: headerValue.trim() },
      });
      setHeaderKey('');
      setHeaderValue('');
    }
  };

  const removeHeader = (key: string) => {
    const newHeaders = { ...scrapeRules.custom_headers };
    delete newHeaders[key];
    setScrapeRules({ ...scrapeRules, custom_headers: newHeaders });
  };

  const addPattern = () => {
    if (patternKey.trim() && patternValue.trim()) {
      setScrapeRules({
        ...scrapeRules,
        extract_patterns: { ...scrapeRules.extract_patterns, [patternKey.trim()]: patternValue.trim() },
      });
      setPatternKey('');
      setPatternValue('');
    }
  };

  const removePattern = (key: string) => {
    const newPatterns = { ...scrapeRules.extract_patterns };
    delete newPatterns[key];
    setScrapeRules({ ...scrapeRules, extract_patterns: newPatterns });
  };

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
        <h1 className="page-title">{isEditing ? '编辑任务' : '创建任务'}</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/tasks')}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      <div className="page-content">
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '20px' }}>基本信息</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">任务名称 *</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入任务名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">关联脚本 *</label>
              <select
                className="form-select"
                value={scriptId}
                onChange={(e) => setScriptId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">选择脚本</option>
                {scripts.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.name}
                  </option>
                ))}
              </select>
              {scripts.length === 0 && (
                <div className="form-hint">
                  暂无脚本，请先<a href="/scripts/new" target="_blank">创建脚本</a>
                </div>
              )}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                清洗管道
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 'normal', marginLeft: '8px' }}>
                  （可选，对抓取结果进行清洗）
                </span>
              </label>
              <select
                className="form-select"
                value={cleaningPipelineId}
                onChange={(e) => setCleaningPipelineId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">不使用清洗管道</option>
                {cleaningPipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name} ({pipeline.rules?.length || 0} 条规则)
                  </option>
                ))}
              </select>
              {cleaningPipelines.length > 0 && (
                <div className="form-hint">
                  <a href="/cleaning" target="_blank">管理清洗管道</a>
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">描述</label>
            <textarea
              className="form-textarea"
              placeholder="输入任务描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: '60px' }}
            />
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '20px' }}>调度配置</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                Cron 表达式
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 'normal', marginLeft: '8px' }}>
                  （UTC 时区）
                </span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="如：0 0 * * *（每天0点 UTC 执行）"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
              />
              <div className="form-hint">留空则不自动调度，需手动执行。时间使用 UTC 时区。</div>
            </div>
            <div className="form-group">
              <label className="form-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  启用任务
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => setIsEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </span>
              </label>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">超时时间（秒）</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={timeout}
                onChange={(e) => setTimeout(parseInt(e.target.value) || 60)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">最大重试次数</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={maxRetries}
                onChange={(e) => setMaxRetries(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '20px' }}>抓取规则</h3>
          <div className="form-group">
            <label className="form-label">起始 URL</label>
            <div className="rule-item">
              <input
                type="text"
                className="form-input"
                placeholder="输入 URL，如 https://example.com"
                value={startUrl}
                onChange={(e) => setStartUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addStartUrl()}
              />
              <button className="btn btn-secondary" onClick={addStartUrl}>
                添加
              </button>
            </div>
            <div style={{ marginTop: '8px' }}>
              {scrapeRules.start_urls.length === 0 ? (
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>暂无起始 URL</span>
              ) : (
                scrapeRules.start_urls.map((url, index) => (
                  <div key={index} className="rule-item">
                    <input type="text" className="form-input" value={url} readOnly />
                    <button className="btn btn-danger btn-sm" onClick={() => removeStartUrl(index)}>
                      删除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">User-Agent</label>
              <input
                type="text"
                className="form-input"
                value={scrapeRules.user_agent}
                onChange={(e) => setScrapeRules({ ...scrapeRules, user_agent: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">请求延迟（秒）</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="form-input"
                value={scrapeRules.delay}
                onChange={(e) => setScrapeRules({ ...scrapeRules, delay: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">最大页数</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={scrapeRules.max_pages}
                onChange={(e) => setScrapeRules({ ...scrapeRules, max_pages: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  自动追踪链接
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={scrapeRules.follow_links}
                      onChange={(e) => setScrapeRules({ ...scrapeRules, follow_links: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">自定义请求头</label>
            <div className="kv-pair">
              <input
                type="text"
                className="form-input"
                placeholder="Header 名称"
                value={headerKey}
                onChange={(e) => setHeaderKey(e.target.value)}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Header 值"
                value={headerValue}
                onChange={(e) => setHeaderValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addHeader()}
              />
              <button className="btn btn-secondary" onClick={addHeader}>
                添加
              </button>
            </div>
            <div style={{ marginTop: '8px' }}>
              {Object.entries(scrapeRules.custom_headers).length === 0 ? (
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>暂无自定义请求头</span>
              ) : (
                Object.entries(scrapeRules.custom_headers).map(([key, value]) => (
                  <div key={key} className="kv-pair">
                    <input type="text" className="form-input" value={key} readOnly />
                    <input type="text" className="form-input" value={value} readOnly />
                    <button className="btn btn-danger btn-sm" onClick={() => removeHeader(key)}>
                      删除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              提取规则
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 'normal', marginLeft: '8px' }}>
                （CSS 选择器，自动提取匹配元素文本）
              </span>
            </label>
            <div className="kv-pair">
              <input
                type="text"
                className="form-input"
                placeholder="规则名称"
                value={patternKey}
                onChange={(e) => setPatternKey(e.target.value)}
              />
              <input
                type="text"
                className="form-input"
                placeholder="CSS 选择器或正则表达式"
                value={patternValue}
                onChange={(e) => setPatternValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addPattern()}
              />
              <button className="btn btn-secondary" onClick={addPattern}>
                添加
              </button>
            </div>
            <div style={{ marginTop: '8px' }}>
              {Object.entries(scrapeRules.extract_patterns).length === 0 ? (
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>暂无提取规则</span>
              ) : (
                Object.entries(scrapeRules.extract_patterns).map(([key, value]) => (
                  <div key={key} className="kv-pair">
                    <input type="text" className="form-input" value={key} readOnly />
                    <input type="text" className="form-input" value={value} readOnly />
                    <button className="btn btn-danger btn-sm" onClick={() => removePattern(key)}>
                      删除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
