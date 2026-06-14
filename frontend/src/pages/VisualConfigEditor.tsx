import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { visualConfigApi } from '../services/api';
import type {
  ListCrawlConfig,
  DetailCrawlConfig,
  CommonCrawlConfig,
  FieldSelector,
  SelectorTestResult,
  PreviewScriptResponse,
} from '../types';

const defaultListConfig: ListCrawlConfig = {
  list_url: '',
  item_selector: '',
  url_selector: '',
  url_attribute: 'href',
  pagination_type: 'none',
  pagination_selector: '',
  max_pages: 10,
  fields: [],
};

const defaultDetailConfig: DetailCrawlConfig = {
  fields: [],
  follow_links: false,
  link_selector: '',
};

const defaultCommonConfig: CommonCrawlConfig = {
  allowed_domains: [],
  delay: 0.5,
  user_agent: 'Mozilla/5.0 (compatible; SpiderPlatform/1.0)',
  custom_headers: {},
  timeout: 30,
};

const attributeOptions = [
  { value: 'text', label: '文本内容' },
  { value: 'href', label: '链接 (href)' },
  { value: 'src', label: '图片/资源 (src)' },
  { value: 'title', label: '标题 (title)' },
  { value: 'class', label: '类名 (class)' },
  { value: 'id', label: 'ID (id)' },
];

const paginationOptions = [
  { value: 'none', label: '无翻页' },
  { value: 'next_page', label: '下一页按钮' },
  { value: 'page_number', label: '页码导航' },
  { value: 'infinite_scroll', label: '无限滚动' },
];

