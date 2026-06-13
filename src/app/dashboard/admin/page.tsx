'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ActiveSession {
  sessionId: string;
  participantCount: number;
  startedAt: string;
}

interface RecentSession {
  sessionId: string;
  startedAt: string;
  durationSeconds: number | null;
  participantCount: number;
}

interface AdminStats {
  stats: {
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
    totalParticipants: number;
  };
  activeSessions: ActiveSession[];
  recentSessions: RecentSession[];
}

interface ServerMetrics {
  activeSessions: number;
  connectedParticipants: number;
  totalSessions: number;
  totalMessages: number;
  uptimeSeconds: number;
}

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, metricsRes] = await Promise.all([
        fetch(`${SIGNALING_URL}/api/admin/stats`),
        fetch(`${SIGNALING_URL}/api/metrics`)
      ]);

      if (!statsRes.ok || !metricsRes.ok) throw new Error('Failed to fetch dashboard data');
      
      const [statsJson, metricsJson] = await Promise.all([
        statsRes.json(),
        metricsRes.json()
      ]);

      setData(statsJson);
      setMetrics(metricsJson);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) return <div className="p-8">Loading dashboard...</div>;
  if (error && !data) return <div className="p-8 text-red-500">Error: {error}</div>;

  const stats = data?.stats;

  const formatDuration = (start: string) => {
    const diff = Math.floor((now.getTime() - new Date(start).getTime()) / 1000);
    if (diff < 0) return '0s';
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const formatDurationSecs = (secs: number | null) => {
    if (secs === null) return '-';
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}m ${s}s`;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto bg-zinc-50 min-h-screen dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-zinc-500 mt-1 text-sm">Real-time operational overview of SupportLens sessions.</p>
        </div>
        <div className="text-xs font-mono text-zinc-400 bg-white dark:bg-zinc-900 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800">
          Last updated: {now.toLocaleTimeString()}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Total Sessions', value: stats?.totalSessions, icon: '📊' },
          { label: 'Active Sessions', value: stats?.activeSessions, icon: '🟢', highlight: true },
          { label: 'Total Messages', value: stats?.totalMessages, icon: '💬' },
          { label: 'Total Participants', value: stats?.totalParticipants, icon: '👥' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{stat.icon}</span>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{stat.label}</p>
            </div>
            <p className={`text-3xl font-black ${stat.highlight ? 'text-emerald-500' : ''}`}>{stat.value ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Observability Metrics */}
      <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-10">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <h2 className="font-bold text-sm uppercase tracking-tight">System Observability</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-zinc-200 dark:divide-zinc-800">
          {[
            { label: 'Live Sessions', value: metrics?.activeSessions },
            { label: 'Live Peers', value: metrics?.connectedParticipants },
            { label: 'Total Sessions', value: metrics?.totalSessions },
            { label: 'Total Messages', value: metrics?.totalMessages },
            { label: 'Uptime', value: metrics ? formatUptime(metrics.uptimeSeconds) : '-', isString: true },
          ].map((m, i) => (
            <div key={i} className="p-6 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{m.label}</p>
              <p className={`font-black tracking-tight ${m.isString ? 'text-sm text-zinc-700 dark:text-zinc-300' : 'text-xl'}`}>
                {m.value ?? 0}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Sessions List */}
        <div className="lg:col-span-1">
          <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <h2 className="font-bold text-sm uppercase tracking-tight">Active Sessions</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">LIVE</span>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {data?.activeSessions.length === 0 ? (
                <p className="p-10 text-center text-sm text-zinc-500 italic">No active sessions at the moment.</p>
              ) : (
                data?.activeSessions.map((s) => (
                  <div key={s.sessionId} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <Link href={`/dashboard/sessions/${s.sessionId}`} className="text-sm font-bold text-blue-600 hover:underline truncate mr-2">
                        {s.sessionId}
                      </Link>
                      <span className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-500">
                        {formatDuration(s.startedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      {s.participantCount} Participant{s.participantCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Recent Sessions Table */}
        <div className="lg:col-span-2">
          <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <h2 className="font-bold text-sm uppercase tracking-tight">Recent Sessions</h2>
              <Link href="/dashboard/sessions" className="text-xs font-bold text-blue-600 hover:underline">View All</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Session ID</th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Started At</th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Duration</th>
                    <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Peers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data?.recentSessions.map((s) => (
                    <tr key={s.sessionId} className="hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-colors">
                      <td className="px-6 py-4">
                        <Link href={`/dashboard/sessions/${s.sessionId}`} className="text-xs font-bold text-blue-600 hover:underline truncate block max-w-[120px]">
                          {s.sessionId}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-400">
                        {new Date(s.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-600 dark:text-zinc-400">
                        {formatDurationSecs(s.durationSeconds)}
                      </td>
                      <td className="px-6 py-4 text-xs">
                         <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                           {s.participantCount}
                         </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
