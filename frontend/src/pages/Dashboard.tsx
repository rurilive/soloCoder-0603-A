import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { resultsApi, taskApi } from '../services/api';
import type { Stats, SpiderJob, SpiderTask } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentJobs, setRecentJobs] = useState<SpiderJob[]>([]);
  const [tasks, setTasks] = useState<SpiderTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, jobsRes, tasksRes] = await Promise.all([
        resultsApi.getStats(),
        resultsApi.listJobs(undefined, undefined, 10),
        taskApi.list(),
      ]);
      setStats(statsRes.data);
      setRecentJobs(jobsRes.data);
      setTasks(tasksRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
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
        <h1 className="page-title">仪表盘</h1>
      </div>
      <div className="page-content">
        {stats && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">总任务数</div>
              <div className="stat-value">{stats.tasks.total}</div>
              <div className="stat-desc">{stats.tasks.enabled} 个已启用</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">执行次数</div>
              <div className="stat-value">{stats.jobs.total}</div>
              <div className="stat-desc">累计执行次数</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">成功任务</div>
              <div className="stat-value success">{stats.jobs.completed}</div>
              <div className="stat-desc">
                {stats.jobs.total > 0
                  ? `${((stats.jobs.completed / stats.jobs.total) * 100).toFixed(1)}% 成功率`
                  : '-'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">抓取数据量</div>
              <div className="stat-value running">{stats.items_scraped}</div>
              <div className="stat-desc">累计抓取条目</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">正在运行</div>
              <div className="stat-value running">{stats.jobs.running}</div>
              <div className="stat-desc">当前运行中的任务</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">失败任务</div>
              <div className="stat-value danger">{stats.jobs.failed}</div>
              <div className="stat-desc">需要关注的任务</div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">最近执行记录</h2>
            <Link to="/results" className="btn btn-secondary btn-sm">
              查看全部
            </Link>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>任务ID</th>
                  <th>状态</th>
                  <th>开始时间</th>
                  <th>耗时</th>
                  <th>抓取数量</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      暂无执行记录
                    </td>
                  </tr>
                ) : (
                  recentJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="mono">#{job.id}</td>
                      <td className="mono">#{job.task_id}</td>
                      <td>
                        <span className={`status-badge status-${job.status}`}>
                          {job.status === 'completed' ? '成功' : job.status === 'running' ? '运行中' : job.status === 'failed' ? '失败' : '等待中'}
                        </span>
                      </td>
                      <td>{dayjs(job.started_at).format('YYYY-MM-DD HH:mm:ss')}</td>
                      <td>{job.duration}s</td>
                      <td>{job.items_scraped}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">定时任务</h2>
            <Link to="/tasks" className="btn btn-secondary btn-sm">
              管理任务
            </Link>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>任务名称</th>
                  <th>脚本</th>
                  <th>Cron 表达式</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      暂无任务，<Link to="/tasks/new">立即创建</Link>
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="mono">#{task.id}</td>
                      <td>{task.name}</td>
                      <td>{task.script?.name || '-'}</td>
                      <td className="mono">{task.cron_expression || '-'}</td>
                      <td>
                        <span className={`status-badge ${task.is_enabled ? 'status-completed' : 'status-pending'}`}>
                          {task.is_enabled ? '已启用' : '已禁用'}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <Link to={`/tasks/${task.id}`} className="btn btn-secondary btn-sm">
                            编辑
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
