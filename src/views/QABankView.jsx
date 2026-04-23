import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, HelpCircle, X, Sparkles, ArrowUpDown, ChevronsUpDown, ChevronsDownUp, Pencil, Check } from 'lucide-react';
import { getQABank, saveQA, updateQA, deleteQA, getResume } from '../lib/storage';
import { gradeAnswer } from '../lib/claude';
import { renderMarkdown } from '../lib/markdown';

const CATEGORIES = ['Behavioral', 'Technical', 'Product', 'Leadership', 'Culture Fit', 'Case Study', 'Situational', 'Other'];

export default function QABankView() {
  const [questions, setQuestions] = useState(() => getQABank());
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [gradingId, setGradingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  // New question form
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newCategory, setNewCategory] = useState('Behavioral');
  const [newSource, setNewSource] = useState('');

  const refresh = () => setQuestions(getQABank());

  const toggleExpand = (id) => setExpandedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const handleAdd = () => {
    if (!newQuestion.trim()) return;
    const qa = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
      category: newCategory,
      source: newSource.trim(),
      grade: null,
    };
    saveQA(qa);
    refresh();
    setExpandedIds((s) => new Set(s).add(qa.id));
    setNewQuestion('');
    setNewAnswer('');
    setNewSource('');
    setShowAdd(false);
  };

  const handleGrade = async (qa) => {
    setGradingId(qa.id);
    try {
      const resume = getResume();
      const result = await gradeAnswer({
        question: qa.question,
        answer: qa.answer,
        category: qa.category,
        resume,
      });
      updateQA(qa.id, { grade: result });
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setGradingId(null);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this Q&A?')) {
      deleteQA(id);
      refresh();
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = sortKey ? [...questions].sort((a, b) => {
    let va = '', vb = '';
    if (sortKey === 'score') { va = a.grade?.score || 0; vb = b.grade?.score || 0; return sortDir === 'asc' ? va - vb : vb - va; }
    if (sortKey === 'question') { va = a.question; vb = b.question; }
    if (sortKey === 'category') { va = a.category; vb = b.category; }
    if (sortKey === 'createdAt') { va = a.createdAt; vb = b.createdAt; }
    va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }) : questions;

  const addFormJSX = (
    <div className="card qa-add-form animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3>Add Question</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}><X size={16} /></button>
      </div>
      <div className="qa-form-fields">
        <div className="qa-form-row">
          <div className="qa-form-field" style={{ flex: 2 }}>
            <label>Question</label>
            <textarea value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="e.g. Tell me about a time you had to influence without authority." rows={2} />
          </div>
          <div className="qa-form-field">
            <label>Category</label>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="qa-form-field">
          <label>Your Answer</label>
          <textarea value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} placeholder="Paste or type your answer..." rows={5} />
        </div>
        <div className="qa-form-field">
          <label>Source (optional)</label>
          <input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="e.g. Google PM interview, Mock with coach" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newQuestion.trim()}>
          <Plus size={14} /> Add
        </button>
        {newAnswer.trim() && newQuestion.trim() && (
          <button className="btn btn-secondary btn-sm" onClick={() => { handleAdd(); }}>
            <Sparkles size={14} /> Add & Grade
          </button>
        )}
      </div>
    </div>
  );

  if (questions.length === 0 && !showAdd) {
    return (
      <div className="qa-view animate-in">
        <div className="view-header"><h1>Q&A Bank</h1></div>
        <div className="empty-state">
          <HelpCircle size={40} strokeWidth={1.2} />
          <h3>No questions yet</h3>
          <p>Add interview questions and your answers. The AI will grade your responses and suggest improvements.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Question
          </button>
        </div>
        {showAdd && addFormJSX}
        <style>{qaStyles}</style>
      </div>
    );
  }

  return (
    <div className="qa-view animate-in">
      <div className="view-header">
        <div className="header-row">
          <div>
            <h1>Q&A Bank</h1>
            <p className="view-subtitle">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setExpandedIds(new Set(questions.map((q) => q.id)))}>
              <ChevronsUpDown size={14} /> Expand All
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setExpandedIds(new Set())}>
              <ChevronsDownUp size={14} /> Collapse All
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add Question
            </button>
          </div>
        </div>
      </div>

      {showAdd && addFormJSX}

      <div className="qa-table-wrap">
        <table className="qa-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th className="sortable-th" style={{ width: 55 }} onClick={() => handleSort('score')}>Score <ArrowUpDown size={11} /></th>
              <th className="sortable-th" onClick={() => handleSort('question')}>Question <ArrowUpDown size={11} /></th>
              <th className="sortable-th" style={{ width: 100 }} onClick={() => handleSort('category')}>Category <ArrowUpDown size={11} /></th>
              <th style={{ width: 60 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((qa) => (
              <React.Fragment key={qa.id}>
                <tr className={expandedIds.has(qa.id) ? 'expanded' : ''}>
                  <td>
                    <button className="expand-btn" onClick={() => toggleExpand(qa.id)}>
                      {expandedIds.has(qa.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </td>
                  <td className="score-cell">
                    {gradingId === qa.id ? (
                      <div className="spinner" style={{ width: 14, height: 14, margin: '0 auto' }} />
                    ) : qa.grade?.score ? (
                      <span className="qa-score" data-score={qa.grade.score >= 7 ? 'high' : qa.grade.score >= 5 ? 'med' : 'low'}>
                        {qa.grade.score}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="qa-question-cell" onClick={() => toggleExpand(qa.id)}>
                    {qa.question}
                  </td>
                  <td><span className="qa-category">{qa.category}</span></td>
                  <td>
                    <button className="btn btn-ghost btn-sm btn-danger" onClick={() => handleDelete(qa.id)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
                {expandedIds.has(qa.id) && (
                  <tr className="detail-row">
                    <td colSpan={5}>
                      <QADetail
                        qa={qa}
                        onGrade={() => handleGrade(qa)}
                        isGrading={gradingId === qa.id}
                        onUpdate={(updates) => { updateQA(qa.id, updates); refresh(); }}
                        editing={editingId === qa.id}
                        onEdit={() => setEditingId(qa.id)}
                        onCancelEdit={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <style>{qaStyles}</style>
    </div>
  );
}

function QADetail({ qa, onGrade, isGrading, onUpdate, editing, onEdit, onCancelEdit }) {
  const [draftAnswer, setDraftAnswer] = useState(qa.answer);
  const grade = qa.grade;

  const handleSave = () => {
    onUpdate({ answer: draftAnswer });
    onCancelEdit();
  };

  return (
    <div className="qa-detail animate-in">
      <div className="qa-detail-header">
        <h4>{qa.question}</h4>
        <div className="qa-detail-actions">
          <button className="btn btn-ghost btn-sm" onClick={onGrade} disabled={isGrading || !qa.answer}>
            {isGrading ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Grading...</> : grade ? <><Sparkles size={13} /> Re-grade</> : <><Sparkles size={13} /> Grade Answer</>}
          </button>
          {!editing && (
            <button className="btn btn-ghost btn-sm" onClick={onEdit}><Pencil size={13} /> Edit</button>
          )}
        </div>
      </div>

      {qa.source && <p className="qa-source">Source: {qa.source}</p>}

      {/* Answer */}
      <div className="qa-section">
        <label>Your Answer</label>
        {editing ? (
          <div>
            <textarea value={draftAnswer} onChange={(e) => setDraftAnswer(e.target.value)} rows={5} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setDraftAnswer(qa.answer); onCancelEdit(); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="qa-answer-text" onClick={onEdit}>
            {qa.answer ? renderMarkdown(qa.answer) : <span className="qa-empty">Click to add your answer...</span>}
          </div>
        )}
      </div>

      {/* Grade results */}
      {grade && (
        <div className="qa-grade-results">
          <div className="qa-grade-header">
            <span className="qa-score-big" data-score={grade.score >= 7 ? 'high' : grade.score >= 5 ? 'med' : 'low'}>{grade.score}/10</span>
          </div>

          {grade.strengths?.length > 0 && (
            <div className="qa-grade-section">
              <label>Strengths</label>
              <ul className="qa-grade-list strengths">
                {grade.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {grade.weaknesses?.length > 0 && (
            <div className="qa-grade-section">
              <label>Areas to Improve</label>
              <ul className="qa-grade-list weaknesses">
                {grade.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {grade.tips?.length > 0 && (
            <div className="qa-grade-section">
              <label>Tips</label>
              <ul className="qa-grade-list tips">
                {grade.tips.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {grade.suggestedAnswer && (
            <div className="qa-grade-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Suggested Improved Answer</label>
                <button className="btn btn-ghost btn-sm" onClick={() => { onUpdate({ answer: grade.suggestedAnswer }); setDraftAnswer(grade.suggestedAnswer); }}>
                  <Check size={13} /> Use This Answer
                </button>
              </div>
              <div className="qa-suggested">{renderMarkdown(grade.suggestedAnswer)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const qaStyles = `
  .qa-view {
    padding: 20px 24px;
    overflow: auto;
    height: 100%;
  }
  .view-header { margin-bottom: 20px; }
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .header-actions { display: flex; gap: 8px; }
  .view-subtitle { color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px; }

  .qa-add-form {
    margin-bottom: 16px;
    padding: 20px;
  }
  .qa-form-fields { display: flex; flex-direction: column; gap: 12px; }
  .qa-form-row { display: flex; gap: 12px; }
  .qa-form-field label { margin-bottom: 4px; }
  .qa-form-field { display: flex; flex-direction: column; flex: 1; }

  .qa-table-wrap {
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-sm);
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }
  .qa-table-wrap:hover { scrollbar-color: var(--border-medium) transparent; }
  .qa-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  .qa-table th {
    text-align: left;
    padding: 8px 10px;
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
  .sortable-th { cursor: pointer; }
  .sortable-th:hover { color: var(--text-primary); }
  .qa-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
  }
  .qa-table tr:hover:not(.detail-row) { background: var(--bg-secondary); }
  .qa-table tr.expanded { background: var(--bg-secondary); }
  .expand-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-tertiary);
    padding: 4px;
    display: flex;
  }
  .expand-btn:hover { color: var(--text-primary); }
  .score-cell { text-align: center; }
  .qa-score {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 0.78rem;
    font-weight: 700;
  }
  .qa-score[data-score="high"] { background: var(--status-offer-bg); color: var(--status-offer); border: 1px solid var(--status-offer); }
  .qa-score[data-score="med"] { background: var(--status-phone-bg); color: var(--status-phone); border: 1px solid var(--status-phone); }
  .qa-score[data-score="low"] { background: var(--status-rejected-bg); color: var(--status-rejected); border: 1px solid var(--status-rejected); }
  .qa-question-cell {
    cursor: pointer;
    font-weight: 500;
  }
  .qa-category {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: var(--bg-tertiary);
    border-radius: 100px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .detail-row td {
    padding: 0;
    background: var(--bg-secondary);
  }
  .qa-detail {
    padding: 16px 20px;
  }
  .qa-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .qa-detail-header h4 { margin: 0; font-size: 1rem; line-height: 1.4; max-width: 500px; }
  .qa-detail-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .qa-source {
    font-size: 0.78rem;
    color: var(--text-tertiary);
    margin-bottom: 12px;
    font-style: italic;
  }
  .qa-section { margin-bottom: 14px; }
  .qa-section label { margin-bottom: 6px; }
  .qa-answer-text {
    font-size: 0.9rem;
    color: var(--text-primary);
    line-height: 1.6;
    padding: 10px 14px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    cursor: pointer;
    min-height: 40px;
  }
  .qa-answer-text:hover { border-color: var(--accent); }
  .qa-answer-text p { margin-bottom: 4px; }
  .qa-empty { color: var(--text-tertiary); font-style: italic; }

  .qa-grade-results {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: 14px 16px;
  }
  .qa-grade-header {
    margin-bottom: 10px;
  }
  .qa-score-big {
    font-size: 1.1rem;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: var(--radius-md);
  }
  .qa-score-big[data-score="high"] { background: var(--status-offer-bg); color: var(--status-offer); }
  .qa-score-big[data-score="med"] { background: var(--status-phone-bg); color: var(--status-phone); }
  .qa-score-big[data-score="low"] { background: var(--status-rejected-bg); color: var(--status-rejected); }
  .qa-grade-section { margin-top: 10px; }
  .qa-grade-section label { margin-bottom: 4px; font-size: 0.75rem; }
  .qa-grade-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .qa-grade-list li {
    font-size: 0.85rem;
    line-height: 1.5;
    display: flex;
    gap: 8px;
  }
  .qa-grade-list li::before { flex-shrink: 0; }
  .qa-grade-list.strengths li::before { content: '✓'; color: var(--status-offer); }
  .qa-grade-list.weaknesses li::before { content: '✗'; color: var(--status-rejected); }
  .qa-grade-list.tips li::before { content: '💡'; }
  .qa-suggested {
    font-size: 0.88rem;
    line-height: 1.6;
    padding: 10px 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    font-style: italic;
    color: var(--text-secondary);
    margin-top: 6px;
  }
  .qa-suggested p { margin-bottom: 4px; }
`;
