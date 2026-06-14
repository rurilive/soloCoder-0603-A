import { useEffect, useState, useMemo } from 'react';
import dayjs from 'dayjs';
import { resultsApi, taskApi } from '../services/api';
import type { SpiderJob, SpiderResult, SpiderTask } from '../types';

interface JobGroup {
  execution_id: string;
  jobs: SpiderJob[];
  latest: SpiderJob;
  totalRetries: number;
}

export default function Results() {
  const [jobs, setJobs] = useState<SpiderJob[]>([]);
  const [tasks, setTasks] = useState<SpiderTask[]>([]);
  const [selectedJob, setSelectedJob] = useState<SpiderJob | null>(null);
  const [jobResults, setJobResults] = useState<SpiderResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [filterTask, setFilterTask] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsRes, tasksRes] = await Promise.all([
        resultsApi.listJobs(undefined, undefined, 500),
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

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (filterTask && job.task_id !== Number(filterTask)) {
        return false;
      }
      if (filterStatus && job.status !== filterStatus) {
        return false;
      }
      return true;
    });
  }, [jobs, filterTask, filterStatus]);

  const jobGroups = useMemo<JobGroup[]>(() => {
    const map = new Map<string, SpiderJob[]>();
    for (const job of filteredJobs) {
      const key = job.execution_id || `job-${job.id}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(job);
    }
    const groups: JobGroup[] = [];
    for (const [execution_id, groupJobs] of map.entries()) {
      const sortedByRetryAsc = [...groupJobs].sort((a, b) => {
        const aCount = a.retry_count ?? 0;
        const bCount = b.retry_count ?? 0;
        return aCount - bCount || a.id - b.id;
      });
      const sortedForLatest = [...groupJobs].sort((a, b) => {
        const aCompleted = a.status === 'completed' ? 1 : 0;
        const bCompleted = b.status === 'completed' ? 1 : 0;
        if (aCompleted !== bCompleted) {
          return bCompleted - aCompleted;
        }
        const aCount = a.retry_count ?? 0;
        const bCount = b.retry_count ?? 0;
        return bCount - aCount || b.id - a.id;
      });
      groups.push({
        execution_id,
        jobs: sortedByRetryAsc,
        latest: sortedForLatest[0],
        totalRetries: groupJobs.length - 1,
      });
    }
    return groups.sort((a, b) =>
      dayjs(b.latest.started_at).valueOf() - dayjs(a.latest.started_at).valueOf()
    );
  }, [filteredJobs]);

  const toggleGroup = (execution_id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(execution_id)) {
        next.delete(execution_id);
      } else {
        next.add(execution_id);
      }
      return next;
    });
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

  const renderJobRow = (
    job: SpiderJob,
    isRetry: boolean = false,
    hasExpandToggle: boolean = false,
    isExpanded: boolean = false,
    onToggle?: () => void,
    retrySummary?: { total: number; failures: number; successes: number }
  ) => (
    <tr key={job.id} className={isRetry ? 'job-retry-row' : ''}>
      <td style={{ width: '32px', textAlign: 'center' }}>
        {hasExpandToggle ? (
          <button className="expand-toggle" onClick={onToggle} title={isExpanded ? '收起' : '展开'}>
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : isRetry ? (
          <span className="retry-indent">↳</span>
        ) : null}
      </td>
      <td className="mono">
        #{job.id}
        {hasExpandToggle && retrySummary && retrySummary.total > 1 && (
          <span
            className="status-badge status-running"
            style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}
          >
            {retrySummary.total} 次执行
            {retrySummary.failures > 0 && ` · ${retrySummary.failures} 次失败`}
          </span>
        )}
        {!hasExpandToggle && job.retry_count > 0 && (
          <span
            className="status-badge status-failed"
            style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}
          >
            重试 {job.retry_count}
          </span>
        )}
      </td>
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
        {hasExpandToggle && retrySummary && retrySummary.successes > 0 && retrySummary.failures > 0 && (
          <span
            className="status-badge status-completed"
            style={{ marginLeft: '6px', fontSize: '11px', padding: '2px 6px' }}
          >
            最终成功
          </span>
        )}
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
  );

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

          {jobGroups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">暂无执行记录</div>
              <p>{jobs.length > 0 ? '当前筛选条件下没有匹配的记录' : '运行爬虫任务后，执行记录将显示在这里'}</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '32px' }}></th>
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
                  {jobGroups.flatMap((group) => {
                    const isExpanded = expandedGroups.has(group.execution_id);
                    const summary = {
                      total: group.jobs.length,
                      failures: group.jobs.filter((j) => j.status === 'failed').length,
                      successes: group.jobs.filter((j) => j.status === 'completed').length,
                    };
                    const rows = [
                      renderJobRow(
                        group.latest,
                        false,
                        group.totalRetries > 0,
                        isExpanded,
                        () => toggleGroup(group.execution_id),
                        summary
                      ),
                    ];
                    if (isExpanded) {
                      for (const j of group.jobs.filter((j) => j.id !== group.latest.id)) {
                        rows.push(renderJobRow(j, true));
                      }
                    }
                    return rows;
                  })}
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
                  {selectedJob.retry_count > 0 && (
                    <span
                      className="status-badge status-failed"
                      style={{ marginLeft: '12px', fontSize: '12px' }}
                    >
                      第 {selectedJob.retry_count} 次重试
                    </span>
                  )}
                </h2>
                <button className="btn btn-secondary btn-sm" onClick={closeDetail}>
                  ✕ 关闭
                </button>
              </div>

              {selectedJob.execution_id && (
                <div style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  执行批次 ID: <code className="mono">{selectedJob.execution_id}</code>
                </div>
              )}

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
