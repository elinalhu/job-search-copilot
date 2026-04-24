import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, Trash2, Download, FileSpreadsheet, ChevronDown, ChevronRight, Search, ExternalLink, MessageCircle, MoreVertical, Link2, Plus, RefreshCw, Check, AlertCircle, Settings2, X, Eye, EyeOff, ChevronsDownUp, ChevronsUpDown, Filter } from 'lucide-react';
import { getJobs, updateJob, deleteJob, getProfile, getColumnConfig, saveColumnConfig, saveJob, getStories } from '../lib/storage';
import { exportCSV, exportXLSX } from '../lib/exportUtils';
import { renderMarkdown } from '../lib/markdown';
import { refreshPreferenceFit, analyzeJob, lookupFundingStage } from '../lib/claude';
import AnalyzeModal from '../components/AnalyzeModal';

const STATUSES = ['Interested', 'Applied', 'Phone Screen', 'Interview', 'Final Round', 'Offer', 'Rejected', 'Pass'];
const WORK_STYLES = ['', 'Remote', 'Hybrid', 'Onsite'];

// Built-in toggleable columns (expand and menu are always shown)
const BUILT_IN_COLUMNS = [
  { key: 'fit', label: 'Fit', width: 55, sortable: true, sortKey: 'fitScore' },
  { key: 'company', label: 'Company', width: 130, sortable: true },
  { key: 'role', label: 'Role', width: 160, sortable: true },
  { key: 'status', label: 'Status', width: 105, sortable: true },
  { key: 'workStyle', label: 'Work Style', width: 95, sortable: true },
  { key: 'location', label: 'Location', width: 110, sortable: true },
  { key: 'salary', label: 'Salary', width: 100 },
  { key: 'referral', label: 'Referral', width: 75 },
  { key: 'url', label: 'Link', width: 50 },
  { key: 'fundingStage', label: 'Stage', width: 90 },
  { key: 'notes', label: 'Notes', width: 120 },
  { key: 'date', label: 'Date', width: 115, sortable: true, sortKey: 'trackedDate' },
];

