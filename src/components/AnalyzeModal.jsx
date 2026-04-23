import { useState, useRef } from 'react';
import { X, Upload, Link2, FileText, Plus, ChevronDown, ChevronRight, AlertCircle, Check } from 'lucide-react';
import { getProfile, getApiKey, getStories, saveJob, getColumnConfig, updateJob } from '../lib/storage';
import { analyzeJob, lookupFundingStage } from '../lib/claude';
import { parseFile } from '../lib/fileParser';
import { scrapeUrl } from '../lib/scraper';
import { renderMarkdown } from '../lib/markdown';

const STATUSES = ['Interested', 'Applied', 'Phone Screen', 'Interview', 'Final Round', 'Offer', 'Rejected', 'Pass'];
const WORK_STYLES = ['', 'Remote', 'Hybrid', 'Onsite'];

export default function AnalyzeModal({ isOpen, onClose, onJobAdded, onQuickAdd }) {
  const [step, setStep] = useState(1);
  const [jdTab, setJdTab] = useState('paste');
  const [jdText, setJdText] = useState('');
  const [jdUrl, setJdUrl] = useState('');
  const [jdError, setJdError] = useState('');
  const [jdLoading, setJdLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Editable fields for step 2
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('Applied');
  const [location, setLocation] = useState('');
  const [workStyle, setWorkStyle] = useState('');
  const [salaryRange, setSalaryRange] = useState('');

  const [expandedSections, setExpandedSections] = useState({ talking: true, fit: true });

  const jdFileRef = useRef(null);
  const abortRef = useRef(null);

  if (!isOpen) return null;

  const handleClose = () => {
    // Abort any in-flight analysis
    if (abortRef.current) {
      abortRef.current.aborted = true;
      abortRef.current = null;
    }
    setStep(1);
    setJdText('');
    setJdUrl('');
    setJdError('');
    setAnalysis(null);
    setError('');
    setAnalyzing(false);
    onClose();
  };

  const handleJdFile = async (file) => {
    if (!file) return;
    try {
      setJdLoading(true);
      const text = await parseFile(file);
      setJdText(text);
      setJdTab('paste');
      setJdError('');
    } catch (err) {
      setJdError(err.message);
    } finally {
      setJdLoading(false);
    }
  };

  const handleJdUrl = async () => {
    if (!jdUrl.trim()) return;
    try {
      setJdLoading(true);
      setJdError('');
      const text = await scrapeUrl(jdUrl.trim());
      setJdText(text);
      setJdTab('paste');
    } catch (err) {
      setJdError(err.message);
    } finally {
      setJdLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleJdFile(file);
  };

  const handleAnalyze = async () => {
    if (!jdText.trim()) { setError('Please add a job description.'); return; }
    const profile = getProfile();
    if (!profile.resume?.trim()) { setError('Please add your resume in Settings first.'); return; }
    if (!getApiKey()) { setError('Please add your API key in Settings first.'); return; }

    setError('');
    setAnalyzing(true);
    const thisRequest = { aborted: false };
    abortRef.current = thisRequest;

    try {
      const stories = getStories();
      const colConfig = getColumnConfig();
      const result = await analyzeJob({
        resume: profile.resume,
        jdText,
        stories,
        preferences: profile.preferences,
        customColumns: colConfig.customColumns,
      });

      // Don't update state if modal was closed during analysis
      if (thisRequest.aborted) return;

      setAnalysis(result);
      setCompany(result.company || '');
      setRole(result.role || '');
      setLocation(result.location || '');
      setWorkStyle(result.workStyle || '');
      setSalaryRange(result.salaryRange || '');
      setStep(2);
    } catch (err) {
      if (!thisRequest.aborted) setError(err.message);
    } finally {
      if (!thisRequest.aborted) setAnalyzing(false);
      abortRef.current = null;
    }
  };

  const handleAddToTracker = () => {
    const job = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      company,
      role,
      jdText,
      sourceUrl: jdUrl || '',
      status,
      location,
      workStyle,
      salaryRange,
      fundingStage: analysis.fundingStage || '',
      notes: '',
      referral: false,
      customFields: analysis.customFields || {},
      analysis: {
        talkingPoints: analysis.talkingPoints,
        starMatches: analysis.starMatches || [],
        researchBrief: analysis.researchBrief,
        gaps: analysis.gaps || [],
        preferenceFit: analysis.preferenceFit || null,
      },
      taggedStoryIds: (analysis.starMatches || []).map((m) => m.storyId).filter(Boolean),
    };

    saveJob(job);
    onJobAdded?.();
    handleClose();

    // Background funding lookup if not already set
    if (!job.fundingStage) {
      lookupFundingStage({ company: job.company, jdText: job.jdText }).then((result) => {
        const label = result.confidence === 'high' ? result.fundingStage
          : result.confidence === 'medium' ? `${result.fundingStage} (est.)`
          : `${result.fundingStage} (?)`;
        updateJob(job.id, { fundingStage: label, fundingData: result });
        onJobAdded?.();
      }).catch(() => {});
    }
  };

  const toggleSection = (key) => setExpandedSections((p) => ({ ...p, [key]: !p[key] }));
  const fitScore = analysis?.preferenceFit?.score || 0;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{step === 1 ? 'Add a Job' : 'Review Analysis'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={handleClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {step === 1 && (
            <div className="step-1">
              <div className="tabs">
                <button className={`tab ${jdTab === 'paste' ? 'active' : ''}`} onClick={() => setJdTab('paste')}>
                  <FileText size={14} /> Paste
                </button>
                <button className={`tab ${jdTab === 'upload' ? 'active' : ''}`} onClick={() => setJdTab('upload')}>
                  <Upload size={14} /> Upload
                </button>
                <button className={`tab ${jdTab === 'url' ? 'active' : ''}`} onClick={() => setJdTab('url')}>
                  <Link2 size={14} /> URL
                </button>
              </div>

              {jdTab === 'paste' && (
                <div
                  className={`paste-area ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder="Paste the job description here, or drag & drop a file..."
                    rows={14}
                  />
                </div>
              )}

              {jdTab === 'upload' && (
                <div
                  className={`upload-area ${dragOver ? 'drag-over' : ''}`}
                  onClick={() => jdFileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <input ref={jdFileRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => handleJdFile(e.target.files?.[0])} hidden />
                  <Upload size={28} strokeWidth={1.5} />
                  <p>Drag & drop or click to upload</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>PDF, DOCX, or TXT</p>
                  {jdLoading && <div className="spinner" />}
                </div>
              )}

              {jdTab === 'url' && (
                <div className="url-input">
                  <input
                    type="url"
                    value={jdUrl}
                    onChange={(e) => setJdUrl(e.target.value)}
                    placeholder="https://jobs.company.com/posting/..."
                    onKeyDown={(e) => e.key === 'Enter' && handleJdUrl()}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={handleJdUrl} disabled={jdLoading}>
                    {jdLoading ? <div className="spinner" /> : 'Fetch'}
                  </button>
                </div>
              )}

              {jdError && (
                <div className="error-msg"><AlertCircle size={14} /> {jdError}</div>
              )}
            </div>
          )}

          {step === 2 && analysis && (
            <div className="step-2">
              {/* Editable fields */}
              <div className="review-fields">
                <div className="field-row">
                  <div className="field">
                    <label>Company</label>
                    <input value={company} onChange={(e) => setCompany(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Role</label>
                    <input value={role} onChange={(e) => setRole(e.target.value)} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Work Style</label>
                    <select value={workStyle} onChange={(e) => setWorkStyle(e.target.value)}>
                      {WORK_STYLES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Location</label>
                    <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City" />
                  </div>
                  <div className="field">
                    <label>Salary</label>
                    <input value={salaryRange} onChange={(e) => setSalaryRange(e.target.value)} placeholder="e.g. $150k-$180k" />
                  </div>
                </div>
              </div>

              {/* Fit score */}
              {fitScore > 0 && (
                <div className="fit-banner" data-score={fitScore >= 7 ? 'high' : fitScore >= 4 ? 'med' : 'low'}>
                  <span className="fit-num">{fitScore}/10</span> Preference Fit
                  {analysis.preferenceFit?.matchingFactors?.length > 0 && (
                    <span className="fit-factors"> — {analysis.preferenceFit.matchingFactors.slice(0, 2).join(', ')}</span>
                  )}
                </div>
              )}

              {/* Sections */}
              {analysis.talkingPoints && (
                <div className="review-section">
                  <div className="review-section-header" onClick={() => toggleSection('talking')}>
                    {expandedSections.talking ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <h4>Talking Points</h4>
                  </div>
                  {expandedSections.talking && (
                    <div className="review-section-body">{renderMarkdown(analysis.talkingPoints)}</div>
                  )}
                </div>
              )}

              {analysis.researchBrief?.short && (
                <div className="review-section">
                  <div className="review-section-header" onClick={() => toggleSection('research')}>
                    {expandedSections.research ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <h4>Research Brief</h4>
                  </div>
                  {expandedSections.research && (
                    <div className="review-section-body">{renderMarkdown(analysis.researchBrief.short)}</div>
                  )}
                </div>
              )}

              {analysis.gaps?.length > 0 && (
                <div className="review-section">
                  <div className="review-section-header" onClick={() => toggleSection('gaps')}>
                    {expandedSections.gaps ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <h4>Gaps ({analysis.gaps.length})</h4>
                  </div>
                  {expandedSections.gaps && (
                    <div className="review-section-body">
                      {analysis.gaps.map((g, i) => (
                        <div key={i} style={{ marginBottom: 10 }}>
                          <strong style={{ fontSize: '0.88rem' }}>{g.gap}</strong>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>{g.howToAddress}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <div className="error-msg"><AlertCircle size={14} /> {error}</div>}
        </div>

        <div className="modal-footer">
          {step === 1 && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={handleClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => { onQuickAdd(jdText, jdUrl); handleClose(); }}
                disabled={!jdText.trim()}
              >
                <Plus size={16} /> Add Job
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" onClick={handleAddToTracker}>
                <Check size={16} /> Add to Tracker
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(3px);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.15s ease;
        }
        .modal-container {
          background: var(--bg-card);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-xl);
          width: 680px;
          max-width: 90vw;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          animation: fadeInScale 0.2s ease;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-light);
        }
        .modal-header h2 { margin: 0; font-size: 1.15rem; }
        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px 24px;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          padding: 16px 24px;
          border-top: 1px solid var(--border-light);
        }
        .footer-hint {
          margin-right: auto;
          font-size: 0.82rem;
          color: var(--text-tertiary);
        }
        /* Step 1 */
        .paste-area { position: relative; }
        .paste-area.drag-over textarea {
          border-color: var(--accent);
          background: var(--accent-light);
        }
        .paste-area textarea {
          min-height: 280px;
        }
        .upload-area {
          border: 2px dashed var(--border-light);
          border-radius: var(--radius-lg);
          padding: 60px 40px;
          text-align: center;
          color: var(--text-tertiary);
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .upload-area:hover, .upload-area.drag-over {
          border-color: var(--accent);
          background: var(--accent-light);
          color: var(--accent);
        }
        .url-input { display: flex; gap: 8px; }
        .url-input input { flex: 1; }
        .error-msg {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--status-rejected);
          font-size: 0.85rem;
          padding: 8px 12px;
          background: var(--status-rejected-bg);
          border-radius: var(--radius-md);
          margin-top: 12px;
        }
        /* Step 2 */
        .review-fields {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .field-row {
          display: flex;
          gap: 10px;
        }
        .field {
          flex: 1;
        }
        .field label {
          margin-bottom: 3px;
          font-size: 0.75rem;
        }
        .field input, .field select {
          padding: 7px 10px;
          font-size: 0.88rem;
        }
        .fit-banner {
          padding: 10px 14px;
          border-radius: var(--radius-md);
          font-size: 0.88rem;
          font-weight: 500;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .fit-banner[data-score="high"] { background: var(--status-offer-bg); color: var(--status-offer); }
        .fit-banner[data-score="med"] { background: var(--status-phone-bg); color: var(--status-phone); }
        .fit-banner[data-score="low"] { background: var(--status-rejected-bg); color: var(--status-rejected); }
        .fit-num { font-weight: 700; font-size: 1rem; }
        .fit-factors { font-weight: 400; opacity: 0.8; }
        .review-section {
          border: 1px solid var(--border-light);
          border-radius: var(--radius-md);
          margin-bottom: 8px;
        }
        .review-section-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 12px;
          cursor: pointer;
          transition: background var(--transition-fast);
        }
        .review-section-header:hover { background: var(--bg-secondary); }
        .review-section-header h4 { margin: 0; font-size: 0.9rem; }
        .review-section-body {
          padding: 0 12px 12px 32px;
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.55;
        }
        .review-section-body p { margin-bottom: 4px; }
      `}</style>
    </div>
  );
}
