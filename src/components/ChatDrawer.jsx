import { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, MessageCircle, Sparkles, Plus } from 'lucide-react';
import { getChatThreads, getChatThread, saveChatThread, createChatThread, deleteChatThread, getResume, getJobs, getStories } from '../lib/storage';
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

export default function ChatDrawer({ isOpen, onClose, preloadedPrompt, onClearPreload }) {
  const [threadId, setThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProcessingActions, setIsProcessingActions] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // When drawer opens, load most recent thread or start fresh
  useEffect(() => {
    if (isOpen) {
      if (preloadedPrompt) {
        // Start a new thread for preloaded prompts
        const thread = createChatThread('New conversation');
        setThreadId(thread.id);
        setMessages([]);
        setInput(preloadedPrompt);
        onClearPreload?.();
      } else if (!threadId) {
        // Load most recent thread if it exists
        const threads = getChatThreads();
        if (threads.length > 0) {
          setThreadId(threads[0].id);
          setMessages(threads[0].messages);
        }
      }
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, preloadedPrompt, onClearPreload]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleNewThread = () => {
    const thread = createChatThread('New conversation');
    setThreadId(thread.id);
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const sendMessage = async (text) => {
    if (!text.trim() || isStreaming) return;

    let currentThreadId = threadId;
    if (!currentThreadId) {
      const thread = createChatThread(text.trim().slice(0, 60));
      currentThreadId = thread.id;
      setThreadId(currentThreadId);
    }

    const userMsg = { role: 'user', content: text.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    // Save to thread
    const thread = getChatThread(currentThreadId);
    if (thread.messages.length === 0) {
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

      // Process any action tags and clean them from displayed text
      setStreamingText('Processing actions...');
      setIsProcessingActions(true);
      const { cleanText, actions, lookups } = await processActions(fullText);
      setIsProcessingActions(false);

      // If the agent requested JD lookups, inject the JD and get a follow-up response
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

        const t = getChatThread(currentThreadId);
        t.messages = updated;
        t.updatedAt = new Date().toISOString();
        saveChatThread(t);
      } else {
        const assistantMsg = { role: 'assistant', content: cleanText, timestamp: Date.now(), actions: actions.length > 0 ? actions : undefined };
        const updated = [...newMessages, assistantMsg];
        setMessages(updated);
        setStreamingText('');

        const t = getChatThread(currentThreadId);
        t.messages = updated;
        t.updatedAt = new Date().toISOString();
        saveChatThread(t);
      }
    } catch (err) {
      const errorMsg = { role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now(), isError: true };
      const updated = [...newMessages, errorMsg];
      setMessages(updated);
      setStreamingText('');

      const t = getChatThread(currentThreadId);
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

  return (
    <>
      {isOpen && <div className="drawer-overlay" onClick={onClose} />}
      <div className={`chat-drawer ${isOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-title">
            <Sparkles size={18} />
            <span>Job Search Coach</span>
          </div>
          <div className="drawer-actions">
            <button className="btn btn-ghost btn-sm" onClick={handleNewThread} title="New conversation">
              <Plus size={15} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="drawer-messages">
          {messages.length === 0 && !isStreaming && (
            <div className="drawer-empty">
              <MessageCircle size={32} strokeWidth={1.5} />
              <p>Ask me anything about your job search.</p>
              <div className="drawer-starters">
                {STARTERS.map((s) => (
                  <button key={s} className="starter-chip" onClick={() => sendMessage(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`drawer-msg ${msg.role} ${msg.isError ? 'error' : ''}`}>
              {msg.role === 'assistant' ? (
                <>
                  <div className="msg-content">{formatMessage(msg.content)}</div>
                  {msg.actions?.length > 0 && (
                    <div className="msg-actions">
                      {msg.actions.map((a, j) => (
                        <div key={j} className={`action-badge ${a.success ? 'success' : 'failed'}`}>
                          {a.success ? `Updated ${a.label || a.field}` : `Failed: ${a.error}`}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="msg-content"><p>{msg.content}</p></div>
              )}
            </div>
          ))}

          {isStreaming && streamingText.trim() && (
            <div className="drawer-msg assistant">
              <div className="msg-content">{formatMessage(streamingText)}</div>
            </div>
          )}

          {isStreaming && !streamingText.trim() && (
            <div className="drawer-msg assistant">
              <div className="msg-content typing-status">
                <div className="spinner" style={{ width: 14, height: 14 }} />
                <span>Thinking...</span>
              </div>
            </div>
          )}

          {isProcessingActions && (
            <div className="drawer-msg assistant">
              <div className="msg-content typing-status">
                <div className="spinner" style={{ width: 14, height: 14 }} />
                <span>Running actions (this may take a moment)...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="drawer-input-area">
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
            className="btn btn-primary btn-sm send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
          >
            <Send size={15} />
          </button>
        </div>
      </div>

      <style>{`
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.15);
          z-index: 90;
          backdrop-filter: blur(2px);
        }
        .chat-drawer {
          position: fixed;
          top: 0;
          right: 0;
          width: var(--chat-drawer-width);
          height: 100vh;
          background: var(--bg-card);
          border-left: 1px solid var(--border-light);
          box-shadow: var(--shadow-xl);
          display: flex;
          flex-direction: column;
          z-index: 100;
          transform: translateX(100%);
          transition: transform var(--transition-slow);
        }
        .chat-drawer.open {
          transform: translateX(0);
        }
        .drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-light);
        }
        .drawer-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 0.95rem;
        }
        .drawer-actions {
          display: flex;
          gap: 4px;
        }
        .drawer-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .drawer-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 40px 16px;
          color: var(--text-tertiary);
          text-align: center;
        }
        .drawer-empty p {
          font-size: 0.9rem;
        }
        .drawer-starters {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
          margin-top: 8px;
        }
        .starter-chip {
          padding: 7px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: 100px;
          font-size: 0.8rem;
          color: var(--text-secondary);
          transition: all var(--transition-fast);
          cursor: pointer;
        }
        .starter-chip:hover {
          background: var(--accent-light);
          border-color: var(--accent);
          color: var(--accent);
        }
        .drawer-msg {
          max-width: 92%;
          animation: fadeIn 0.2s ease both;
        }
        .drawer-msg.user {
          align-self: flex-end;
        }
        .drawer-msg.user .msg-content {
          background: var(--accent);
          color: white;
          border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg);
          padding: 10px 14px;
        }
        .drawer-msg.assistant .msg-content {
          background: var(--bg-secondary);
          border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm);
          padding: 10px 14px;
        }
        .drawer-msg.error .msg-content {
          background: var(--status-rejected-bg);
          color: var(--status-rejected);
        }
        .msg-content {
          font-size: 0.88rem;
          line-height: 1.55;
        }
        .msg-content p {
          margin-bottom: 4px;
        }
        .msg-actions {
          margin-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .action-badge {
          font-size: 0.75rem;
          padding: 3px 8px;
          border-radius: var(--radius-sm);
          font-weight: 500;
        }
        .action-badge.success {
          background: var(--status-offer-bg);
          color: var(--status-offer);
        }
        .action-badge.failed {
          background: var(--status-rejected-bg);
          color: var(--status-rejected);
        }
        .msg-content p:last-child {
          margin-bottom: 0;
        }
        .typing-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px !important;
          font-size: 0.82rem;
          color: var(--text-tertiary);
        }
        .typing {
          display: flex;
          gap: 4px;
          padding: 12px 14px !important;
        }
        .typing span {
          width: 6px;
          height: 6px;
          background: var(--text-tertiary);
          border-radius: 50%;
          animation: bounce 1.2s infinite;
        }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        .drawer-input-area {
          padding: 12px 16px;
          border-top: 1px solid var(--border-light);
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }
        .drawer-input-area textarea {
          flex: 1;
          min-height: 40px;
          max-height: 100px;
          padding: 10px 12px;
          resize: none;
          font-size: 0.88rem;
        }
        .send-btn {
          flex-shrink: 0;
          padding: 10px 12px;
        }
      `}</style>
    </>
  );
}
