import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { scriptApi } from '../services/api';
import type { SpiderScript } from '../types';

export default function ScriptList() {
  const [scripts, setScripts] = useState<SpiderScript[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScripts();
  }, []);

  const loadScripts = async () => {
    try {
      const res = await scriptApi.list();
      setScripts(res.data);
    } catch (error) {
      console.error('Failed to load scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (confirm(`确定要删除脚本 "${name}" 吗？`)) {
      try {
        await scriptApi.delete(id);
        loadScripts();
      } catch (error) {
        console.error('Failed to delete script:', error);
        alert('删除失败');
      }
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
        <h1 className="page-title">脚本管理</h1>
        <Link to="/scripts/new" className="btn btn-primary">
          + 创建脚本
        </Link>
      </div>
      <div className="page-content">
        {scripts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-title">暂无脚本</div>
            <p style={{ marginBottom: '20px' }}>创建你的第一个爬虫脚本开始使用</p>
            <Link to="/scripts/new" className="btn btn-primary">
              创建脚本
            </Link>
          </div>
        ) : (
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>名称</th>
                    <th>描述</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {scripts.map((script) => (
                    <tr key={script.id}>
                      <td className="mono">#{script.id}</td>
                      <td>{script.name}</td>
                      <td>{script.description || '-'}</td>
                      <td>{dayjs(script.updated_at).format('YYYY-MM-DD HH:mm:ss')}</td>
                      <td>
                        <div className="action-buttons">
                          <Link to={`/scripts/${script.id}`} className="btn btn-secondary btn-sm">
                            编辑
                          </Link>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(script.id, script.name)}
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
          </div>
        )}
      </div>
    </>
  );
}
