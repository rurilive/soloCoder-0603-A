import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { resultsApi, taskApi } from '../services/api';
import type { SpiderJob, SpiderResult, SpiderTask } from '../types';

export default function Results() {
  const [jobs, setJobs] = useState<SpiderJob[]>([]);
  const [tasks, setTasks] = useState<SpiderTask[]>([]);
  const [selectedJob, setSelectedJob] = useState<SpiderJob | null>(null);
  const [jobResults, setJobResults] = useState<SpiderResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [filterTask, setFilterTask] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [filterTask, filterStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsRes, tasksRes] = await Promise.all([
        resultsApi.listJobs(
          filterTask ? Number(filterTask) : undefined,
          filterStatus || undefined,
          50
        ),
        taskApi.list(),
      ]);
      setJobs(jobsRes.data);
      setTasks(tasksRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadJobResults = async (job: SpiderJob) => {
    setSelectedJob(job);
    if (job.items_scraped === 0) {
      setJobResults([]);
      return;
    }
    setLoadingResults(true);
    try {
      const res = await resultsApi.getJobResults(job.id);
      setJobResults(res.data);
    } catch (error) {
      console.error('Failed to load job results:', error);
    } finally {
      setLoadingResults(false);
    }
  };

  const handleExport = async (jobId: number, format: 'json' | 'csv') => {
    try {
      const res = await resultsApi.exportResults(jobId, format);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `job_${jobId}_results.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export results:', error);
      alert('导出失败');
    }
  };

  const getTaskName = (taskId: number) => {
    return tasks.find((t) => t.id === taskId)?.name || `#${taskId}`;
  };

  const closeDetail = () => {
    setSelectedJob(null);
    setJobResults([]);
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
        <h1 className="page-title">执行结果</h1>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="form-row" style={{ marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">筛选任务</label>
              <select
                className="form-select"
                value={filterTask}
                onChange={(e) => setFilterTask(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">全部任务</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">筛选状态</label>
              <select
                className="form-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">全部状态</option>
                <option value="completed">成功</option>
                <option value="running">运行中</option>
                <option value="failed">失败</option>
                <option value="pending">等待中</option>
              </select>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">暂无执行记录</div>
              <p>运行爬虫任务后，执行记录将显示在这里</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>任务</th>
                    <th>状态</th>
                    <th>开始时间</th>
                    <th>结束时间</th>
                    <th>耗时</th>
                    <th>抓取数量</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="mono">#{job.id}</td>
                      <td>{getTaskName(job.task_id)}</td>
                      <td>
                        <span className={`status-badge status-${job.status}`}>
                          {job.status === 'completed'
                            ? '成功'
                            : job.status === 'running'
                            ? '运行中'
                            : job.status === 'failed'
                            ? '失败'
                            : '等待中'}
                        </span>
                      </td>
                      <td>{dayjs(job.started_at).format('YYYY-MM-DD HH:mm:ss')}</td>
                      <td>
                        {job.finished_at
                          ? dayjs(job.finished_at).format('YYYY-MM-DD HH:mm:ss')
                          : '-'}
                      </td>
                      <td>{job.duration}s</td>
                      <td>{job.items_scraped}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => loadJobResults(job)}
                          >
                            查看详情
                          </button>
                          {job.status === 'completed' && job.items_scraped > 0 && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleExport(job.id, 'json')}
                              >
                                JSON
                              </button>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleExport(job.id, 'csv')}
                              >
                                CSV
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedJob && (
          <div className="modal-overlay" onClick={closeDetail}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">
                  执行详情 #{selectedJob.id} - {getTaskName(selectedJob.task_id)}
                </h2>
                <button className="btn btn-secondary btn-sm" onClick={closeDetail}>
                  ✕ 关闭
                </button>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>状态</span>
                  <div>
                    <span className={`status-badge status-${selectedJob.status}`}>
                      {selectedJob.status === 'completed'
                        ? '成功'
                        : selectedJob.status === 'running'
                        ? '运行中'
                        : selectedJob.status === 'failed'
                        ? '失败'
                        : '等待中'}
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>耗时</span>
                  <div style={{ fontSize: '20px', fontWeight: '600' }}>{selectedJob.duration}s</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>抓取数量</span>
                  <div style={{ fontSize: '20px', fontWeight: '600' }}>{selectedJob.items_scraped}</div>
                </div>
              </div>

              {selectedJob.error_message && (
                <div className="form-group">
                  <label className="form-label">错误信息</label>
                  <div className="logs-container" style={{ color: 'var(--danger)' }}>
                    {selectedJob.error_message}
                  </div>
                </div>
              )}

              {selectedJob.items_scraped > 0 && (
                <div className="form-group">
                  <label className="form-label">
                    抓取结果
                    <span style={{ marginLeft: '10px' }}>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleExport(selectedJob.id, 'json')}
                        style={{ marginRight: '8px' }}
                      >
                        导出 JSON
                      </button>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleExport(selectedJob.id, 'csv')}
                      >
                        导出 CSV
                      </button>
                    </span>
                  </label>
                  {loadingResults ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      加载中...
                    </div>
                  ) : jobResults.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      暂无数据
                    </div>
                  ) : (
                    <div className="results-preview">
                      {jobResults.map((result) => (
                        <div key={result.id} className="result-item">
                          <div className="result-url">
                            #{result.id} {result.url || '无 URL'}
                          </div>
                          <div className="result-data">{JSON.stringify(result.data, null, 2)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
