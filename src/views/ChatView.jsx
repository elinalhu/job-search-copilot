import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Sparkles, MessageCircle, Plus, ArrowLeft, Clock } from 'lucide-react';
import { getChatThreads, getChatThread, saveChatThread, deleteChatThread, createChatThread, getResume, getJobs, getStories } from '../lib/storage';
import { chat as chatApi } from '../lib/claude';
import { renderMarkdown } from '../lib/markdown';
import { processActions } from '../lib/chatActions';

const STARTERS = [
  'Help me refine a STAR story',
  'Prep me for an interview',
  'What should I ask them in the interview?',
  'How do I talk about a gap in my experience?',
  'Help me negotiate an offer',
  'Which of my stories fits this role best?',
];

export default function ChatView({ preloadedPrompt, onClearPreload }) {
  const [threads, setThreads] = useState(() => getChatThreads());
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (preloadedPrompt) {
      // Start a new thread with preloaded prompt
      const thread = createChatThread('New conversation');
      setThreads(getChatThreads());
      setActiveThreadId(thread.id);
      setMessages([]);
      setInput(preloadedPrompt);
      onClearPreload?.();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [preloadedPrompt, onClearPreload]);

  useEffect(() => {
    if (activeThreadId) {
      const thread = getChatThread(activeThreadId);
      setMessages(thread?.messages || []);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const refreshThreads = () => setThreads(getChatThreads());

  const handleNewThread = () => {
    const thread = createChatThread('New conversation');
    refreshThreads();
    setActiveThreadId(thread.id);
    setMessages([]);
  };

  const handleOpenThread = (id) => {
    setActiveThreadId(id);
    setDeleteConfirm(null);
  };

  const handleDeleteThread = (id) => {
    deleteChatThread(id);
    refreshThreads();
    if (activeThreadId === id) {
      setActiveThreadId(null);
      setMessages([]);
    }
    setDeleteConfirm(null);
  };

  const handleBack = () => {
    setActiveThreadId(null);
    refreshThreads();
  };

  const sendMessage = async (text) => {
    if (!text.trim() || isStreaming) return;

    let threadId = activeThreadId;
    if (!threadId) {
      const thread = createChatThread(text.trim().slice(0, 60));
      threadId = thread.id;
      setActiveThreadId(threadId);
      refreshThreads();
    }

    const userMsg = { role: 'user', content: text.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    // Update thread title from first message
    const thread = getChatThread(threadId);
    if (thread && thread.messages.length === 0) {
      thread.title = text.trim().slice(0, 60);
    }
    thread.messages = newMessages;
    thread.updatedAt = new Date().toISOString();
    saveChatThread(thread);

    try {
      const fullText = await chatApi({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        resume: getResume(),
        jobs: getJobs(),
        stories: getStories(),
        onChunk: (t) => setStreamingText(t.replace(/\[\[ACTION:[^\]]*?\]\]/g, '').replace(/\[\[ACTION:[^\n]*$/g, '')),
      });

      const { cleanText, actions, lookups } = await processActions(fullText);

      if (lookups.length > 0) {
        const jdContext = lookups.map((l) => `Job Description for ${l.company} — ${l.role}:\n${l.jdText}`).join('\n\n---\n\n');
        const withJd = [
          ...newMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'assistant', content: fullText },
          { role: 'user', content: `[System: Here are the requested job descriptions]\n\n${jdContext}` },
        ];
        setStreamingText('');
        const followUp = await chatApi({
          messages: withJd,
          resume: getResume(),
          jobs: getJobs(),
          stories: getStories(),
          onChunk: (t) => setStreamingText(t.replace(/\[\[ACTION:[^\]]*?\]\]/g, '').replace(/\[\[ACTION:[^\n]*$/g, '')),
        });
        const { cleanText: followClean, actions: followActions } = await processActions(followUp);
        const allActions = [...actions, ...followActions];
        const assistantMsg = { role: 'assistant', content: followClean, timestamp: Date.now(), actions: allActions.length > 0 ? allActions : undefined };
        const updated = [...newMessages, assistantMsg];
        setMessages(updated);
        setStreamingText('');
        const t2 = getChatThread(threadId);
        t2.messages = updated;
        t2.updatedAt = new Date().toISOString();
        saveChatThread(t2);
      } else {
        const assistantMsg = { role: 'assistant', content: cleanText, timestamp: Date.now(), actions: actions.length > 0 ? actions : undefined };
        const updated = [...newMessages, assistantMsg];
        setMessages(updated);
        setStreamingText('');
        const t = getChatThread(threadId);
        t.messages = updated;
        t.updatedAt = new Date().toISOString();
        saveChatThread(t);
      }
      refreshThreads();
    } catch (err) {
      const errorMsg = { role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now(), isError: true };
      const updated = [...newMessages, errorMsg];
      setMessages(updated);
      setStreamingText('');

      const t = getChatThread(threadId);
      t.messages = updated;
      saveChatThread(t);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatMessage = (text) => renderMarkdown(text);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  };

  // Thread list view
  if (!activeThreadId) {
    return (
      <div className="chat-view animate-in">
        <div className="chat-view-header">
          <div>
            <h1>Chat</h1>
            <p className="view-subtitle">Your conversations with the job search coach.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleNewThread}>
            <Plus size={14} /> New Conversation
          </button>
        </div>

        <div className="thread-list">
          {threads.length === 0 && (
            <div className="chat-empty">
              <Sparkles size={40} strokeWidth={1.2} />
              <h3>No conversations yet</h3>
              <p>Start a new conversation or use the chat bubble on any page.</p>
              <div className="chat-starters">
                {STARTERS.map((s) => (
                  <button key={s} className="starter-btn" onClick={() => { handleNewThread(); setTimeout(() => sendMessage(s), 100); }}>
                    <MessageCircle size={14} /> {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {threads.map((thread) => (
            <div key={thread.id} className="thread-item" onClick={() => handleOpenThread(thread.id)}>
              <div className="thread-item-content">
                <div className="thread-title">{thread.title}</div>
                <div className="thread-meta">
                  <Clock size={12} />
                  {formatDate(thread.updatedAt)} · {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}
                </div>
                {thread.messages.length > 0 && (
                  <div className="thread-preview">
                    {thread.messages[thread.messages.length - 1].content.slice(0, 100)}...
                  </div>
                )}
              </div>
              <div className="thread-item-actions" onClick={(e) => e.stopPropagation()}>
                {deleteConfirm === thread.id ? (
                  <>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteThread(thread.id)}>Delete</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setDeleteConfirm(thread.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <style>{chatStyles}</style>
      </div>
    );
  }

  // Active conversation view
  return (
    <div className="chat-view animate-in">
      <div className="chat-view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleBack}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3 style={{ margin: 0 }}>{getChatThread(activeThreadId)?.title || 'Conversation'}</h3>
          </div>
        </div>
      </div>

      <div className="chat-view-messages">
        {messages.length === 0 && !isStreaming && (
          <div className="chat-empty">
            <Sparkles size={32} strokeWidth={1.2} />
            <p>Start the conversation — ask anything about your job search.</p>
            <div className="chat-starters">
              {STARTERS.map((s) => (
                <button key={s} className="starter-btn" onClick={() => sendMessage(s)}>
                  <MessageCircle size={14} /> {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role} ${msg.isError ? 'error' : ''}`}>
            <div className="msg-label">{msg.role === 'user' ? 'You' : 'Coach'}</div>
            <div className="msg-body">{formatMessage(msg.content)}</div>
          </div>
        ))}

        {isStreaming && streamingText.trim() && (
          <div className="chat-msg assistant">
            <div className="msg-label">Coach</div>
            <div className="msg-body">{formatMessage(streamingText)}</div>
          </div>
        )}

        {isStreaming && !streamingText.trim() && (
          <div className="chat-msg assistant">
            <div className="msg-label">Coach</div>
            <div className="msg-body" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              <div className="spinner" style={{ width: 14, height: 14 }} /> Working...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-view-input">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your job search..."
          rows={2}
          disabled={isStreaming}
        />
        <button
          className="btn btn-primary send-btn"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isStreaming}
        >
          <Send size={16} />
        </button>
      </div>

      <style>{chatStyles}</style>
    </div>
  );
}

const chatStyles = `
  .chat-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  .chat-view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 40px 20px;
    border-bottom: 1px solid var(--border-light);
  }
  .chat-view-header h1 { margin-bottom: 0; }
  .view-subtitle {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-top: 4px;
  }
  .thread-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px 40px;
  }
  .thread-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    margin-bottom: 8px;
    cursor: pointer;
    transition: all var(--transition-fast);
    background: var(--bg-card);
  }
  .thread-item:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-sm);
  }
  .thread-item-content {
    flex: 1;
    min-width: 0;
  }
  .thread-title {
    font-weight: 600;
    font-size: 0.95rem;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thread-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78rem;
    color: var(--text-tertiary);
  }
  .thread-preview {
    font-size: 0.82rem;
    color: var(--text-tertiary);
    margin-top: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thread-item-actions {
    flex-shrink: 0;
    margin-left: 12px;
  }
  .chat-view-messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .chat-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 60px 20px;
    text-align: center;
    color: var(--text-tertiary);
  }
  .chat-empty h3 {
    color: var(--text-secondary);
  }
  .chat-empty p {
    max-width: 420px;
  }
  .chat-starters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-top: 12px;
    max-width: 600px;
  }
  .starter-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    font-size: 0.85rem;
    color: var(--text-secondary);
    transition: all var(--transition-fast);
    cursor: pointer;
  }
  .starter-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-light);
  }
  .chat-msg {
    max-width: 680px;
  }
  .chat-msg.user {
    align-self: flex-end;
  }
  .msg-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-tertiary);
    margin-bottom: 4px;
  }
  .chat-msg.user .msg-label { text-align: right; }
  .msg-body {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    padding: 14px 18px;
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .chat-msg.user .msg-body {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .chat-msg.error .msg-body {
    background: var(--status-rejected-bg);
    border-color: var(--status-rejected);
    color: var(--status-rejected);
  }
  .msg-body p { margin-bottom: 4px; }
  .msg-body p:last-child { margin-bottom: 0; }
  .typing-dots {
    display: flex;
    gap: 4px;
    padding: 8px 0;
  }
  .typing-dots span {
    width: 6px;
    height: 6px;
    background: var(--text-tertiary);
    border-radius: 50%;
    animation: bounce 1.2s infinite;
  }
  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }
  .chat-view-input {
    padding: 16px 40px;
    border-top: 1px solid var(--border-light);
    display: flex;
    gap: 12px;
    align-items: flex-end;
    background: var(--bg-card);
  }
  .chat-view-input textarea {
    flex: 1;
    min-height: 44px;
    max-height: 120px;
    resize: none;
  }
  .send-btn {
    flex-shrink: 0;
    padding: 12px 16px;
  }
`;