export default function TrackerView({ onNavigate, onOpenChat }) {
  const [jobs, setJobs] = useState(() => getJobs());
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [colWidths, setColWidths] = useState({});
  const resizingRef = useRef(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);
  const menuBtnRectRef = useRef(null);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [refreshingFitId, setRefreshingFitId] = useState(null);
  const [lookingUpFundingId, setLookingUpFundingId] = useState(null);
  const [columnConfig, setColumnConfig] = useState(() => getColumnConfig());
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnInstruction, setNewColumnInstruction] = useState('');
  const [processingJobs, setProcessingJobs] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ statuses: [], workStyles: [], search: '' });
  const [showHidden, setShowHidden] = useState(false);
  const [dragColKey, setDragColKey] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null); // { key, position: 'above' | 'below' }
  const [editingColumn, setEditingColumn] = useState(null); // full column object being edited
  const [editColLabel, setEditColLabel] = useState('');
  const [editColInstruction, setEditColInstruction] = useState('');

  // Build visible columns list
  const allColumnsUnordered = [
    ...BUILT_IN_COLUMNS,
    ...columnConfig.customColumns.map((c) => ({ key: c.key, label: c.label, width: c.width || 120, custom: true, instruction: c.instruction || '' })),
  ];
  // Apply custom ordering if set
  const allColumns = columnConfig.columnOrder?.length > 0
    ? [
        ...columnConfig.columnOrder.map((k) => allColumnsUnordered.find((c) => c.key === k)).filter(Boolean),
        ...allColumnsUnordered.filter((c) => !columnConfig.columnOrder.includes(c.key)),
      ]
    : allColumnsUnordered;
  const visibleColumns = allColumns.filter((c) => !columnConfig.hiddenColumns.includes(c.key));

  const toggleColumnVisibility = (key) => {
    const hidden = columnConfig.hiddenColumns.includes(key)
      ? columnConfig.hiddenColumns.filter((k) => k !== key)
      : [...columnConfig.hiddenColumns, key];
    const updated = { ...columnConfig, hiddenColumns: hidden };
    setColumnConfig(updated);
    saveColumnConfig(updated);
  };

  const addCustomColumn = () => {
    if (!newColumnName.trim()) return;
    const key = `custom_${crypto.randomUUID().slice(0, 8)}`;
    const updated = {
      ...columnConfig,
      customColumns: [...columnConfig.customColumns, { key, label: newColumnName.trim(), width: 120, instruction: newColumnInstruction.trim() || '' }],
    };
    setColumnConfig(updated);
    saveColumnConfig(updated);
    setNewColumnName('');
    setNewColumnInstruction('');
  };

  const openColumnEditor = (col) => {
    const stored = columnConfig.customColumns.find((c) => c.key === col.key);
    setEditingColumn(col);
    setEditColLabel(stored?.label || col.label);
    setEditColInstruction(stored?.instruction || '');
  };

  const saveColumnEdit = () => {
    if (!editingColumn) return;
    const updated = {
      ...columnConfig,
      customColumns: columnConfig.customColumns.map((c) =>
        c.key === editingColumn.key ? { ...c, label: editColLabel.trim() || c.label, instruction: editColInstruction.trim() } : c
      ),
    };
    setColumnConfig(updated);
    saveColumnConfig(updated);
    setEditingColumn(null);
  };

  const removeCustomColumn = (key) => {
    const updated = {
      ...columnConfig,
      customColumns: columnConfig.customColumns.filter((c) => c.key !== key),
      hiddenColumns: columnConfig.hiddenColumns.filter((k) => k !== key),
    };
    setColumnConfig(updated);
    saveColumnConfig(updated);
  };

  // Background job add
  const handleQuickAdd = async (jdText, sourceUrl) => {
    const tempId = crypto.randomUUID();
    const tempJob = {
      id: tempId,
      createdAt: new Date().toISOString(),
      company: 'Processing...',
      role: 'Analyzing job description...',
      jdText,
      sourceUrl: sourceUrl || '',
      status: 'Applied',
      location: '',
      workStyle: '',
      salaryRange: '',
      notes: '',
      referral: false,
      analysis: null,
      taggedStoryIds: [],
      _processing: true,
    };
    saveJob(tempJob);
    refreshJobs();
    setProcessingJobs((prev) => new Set(prev).add(tempId));

    try {
      const profile = getProfile();
      const stories = getStories();
      const analysis = await analyzeJob({
        resume: profile.resume,
        jdText,
        stories,
        preferences: profile.preferences,
        customColumns: columnConfig.customColumns,
      });

      updateJob(tempId, {
        company: analysis.company || 'Unknown Company',
        role: analysis.role || 'Unknown Role',
        location: analysis.location || '',
        workStyle: analysis.workStyle || '',
        salaryRange: analysis.salaryRange || '',
        fundingStage: analysis.fundingStage || '',
        customFields: analysis.customFields || {},
        analysis: {
          talkingPoints: analysis.talkingPoints,
          starMatches: analysis.starMatches || [],
          researchBrief: analysis.researchBrief,
          gaps: analysis.gaps || [],
          preferenceFit: analysis.preferenceFit || null,
        },
        taggedStoryIds: (analysis.starMatches || []).map((m) => m.storyId).filter(Boolean),
        _processing: false,
      });
      refreshJobs();

      // Background funding lookup
      if (!analysis.fundingStage) {
        lookupFundingStage({ company: analysis.company, jdText }).then((result) => {
          const label = result.confidence === 'high' ? result.fundingStage
            : result.confidence === 'medium' ? `${result.fundingStage} (est.)`
            : `${result.fundingStage} (?)`;
          updateJob(tempId, { fundingStage: label, fundingData: result });
          refreshJobs();
        }).catch(() => {});
      }
    } catch (err) {
      updateJob(tempId, {
        company: 'Error',
        role: err.message,
        _processing: false,
      });
    } finally {
      setProcessingJobs((prev) => { const s = new Set(prev); s.delete(tempId); return s; });
      refreshJobs();
    }
  };

  const refreshJobs = () => setJobs(getJobs());

  useEffect(() => {
    refreshJobs();
  }, []);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    // Defer so the opening click doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [openMenuId]);

  // Reposition overflow menu if it overflows the bottom of the viewport
  useEffect(() => {
    if (!openMenuId || !menuRef.current) return;
    const menuEl = menuRef.current;
    const menuRect = menuEl.getBoundingClientRect();
    const btnRect = menuBtnRectRef.current;
    if (menuRect.bottom > window.innerHeight && btnRect) {
      setMenuPos((prev) => ({ ...prev, top: btnRect.top - menuRect.height - 4 }));
    }
  }, [openMenuId]);

  // Get effective width for a column (from state or default)
  const FIXED_WIDTHS = { expand: 32, menu: 40 };
  const getColWidth = (key) => {
    if (colWidths[key]) return colWidths[key];
    if (FIXED_WIDTHS[key]) return FIXED_WIDTHS[key];
    const col = allColumns.find((c) => c.key === key);
    return col?.width || 120;
  };

  const handleResizeStart = (colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const th = e.currentTarget.parentElement;
    const startWidth = th ? th.getBoundingClientRect().width : 120;
    resizingRef.current = true;

    const handleMouseMove = (moveE) => {
      const delta = moveE.clientX - startX;
      setColWidths((prev) => ({
        ...prev,
        [colKey]: Math.max(50, Math.round(startWidth + delta)),
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Delay clearing so the click event from mouseup doesn't trigger sort
      setTimeout(() => { resizingRef.current = false; }, 100);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleSort = (key) => {
    if (resizingRef.current) return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Filter jobs — separate hidden from visible
  const visibleJobs = jobs.filter((j) => !j._hidden);
  const hiddenJobs = jobs.filter((j) => j._hidden);

  const filtered = visibleJobs.filter((j) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(j.status)) return false;
    if (filters.workStyles.length > 0 && !filters.workStyles.includes(j.workStyle)) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${j.company} ${j.role} ${j.location} ${j.notes} ${j.salaryRange}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const activeFilterCount = (filters.statuses.length > 0 ? 1 : 0) + (filters.workStyles.length > 0 ? 1 : 0) + (filters.search ? 1 : 0);

  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortKey] || '';
    let vb = b[sortKey] || '';
    if (sortKey === 'fitScore') {
      va = a.analysis?.preferenceFit?.score || 0;
      vb = b.analysis?.preferenceFit?.score || 0;
    } else if (sortKey === 'createdAt' || sortKey === 'trackedDate') {
      va = new Date(va || a.createdAt).getTime();
      vb = new Date(vb || b.createdAt).getTime();
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleUpdate = (id, field, value) => {
    updateJob(id, { [field]: value });
    refreshJobs();
    setEditingCell(null);
  };

  const handleRefreshFit = async (job) => {
    setRefreshingFitId(job.id);
    setOpenMenuId(null);
    try {
      const profile = getProfile();
      const fit = await refreshPreferenceFit({
        jdText: job.jdText,
        company: job.company,
        role: job.role,
        preferences: profile.preferences,
        trackerValues: {
          location: job.location,
          workStyle: job.workStyle,
          salaryRange: job.salaryRange,
          fundingStage: job.fundingStage,
          customFields: job.customFields,
        },
      });
      updateJob(job.id, {
        analysis: { ...job.analysis, preferenceFit: fit },
      });
      refreshJobs();
    } catch (err) {
      alert(err.message);
    } finally {
      setRefreshingFitId(null);
    }
  };

  const handleLookupFunding = async (job) => {
    setLookingUpFundingId(job.id);
    setOpenMenuId(null);
    try {
      const result = await lookupFundingStage({ company: job.company, jdText: job.jdText });
      const label = result.confidence === 'high' ? result.fundingStage
        : result.confidence === 'medium' ? `${result.fundingStage} (est.)`
        : `${result.fundingStage} (?)`;
      updateJob(job.id, {
        fundingStage: label,
        fundingData: result,
      });
      refreshJobs();
    } catch (err) {
      alert(err.message);
    } finally {
      setLookingUpFundingId(null);
    }
  };

  const handleDelete = (id) => {
    deleteJob(id);
    refreshJobs();
    setDeleteConfirm(null);
    setExpandedIds((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  const statusClass = (status) => `status-${status.replace(/\s/g, '-')}`;

  const renderCell = (col, job) => {
    switch (col.key) {
      case 'fit':
        return refreshingFitId === job.id ? (
          <div className="spinner" style={{ width: 16, height: 16, margin: '0 auto' }} />
        ) : job.analysis?.preferenceFit?.score > 0 ? (
          <span className="fit-badge" data-score={job.analysis.preferenceFit.score >= 7 ? 'high' : job.analysis.preferenceFit.score >= 4 ? 'med' : 'low'}>
            {job.analysis.preferenceFit.score}
          </span>
        ) : '—';
      case 'company':
        return <EditableCell value={job.company} isEditing={editingCell === `${job.id}-company`} onEdit={() => setEditingCell(`${job.id}-company`)} onSave={(v) => handleUpdate(job.id, 'company', v)} onCancel={() => setEditingCell(null)} />;
      case 'role':
        return <EditableCell value={job.role} isEditing={editingCell === `${job.id}-role`} onEdit={() => setEditingCell(`${job.id}-role`)} onSave={(v) => handleUpdate(job.id, 'role', v)} onCancel={() => setEditingCell(null)} />;
      case 'status':
        return (
          <div className="status-select-wrap">
            <span className="status-select-sizer">{job.status}</span>
            <select className={`status-select ${statusClass(job.status)}`} value={job.status} onChange={(e) => handleUpdate(job.id, 'status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        );
      case 'workStyle':
        return (
          <select className="mini-select" value={job.workStyle || ''} onChange={(e) => handleUpdate(job.id, 'workStyle', e.target.value)}>
            {WORK_STYLES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
          </select>
        );
      case 'location':
        return <EditableCell value={job.location || ''} placeholder="Add" isEditing={editingCell === `${job.id}-location`} onEdit={() => setEditingCell(`${job.id}-location`)} onSave={(v) => handleUpdate(job.id, 'location', v)} onCancel={() => setEditingCell(null)} />;
      case 'salary':
        return <EditableCell value={job.salaryRange || ''} placeholder="Add" isEditing={editingCell === `${job.id}-salary`} onEdit={() => setEditingCell(`${job.id}-salary`)} onSave={(v) => handleUpdate(job.id, 'salaryRange', v)} onCancel={() => setEditingCell(null)} />;
      case 'referral':
        return <input type="checkbox" className="referral-checkbox" checked={!!job.referral} onChange={(e) => handleUpdate(job.id, 'referral', e.target.checked)} />;
      case 'url':
        return job.sourceUrl ? (
          <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer" className="url-link" title={job.sourceUrl}><ExternalLink size={14} /></a>
        ) : (
          <button className="url-add-btn" onClick={() => { const url = prompt('Paste job URL:'); if (url) handleUpdate(job.id, 'sourceUrl', url); }} title="Add URL"><Link2 size={14} /></button>
        );
      case 'fundingStage':
        if (lookingUpFundingId === job.id) return <div className="spinner" style={{ width: 14, height: 14 }} />;
        if (editingCell === `${job.id}-fundingStage`) {
          return <EditableCell value={job.fundingStage || ''} placeholder="Add" isEditing={true} onEdit={() => {}} onSave={(v) => handleUpdate(job.id, 'fundingStage', v)} onCancel={() => setEditingCell(null)} />;
        }
        return (
          <span
            className="cell-text"
            onClick={() => setEditingCell(`${job.id}-fundingStage`)}
            title={job.fundingData ? `${job.fundingData.reasoning || ''}${job.fundingData.lastKnownRound ? `\nLast round: ${job.fundingData.lastKnownRound}` : ''}${job.fundingData.totalRaised ? `\nTotal raised: ${job.fundingData.totalRaised}` : ''}` : 'Click to edit, or use menu → Look up funding stage'}
          >
            {job.fundingStage || '—'}
          </span>
        );
      case 'notes':
        return <EditableCell value={job.notes || ''} placeholder="Add" isEditing={editingCell === `${job.id}-notes`} onEdit={() => setEditingCell(`${job.id}-notes`)} onSave={(v) => handleUpdate(job.id, 'notes', v)} onCancel={() => setEditingCell(null)} />;
      case 'date':
        return <input type="date" className="date-input" value={job.trackedDate || job.createdAt?.slice(0, 10) || ''} onChange={(e) => handleUpdate(job.id, 'trackedDate', e.target.value)} />;
      default:
        // Custom columns — stored as job.customFields[col.key]
        if (col.custom) {
          return <EditableCell value={job.customFields?.[col.key] || ''} placeholder="Add" isEditing={editingCell === `${job.id}-${col.key}`} onEdit={() => setEditingCell(`${job.id}-${col.key}`)} onSave={(v) => handleUpdate(job.id, 'customFields', { ...job.customFields, [col.key]: v })} onCancel={() => setEditingCell(null)} />;
        }
        return '—';
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="tracker-view animate-in">
        <div className="view-header">
          <h1>Job Tracker</h1>
        </div>
        <div className="empty-state">
          <Search size={40} strokeWidth={1.2} />
          <h3>No jobs tracked yet</h3>
          <p>Add your first job to get started with AI-powered analysis.</p>
          <button className="btn btn-primary" onClick={() => setShowAnalyzeModal(true)}>
            <Plus size={16} /> Add Job
          </button>
        </div>
        <AnalyzeModal
          isOpen={showAnalyzeModal}
          onClose={() => setShowAnalyzeModal(false)}
          onJobAdded={refreshJobs}
        />
        <style>{trackerStyles}</style>
      </div>
    );
  }

  return (
    <div className="tracker-view animate-in">
      <div className="view-header">
        <div className="header-row">
          <div>
            <h1>Job Tracker</h1>
            <p className="view-subtitle">{visibleJobs.length} application{visibleJobs.length !== 1 ? 's' : ''} tracked{hiddenJobs.length > 0 ? ` · ${hiddenJobs.length} hidden` : ''}</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setExpandedIds(new Set(jobs.map((j) => j.id)))}>
              <ChevronsUpDown size={14} /> Expand All
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setExpandedIds(new Set())}>
              <ChevronsDownUp size={14} /> Collapse All
            </button>
            <button className={`btn btn-ghost btn-sm ${showFilters ? 'active-toggle' : ''}`} onClick={() => setShowFilters(!showFilters)}>
              <Filter size={14} /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <button className={`btn btn-ghost btn-sm ${showColumnSettings ? 'active-toggle' : ''}`} onClick={() => setShowColumnSettings(!showColumnSettings)}>
              <Settings2 size={14} /> Columns
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(jobs)}>
              <Download size={14} /> CSV
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportXLSX(jobs)}>
              <FileSpreadsheet size={14} /> XLSX
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAnalyzeModal(true)}>
              <Plus size={14} /> Add Job
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="filter-panel card animate-in">
          <div className="filter-row">
            <div className="filter-field">
              <label>Search</label>
              <input
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Company, role, location..."
              />
            </div>
            <div className="filter-field filter-field-wide">
              <label>Status</label>
              <div className="filter-checkboxes">
                {STATUSES.map((s) => (
                  <label key={s} className={`filter-chip ${filters.statuses.includes(s) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(s)}
                      onChange={() => setFilters((f) => ({
                        ...f,
                        statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
                      }))}
                    />
                    <span className={`status-dot status-dot-${s.replace(/\s/g, '-')}`} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div className="filter-field">
              <label>Work Style</label>
              <div className="filter-checkboxes">
                {WORK_STYLES.filter(Boolean).map((s) => (
                  <label key={s} className={`filter-chip ${filters.workStyles.includes(s) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={filters.workStyles.includes(s)}
                      onChange={() => setFilters((f) => ({
                        ...f,
                        workStyles: f.workStyles.includes(s) ? f.workStyles.filter((x) => x !== s) : [...f.workStyles, s],
                      }))}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ statuses: [], workStyles: [], search: '' })} style={{ alignSelf: 'flex-end', marginBottom: 2 }}>
                Clear all
              </button>
            )}
          </div>
          {activeFilterCount > 0 && (
            <p className="filter-summary">Showing {filtered.length} of {jobs.length} jobs</p>
          )}
        </div>
      )}

      {/* Column Settings Modal */}
      {showColumnSettings && createPortal(
        <div className="modal-overlay" onClick={() => setShowColumnSettings(false)}>
          <div className="col-modal animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="col-modal-header">
              <h2>Manage Columns</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowColumnSettings(false)}><X size={18} /></button>
            </div>
            <div className="col-modal-body">
              <p className="col-modal-hint">Drag to reorder. Toggle visibility. Click Edit on custom columns to configure AI instructions.</p>
              <div className="col-modal-list">
                {allColumns.map((col) => (
                  <div
                    key={col.key}
                    className={`col-modal-row ${dragColKey === col.key ? 'dragging' : ''} ${dragOverCol?.key === col.key && dragOverCol?.position === 'above' ? 'drop-above' : ''} ${dragOverCol?.key === col.key && dragOverCol?.position === 'below' ? 'drop-below' : ''}`}
                    draggable
                    onDragStart={() => setDragColKey(col.key)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const midY = rect.top + rect.height / 2;
                      const position = e.clientY < midY ? 'above' : 'below';
                      setDragOverCol({ key: col.key, position });
                    }}
                    onDrop={() => {
                      if (dragColKey && dragColKey !== dragOverCol?.key) {
                        const keys = allColumns.map((c) => c.key);
                        const from = keys.indexOf(dragColKey);
                        keys.splice(from, 1);
                        let to = keys.indexOf(dragOverCol?.key);
                        if (dragOverCol?.position === 'below') to += 1;
                        keys.splice(to, 0, dragColKey);
                        const updated = { ...columnConfig, columnOrder: keys };
                        setColumnConfig(updated);
                        saveColumnConfig(updated);
                      }
                      setDragColKey(null);
                      setDragOverCol(null);
                    }}
                    onDragEnd={() => { setDragColKey(null); setDragOverCol(null); }}
                  >
                    <span className="col-drag-handle">⠿</span>
                    <label className="col-modal-toggle">
                      <input
                        type="checkbox"
                        checked={!columnConfig.hiddenColumns.includes(col.key)}
                        onChange={() => toggleColumnVisibility(col.key)}
                      />
                      <span className="col-modal-name">{col.label}</span>
                      {!col.custom && <span className="col-modal-badge">Built-in</span>}
                    </label>
                    {col.custom && (
                      <div className="col-modal-actions">
                        {col.instruction && <span className="col-modal-instruction-preview" title={col.instruction}>{col.instruction.slice(0, 80)}{col.instruction.length > 80 ? '...' : ''}</span>}
                        <button className="btn btn-ghost btn-sm" onClick={() => openColumnEditor(col)}>
                          {col.instruction ? 'Edit' : '+ AI Instruction'}
                        </button>
                        <button className="btn btn-ghost btn-sm btn-danger" onClick={() => removeCustomColumn(col.key)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="col-modal-add">
                <h4>Add Custom Column</h4>
                <div className="col-modal-add-row">
                  <input
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    placeholder="Column name (e.g. Fertility Benefits)"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomColumn()}
                  />
                  <button className="btn btn-primary btn-sm" onClick={addCustomColumn} disabled={!newColumnName.trim()}>
                    <Plus size={14} /> Add
                  </button>
                </div>
                {newColumnName.trim() && (
                  <textarea
                    value={newColumnInstruction}
                    onChange={(e) => setNewColumnInstruction(e.target.value)}
                    placeholder="AI instruction — tell the AI what to research for this column (optional). e.g. Does this company offer fertility/IVF coverage? Answer Yes, No, or Unknown."
                    rows={2}
                    className="col-modal-instruction-input"
                  />
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="tracker-table-wrap">
        <table className="tracker-table">
          <thead>
            <tr>
              {(() => {
                const cols = [
                  { key: 'expand', label: '', width: 32, noResize: true },
                  ...visibleColumns,
                  { key: 'menu', label: '', width: 40, noResize: true },
                ];
                return cols.map((col) => {
                  const w = getColWidth(col.key);
                  return (
                    <th
                      key={col.key}
                      style={{ width: w, minWidth: col.noResize ? 30 : 50, position: 'relative' }}
                      onClick={col.sortable ? () => handleSort(col.sortKey || col.key) : undefined}
                    >
                      {col.label} {col.sortable && <ArrowUpDown size={12} />}
                      {!col.noResize && (
                        <span
                          className="col-resize-handle"
                          onMouseDown={(e) => handleResizeStart(col.key, e)}
                        />
                      )}
                    </th>
                  );
                });
              })()}
            </tr>
          </thead>
          <tbody>
            {sorted.map((job) => (
              <React.Fragment key={job.id}>
                <tr className={expandedIds.has(job.id) ? 'expanded' : ''}>
                  <td className="expand-cell">
                    <button className="expand-btn" onClick={() => setExpandedIds((s) => { const n = new Set(s); if (n.has(job.id)) n.delete(job.id); else n.add(job.id); return n; })}>
                      {expandedIds.has(job.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </td>
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={col.key === 'fit' ? 'fit-cell' : col.key === 'referral' ? 'referral-cell' : col.key === 'url' ? 'url-cell' : ''}>
                      {renderCell(col, job)}
                    </td>
                  ))}
                  <td className="menu-cell">
                    <button className="menu-btn" onClick={(e) => {
                      e.stopPropagation();
                      if (openMenuId === job.id) { setOpenMenuId(null); return; }
                      const rect = e.currentTarget.getBoundingClientRect();
                      menuBtnRectRef.current = rect;
                      setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
                      setOpenMenuId(job.id);
                    }}>
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </tr>
                {expandedIds.has(job.id) && (
                  <tr key={`${job.id}-detail`} className="detail-row">
                    <td colSpan={visibleColumns.length + 2}>
                      <ExpandedJobDetail job={job} onOpenChat={onOpenChat} onUpdate={(field, value) => handleUpdate(job.id, field, value)} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hidden rows section */}
      {hiddenJobs.length > 0 && (
        <div className="hidden-section">
          <button className="hidden-toggle" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Hidden ({hiddenJobs.length})</span>
          </button>
          {showHidden && (
            <div className="hidden-list animate-in">
              {hiddenJobs.map((job) => (
                <div key={job.id} className="hidden-row">
                  <span className="hidden-company">{job.company}</span>
                  <span className="hidden-role">{job.role}</span>
                  <span className={`status-badge status-${job.status.replace(/\s/g, '-')}`} style={{ fontSize: '0.72rem', padding: '1px 7px' }}>{job.status}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleUpdate(job.id, '_hidden', false)}>
                    Unhide
                  </button>
                  <button className="btn btn-ghost btn-sm btn-danger" onClick={() => {
                    if (window.confirm(`Delete ${job.company} — ${job.role}?`)) handleDelete(job.id);
                  }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Column Edit Modal */}
      {editingColumn && createPortal(
        <div className="modal-overlay" onClick={() => setEditingColumn(null)}>
          <div className="col-edit-modal animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="col-edit-header">
              <h3>Edit Column</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingColumn(null)}><X size={16} /></button>
            </div>
            <div className="col-edit-body">
              <div className="col-edit-field">
                <label>Column Name</label>
                <input
                  value={editColLabel}
                  onChange={(e) => setEditColLabel(e.target.value)}
                  placeholder="Column name"
                />
              </div>
              <div className="col-edit-field">
                <label>AI Instruction</label>
                <p className="col-edit-hint">Tell the AI what to look for when researching this column. Be specific about what values to return.</p>
                <textarea
                  value={editColInstruction}
                  onChange={(e) => setEditColInstruction(e.target.value)}
                  placeholder="e.g. Does this company have a female co-founder or female CEO? Search for the founding team and current C-suite leadership. Answer: Yes (with name), No, or Unknown."
                  rows={4}
                />
              </div>
            </div>
            <div className="col-edit-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingColumn(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveColumnEdit}>Save</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {openMenuId && createPortal(
        <div ref={menuRef} className="overflow-menu animate-in" style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 200 }}>
          {(() => {
            const job = jobs.find((j) => j.id === openMenuId);
            if (!job) return null;
            return (
              <>
                <button className="overflow-item" onClick={() => { setExpandedIds((s) => { const n = new Set(s); if (n.has(job.id)) n.delete(job.id); else n.add(job.id); return n; }); setOpenMenuId(null); }}>
                  {expandedIds.has(job.id) ? 'Collapse details' : 'View details'}
                </button>
                <button className="overflow-item" onClick={() => handleRefreshFit(job)} disabled={refreshingFitId === job.id}>
                  {refreshingFitId === job.id ? 'Refreshing...' : 'Refresh fit score'}
                </button>
                <button className="overflow-item" onClick={() => handleLookupFunding(job)} disabled={lookingUpFundingId === job.id}>
                  {lookingUpFundingId === job.id ? 'Looking up...' : 'Look up funding stage'}
                </button>
                <button className="overflow-item" onClick={() => {
                  const url = prompt('Paste job URL:', job.sourceUrl || '');
                  if (url !== null) handleUpdate(job.id, 'sourceUrl', url);
                  setOpenMenuId(null);
                }}>
                  {job.sourceUrl ? 'Edit URL' : 'Add URL'}
                </button>
                <button className="overflow-item" onClick={() => {
                  handleUpdate(job.id, '_hidden', true);
                  setOpenMenuId(null);
                }}>Hide row</button>
                <button className="overflow-item danger" onClick={() => {
                  if (window.confirm(`Delete ${job.company} — ${job.role}?`)) {
                    handleDelete(job.id);
                  }
                  setOpenMenuId(null);
                }}>Delete job</button>
              </>
            );
          })()}
        </div>,
        document.body
      )}

      <AnalyzeModal
        isOpen={showAnalyzeModal}
        onClose={() => setShowAnalyzeModal(false)}
        onJobAdded={refreshJobs}
        onQuickAdd={handleQuickAdd}
      />

      <style>{trackerStyles}</style>
    </div>
  );
}

function EditableCell({ value, placeholder, isEditing, onEdit, onSave, onCancel }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  if (isEditing) {
    return (
      <input
        className="cell-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(draft);
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
      />
    );
  }

  return (
    <span className={`cell-text ${!value ? 'placeholder' : ''}`} onClick={onEdit}>
      {value || placeholder || '—'}
    </span>
  );
}

function ExpandedJobDetail({ job, onOpenChat, onUpdate }) {
  const [showJd, setShowJd] = useState(false);
  const [editingJd, setEditingJd] = useState(false);
  const [jdDraft, setJdDraft] = useState(job.jdText || '');
  const analysis = job.analysis;

  const fit = analysis?.preferenceFit;

  return (
    <div className="detail-content animate-in">
      {fit?.score > 0 && (
        <div className="detail-section">
          <h4>Preference Fit — {fit.score}/10</h4>
          {fit.reasoning && (
            <p className="fit-reasoning">{fit.reasoning}</p>
          )}
          {fit.matchingFactors?.length > 0 && (
            <div className="fit-factors-list">
              {fit.matchingFactors.map((f, i) => (
                <div key={i} className="fit-factor match"><Check size={13} /> {f}</div>
              ))}
            </div>
          )}
          {fit.mismatches?.length > 0 && (
            <div className="fit-factors-list">
              {fit.mismatches.map((f, i) => (
                <div key={i} className="fit-factor mismatch"><AlertCircle size={13} /> {f}</div>
              ))}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => onOpenChat(`I'm looking at the job at ${job.company} for the ${job.role} role. The fit score is ${fit.score}/10. ${fit.reasoning || ''} Can you help me understand what I can do to be a stronger fit, and how to address the mismatches in my interviews?`)}>
            <MessageCircle size={13} /> Ask about this fit score
          </button>
        </div>
      )}

      {job.fundingData && (
        <div className="detail-section">
          <h4>Funding Stage — {job.fundingStage}</h4>
          <p className="fit-reasoning">{job.fundingData.reasoning}</p>
          {job.fundingData.lastKnownRound && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Last round: {job.fundingData.lastKnownRound}</p>}
          {job.fundingData.totalRaised && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Total raised: {job.fundingData.totalRaised}</p>}
          <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
            Confidence: {job.fundingData.confidence}
            {job.fundingData.sources?.length > 0 && ` · Sources: ${job.fundingData.sources.join(', ')}`}
          </p>
        </div>
      )}

      {analysis?.talkingPoints && (
        <div className="detail-section">
          <h4>Talking Points</h4>
          <div className="detail-text">
            {renderMarkdown(analysis.talkingPoints)}
          </div>
        </div>
      )}

      {analysis?.researchBrief?.short && (
        <div className="detail-section">
          <h4>Research Brief</h4>
          <div className="detail-text">
            {renderMarkdown(analysis.researchBrief.short)}
          </div>
        </div>
      )}

      {analysis?.gaps?.length > 0 && (
        <div className="detail-section">
          <h4>Gaps</h4>
          {analysis.gaps.map((g, i) => (
            <div key={i} className="detail-gap">
              <strong>{g.gap}</strong>
              <p>{g.howToAddress}</p>
              <button className="btn btn-ghost btn-sm" onClick={() => onOpenChat(`Help me talk about this gap: "${g.gap}"`)}>
                <MessageCircle size={13} /> Chat about this
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="detail-section">
        <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowJd(!showJd)} style={{ padding: 0, fontWeight: 600, fontSize: '0.95rem' }}>
            {showJd ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Job Description
          </button>
          {showJd && !editingJd && job.jdText && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingJd(true)} style={{ fontSize: '0.78rem' }}>Edit</button>
          )}
          {!job.jdText && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowJd(true); setEditingJd(true); }} style={{ fontSize: '0.78rem' }}>+ Add JD</button>
          )}
        </h4>
        {showJd && (
          editingJd ? (
            <div className="detail-jd-edit animate-in">
              <textarea
                value={jdDraft}
                onChange={(e) => setJdDraft(e.target.value)}
                rows={12}
                placeholder="Paste the job description here..."
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => { onUpdate('jdText', jdDraft); setEditingJd(false); }}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setJdDraft(job.jdText || ''); setEditingJd(false); }}>Cancel</button>
              </div>
            </div>
          ) : job.jdText ? (
            <div className="detail-jd animate-in">
              {job.jdText.split('\n').map((line, i) => (
                line.trim() ? <p key={i}>{line}</p> : <br key={i} />
              ))}
            </div>
          ) : null
        )}
      </div>

      {!analysis && !job.jdText && (
        <div className="detail-empty">No analysis data for this job.</div>
      )}
    </div>
  );
}

const trackerStyles = `
  .tracker-view {
    padding: 20px 24px;
    overflow: auto;
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
  .hidden-section {
    margin-top: 16px;
  }
  .hidden-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--text-tertiary);
    cursor: pointer;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }
  .hidden-toggle:hover {
    color: var(--text-secondary);
    background: var(--bg-secondary);
  }
  .hidden-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }
  .hidden-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    font-size: 0.82rem;
    opacity: 0.7;
  }
  .hidden-row:hover { opacity: 1; }
  .hidden-company {
    font-weight: 600;
    min-width: 100px;
  }
  .hidden-role {
    flex: 1;
    color: var(--text-secondary);
  }
  .active-toggle {
    background: var(--accent-light);
    color: var(--accent);
  }
  .filter-panel {
    margin-bottom: 12px;
    padding: 14px 16px;
  }
  .filter-row {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 140px;
  }
  .filter-field label {
    font-size: 0.72rem;
    margin-bottom: 0;
  }
  .filter-field-wide {
    min-width: auto;
  }
  .filter-field input[type="text"],
  .filter-field input:not([type]) {
    padding: 6px 10px;
    font-size: 0.85rem;
  }
  .filter-checkboxes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: 1px solid var(--border-light);
    border-radius: 100px;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-transform: none;
    white-space: nowrap;
  }
  .filter-chip:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .filter-chip.selected {
    background: var(--accent-light);
    border-color: var(--accent);
    color: var(--accent);
  }
  .filter-chip input[type="checkbox"] {
    display: none;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot-Interested { background: var(--status-interested); }
  .status-dot-Applied { background: var(--status-applied); }
  .status-dot-Phone-Screen { background: var(--status-phone); }
  .status-dot-Interview { background: var(--status-interview); }
  .status-dot-Final-Round { background: var(--status-final); }
  .status-dot-Offer { background: var(--status-offer); }
  .status-dot-Rejected { background: var(--status-rejected); }
  .status-dot-Pass { background: var(--status-pass); }
  .filter-summary {
    font-size: 0.82rem;
    color: var(--text-tertiary);
    margin-top: 8px;
    margin-bottom: 0;
  }
  .col-modal {
    background: var(--bg-card);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    width: 720px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }
  .col-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border-light);
  }
  .col-modal-header h2 { margin: 0; font-size: 1.15rem; }
  .col-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px 24px;
  }
  .col-modal-hint {
    font-size: 0.82rem;
    color: var(--text-tertiary);
    margin-bottom: 14px;
  }
  .col-modal-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 20px;
  }
  .col-modal-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-md);
    cursor: grab;
    transition: all var(--transition-fast);
    border: 1px solid transparent;
  }
  .col-modal-row:hover { background: var(--bg-secondary); }
  .col-modal-row.dragging { opacity: 0.3; }
  .col-modal-row { position: relative; }
  .col-modal-row.drop-above::before,
  .col-modal-row.drop-below::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
    border-radius: 1px;
    pointer-events: none;
    z-index: 1;
  }
  .col-modal-row.drop-above::before { top: -1px; }
  .col-modal-row.drop-below::after { bottom: -1px; }
  .col-drag-handle {
    color: var(--text-tertiary);
    font-size: 0.75rem;
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }
  .col-modal-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
    text-transform: none;
    font-weight: 400;
    font-size: 0.9rem;
    color: var(--text-primary);
  }
  .col-modal-toggle input[type="checkbox"] {
    width: 15px;
    height: 15px;
    accent-color: var(--accent);
    cursor: pointer;
    flex-shrink: 0;
  }
  .col-modal-name { font-weight: 500; }
  .col-modal-badge {
    font-size: 0.68rem;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 500;
  }
  .col-modal-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    flex-shrink: 0;
  }
  .col-modal-instruction-preview {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-style: italic;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .col-modal-add {
    border-top: 1px solid var(--border-light);
    padding-top: 16px;
  }
  .col-modal-add h4 { margin: 0 0 10px; font-size: 0.9rem; }
  .col-modal-add-row {
    display: flex;
    gap: 8px;
  }
  .col-modal-add-row input { flex: 1; }
  .col-modal-instruction-input {
    margin-top: 8px;
    font-size: 0.85rem;
    min-height: 50px;
  }
  .col-edit-modal {
    background: var(--bg-card);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    width: 480px;
    max-width: 90vw;
  }
  .col-edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 22px 14px;
    border-bottom: 1px solid var(--border-light);
  }
  .col-edit-header h3 { margin: 0; font-size: 1.05rem; }
  .col-edit-body {
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .col-edit-field label { margin-bottom: 4px; }
  .col-edit-field textarea { min-height: 90px; font-size: 0.88rem; line-height: 1.5; }
  .col-edit-hint { font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 6px; line-height: 1.4; }
  .col-edit-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 22px;
    border-top: 1px solid var(--border-light);
  }
  .tracker-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-sm);
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }
  .tracker-table-wrap:hover {
    scrollbar-color: var(--border-medium) transparent;
  }
  .tracker-table-wrap::-webkit-scrollbar {
    height: 4px;
  }
  .tracker-table-wrap::-webkit-scrollbar-track {
    background: transparent;
  }
  .tracker-table-wrap::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 2px;
  }
  .tracker-table-wrap:hover::-webkit-scrollbar-thumb {
    background: var(--border-medium);
  }
  .tracker-table {
    min-width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    table-layout: fixed;
  }
  .tracker-table th {
    text-align: left;
    padding: 6px 8px;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-tertiary);
    border-bottom: 1px solid var(--border-light);
    cursor: pointer;
    overflow: hidden;
    user-select: none;
    white-space: nowrap;
    background: var(--bg-secondary);
  }
  .tracker-table th:hover {
    color: var(--text-primary);
  }
  .col-resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    background: transparent;
    transition: background var(--transition-fast);
    z-index: 1;
  }
  .col-resize-handle:hover,
  .col-resize-handle:active {
    background: var(--accent);
    opacity: 0.4;
  }
  .tracker-table td {
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 5px 8px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
  }
  .tracker-table tr:last-child td {
    border-bottom: none;
  }
  .tracker-table tr:hover:not(.detail-row) {
    background: var(--bg-secondary);
  }
  .tracker-table tr.expanded {
    background: var(--bg-secondary);
  }
  .cell-text {
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
    display: block;
    min-width: 30px;
    border: 1px solid transparent;
    line-height: 1.3;
    font-size: 0.82rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-text:hover {
    background: var(--bg-tertiary);
  }
  .cell-text.placeholder {
    color: var(--text-tertiary);
    font-style: italic;
  }
  .cell-input {
    padding: 2px 4px;
    font-size: 0.82rem;
    line-height: 1.3;
    width: 100%;
    min-width: 30px;
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    box-shadow: none;
    background: var(--bg-card);
  }
  .cell-input:focus {
    box-shadow: none;
  }
  .status-select-wrap {
    display: inline-grid;
    align-items: center;
  }
  .status-select-sizer {
    grid-area: 1 / 1;
    visibility: hidden;
    padding: 3px 22px 3px 8px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .status-select {
    grid-area: 1 / 1;
    padding: 3px 22px 3px 8px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    background-size: 14px;
    background-position: right 4px center;
  }
  .mini-select {
    padding: 3px 24px 3px 8px;
    font-size: 0.85rem;
    border: none;
    background-color: transparent;
    cursor: pointer;
    width: auto;
    background-size: 16px;
  }
  .date-input {
    padding: 4px 6px;
    font-size: 0.82rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    width: 100%;
  }
  .date-input:hover {
    border-color: var(--border-medium);
  }
  .date-input:focus {
    border-color: var(--accent);
    box-shadow: none;
    color: var(--text-primary);
  }
  .fit-cell {
    text-align: center;
    color: var(--text-tertiary);
  }
  .fit-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 0.78rem;
    font-weight: 700;
  }
  .fit-badge[data-score="high"] { background: var(--status-offer-bg); color: var(--status-offer); border: 1px solid var(--status-offer); }
  .fit-badge[data-score="med"] { background: var(--status-phone-bg); color: var(--status-phone); border: 1px solid var(--status-phone); }
  .fit-badge[data-score="low"] { background: var(--status-rejected-bg); color: var(--status-rejected); border: 1px solid var(--status-rejected); }
  .referral-cell {
    text-align: center;
  }
  .referral-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--accent);
  }
  .expand-cell {
    text-align: center;
    padding: 0 !important;
  }
  .expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 10px 4px;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: color var(--transition-fast);
    background: none;
    border: none;
  }
  .expand-btn:hover { color: var(--text-primary); }
  .url-cell {
    text-align: center;
  }
  .url-link {
    color: var(--accent);
    display: inline-flex;
    padding: 4px;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }
  .url-link:hover { background: var(--accent-light); }
  .url-add-btn {
    color: var(--text-tertiary);
    display: inline-flex;
    padding: 4px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    background: none;
    border: none;
    transition: color var(--transition-fast);
  }
  .url-add-btn:hover { color: var(--accent); }
  .menu-cell {
    text-align: center;
    padding: 0 !important;
    position: relative;
  }
  .overflow-menu-wrap {
    position: relative;
    display: inline-flex;
  }
  .menu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 4px;
    color: var(--text-tertiary);
    cursor: pointer;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }
  .menu-btn:hover { color: var(--text-primary); background: var(--bg-tertiary); }
  .overflow-menu {
    z-index: 200;
    min-width: 160px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: 4px 0;
  }
  .overflow-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 14px;
    font-size: 0.85rem;
    color: var(--text-primary);
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .overflow-item:hover { background: var(--bg-secondary); }
  .overflow-item.danger { color: var(--status-rejected); }
  .overflow-item.danger:hover { background: var(--status-rejected-bg); }
  .detail-row td {
    padding: 0;
    background: var(--bg-secondary);
  }
  .detail-content {
    padding: 20px 24px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }
  .detail-section h4 {
    margin-bottom: 8px;
    color: var(--text-primary);
  }
  .detail-text p {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  .detail-gap {
    margin-bottom: 12px;
    padding: 10px;
    background: var(--bg-card);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-light);
  }
  .detail-gap strong {
    font-size: 0.88rem;
    display: block;
    margin-bottom: 4px;
  }
  .detail-gap p {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }
  .detail-empty {
    padding: 20px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.88rem;
  }
  .fit-reasoning {
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: 8px;
    font-style: italic;
  }
  .fit-factors-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 6px;
  }
  .fit-factor {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 0.82rem;
  }
  .fit-factor.match { color: var(--status-offer); }
  .fit-factor.mismatch { color: var(--status-phone); }
  .detail-jd-edit textarea {
    width: 100%;
    font-size: 0.85rem;
    line-height: 1.5;
    font-family: inherit;
  }
  .detail-jd {
    max-height: 400px;
    overflow-y: auto;
    padding: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    font-size: 0.82rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .detail-jd p {
    margin-bottom: 4px;
  }
`;
