import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { taskApi } from '../services/api';
import type { SpiderTask } from '../types';

export default function TaskList() {
  const [tasks, setTasks] = useState<SpiderTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTask, setRunningTask] = useState<number | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const res = await taskApi.list();
      setTasks(res.data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async (id: number) => {
    if (!confirm('确定要立即执行此任务吗？')) return;
    setRunningTask(id);
    try {
      await taskApi.run(id);
      alert('任务执行完成！');
      loadTasks();
    } catch (error: any) {
      console.error('Failed to run task:', error);
      alert(`执行失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setRunningTask(null);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await taskApi.toggle(id);
      loadTasks();
    } catch (error) {
      console.error('Failed to toggle task:', error);
      alert('操作失败');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (confirm(`确定要删除任务 "${name}" 吗？`)) {
      try {
        await taskApi.delete(id);
        loadTasks();
      } catch (error) {
        console.error('Failed to delete task:', error);
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
        <h1 className="page-title">任务管理</h1>
        <Link to="/tasks/new" className="btn btn-primary">
          + 创建任务
        </Link>
      </div>
      <div className="page-content">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏰</div>
            <div className="empty-state-title">暂无任务</div>
            <p style={{ marginBottom: '20px' }}>创建你的第一个爬虫任务</p>
            <Link to="/tasks/new" className="btn btn-primary">
              创建任务
            </Link>
          </div>
        ) : (
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>任务名称</th>
                    <th>脚本</th>
                    <th>Cron 表达式</th>
                    <th>超时</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="mono">#{task.id}</td>
                      <td>{task.name}</td>
                      <td>{task.script?.name || '-'}</td>
                      <td className="mono">{task.cron_expression || '-'}</td>
                      <td>{task.timeout}s</td>
                      <td>
                        <span className={`status-badge ${task.is_enabled ? 'status-completed' : 'status-pending'}`}>
                          {task.is_enabled ? '已启用' : '已禁用'}
                        </span>
                      </td>
                      <td>{dayjs(task.updated_at).format('YYYY-MM-DD HH:mm:ss')}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleRun(task.id)}
                            disabled={runningTask === task.id}
                          >
                            {runningTask === task.id ? '执行中...' : '▶ 运行'}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleToggle(task.id)}
                          >
                            {task.is_enabled ? '⏸ 暂停' : '▶ 启用'}
                          </button>
                          <Link to={`/tasks/${task.id}`} className="btn btn-secondary btn-sm">
                            编辑
                          </Link>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(task.id, task.name)}
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

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Cron 表达式说明</h2>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '12px' }}>Cron 表达式格式：<code>分 时 日 月 周</code></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div><code>* * * * *</code> - 每分钟执行</div>
              <div><code>0 * * * *</code> - 每小时执行</div>
              <div><code>0 0 * * *</code> - 每天 0 点执行</div>
              <div><code>0 12 * * *</code> - 每天 12 点执行</div>
              <div><code>0 0 * * 1</code> - 每周一 0 点执行</div>
              <div><code>0 0 1 * *</code> - 每月 1 号 0 点执行</div>
              <div><code>*/5 * * * *</code> - 每 5 分钟执行</div>
              <div><code>0 9-18 * * *</code> - 每天 9-18 点每小时执行</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
