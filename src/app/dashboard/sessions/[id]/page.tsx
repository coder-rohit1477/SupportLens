'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Session {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

interface Participant {
  id: string;
  userId: string;
  name: string;
  role: string;
  joinedAt: string;
  leftAt: string | null;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  type: 'text' | 'file';
  text?: string;
  fileName?: string;
  fileUrl?: string;
  mimeType?: string;
  createdAt: string;
}

interface Summary {
  issue: string;
  resolution: string;
  status: string;
  summary: string;
}

interface SessionDetail {
  session: Session;
  participants: Participant[];
  messages: Message[];
}

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001';

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessionDetail() {
      try {
        const response = await fetch(`${SIGNALING_URL}/api/sessions/${id}`);
        if (!response.ok) throw new Error('Failed to fetch session details');
        const json = await response.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSessionDetail();
  }, [id]);

  const generateSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const response = await fetch(`${SIGNALING_URL}/api/sessions/${id}/summary`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to generate summary');
      const data = await response.json();
      setSummary(data);
    } catch (err: any) {
      setSummaryError(err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading session details...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-8">No data found.</div>;

  const { session, participants, messages } = data;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/sessions" className="text-blue-600 hover:underline">
            &larr; Back to Sessions
          </Link>
          <h1 className="text-2xl font-bold">Session Detail: {session.sessionId}</h1>
        </div>
        <button
          onClick={generateSummary}
          disabled={summaryLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
        >
          {summaryLoading ? 'Generating...' : 'Generate AI Summary'}
        </button>
      </div>

      {/* AI Summary Display */}
      {summary && (
        <section className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 shadow rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-blue-900 dark:text-blue-100 border-b border-blue-200 dark:border-blue-800 pb-2">AI Call Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">Issue</p>
              <p className="text-sm font-medium">{summary.issue}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">Resolution</p>
              <p className="text-sm font-medium">{summary.resolution}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">Status</p>
              <p className="text-sm font-medium">
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 rounded text-xs">
                  {summary.status}
                </span>
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">Summary</p>
            <p className="text-sm leading-relaxed">{summary.summary}</p>
          </div>
        </section>
      )}

      {summaryError && (
        <div className="mb-8 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">
          Failed to generate summary: {summaryError}
        </div>
      )}

      {/* Session Overview */}
      <section className="bg-white dark:bg-zinc-900 shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-zinc-500 uppercase">Started At</p>
            <p className="font-medium">{new Date(session.startedAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-zinc-500 uppercase">Ended At</p>
            <p className="font-medium">{session.endedAt ? new Date(session.endedAt).toLocaleString() : 'Active'}</p>
          </div>
          <div>
            <p className="text-sm text-zinc-500 uppercase">Duration</p>
            <p className="font-medium">{session.durationSeconds ? `${session.durationSeconds}s` : '-'}</p>
          </div>
          <div>
            <p className="text-sm text-zinc-500 uppercase">Total Messages</p>
            <p className="font-medium">{messages.length}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Participants */}
        <section className="bg-white dark:bg-zinc-900 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">Participants</h2>
          <div className="space-y-4">
            {participants.map((p) => (
              <div key={p.id} className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold">{p.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${p.role === 'AGENT' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                    {p.role}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">User ID: {p.userId}</p>
                <div className="flex gap-4 mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>Joined: {new Date(p.joinedAt).toLocaleTimeString()}</span>
                  {p.leftAt && <span>Left: {new Date(p.leftAt).toLocaleTimeString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Messages */}
        <section className="bg-white dark:bg-zinc-900 shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">Chat History</h2>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {messages.map((m) => (
              <div key={m.id} className="border-l-4 border-zinc-200 dark:border-zinc-700 pl-4 py-1">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm">{m.senderName} ({m.senderRole})</span>
                  <span className="text-[10px] text-zinc-400">{new Date(m.createdAt).toLocaleTimeString()}</span>
                </div>
                {m.type === 'file' ? (
                  <div className="mt-2">
                    {m.mimeType?.startsWith('image/') ? (
                      <div className="mb-2">
                        <img 
                          src={m.fileUrl} 
                          alt={m.fileName} 
                          className="max-h-32 rounded border border-zinc-200 dark:border-zinc-700 object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-zinc-500 mb-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-xs uppercase font-bold">{m.mimeType === 'application/pdf' ? 'PDF' : 'File'}</span>
                      </div>
                    )}
                    <a 
                      href={m.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {m.fileName}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{m.text}</p>
                )}
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-center text-zinc-500 py-8">No messages sent in this session.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
