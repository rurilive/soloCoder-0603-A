import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { cleaningApi } from '../services/api';
import type { CleaningPipeline } from '../types';

export default function CleaningPipelineList() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<CleaningPipeline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPipelines();
  }, []);

  const loadPipelines = async () => {
    setLoading(true);
    try {
      const res = await cleaningApi.listPipelines();
      setPipelines(res.data);
    } catch (error) {
      console.error('Failed to load pipelines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除此清洗管道吗？')) {
      return;
    }
    try {
      await cleaningApi.deletePipeline(id);
      setPipelines(pipelines.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Failed to delete pipeline:', error);
      alert('删除失败');
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
        <h1 className="page-title">数据清洗管道</h1>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/cleaning/new')}
        >
          + 新建管道
        </button>
      </div>
      <div className="page-content">
        <div className="card">
          {pipelines.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧹</div>
              <div className="empty-state-title">暂无清洗管道</div>
              <p>创建数据清洗管道，对抓取结果进行清洗和转换</p>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/cleaning/new')}
              >
                创建第一个管道
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>名称</th>
                    <th>描述</th>
                    <th>规则数量</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelines.map((pipeline) => (
                    <tr
                      key={pipeline.id}
                      className="clickable"
                      onClick={() => navigate(`/cleaning/${pipeline.id}`)}
                    >
                      <td className="mono">#{pipeline.id}</td>
                      <td className="font-medium">{pipeline.name}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {pipeline.description || '-'}
                      </td>
                      <td>
                        <span className="status-badge status-running" style={{ fontSize: '12px' }}>
                          {pipeline.rules?.length || 0} 条规则
                        </span>
                      </td>
                      <td>{dayjs(pipeline.updated_at).format('YYYY-MM-DD HH:mm:ss')}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/cleaning/${pipeline.id}`);
                            }}
                          >
                            编辑
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={(e) => handleDelete(pipeline.id, e)}
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
      </div>
    </>
  );
}
