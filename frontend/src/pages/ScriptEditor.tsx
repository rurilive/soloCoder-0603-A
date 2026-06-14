import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { scriptApi, executeApi } from '../services/api';
import type { ScrapeRules, ExecuteResult } from '../types';

const defaultCode = `import requests
from bs4 import BeautifulSoup
import time

log("开始执行爬虫...")
log(f"起始URL: {rules.start_urls}")

headers = {
    "User-Agent": rules.user_agent,
    **rules.custom_headers
}

for url in rules.start_urls:
    try:
        log(f"正在抓取: {url}")
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")
        title = soup.title.string if soup.title else "No title"

        save_item({
            "title": title,
            "url": url,
            "status_code": response.status_code
        }, url)

        time.sleep(rules.delay)

    except Exception as e:
        log(f"抓取失败 {url}: {str(e)}")

log(f"抓取完成，共抓取 {len(results)} 条数据")
`;

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

export default function ScriptEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState(defaultCode);
  const [scrapeRules, setScrapeRules] = useState<ScrapeRules>(defaultRules);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecuteResult | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'rules' | 'result'>('editor');
  const [startUrl, setStartUrl] = useState('');
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  useEffect(() => {
    if (isEditing) {
      loadScript();
    }
  }, [id]);

  const loadScript = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await scriptApi.get(parseInt(id));
      const script = res.data;
      setName(script.name);
      setDescription(script.description);
      setCode(script.code);
    } catch (error) {
      console.error('Failed to load script:', error);
      alert('加载脚本失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('请输入脚本名称');
      return;
    }
    setLoading(true);
    try {
      if (isEditing) {
        await scriptApi.update(parseInt(id!), { name, description, code });
      } else {
        await scriptApi.create({ name, description, code });
      }
      navigate('/scripts');
    } catch (error) {
      console.error('Failed to save script:', error);
      alert('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    setExecuting(true);
    setExecutionResult(null);
    setActiveTab('result');
    try {
      const res = await executeApi.executeCode(code, scrapeRules);
      setExecutionResult(res.data);
    } catch (error: any) {
      console.error('Failed to execute script:', error);
      setExecutionResult({
        job_id: 0,
        status: 'failed',
        items_scraped: 0,
        duration: 0,
        results: [],
        logs: [],
        error: error.response?.data?.detail || error.message || '执行失败',
      });
    } finally {
      setExecuting(false);
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

  if (loading && isEditing) {
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
        <h1 className="page-title">{isEditing ? '编辑脚本' : '创建脚本'}</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/scripts')}>
            取消
          </button>
          <button className="btn btn-success" onClick={handleRun} disabled={executing}>
            {executing ? '执行中...' : '▶ 运行测试'}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">脚本名称</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入脚本名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">描述</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入脚本描述（可选）"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${activeTab === 'editor' ? 'active' : ''}`} onClick={() => setActiveTab('editor')}>
            代码编辑
          </button>
          <button className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
            抓取规则
          </button>
          <button className={`tab ${activeTab === 'result' ? 'active' : ''}`} onClick={() => setActiveTab('result')}>
            执行结果
          </button>
        </div>

        {activeTab === 'editor' && (
          <div className="card">
            <div className="form-group">
              <label className="form-label">Python 代码</label>
              <div className="form-hint" style={{ marginBottom: '12px' }}>
                可用变量：<code className="mono">rules</code>（抓取规则配置），可用函数：<code className="mono">save_item(data, url)</code>（保存数据），<code className="mono">log(message)</code>（输出日志）
              </div>
              <div className="editor-container">
                <Editor
                  height="100%"
                  language="python"
                  theme="vs-dark"
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="card">
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
          </div>
        )}

        {activeTab === 'result' && (
          <div className="card">
            {executing ? (
              <div className="empty-state">
                <div className="empty-state-icon">⚙️</div>
                <div className="empty-state-title">正在执行...</div>
                <p>爬虫正在运行，请稍候</p>
              </div>
            ) : executionResult ? (
              <div>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>状态</span>
                    <div>
                      <span className={`status-badge status-${executionResult.status}`}>
                        {executionResult.status === 'completed' ? '成功' : '失败'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>抓取数量</span>
                    <div style={{ fontSize: '24px', fontWeight: '600' }}>{executionResult.items_scraped}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>耗时</span>
                    <div style={{ fontSize: '24px', fontWeight: '600' }}>{executionResult.duration}s</div>
                  </div>
                </div>

                {executionResult.error && (
                  <div className="form-group">
                    <label className="form-label">错误信息</label>
                    <div className="logs-container" style={{ color: 'var(--danger)' }}>
                      {executionResult.error}
                    </div>
                  </div>
                )}

                {executionResult.logs.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">执行日志</label>
                    <div className="logs-container">
                      {executionResult.logs.map((log, index) => (
                        <div key={index} className={`log-line ${log.includes('ERROR') ? 'error' : ''}`}>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {executionResult.results.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">抓取结果</label>
                    <div className="results-preview">
                      {executionResult.results.map((item, index) => (
                        <div key={index} className="result-item">
                          <div className="result-url">{item.url || '无 URL'}</div>
                          <div className="result-data">{JSON.stringify(item.data, null, 2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">▶️</div>
                <div className="empty-state-title">点击运行测试</div>
                <p>运行爬虫脚本以查看执行结果</p>
                <button className="btn btn-success btn-lg" onClick={handleRun}>
                  运行测试
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
