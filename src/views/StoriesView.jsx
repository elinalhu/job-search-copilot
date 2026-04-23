import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, BookOpen, X, Clipboard, Sparkles, Save, Link, Pencil, GripVertical, ChevronsDownUp, ChevronsUpDown, ArrowUpDown } from 'lucide-react';
import { getStories, saveStory, updateStory, deleteStory, reorderStories, getJobs } from '../lib/storage';
import { parseStory, parseMultipleStories, scoreStory } from '../lib/claude';

const SUGGESTED_TAGS = ['leadership', 'technical', 'cross-functional', 'data-driven', 'customer-facing', 'conflict-resolution', 'ambiguity', 'scale'];

// Format STAR text: bold numbers/metrics, split sentences into bullet points
function formatStarText(text) {
  if (!text) return null;
  // Split on sentence boundaries or newlines to create bullet points
  const sentences = text
    .split(/(?:\n|(?<=[.!?])\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return (
    <ul className="star-bullets">
      {sentences.map((s, i) => (
        <li key={i}><span>{highlightMetrics(s)}</span></li>
      ))}
    </ul>
  );
}

// Bold complete metric expressions: $amounts, percentages, large numbers with context
function highlightMetrics(text) {
  const parts = [];
  // Match complete metrics only at word boundaries:
  // $100K, $2M, $150k-$180k, 97%, 80%+, 50K+, 3x, "200+ customers"
  const metricRegex = /(?<!\w)(\$[\d,.]+[kKmMbB]?(?:\s*[-–—]\s*\$[\d,.]+[kKmMbB]?)?|[\d,.]+[kKmMbB]\+?(?:\s+(?:team members|engineers|customers|users|clients|people|partners|stakeholders|projects|products|countries|markets|months|weeks|days|hours|menu items))?|[\d,.]+%\+?|[\d,.]+x)(?!\w)/g;

  let lastIndex = 0;
  let match;
  while ((match = metricRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(<strong key={`m${match.index}`}>{match[0]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : text;
}

export default function StoriesView() {
  const [stories, setStories] = useState(() => getStories());
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteMode, setPasteMode] = useState('single'); // 'single' | 'transcript'
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null); // { id, position }
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [scoringId, setScoringId] = useState(null);

  const jobs = getJobs();

  const refreshStories = () => setStories(getStories());

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedStories = sortKey ? [...stories].sort((a, b) => {
    let va = '', vb = '';
    if (sortKey === 'company') { va = a.company || ''; vb = b.company || ''; }
    else if (sortKey === 'title') { va = a.title || ''; vb = b.title || ''; }
    else if (sortKey === 'tags') { va = (a.tags || []).join(','); vb = (b.tags || []).join(','); }
    else if (sortKey === 'score') { return sortDir === 'asc' ? (a.scoreData?.score || 0) - (b.scoreData?.score || 0) : (b.scoreData?.score || 0) - (a.scoreData?.score || 0); }
    else if (sortKey === 'createdAt') { va = a.createdAt || ''; vb = b.createdAt || ''; }
    va = va.toLowerCase(); vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }) : stories;

  const handleDragStart = (id) => setDragId(id);
  const handleDragOverStory = (e, id) => {
    e.preventDefault();
    if (id !== dragId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const position = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
      setDragOver({ id, position });
    }
  };
  const handleDrop = () => {
    if (!dragId || !dragOver || dragId === dragOver.id) { setDragId(null); setDragOver(null); return; }
    const ids = stories.map((s) => s.id);
    const fromIdx = ids.indexOf(dragId);
    ids.splice(fromIdx, 1);
    let toIdx = ids.indexOf(dragOver.id);
    if (dragOver.position === 'below') toIdx += 1;
    ids.splice(toIdx, 0, dragId);
    reorderStories(ids);
    refreshStories();
    setDragId(null);
    setDragOver(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOver(null); };

  const handleNewStory = () => {
    const story = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: '',
      situation: '',
      task: '',
      action: '',
      result: '',
      tags: [],
      taggedJobIds: [],
    };
    saveStory(story);
    refreshStories();
    setExpandedIds((s) => new Set(s).add(story.id));
    setEditingId(story.id);
    setIsNew(true);
  };

  const handleParsePaste = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    setParseError('');
    try {
      if (pasteMode === 'transcript') {
        // Parse multiple stories from transcript
        const parsedStories = await parseMultipleStories(pasteText.trim());
        const newIds = [];
        for (const parsed of parsedStories) {
          const story = {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            title: parsed.title || '',
            company: parsed.company || '',
            situation: parsed.situation || '',
            task: parsed.task || '',
            action: parsed.action || '',
            result: parsed.result || '',
            tags: parsed.tags || [],
            taggedJobIds: [],
          };
          saveStory(story);
          newIds.push(story.id);
        }
        refreshStories();
        setExpandedIds((s) => { const n = new Set(s); newIds.forEach((id) => n.add(id)); return n; });
        setIsPasting(false);
        setPasteText('');
        setPasteMode('single');
      } else {
        // Parse single story
        const parsed = await parseStory(pasteText.trim());
        const story = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          title: parsed.title || '',
          company: parsed.company || '',
          situation: parsed.situation || '',
          task: parsed.task || '',
          action: parsed.action || '',
          result: parsed.result || '',
          tags: parsed.tags || [],
          taggedJobIds: [],
        };
        saveStory(story);
        refreshStories();
        setExpandedIds((s) => new Set(s).add(story.id));
        setEditingId(null);
        setIsPasting(false);
        setPasteText('');
      }
    } catch (err) {
      setParseError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleSaveStory = (id, updates) => {
    updateStory(id, updates);
    refreshStories();
    setEditingId(null);
  };

  const handleScoreStory = async (story) => {
    setScoringId(story.id);
    try {
      const result = await scoreStory(story);
      updateStory(story.id, { scoreData: result });
      refreshStories();
    } catch (err) {
      alert(err.message);
    } finally {
      setScoringId(null);
    }
  };

  const handleDelete = (id) => {
    deleteStory(id);
    refreshStories();
    setDeleteConfirm(null);
    if (expandedIds.has(id)) { setExpandedIds((s) => { const n = new Set(s); n.delete(id); return n; }); setEditingId(null); }
  };

  if (stories.length === 0 && !isPasting) {
    return (
      <div className="stories-view animate-in">
        <div className="view-header">
          <h1>STAR Stories</h1>
        </div>
        <div className="empty-state">
          <BookOpen size={40} strokeWidth={1.2} />
          <h3>No stories yet</h3>
          <p>Add your interview stories in STAR format. They'll be matched to job descriptions when you analyze roles.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={handleNewStory}>
              <Plus size={16} /> New Story
            </button>
            <button className="btn btn-secondary" onClick={() => setIsPasting(true)}>
              <Clipboard size={16} /> Paste Existing
            </button>
          </div>
        </div>
        <style>{storiesStyles}</style>
      </div>
    );
  }

  return (
    <div className="stories-view animate-in">
      <div className="view-header">
        <div className="header-row">
          <div>
            <h1>STAR Stories</h1>
            <p className="view-subtitle">{stories.length} stor{stories.length !== 1 ? 'ies' : 'y'}</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setExpandedIds(new Set(stories.map((s) => s.id)))}>
              <ChevronsUpDown size={14} /> Expand All
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setExpandedIds(new Set()); setEditingId(null); }}>
              <ChevronsDownUp size={14} /> Collapse All
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setIsPasting(true)}>
              <Clipboard size={14} /> Paste & Parse
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleNewStory}>
              <Plus size={14} /> New Story
            </button>
          </div>
        </div>
      </div>

      {/* Paste modal */}
      {isPasting && (
        <div className="card paste-card animate-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3><Sparkles size={16} /> Paste & Auto-Parse</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => { setIsPasting(false); setPasteText(''); setParseError(''); setPasteMode('single'); }}>
              <X size={16} />
            </button>
          </div>
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button className={`tab ${pasteMode === 'single' ? 'active' : ''}`} onClick={() => setPasteMode('single')}>
              Single Story
            </button>
            <button className={`tab ${pasteMode === 'transcript' ? 'active' : ''}`} onClick={() => setPasteMode('transcript')}>
              Transcript (Multiple)
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
            {pasteMode === 'transcript'
              ? 'Paste a conversation transcript, interview notes, or any text containing multiple stories. Claude will identify and separate each story into its own STAR entry.'
              : 'Paste a single story or experience and Claude will parse it into S/T/A/R fields.'}
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={pasteMode === 'transcript' ? 'Paste your transcript or notes here... Multiple stories will be extracted automatically.' : 'Paste your story here...'}
            rows={pasteMode === 'transcript' ? 12 : 8}
          />
          {parseError && (
            <div style={{ color: 'var(--status-rejected)', fontSize: '0.85rem', marginTop: 8 }}>{parseError}</div>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleParsePaste}
            disabled={parsing || !pasteText.trim()}
            style={{ marginTop: 12 }}
          >
            {parsing ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Parsing...</> : pasteMode === 'transcript' ? 'Extract Stories' : 'Parse into STAR'}
          </button>
        </div>
      )}

      {/* Stories table */}
      <div className="stories-table-wrap">
        <table className="stories-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th style={{ width: 30 }}></th>
              <th className="sortable-th" style={{ width: 55 }} onClick={() => handleSort('score')}>Score <ArrowUpDown size={11} /></th>
              <th className="sortable-th" onClick={() => handleSort('company')}>Company <ArrowUpDown size={11} /></th>
              <th className="sortable-th" onClick={() => handleSort('title')}>Title <ArrowUpDown size={11} /></th>
              <th className="sortable-th" onClick={() => handleSort('tags')}>Tags <ArrowUpDown size={11} /></th>
              <th className="sortable-th" onClick={() => handleSort('createdAt')}>Updated <ArrowUpDown size={11} /></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedStories.map((story) => (
              <React.Fragment key={story.id}>
                <tr
                  className={`${expandedIds.has(story.id) ? 'expanded' : ''} ${dragOver?.id === story.id && dragOver?.position === 'above' ? 'drop-above' : ''} ${dragOver?.id === story.id && dragOver?.position === 'below' ? 'drop-below' : ''} ${dragId === story.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(story.id)}
                  onDragOver={(e) => handleDragOverStory(e, story.id)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onDoubleClick={() => { setExpandedIds((s) => new Set(s).add(story.id)); setEditingId(story.id); }}
                >
                  <td className="drag-handle-cell">
                    <GripVertical size={14} />
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setExpandedIds((s) => { const n = new Set(s); if (n.has(story.id)) n.delete(story.id); else n.add(story.id); return n; })}>
                      {expandedIds.has(story.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </td>
                  <td className="score-cell">
                    {scoringId === story.id ? (
                      <div className="spinner" style={{ width: 14, height: 14, margin: '0 auto' }} />
                    ) : story.scoreData?.score ? (
                      <span
                        className="story-score-badge"
                        data-score={story.scoreData.score >= 7 ? 'high' : story.scoreData.score >= 5 ? 'med' : 'low'}
                        title={story.scoreData.reasoning}
                        onClick={() => handleScoreStory(story)}
                      >
                        {story.scoreData.score}
                      </span>
                    ) : (
                      <button className="score-btn" onClick={() => handleScoreStory(story)} title="Score this story">
                        —
                      </button>
                    )}
                  </td>
                  <td className="story-company" onClick={() => setExpandedIds((s) => { const n = new Set(s); if (n.has(story.id)) n.delete(story.id); else n.add(story.id); return n; })}>
                    {story.company || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                  </td>
                  <td className="story-title" onClick={() => setExpandedIds((s) => { const n = new Set(s); if (n.has(story.id)) n.delete(story.id); else n.add(story.id); return n; })}>
                    {story.title || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Untitled</span>}
                  </td>
                  <td>
                    <div className="tag-list">
                      {story.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                    </div>
                  </td>
                  <td className="date-cell">
                    {new Date(story.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    {deleteConfirm === story.id ? (
                      <div className="action-btns">
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(story.id)}>Confirm</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setDeleteConfirm(story.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
                {expandedIds.has(story.id) && (
                  <tr key={`${story.id}-detail`} className="detail-row">
                    <td colSpan={8}>
                      {editingId === story.id ? (
                        <StoryEditor
                          story={story}
                          jobs={jobs}
                          onSave={(updates) => handleSaveStory(story.id, updates)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <StoryViewer
                          story={story}
                          jobs={jobs}
                          onEdit={() => setEditingId(story.id)}
                          onScore={() => handleScoreStory(story)}
                          isScoring={scoringId === story.id}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <style>{storiesStyles}</style>
    </div>
  );
}

function StoryViewer({ story, jobs, onEdit, onScore, isScoring }) {
  const sd = story.scoreData;

  return (
    <div className="story-viewer animate-in">
      <div className="viewer-header">
        <div>
          {story.company && <span className="viewer-company">{story.company}</span>}
          <h3>{story.title || 'Untitled Story'}</h3>
        </div>
        <div className="viewer-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={onScore} disabled={isScoring}>
            {isScoring ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Scoring...</> : sd ? 'Re-score' : 'Score Story'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>
            <Pencil size={13} /> Edit
          </button>
        </div>
      </div>

      {/* Score details */}
      {sd && (
        <div className="score-details">
          <div className="score-details-header">
            <span className="score-big" data-score={sd.score >= 7 ? 'high' : sd.score >= 5 ? 'med' : 'low'}>{sd.score}/10</span>
            <p className="score-reasoning">{sd.reasoning}</p>
          </div>
          {sd.strengths?.length > 0 && (
            <div className="score-section">
              <label>Strengths</label>
              <ul className="score-list strengths">
                {sd.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {sd.improvements?.length > 0 && (
            <div className="score-section">
              <label>How to Improve</label>
              <ul className="score-list improvements">
                {sd.improvements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {sd.revisedResult && (
            <div className="score-section">
              <label>Suggested Result</label>
              <p className="score-revised">{sd.revisedResult}</p>
            </div>
          )}
        </div>
      )}

      <div className="viewer-star-grid">
        <div className="viewer-field">
          <label>Situation</label>
          {story.situation ? formatStarText(story.situation) : <p className="viewer-text"><span className="viewer-empty">Not filled in yet</span></p>}
        </div>
        <div className="viewer-field">
          <label>Task</label>
          {story.task ? formatStarText(story.task) : <p className="viewer-text"><span className="viewer-empty">Not filled in yet</span></p>}
        </div>
        <div className="viewer-field">
          <label>Action</label>
          {story.action ? formatStarText(story.action) : <p className="viewer-text"><span className="viewer-empty">Not filled in yet</span></p>}
        </div>
        <div className="viewer-field">
          <label>Result</label>
          {story.result ? formatStarText(story.result) : <p className="viewer-text"><span className="viewer-empty">Not filled in yet</span></p>}
        </div>
      </div>

      {story.tags.length > 0 && (
        <div className="viewer-field">
          <label>Tags</label>
          <div className="tag-list">
            {story.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>
      )}

    </div>
  );
}

function StoryEditor({ story, jobs, onSave, onCancel }) {
  const [draft, setDraft] = useState({ ...story });
  const [tagInput, setTagInput] = useState('');

  const handleField = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const handleAddTag = (tag) => {
    const t = tag.trim().toLowerCase();
    if (t && !draft.tags.includes(t)) {
      const newTags = [...draft.tags, t];
      setDraft((d) => ({ ...d, tags: newTags }));
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag) => {
    setDraft((d) => ({ ...d, tags: d.tags.filter((t) => t !== tag) }));
  };

  const handleToggleJob = (jobId) => {
    const ids = draft.taggedJobIds || [];
    const newIds = ids.includes(jobId) ? ids.filter((id) => id !== jobId) : [...ids, jobId];
    setDraft((d) => ({ ...d, taggedJobIds: newIds }));
  };

  const handleSave = () => {
    onSave(draft);
  };

  const handleEditorKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="story-editor animate-in">
      <div className="editor-row">
        <div className="editor-field" style={{ flex: 1 }}>
          <label>Company</label>
          <input value={draft.company || ''} onChange={(e) => handleField('company', e.target.value)} placeholder="Company name" onKeyDown={handleEditorKeyDown} />
        </div>
        <div className="editor-field" style={{ flex: 2 }}>
          <label>Title</label>
          <input value={draft.title} onChange={(e) => handleField('title', e.target.value)} placeholder="Brief descriptive title" onKeyDown={handleEditorKeyDown} />
        </div>
      </div>

      <div className="editor-star-grid">
        <div className="editor-field">
          <label>Situation</label>
          <textarea value={draft.situation} onChange={(e) => handleField('situation', e.target.value)} placeholder="What was the context?" rows={3} onKeyDown={handleEditorKeyDown} />
        </div>
        <div className="editor-field">
          <label>Task</label>
          <textarea value={draft.task} onChange={(e) => handleField('task', e.target.value)} placeholder="What was your responsibility?" rows={3} onKeyDown={handleEditorKeyDown} />
        </div>
        <div className="editor-field">
          <label>Action</label>
          <textarea value={draft.action} onChange={(e) => handleField('action', e.target.value)} placeholder="What did you do?" rows={3} onKeyDown={handleEditorKeyDown} />
        </div>
        <div className="editor-field">
          <label>Result</label>
          <textarea value={draft.result} onChange={(e) => handleField('result', e.target.value)} placeholder="What was the outcome?" rows={3} onKeyDown={handleEditorKeyDown} />
        </div>
      </div>

      <div className="editor-field">
        <label>Tags</label>
        <div className="tags-area">
          {draft.tags.map((t) => (
            <span key={t} className="tag">
              {t}
              <span className="tag-remove" onClick={() => handleRemoveTag(t)}><X size={12} /></span>
            </span>
          ))}
          <input
            className="tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                handleAddTag(tagInput);
              }
            }}
            placeholder="Type + enter"
          />
        </div>
        <div className="suggested-tags">
          {SUGGESTED_TAGS.filter((t) => !draft.tags.includes(t)).map((t) => (
            <button key={t} className="tag suggested" onClick={() => handleAddTag(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="editor-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSave}>
          <Save size={14} /> Save Changes
        </button>
        {onCancel && (
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

const storiesStyles = `
  .stories-view {
    padding: 32px 40px;
    overflow-y: auto;
    height: 100%;
  }
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }
  .header-actions {
    display: flex;
    gap: 8px;
  }
  .view-subtitle {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-top: 4px;
  }
  .paste-card {
    margin-bottom: 20px;
  }
  .stories-table-wrap {
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }
  .stories-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }
  .stories-table th {
    text-align: left;
    padding: 12px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-tertiary);
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
    user-select: none;
    white-space: nowrap;
  }
  .sortable-th {
    cursor: pointer;
  }
  .sortable-th:hover {
    color: var(--text-primary);
  }
  .stories-table td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
  }
  .stories-table tr:last-child td { border-bottom: none; }
  .stories-table tr:hover:not(.detail-row) { background: var(--bg-secondary); }
  .stories-table tr.expanded { background: var(--bg-secondary); }
  .drag-handle-cell {
    cursor: grab;
    color: var(--text-tertiary);
    text-align: center;
    padding: 0 !important;
    width: 28px;
  }
  .drag-handle-cell:active { cursor: grabbing; }
  tr.dragging {
    opacity: 0.3;
  }
  tr.drop-above td:first-child {
    box-shadow: inset 0 2px 0 0 var(--accent);
  }
  tr.drop-above td {
    box-shadow: inset 0 2px 0 0 var(--accent);
  }
  tr.drop-below td {
    box-shadow: inset 0 -2px 0 0 var(--accent);
  }
  .score-cell {
    text-align: center;
  }
  .story-score-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform var(--transition-fast);
  }
  .story-score-badge:hover { transform: scale(1.15); }
  .story-score-badge[data-score="high"] { background: var(--status-offer-bg); color: var(--status-offer); border: 1px solid var(--status-offer); }
  .story-score-badge[data-score="med"] { background: var(--status-phone-bg); color: var(--status-phone); border: 1px solid var(--status-phone); }
  .story-score-badge[data-score="low"] { background: var(--status-rejected-bg); color: var(--status-rejected); border: 1px solid var(--status-rejected); }
  .score-btn {
    color: var(--text-tertiary);
    cursor: pointer;
    background: none;
    border: none;
    font-size: 0.85rem;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }
  .score-btn:hover { color: var(--accent); background: var(--accent-light); }
  .viewer-header-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .score-details {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    margin-bottom: 14px;
  }
  .score-details-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }
  .score-big {
    font-size: 1.1rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }
  .score-big[data-score="high"] { background: var(--status-offer-bg); color: var(--status-offer); }
  .score-big[data-score="med"] { background: var(--status-phone-bg); color: var(--status-phone); }
  .score-big[data-score="low"] { background: var(--status-rejected-bg); color: var(--status-rejected); }
  .score-reasoning {
    font-size: 0.88rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
  }
  .score-section {
    margin-top: 10px;
  }
  .score-section label {
    margin-bottom: 4px;
    font-size: 0.75rem;
  }
  .score-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .score-list li {
    font-size: 0.85rem;
    line-height: 1.5;
    display: flex;
    gap: 8px;
  }
  .score-list li::before {
    flex-shrink: 0;
  }
  .score-list.strengths li::before {
    content: '✓';
    color: var(--status-offer);
  }
  .score-list.improvements li::before {
    content: '→';
    color: var(--accent);
  }
  .score-revised {
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
    padding: 8px 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    font-style: italic;
  }
  .story-company {
    font-weight: 500;
    cursor: pointer;
    font-size: 0.88rem;
    color: var(--text-secondary);
  }
  .story-title {
    font-weight: 500;
    cursor: pointer;
  }
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .link-count {
    color: var(--accent);
    font-size: 0.82rem;
    font-weight: 500;
  }
  .date-cell {
    white-space: nowrap;
    color: var(--text-secondary);
    font-size: 0.82rem;
  }
  .action-btns {
    display: flex;
    gap: 4px;
  }
  .detail-row td {
    padding: 0;
    background: var(--bg-secondary);
  }
  .story-viewer {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .viewer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .viewer-company {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .viewer-header h3 {
    margin: 0;
  }
  .viewer-star-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 16px;
  }
  .viewer-field label {
    margin-bottom: 4px;
  }
  .viewer-text {
    font-size: 0.9rem;
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
    white-space: pre-wrap;
  }
  .star-bullets {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .star-bullets li {
    font-size: 0.9rem;
    color: var(--text-primary);
    line-height: 1.55;
    display: flex;
    gap: 8px;
  }
  .star-bullets li::before {
    content: '•';
    flex-shrink: 0;
    color: var(--text-tertiary);
  }
  .star-bullets strong {
    color: var(--accent-hover);
    font-weight: 600;
  }
  .viewer-empty {
    color: var(--text-tertiary);
    font-style: italic;
  }
  .viewer-jobs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .viewer-job-chip {
    font-size: 0.82rem;
    color: var(--text-secondary);
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    padding: 3px 10px;
    border-radius: 100px;
  }
  .story-editor {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .editor-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .editor-row {
    display: flex;
    gap: 14px;
  }
  .editor-field label {
    margin-bottom: 6px;
  }
  .editor-star-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .tags-area {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding: 8px 10px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    min-height: 38px;
  }
  .tag-input {
    border: none;
    background: none;
    padding: 2px 4px;
    font-size: 0.85rem;
    min-width: 100px;
    flex: 1;
    outline: none;
    width: auto;
  }
  .tag-input:focus {
    box-shadow: none;
  }
  .suggested-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }
  .suggested {
    cursor: pointer;
    opacity: 0.6;
    transition: opacity var(--transition-fast);
    border: 1px dashed var(--border-medium);
    background: transparent;
  }
  .suggested:hover {
    opacity: 1;
    background: var(--bg-tertiary);
  }
  .job-links {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 150px;
    overflow-y: auto;
  }
  .job-link-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    text-transform: none;
    font-weight: 400;
    color: var(--text-primary);
    cursor: pointer;
  }
  .job-link-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
`;
