import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { debugApi, scriptApi } from '../services/api';
import type { DebugSessionState, SpiderScript, ScrapeRules } from '../types';

const defaultCode = `# 调试模式示例脚本
# 使用下方控制按钮进行单步调试

log("开始调试...")

# 示例：简单的页面抓取
url = rules.start_urls[0] if rules.start_urls else "https://example.com"
log(f"准备抓取: {url}")

soup = fetch_page(url)
if soup:
    title = soup.title.string if soup.title else "No title"
    log(f"页面标题: {title}")
    save_item({"title": title, "url": url}, url)

log("调试结束")
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

export default function Debugger() {
  const { scriptId } = useParams();
  const navigate = useNavigate();

  const [code, setCode] = useState(defaultCode);
  const [scrapeRules, setScrapeRules] = useState<ScrapeRules>(defaultRules);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [debugState, setDebugState] = useState<DebugSessionState | null>(null);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [scripts, setScripts] = useState<SpiderScript[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<number | ''>('');
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [startUrl, setStartUrl] = useState('');
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadScripts();
    if (scriptId) {
      loadScript(parseInt(scriptId));
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [scriptId]);

  const loadScripts = async () => {
    try {
      const res = await scriptApi.list();
      setScripts(res.data);
    } catch (error) {
      console.error('Failed to load scripts:', error);
    }
  };

  const loadScript = async (id: number) => {
    try {
      const res = await scriptApi.get(id);
      setCode(res.data.code);
      setSelectedScriptId(id);
    } catch (error) {
      console.error('Failed to load script:', error);
    }
  };

  const handleScriptSelect = (id: number | '') => {
    setSelectedScriptId(id);
    if (id) {
      loadScript(id);
    }
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        const lineNumber = e.target.position.lineNumber;
        toggleBreakpoint(lineNumber);
      }
    });

    editor.addAction({
      id: 'toggle-breakpoint',
      label: 'Toggle Breakpoint',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB],
      run: () => {
        const position = editor.getPosition();
        if (position) {
          toggleBreakpoint(position.lineNumber);
        }
      },
    });
  };

  const toggleBreakpoint = (lineNumber: number) => {
    setBreakpoints((prev) => {
      const exists = prev.includes(lineNumber);
      const newBreakpoints = exists
        ? prev.filter((l) => l !== lineNumber)
        : [...prev, lineNumber];

      updateBreakpointDecorations(newBreakpoints);
      return newBreakpoints;
    });
  };

  const updateBreakpointDecorations = useCallback((bps: number[]) => {
    if (!editorRef.current || !monacoRef.current) return;

    const decorations = bps.map((line) => ({
      range: new monacoRef.current.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'breakpoint-glyph',
        linesDecorationsClassName: 'breakpoint-line',
      },
    }));

    if (debugState?.current_line) {
      decorations.push({
        range: new monacoRef.current.Range(debugState.current_line, 1, debugState.current_line, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: '',
          linesDecorationsClassName: 'current-line-decoration',
        },
      });
    }

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      decorations
    );
  }, [debugState]);

  useEffect(() => {
    updateBreakpointDecorations(breakpoints);
  }, [breakpoints, debugState, updateBreakpointDecorations]);

  const startDebugging = async () => {
    if (!code.trim()) {
      alert('请输入要调试的代码');
      return;
    }
    setStarting(true);
    try {
      const sessionRes = await debugApi.createSession({
        script_id: selectedScriptId ? Number(selectedScriptId) : undefined,
        code,
        scrape_rules: scrapeRules,
      });
      setSessionId(sessionRes.data.session_id);

      const stateRes = await debugApi.startSession(sessionRes.data.session_id);
      setDebugState(stateRes.data);

      startPolling(sessionRes.data.session_id);
    } catch (error: any) {
      console.error('Failed to start debugging:', error);
      alert(`启动调试失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setStarting(false);
    }
  };

  const startPolling = (sid: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const res = await debugApi.getState(sid);
        setDebugState(res.data);
        if (res.data.status === 'finished' || res.data.status === 'error' || res.data.status === 'stopped') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (error) {
        console.error('Failed to poll state:', error);
      }
    }, 500);
  };

  const executeCommand = async (command: 'step' | 'continue' | 'stop' | 'next') => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await debugApi.executeCommand(sessionId, {
        session_id: sessionId,
        command,
        breakpoints,
      });
      setDebugState(res.data);

      if (command === 'stop') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (error: any) {
      console.error('Failed to execute command:', error);
      alert(`执行失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetDebugger = async () => {
    if (sessionId) {
      try {
        await debugApi.stopSession(sessionId);
      } catch (e) {
        // ignore
      }
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setSessionId(null);
    setDebugState(null);
    setBreakpoints([]);
    decorationsRef.current = [];
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

  const isDebugging = debugState && debugState.status !== 'finished' && debugState.status !== 'error' && debugState.status !== 'stopped';

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">🐛 脚本调试器</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/scripts')}>
            返回脚本列表
          </button>
          {sessionId && (
            <button className="btn btn-danger" onClick={resetDebugger}>
              🔄 重置调试
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {!sessionId ? (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '20px' }}>开始调试</h3>
            <div className="form-group">
              <label className="form-label">选择已有脚本（可选）</label>
              <select
                className="form-select"
                value={selectedScriptId}
                onChange={(e) => handleScriptSelect(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">不选择，使用下方代码</option>
                {scripts.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">
                调试代码
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 'normal', marginLeft: '8px' }}>
                  点击行号添加/移除断点，按 Ctrl+B 切换断点
                </span>
              </label>
              <div className="editor-container" style={{ height: '400px' }}>
                <Editor
                  height="100%"
                  language="python"
                  theme="vs-dark"
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  onMount={handleEditorMount}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    glyphMargin: true,
                    lineNumbers: 'on',
                  }}
                />
              </div>
            </div>
            <div className="form-group">
              <button
                className="btn btn-secondary"
                onClick={() => setShowRulesPanel(!showRulesPanel)}
              >
                {showRulesPanel ? '▼ 隐藏抓取规则' : '▶ 配置抓取规则'}
              </button>
            </div>
            {showRulesPanel && (
              <div className="card" style={{ margin: '10px 0', padding: '15px' }}>
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
            <div style={{ marginTop: '20px' }}>
              <button
                className="btn btn-success btn-lg"
                onClick={startDebugging}
                disabled={starting}
              >
                {starting ? '启动中...' : '▶ 开始调试'}
              </button>
            </div>
          </div>
        ) : (
          <div className="debugger-layout">
            <div className="debugger-main">
              <div className="debugger-toolbar">
                <div className="debugger-status">
                  <span className={`status-dot status-${debugState?.status || 'idle'}`}></span>
                  <span>
                    状态: {debugState?.status === 'running' ? '运行中' :
                            debugState?.status === 'paused' ? '已暂停' :
                            debugState?.status === 'finished' ? '已完成' :
                            debugState?.status === 'error' ? '出错' :
                            debugState?.status === 'stopped' ? '已停止' : '空闲'}
                  </span>
                  {debugState?.current_line && debugState.current_line > 0 && (
                    <span style={{ marginLeft: '20px' }}>当前行: {debugState.current_line}</span>
                  )}
                </div>
                <div className="debugger-controls">
                  <button
                    className="btn btn-primary"
                    onClick={() => executeCommand('step')}
                    disabled={!isDebugging || loading}
                  >
                    ⏭ 单步执行
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={() => executeCommand('continue')}
                    disabled={!isDebugging || loading}
                  >
                    ▶ 继续执行
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => executeCommand('stop')}
                    disabled={!isDebugging || loading}
                  >
                    ⏹ 停止
                  </button>
                </div>
              </div>

              <div className="debugger-editor-container">
                <Editor
                  height="100%"
                  language="python"
                  theme="vs-dark"
                  value={code}
                  onMount={handleEditorMount}
                  options={{
                    fontSize: 14,
                    readOnly: true,
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    glyphMargin: true,
                    lineNumbers: 'on',
                  }}
                />
              </div>

              <div className="debugger-panels">
                <div className="debugger-panel">
                  <div className="debugger-panel-header">
                    <span>📤 输出日志</span>
                  </div>
                  <div className="debugger-panel-content">
                    {debugState?.output && debugState.output.length > 0 ? (
                      debugState.output.map((line, index) => (
                        <div
                          key={index}
                          className={`log-line ${line.includes('ERROR') ? 'error' : ''}`}
                        >
                          {line}
                        </div>
                      ))
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>暂无输出</span>
                    )}
                  </div>
                </div>

                <div className="debugger-panel">
                  <div className="debugger-panel-header">
                    <span>📊 当前变量</span>
                  </div>
                  <div className="debugger-panel-content">
                    {debugState?.variables && Object.keys(debugState.variables).length > 0 ? (
                      Object.entries(debugState.variables).map(([key, value]) => (
                        <div key={key} className="variable-row">
                          <span className="variable-name">{key}</span>
                          <span className="variable-value">{String(value)}</span>
                        </div>
                      ))
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>暂无变量</span>
                    )}
                  </div>
                </div>

                <div className="debugger-panel">
                  <div className="debugger-panel-header">
                    <span>📍 断点 ({breakpoints.length})</span>
                  </div>
                  <div className="debugger-panel-content">
                    {breakpoints.length > 0 ? (
                      breakpoints.map((line) => (
                        <div key={line} className="breakpoint-row">
                          <span>第 {line} 行</span>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => toggleBreakpoint(line)}
                          >
                            删除
                          </button>
                        </div>
                      ))
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>暂无断点</span>
                    )}
                  </div>
                </div>
              </div>

              {debugState?.error && (
                <div className="debugger-error">
                  <strong>❌ 错误:</strong>
                  <pre>{debugState.error}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .breakpoint-glyph {
          background: #e74c3c;
          border-radius: 50%;
          width: 10px !important;
          height: 10px !important;
          margin-left: 6px;
          margin-top: 4px;
        }
        .breakpoint-line {
          background: rgba(231, 76, 60, 0.1) !important;
        }
        .current-line-decoration {
          background: rgba(241, 196, 15, 0.3) !important;
          border-left: 3px solid #f1c40f !important;
        }
        .debugger-layout {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .debugger-main {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .debugger-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          background: var(--card-bg);
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }
        .debugger-status {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .status-dot.status-running { background: #2ecc71; }
        .status-dot.status-paused { background: #f1c40f; }
        .status-dot.status-finished { background: #3498db; }
        .status-dot.status-error { background: #e74c3c; }
        .status-dot.status-stopped { background: #95a5a6; }
        .status-dot.status-idle { background: #95a5a6; }
        .debugger-controls {
          display: flex;
          gap: 10px;
        }
        .debugger-editor-container {
          height: 400px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border-color);
        }
        .debugger-panels {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 15px;
        }
        .debugger-panel {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
        }
        .debugger-panel-header {
          padding: 12px 15px;
          background: var(--header-bg);
          border-bottom: 1px solid var(--border-color);
          font-weight: 600;
          font-size: 13px;
        }
        .debugger-panel-content {
          padding: 15px;
          max-height: 250px;
          overflow-y: auto;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 12px;
        }
        .variable-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          border-bottom: 1px solid var(--border-color);
        }
        .variable-name {
          color: var(--primary);
          font-weight: 600;
        }
        .variable-value {
          color: var(--text-secondary);
          word-break: break-all;
          max-width: 60%;
        }
        .breakpoint-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          border-bottom: 1px solid var(--border-color);
        }
        .debugger-error {
          padding: 15px;
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid var(--danger);
          border-radius: 8px;
          color: var(--danger);
        }
        .debugger-error pre {
          margin: 10px 0 0 0;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .crawl-type-options {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
          margin-top: 10px;
        }
        .crawl-type-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          border: 2px solid var(--border-color);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .crawl-type-option:hover {
          border-color: var(--primary);
          background: rgba(52, 152, 219, 0.05);
        }
        .crawl-type-option.selected {
          border-color: var(--primary);
          background: rgba(52, 152, 219, 0.1);
        }
        .crawl-type-option input {
          display: none;
        }
        .crawl-type-icon {
          font-size: 32px;
          margin-bottom: 10px;
        }
        .crawl-type-name {
          font-weight: 600;
          margin-bottom: 5px;
        }
        .crawl-type-desc {
          font-size: 12px;
          color: var(--text-secondary);
          text-align: center;
        }
        .field-config-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
          padding: 10px;
          background: var(--bg-secondary);
          border-radius: 6px;
        }
      `}</style>
    </>
  );
}
