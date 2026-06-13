import React, { useEffect, useRef, useState } from 'react';
import { useCallStore } from '../store/useCallStore';

interface ChatPanelProps {
  onSendMessage: (text: string) => void;
  onSendFile: (fileName: string, fileUrl: string, mimeType: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ onSendMessage, onSendFile }) => {
  const { chatMessages, localUserId, connectionState } = useCallStore();
  const [draft, setDraft] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    onSendMessage(trimmed);
    setDraft('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Max size is 10MB.');
      return;
    }

    // Validate type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Only PNG, JPEG, and PDF are allowed.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadUrl = (process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001') + '/api/upload';
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      onSendFile(data.fileName, data.fileUrl, data.mimeType);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderFileMessage = (message: any) => {
    const isImage = message.mimeType?.startsWith('image/');
    const isPdf = message.mimeType === 'application/pdf';

    if (isImage) {
      return (
        <div className="mt-2 group relative">
          <a 
            href={message.fileUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 transition-all hover:border-emerald-500/50"
          >
            <img 
              src={message.fileUrl} 
              alt={message.fileName} 
              className="max-h-60 w-full object-cover"
            />
            <div className="absolute inset-0 bg-zinc-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
               <span className="text-white text-xs font-bold bg-zinc-900/80 px-3 py-1.5 rounded-full border border-zinc-700 shadow-xl">
                 Click to expand
               </span>
            </div>
          </a>
          <p className="mt-1 text-[10px] text-zinc-500 truncate">{message.fileName}</p>
        </div>
      );
    }

    return (
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/50">
          <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-400">
            {isPdf ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-200 truncate">{message.fileName}</p>
            <p className="text-[10px] text-zinc-500 uppercase">{isPdf ? 'PDF Document' : 'Attachment'}</p>
          </div>
        </div>
        <a 
          href={message.fileUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition shadow-sm border border-zinc-700"
        >
          {isPdf ? 'Open PDF' : 'Download File'}
        </a>
      </div>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-4">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide text-zinc-100 uppercase">Chat</h3>
            <p className="text-xs text-zinc-500">Realtime room messages</p>
          </div>
          <div className={`text-xs font-semibold px-3 py-1 rounded-full border ${connectionState === 'connected' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-zinc-700 text-zinc-400 bg-zinc-900'}`}>
            {connectionState === 'connected' ? 'Live' : 'Offline'}
          </div>
        </div>

        <div className="h-72 overflow-y-auto px-5 py-4 space-y-3 bg-gradient-to-b from-zinc-950 to-zinc-900/70">
          {chatMessages.length === 0 ? (
            <div className="h-full min-h-[12rem] flex items-center justify-center text-zinc-500 text-sm">
              No messages yet. Start the conversation.
            </div>
          ) : (
            chatMessages.map((message) => {
              const isMine = message.senderId === localUserId;
              return (
                <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 border shadow-lg ${isMine ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-50' : 'bg-zinc-900 border-zinc-800 text-zinc-100'}`}>
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        {isMine ? 'You' : `${message.senderName} (${message.senderRole.toLowerCase()})`}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {message.type === 'file' ? (
                      renderFileMessage(message)
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-950">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".png,.jpg,.jpeg,.pdf"
          />
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || connectionState !== 'connected'}
              className="h-12 w-12 flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition disabled:opacity-40"
              title="Attach File"
            >
              {isUploading ? (
                <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Type a message..."
              className="flex-1 resize-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-0"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim() || connectionState !== 'connected'}
              className="h-12 px-5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
