"use client";

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import LoadingPlaceholder from '@/components/LoadingPlaceholder';

type Daily = { day: string; count: string };
type SummaryResponse = {
  success: boolean;
  windowDays: number;
  total: number;
  byAction: Record<string, number>;
  recent: Array<{
    id: number;
    user_id: number;
    username?: string;
    action: string;
    target_type: string | null;
    target_id: number | string | null;
    metadata: any;
    created_at: string;
  }>;
  dailyCounts?: Daily[];
  overallDailyCounts?: Daily[] | null;
};

type User = { id: number; username: string; role: string };

export default function StatsPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [recent, setRecent] = useState<SummaryResponse['recent']>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [days, setDays] = useState<number>(14);

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    if (me) {
      if (me.role === 'superuser') {
        loadUsers();
      }
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, selectedUserId, days]);

  const loadMe = async () => {
    try {
      const res = await axios.get('/api/auth/me');
      if (res.data?.user) {
        setMe(res.data.user);
      }
    } catch (e) {
      console.error('Failed to load user', e);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await axios.get('/api/users');
      setUsers(res.data?.users || []);
    } catch (e) {
      console.error('Failed to load users', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { days };
      if (me?.role === 'superuser' && selectedUserId) {
        params.user_id = selectedUserId;
      }
      const s = await axios.get<SummaryResponse>('/api/activity/summary', { params });
      if (s.data && s.data.success) {
        setSummary(s.data);
        setRecent(s.data.recent || []);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Keep hooks order consistent across renders: compute memoized maxDaily
  const maxDaily = useMemo(() => {
    const arr = (summary?.overallDailyCounts || summary?.dailyCounts || []) as Daily[];
    return arr.reduce((m, d) => Math.max(m, parseInt(d.count || '0')), 0) || 0;
  }, [summary]);

  if (loading || !summary) {
    return <LoadingPlaceholder type="videos" count={5} />;
  }

  const actionOrder = [
    'login',
    'upload_local',
    'upload_remote',
    'delete_video',
    'delete_folder',
    'create_folder',
    'create_post',
  ];

  

  const LineChart = ({ data }: { data: Daily[] }) => {
    const width = 600;
    const height = 160;
    const pad = 20;
    const points = data.map((d, i) => {
      const x = pad + (i * (width - 2 * pad)) / Math.max(data.length - 1, 1);
      const yVal = parseInt(d.count || '0');
      const y = height - pad - (yVal / Math.max(maxDaily, 1)) * (height - 2 * pad);
      return `${x},${y}`;
    });
    const path = points.length > 0 ? `M ${points[0]} L ${points.slice(1).join(' ')}` : '';
    return (
      <svg width={width} height={height} className="bg-transparent">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#9CA3AF" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#9CA3AF" strokeWidth={1} />
        <path d={path} fill="none" stroke="#2563EB" strokeWidth={2} />
        {data.map((d, i) => {
          const [xStr, yStr] = points[i].split(',');
          const x = parseFloat(xStr);
          const y = parseFloat(yStr);
          return <circle key={i} cx={x} cy={y} r={3} fill="#2563EB" />;
        })}
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Activity Stats</h2>
        <div className="flex items-center gap-2">
          <select
            className="px-2 py-1 text-sm border rounded-md dark:bg-gray-800 dark:text-white"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            title="Range days"
          >
            {[7, 14, 30].map((d) => (
              <option key={d} value={d}>Last {d} days</option>
            ))}
          </select>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {me?.role === 'superuser' && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-300">Lihat statistik untuk user:</label>
          <select
            className="px-2 py-1 text-sm border rounded-md dark:bg-gray-800 dark:text-white"
            value={selectedUserId || ''}
            onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
            ))}
          </select>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {actionOrder.map((action) => (
          <div key={action} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">{action.replace('_', ' ')}</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              {summary.byAction[action] || 0}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">last {summary.windowDays} days</div>
          </div>
        ))}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">total events</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{summary.total}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">last {summary.windowDays} days</div>
        </div>
      </div>

      {/* Overall trend (superuser) */}
      {me?.role === 'superuser' && summary.overallDailyCounts && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Overall Trend (All Users)</h3>
            <div className="text-xs text-gray-500 dark:text-gray-400">last {summary.windowDays} days</div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <LineChart data={summary.overallDailyCounts as Daily[]} />
          </div>
        </div>
      )}

      {/* Recent activity table */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Recent Activity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">User</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Target</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {recent.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{row.username || row.user_id}</td>
                  <td className="px-4 py-2 text-sm">
                    <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                    {row.target_type || '-'}{row.target_id ? `:${row.target_id}` : ''}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 max-w-[360px] truncate">
                    {row.metadata ? JSON.stringify(row.metadata) : '-'}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400" colSpan={5}>No activity</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}