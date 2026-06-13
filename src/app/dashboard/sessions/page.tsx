'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Session {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  participantCount: number;
  messageCount: number;
}

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';

export default function SessionListPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const response = await fetch(`${SIGNALING_URL}/api/sessions`);
        if (!response.ok) throw new Error('Failed to fetch sessions');
        const data = await response.json();
        setSessions(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  }, []);

  if (loading) return <div className="p-8">Loading sessions...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Call Sessions History</h1>
      <div className="overflow-x-auto bg-white dark:bg-zinc-900 shadow rounded-lg">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Session ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Started At</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Ended At</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Participants</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Messages</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
            {sessions.map((session) => (
              <tr 
                key={session.sessionId} 
                className="hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                  <Link href={`/dashboard/sessions/${session.sessionId}`}>
                    {session.sessionId}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                  {new Date(session.startedAt).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                  {session.endedAt ? new Date(session.endedAt).toLocaleString() : 'Active'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                  {session.durationSeconds ? `${session.durationSeconds}s` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                  {session.participantCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                  {session.messageCount}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                  No sessions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