export default function VisualConfigEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id && id !== 'new';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [crawlType, setCrawlType] = useState<'list' | 'detail' | 'list_detail'>('list');
  const [listConfig, setListConfig] = useState<ListCrawlConfig>(defaultListConfig);
  const [detailConfig, setDetailConfig] = useState<DetailCrawlConfig>(defaultDetailConfig);
  const [commonConfig, setCommonConfig] = useState<CommonCrawlConfig>(defaultCommonConfig);

  const [activeTab, setActiveTab] = useState<'basic' | 'list' | 'detail' | 'common' | 'preview'>('basic');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewScriptResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [testUrl, setTestUrl] = useState('');
  const [testSelector, setTestSelector] = useState('');
  const [testAttribute, setTestAttribute] = useState('text');
  const [testResult, setTestResult] = useState<SelectorTestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [domainInput, setDomainInput] = useState('');

  useEffect(() => {
    if (isEditing) {
      loadConfig();
    }
  }, [id]);

  const loadConfig = async () => {
    if (!id || id === 'new') return;
    setLoading(true);
    try {
      const res = await visualConfigApi.get(parseInt(id));
      const config = res.data;
      setName(config.name);
      setDescription(config.description);
      setCrawlType(config.crawl_type);
      setListConfig(config.list_config);
      setDetailConfig(config.detail_config);
      setCommonConfig(config.common_config);
    } catch (error) {
      console.error('Failed to load config:', error);
      alert('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('请输入配置名称');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name,
        description,
        crawl_type: crawlType,
        list_config: listConfig,
        detail_config: detailConfig,
        common_config: commonConfig,
      };

      if (isEditing) {
        await visualConfigApi.update(parseInt(id!), data);
      } else {
        await visualConfigApi.create(data);
      }
      navigate('/visual-config');
    } catch (error: any) {
      console.error('Failed to save config:', error);
      alert(`保存失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!name.trim()) {
      alert('请先输入配置名称');
      return;
    }
    setPreviewLoading(true);
    try {
      if (isEditing) {
        const res = await visualConfigApi.previewScript(parseInt(id!));
        setPreviewData(res.data);
      } else {
        const createRes = await visualConfigApi.create({
          name,
          description,
          crawl_type: crawlType,
          list_config: listConfig,
          detail_config: detailConfig,
          common_config: commonConfig,
        });
        const previewRes = await visualConfigApi.previewScript(createRes.data.id);
        setPreviewData(previewRes.data);
      }
      setActiveTab('preview');
    } catch (error: any) {
      console.error('Failed to preview script:', error);
      alert(`预览失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!name.trim()) {
      alert('请先输入配置名称');
      return;
    }
    setSaving(true);
    try {
      let configId: number;
      if (isEditing) {
        configId = parseInt(id!);
      } else {
        const createRes = await visualConfigApi.create({
          name,
          description,
          crawl_type: crawlType,
          list_config: listConfig,
          detail_config: detailConfig,
          common_config: commonConfig,
        });
        configId = createRes.data.id;
      }
      const res = await visualConfigApi.generateScript(configId);
      alert(`脚本生成成功！脚本ID: ${res.data.script_id}`);
      navigate(`/scripts/${res.data.script_id}`);
    } catch (error: any) {
      console.error('Failed to generate script:', error);
      alert(`生成失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSelector = async () => {
    if (!testUrl.trim() || !testSelector.trim()) {
      alert('请输入测试URL和选择器');
      return;
    }
    setTestLoading(true);
    try {
      const res = await visualConfigApi.testSelector({
        url: testUrl,
        selector: testSelector,
        attribute: testAttribute,
      });
      setTestResult(res.data);
    } catch (error) {
      console.error('Failed to test selector:', error);
      alert('测试失败');
    } finally {
      setTestLoading(false);
    }
  };

  const addListField = () => {
    const newField: FieldSelector = {
      name: `字段${listConfig.fields.length + 1}`,
      selector: '',
      attribute: 'text',
      required: false,
      description: '',
    };
    setListConfig({ ...listConfig, fields: [...listConfig.fields, newField] });
  };

  const updateListField = (index: number, key: keyof FieldSelector, value: any) => {
    const newFields = [...listConfig.fields];
    newFields[index] = { ...newFields[index], [key]: value };
    setListConfig({ ...listConfig, fields: newFields });
  };

  const removeListField = (index: number) => {
    const newFields = listConfig.fields.filter((_, i) => i !== index);
    setListConfig({ ...listConfig, fields: newFields });
  };

  const addDetailField = () => {
    const newField: FieldSelector = {
      name: `字段${detailConfig.fields.length + 1}`,
      selector: '',
      attribute: 'text',
      required: false,
      description: '',
    };
    setDetailConfig({ ...detailConfig, fields: [...detailConfig.fields, newField] });
  };

  const updateDetailField = (index: number, key: keyof FieldSelector, value: any) => {
    const newFields = [...detailConfig.fields];
    newFields[index] = { ...newFields[index], [key]: value };
    setDetailConfig({ ...detailConfig, fields: newFields });
  };

  const removeDetailField = (index: number) => {
    const newFields = detailConfig.fields.filter((_, i) => i !== index);
    setDetailConfig({ ...detailConfig, fields: newFields });
  };

  const addHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      setCommonConfig({
        ...commonConfig,
        custom_headers: { ...commonConfig.custom_headers, [headerKey.trim()]: headerValue.trim() },
      });
      setHeaderKey('');
      setHeaderValue('');
    }
  };

  const removeHeader = (key: string) => {
    const newHeaders = { ...commonConfig.custom_headers };
    delete newHeaders[key];
    setCommonConfig({ ...commonConfig, custom_headers: newHeaders });
  };

  const addDomain = () => {
    if (domainInput.trim() && !commonConfig.allowed_domains.includes(domainInput.trim())) {
      setCommonConfig({
        ...commonConfig,
        allowed_domains: [...commonConfig.allowed_domains, domainInput.trim()],
      });
      setDomainInput('');
    }
  };

  const removeDomain = (domain: string) => {
    setCommonConfig({
      ...commonConfig,
      allowed_domains: commonConfig.allowed_domains.filter((d) => d !== domain),
    });
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
        <h1 className="page-title">{isEditing ? '编辑可视化配置' : '新建可视化配置'}</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/visual-config')}>
            取消
          </button>
          <button className="btn btn-secondary" onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? '生成中...' : '📄 预览脚本'}
          </button>
          <button className="btn btn-success" onClick={handleGenerate} disabled={saving}>
            {saving ? '生成中...' : '✨ 生成脚本'}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'basic' ? 'active' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            基本信息
          </button>
          {(crawlType === 'list' || crawlType === 'list_detail') && (
            <button
              className={`tab ${activeTab === 'list' ? 'active' : ''}`}
              onClick={() => setActiveTab('list')}
            >
              列表页配置
            </button>
          )}
          {(crawlType === 'detail' || crawlType === 'list_detail') && (
            <button
              className={`tab ${activeTab === 'detail' ? 'active' : ''}`}
              onClick={() => setActiveTab('detail')}
            >
              详情页配置
            </button>
          )}
          <button
            className={`tab ${activeTab === 'common' ? 'active' : ''}`}
            onClick={() => setActiveTab('common')}
          >
            通用配置
          </button>
          <button
            className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            脚本预览
          </button>
        </div>

        {activeTab === 'basic' && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '20px' }}>基本信息</h3>
            <div className="form-group">
              <label className="form-label">配置名称 *</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入配置名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">描述</label>
              <textarea
                className="form-textarea"
                placeholder="输入配置描述（可选）"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ minHeight: '60px' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">抓取类型 *</label>
              <div className="crawl-type-options">
                <label
                  className={`crawl-type-option ${crawlType === 'list' ? 'selected' : ''}`}
                  onClick={() => setCrawlType('list')}
                >
                  <input type="radio" name="crawlType" value="list" checked={crawlType === 'list'} readOnly />
                  <div className="crawl-type-icon">📋</div>
                  <div className="crawl-type-name">列表页抓取</div>
                  <div className="crawl-type-desc">抓取列表页面的多条数据</div>
                </label>
                <label
                  className={`crawl-type-option ${crawlType === 'detail' ? 'selected' : ''}`}
                  onClick={() => setCrawlType('detail')}
                >
                  <input type="radio" name="crawlType" value="detail" checked={crawlType === 'detail'} readOnly />
                  <div className="crawl-type-icon">📄</div>
                  <div className="crawl-type-name">详情页抓取</div>
                  <div className="crawl-type-desc">抓取单个或多个详情页数据</div>
                </label>
                <label
                  className={`crawl-type-option ${crawlType === 'list_detail' ? 'selected' : ''}`}
                  onClick={() => setCrawlType('list_detail')}
                >
                  <input type="radio" name="crawlType" value="list_detail" checked={crawlType === 'list_detail'} readOnly />
                  <div className="crawl-type-icon">🔗</div>
                  <div className="crawl-type-name">列表+详情</div>
                  <div className="crawl-type-desc">先抓列表，再抓每个详情页</div>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'list' && (crawlType === 'list' || crawlType === 'list_detail') && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '20px' }}>列表页配置</h3>
            <div className="form-group">
              <label className="form-label">列表页 URL *</label>
              <input
                type="text"
                className="form-input"
                placeholder="如 https://example.com/list"
                value={listConfig.list_url}
                onChange={(e) => setListConfig({ ...listConfig, list_url: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">条目选择器 *</label>
              <input
                type="text"
                className="form-input"
                placeholder="CSS选择器，如 .item, .article"
                value={listConfig.item_selector}
                onChange={(e) => setListConfig({ ...listConfig, item_selector: e.target.value })}
              />
              <div className="form-hint">用于定位列表中的每个条目元素</div>
            </div>
            {crawlType === 'list_detail' && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">详情链接选择器</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="CSS选择器，如 a.title"
                    value={listConfig.url_selector}
                    onChange={(e) => setListConfig({ ...listConfig, url_selector: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">链接属性</label>
                  <select
                    className="form-select"
                    value={listConfig.url_attribute}
                    onChange={(e) => setListConfig({ ...listConfig, url_attribute: e.target.value })}
                  >
                    {attributeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">翻页方式</label>
                <select
                  className="form-select"
                  value={listConfig.pagination_type}
                  onChange={(e) =>
                    setListConfig({
                      ...listConfig,
                      pagination_type: e.target.value as any,
                    })
                  }
                >
                  {paginationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">最大页数</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={listConfig.max_pages}
                  onChange={(e) =>
                    setListConfig({ ...listConfig, max_pages: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
            {listConfig.pagination_type !== 'none' && (
              <div className="form-group">
                <label className="form-label">翻页选择器</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="CSS选择器，如 .next, .pagination a"
                  value={listConfig.pagination_selector}
                  onChange={(e) => setListConfig({ ...listConfig, pagination_selector: e.target.value })}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                提取字段
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 'normal', marginLeft: '8px' }}>
                  从每个列表条目中提取的字段
                </span>
              </label>
              {listConfig.fields.map((field, index) => (
                <div key={index} className="field-config-row">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="字段名"
                    value={field.name}
                    onChange={(e) => updateListField(index, 'name', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="CSS选择器"
                    value={field.selector}
                    onChange={(e) => updateListField(index, 'selector', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <select
                    className="form-select"
                    value={field.attribute}
                    onChange={(e) => updateListField(index, 'attribute', e.target.value)}
                    style={{ width: '120px' }}
                  >
                    {attributeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <label className="switch" style={{ margin: '0 10px' }}>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateListField(index, 'required', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '40px' }}>
                    {field.required ? '必填' : '可选'}
                  </span>
                  <button className="btn btn-danger btn-sm" onClick={() => removeListField(index)}>
                    删除
                  </button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={addListField} style={{ marginTop: '10px' }}>
                + 添加字段
              </button>
            </div>
          </div>
        )}

        {activeTab === 'detail' && (crawlType === 'detail' || crawlType === 'list_detail') && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '20px' }}>详情页配置</h3>
            <div className="form-group">
              <label className="form-label">
                提取字段
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 'normal', marginLeft: '8px' }}>
                  从详情页中提取的字段
                </span>
              </label>
              {detailConfig.fields.map((field, index) => (
                <div key={index} className="field-config-row">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="字段名"
                    value={field.name}
                    onChange={(e) => updateDetailField(index, 'name', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="CSS选择器"
                    value={field.selector}
                    onChange={(e) => updateDetailField(index, 'selector', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <select
                    className="form-select"
                    value={field.attribute}
                    onChange={(e) => updateDetailField(index, 'attribute', e.target.value)}
                    style={{ width: '120px' }}
                  >
                    {attributeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <label className="switch" style={{ margin: '0 10px' }}>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateDetailField(index, 'required', e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '40px' }}>
                    {field.required ? '必填' : '可选'}
                  </span>
                  <button className="btn btn-danger btn-sm" onClick={() => removeDetailField(index)}>
                    删除
                  </button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={addDetailField} style={{ marginTop: '10px' }}>
                + 添加字段
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  追踪页面链接
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={detailConfig.follow_links}
                      onChange={(e) => setDetailConfig({ ...detailConfig, follow_links: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </span>
              </label>
              {detailConfig.follow_links && (
                <input
                  type="text"
                  className="form-input"
                  placeholder="链接选择器，如 a.related"
                  value={detailConfig.link_selector}
                  onChange={(e) => setDetailConfig({ ...detailConfig, link_selector: e.target.value })}
                  style={{ marginTop: '10px' }}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'common' && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '20px' }}>通用配置</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">User-Agent</label>
                <input
                  type="text"
                  className="form-input"
                  value={commonConfig.user_agent}
                  onChange={(e) => setCommonConfig({ ...commonConfig, user_agent: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">请求延迟（秒）</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-input"
                  value={commonConfig.delay}
                  onChange={(e) =>
                    setCommonConfig({ ...commonConfig, delay: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">允许的域名</label>
              <div className="rule-item">
                <input
                  type="text"
                  className="form-input"
                  placeholder="如 example.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addDomain()}
                />
                <button className="btn btn-secondary" onClick={addDomain}>
                  添加
                </button>
              </div>
              <div style={{ marginTop: '8px' }}>
                {commonConfig.allowed_domains.length === 0 ? (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    留空则允许所有域名
                  </span>
                ) : (
                  commonConfig.allowed_domains.map((domain, index) => (
                    <div key={index} className="rule-item">
                      <input type="text" className="form-input" value={domain} readOnly />
                      <button className="btn btn-danger btn-sm" onClick={() => removeDomain(domain)}>
                        删除
                      </button>
                    </div>
                  ))
                )}
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
                {Object.entries(commonConfig.custom_headers).length === 0 ? (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    暂无自定义请求头
                  </span>
                ) : (
                  Object.entries(commonConfig.custom_headers).map(([key, value]) => (
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

        {activeTab === 'preview' && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '20px' }}>脚本预览</h3>
            {!previewData ? (
              <div className="empty-state">
                <div className="empty-state-icon">📄</div>
                <div className="empty-state-title">暂无预览</div>
                <p>点击"预览脚本"按钮生成预览</p>
                <button className="btn btn-primary" onClick={handlePreview} disabled={previewLoading}>
                  {previewLoading ? '生成中...' : '生成预览'}
                </button>
              </div>
            ) : (
              <div>
                <div className="form-group">
                  <label className="form-label">生成的 Python 代码</label>
                  <div className="editor-container">
                    <Editor
                      height="500px"
                      language="python"
                      theme="vs-dark"
                      value={previewData.code}
                      options={{
                        fontSize: 14,
                        readOnly: true,
                        minimap: { enabled: true },
                        wordWrap: 'on',
                      }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">抓取规则配置</label>
                  <pre className="logs-container">{JSON.stringify(previewData.scrape_rules, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="card" style={{ marginTop: '20px' }}>
          <h3 className="card-title" style={{ marginBottom: '20px' }}>🔍 CSS 选择器测试工具</h3>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">测试 URL</label>
              <input
                type="text"
                className="form-input"
                placeholder="输入要测试的页面URL"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">CSS 选择器</label>
              <input
                type="text"
                className="form-input"
                placeholder="如 .title, a.link"
                value={testSelector}
                onChange={(e) => setTestSelector(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">提取属性</label>
              <select
                className="form-select"
                value={testAttribute}
                onChange={(e) => setTestAttribute(e.target.value)}
              >
                {attributeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <button className="btn btn-primary" onClick={handleTestSelector} disabled={testLoading}>
              {testLoading ? '测试中...' : '🎯 测试选择器'}
            </button>
          </div>
          {testResult && (
            <div className="form-group">
              <label className="form-label">
                测试结果 - 匹配 {testResult.matches} 个元素
              </label>
              {testResult.success ? (
                <div className="results-preview">
                  {testResult.results.map((item) => (
                    <div key={item.index} className="result-item">
                      <div className="result-url">匹配 #{item.index + 1}</div>
                      <div className="result-data">
                        <strong>值：</strong>
                        {item.value || '(空)'}
                      </div>
                      <div className="result-data" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <strong>HTML：</strong>
                        {item.html}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="logs-container" style={{ color: 'var(--danger)' }}>
                  测试失败: {testResult.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
