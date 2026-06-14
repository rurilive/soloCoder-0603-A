import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { visualConfigApi } from '../services/api';
import type { VisualCrawlConfig } from '../types';

const crawlTypeLabels: Record<string, string> = {
  list: '列表页抓取',
  detail: '详情页抓取',
  list_detail: '列表+详情抓取',
};

export default function VisualConfigList() {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<VisualCrawlConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const res = await visualConfigApi.list();
      setConfigs(res.data);
    } catch (error) {
      console.error('Failed to load configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个配置吗？')) return;
    try {
      await visualConfigApi.delete(id);
      setConfigs(configs.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Failed to delete config:', error);
      alert('删除失败');
    }
  };

  const handleGenerateScript = async (id: number) => {
    try {
      const res = await visualConfigApi.generateScript(id);
      alert(`脚本生成成功！脚本ID: ${res.data.script_id}`);
      navigate(`/scripts/${res.data.script_id}`);
    } catch (error: any) {
      console.error('Failed to generate script:', error);
      alert(`生成脚本失败: ${error.response?.data?.detail || error.message}`);
    }
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
        <h1 className="page-title">可视化爬虫配置</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={() => navigate('/visual-config/new')}>
            + 新建配置
          </button>
        </div>
      </div>

      <div className="page-content">
        {configs.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🎛️</div>
              <div className="empty-state-title">暂无可视化配置</div>
              <p>通过图形化界面配置爬虫，无需编写代码</p>
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/visual-config/new')}>
                创建第一个配置
              </button>
            </div>
          </div>
        ) : (
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>描述</th>
                  <th>已生成脚本</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr key={config.id}>
                    <td>
                      <span className="font-medium">{config.name}</span>
                    </td>
                    <td>
                      <span className="status-badge status-completed">
                        {crawlTypeLabels[config.crawl_type] || config.crawl_type}
                      </span>
                    </td>
                    <td>{config.description || '-'}</td>
                    <td>
                      {config.generated_script_id ? (
                        <button
                          className="btn btn-link btn-sm"
                          onClick={() => navigate(`/scripts/${config.generated_script_id}`)}
                        >
                          查看脚本 #{config.generated_script_id}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>未生成</span>
                      )}
                    </td>
                    <td>{new Date(config.updated_at).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/visual-config/${config.id}`)}
                        >
                          编辑
                        </button>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleGenerateScript(config.id)}
                        >
                          生成脚本
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(config.id)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
