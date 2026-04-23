import { useState, useRef } from 'react';
import { Upload, Check, Eye, EyeOff, User, X, Pencil } from 'lucide-react';
import { getProfile, saveProfile, getApiKey, saveApiKey } from '../lib/storage';
import { parseFile } from '../lib/fileParser';

const WORK_STYLE_OPTIONS = ['Remote', 'Hybrid', 'Onsite'];
const COMPANY_SIZE_OPTIONS = ['Startup', 'Mid-size', 'Enterprise'];

function ChipInput({ values, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const handleAdd = (val) => {
    const v = val.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  };
  return (
    <div className="chip-input-wrap">
      {values.map((v) => (
        <span key={v} className="tag">
          {v}
          <span className="tag-remove" onClick={() => onChange(values.filter((x) => x !== v))}><X size={12} /></span>
        </span>
      ))}
      <input
        className="chip-text-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault();
            handleAdd(input);
          }
        }}
        placeholder={values.length === 0 ? placeholder : ''}
      />
    </div>
  );
}

function CheckboxGroup({ options, selected, onChange }) {
  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter((x) => x !== opt));
    else onChange([...selected, opt]);
  };
  return (
    <div className="checkbox-group">
      {options.map((opt) => (
        <label key={opt} className="checkbox-item">
          <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

export default function SettingsView() {
  const [profile, setProfile] = useState(() => getProfile());
  const [profileDraft, setProfileDraft] = useState(() => getProfile());
  const [editingProfile, setEditingProfile] = useState(() => !getProfile().resume);
  const [profileSaved, setProfileSaved] = useState(false);

  const [apiKey, setApiKey] = useState(() => getApiKey());
  const [showKey, setShowKey] = useState(false);
  const [editingKey, setEditingKey] = useState(!getApiKey());

  const [error, setError] = useState('');
  const resumeFileRef = useRef(null);

  const handleResumeFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await parseFile(file);
      setProfileDraft((d) => ({ ...d, resume: text }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveProfile = () => {
    saveProfile(profileDraft);
    setProfile(profileDraft);
    setEditingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleEditProfile = () => {
    setProfileDraft(getProfile());
    setEditingProfile(true);
  };

  const handleSaveKey = () => {
    saveApiKey(apiKey);
    setEditingKey(false);
  };

  const updateDraft = (field, value) => {
    setProfileDraft((d) => ({ ...d, [field]: value }));
  };
  const updatePrefs = (field, value) => {
    setProfileDraft((d) => ({ ...d, preferences: { ...d.preferences, [field]: value } }));
  };

  const prefs = profile.preferences || {};
  const hasPrefs = prefs.targetRoles?.length || prefs.targetLocations?.length || prefs.salaryMin || prefs.workStyles?.length || prefs.companySizes?.length || prefs.industries?.length || prefs.freetext;

  return (
    <div className="settings-view animate-in">
      <div className="view-header">
        <h1>Settings</h1>
        <p className="view-subtitle">Manage your profile and preferences for job analysis.</p>
      </div>

      <div className="settings-content">
        {/* API Key */}
        <div className="card settings-section">
          <label>Anthropic API Key</label>
          {editingKey ? (
            <div className="inline-edit">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveKey}>Save</button>
            </div>
          ) : (
            <div className="saved-indicator">
              <Check size={15} />
              <span>Key saved ({apiKey.slice(0, 10)}...)</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingKey(true)}>Edit</button>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="card settings-section">
          <div className="section-header">
            <label><User size={14} /> Your Profile</label>
            {!editingProfile && (
              <button className="btn btn-ghost btn-sm" onClick={handleEditProfile}>
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>

          {editingProfile ? (
            <div className="profile-editor">
              <div className="profile-field">
                <label>Resume</label>
                <textarea
                  value={profileDraft.resume}
                  onChange={(e) => updateDraft('resume', e.target.value)}
                  placeholder="Paste your resume text here..."
                  rows={6}
                />
                <div className="input-actions">
                  <input ref={resumeFileRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleResumeFile} hidden />
                  <button className="btn btn-secondary btn-sm" onClick={() => resumeFileRef.current?.click()}>
                    <Upload size={14} /> Upload PDF/DOCX
                  </button>
                </div>
              </div>

              <div className="profile-field">
                <label>LinkedIn URL</label>
                <input
                  value={profileDraft.linkedinUrl}
                  onChange={(e) => updateDraft('linkedinUrl', e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>

              <div className="profile-field">
                <label>Target Roles</label>
                <ChipInput
                  values={profileDraft.preferences.targetRoles}
                  onChange={(v) => updatePrefs('targetRoles', v)}
                  placeholder="e.g. Staff PM, Director of Product"
                />
              </div>

              <div className="profile-field">
                <label>Preferred Locations</label>
                <ChipInput
                  values={profileDraft.preferences.targetLocations}
                  onChange={(v) => updatePrefs('targetLocations', v)}
                  placeholder="e.g. San Francisco, Remote"
                />
              </div>

              <div className="profile-field">
                <label>Minimum Salary</label>
                <input
                  value={profileDraft.preferences.salaryMin}
                  onChange={(e) => updatePrefs('salaryMin', e.target.value)}
                  placeholder="e.g. $180k"
                  style={{ maxWidth: 200 }}
                />
              </div>

              <div className="profile-row">
                <div className="profile-field" style={{ flex: 1 }}>
                  <label>Work Style</label>
                  <CheckboxGroup
                    options={WORK_STYLE_OPTIONS}
                    selected={profileDraft.preferences.workStyles}
                    onChange={(v) => updatePrefs('workStyles', v)}
                  />
                </div>
                <div className="profile-field" style={{ flex: 1 }}>
                  <label>Company Size</label>
                  <CheckboxGroup
                    options={COMPANY_SIZE_OPTIONS}
                    selected={profileDraft.preferences.companySizes}
                    onChange={(v) => updatePrefs('companySizes', v)}
                  />
                </div>
              </div>

              <div className="profile-field">
                <label>Industries</label>
                <ChipInput
                  values={profileDraft.preferences.industries}
                  onChange={(v) => updatePrefs('industries', v)}
                  placeholder="e.g. AI/ML, SaaS, Fintech"
                />
              </div>

              <div className="profile-field">
                <label>Additional Preferences</label>
                <textarea
                  value={profileDraft.preferences.freetext}
                  onChange={(e) => updatePrefs('freetext', e.target.value)}
                  placeholder="Anything else you're looking for..."
                  rows={3}
                />
              </div>

              {error && <div className="error-text">{error}</div>}

              <div className="profile-actions">
                <button className="btn btn-primary btn-sm" onClick={handleSaveProfile}>Save Profile</button>
                {profile.resume && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingProfile(false)}>Cancel</button>
                )}
              </div>
            </div>
          ) : (
            <div className="profile-summary">
              {profileSaved && <div className="save-toast animate-in">Profile saved</div>}
              <div className="summary-item">
                <Check size={14} />
                <span>Resume ({profile.resume.split(/\s+/).length} words)</span>
              </div>
              {profile.linkedinUrl && (
                <div className="summary-item">
                  <Check size={14} />
                  <span>LinkedIn linked</span>
                </div>
              )}
              {hasPrefs && (
                <div className="summary-prefs">
                  {prefs.targetRoles?.length > 0 && (
                    <div className="summary-chips">
                      <span className="summary-label">Roles:</span>
                      {prefs.targetRoles.map((r) => <span key={r} className="tag">{r}</span>)}
                    </div>
                  )}
                  {prefs.targetLocations?.length > 0 && (
                    <div className="summary-chips">
                      <span className="summary-label">Locations:</span>
                      {prefs.targetLocations.map((l) => <span key={l} className="tag">{l}</span>)}
                    </div>
                  )}
                  {prefs.workStyles?.length > 0 && (
                    <div className="summary-chips">
                      <span className="summary-label">Style:</span>
                      {prefs.workStyles.map((w) => <span key={w} className="tag">{w}</span>)}
                    </div>
                  )}
                  {prefs.salaryMin && <div className="summary-text">Min salary: {prefs.salaryMin}</div>}
                </div>
              )}
              {!hasPrefs && !profile.resume && (
                <div className="summary-text" style={{ color: 'var(--text-tertiary)' }}>
                  No profile set up yet. Click Edit to add your resume and preferences.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .settings-view {
          padding: 32px 40px;
          overflow-y: auto;
          height: 100%;
        }
        .view-header { margin-bottom: 28px; }
        .view-subtitle { color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px; }
        .settings-content {
          max-width: 640px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .settings-section { padding: 20px; }
        .settings-section > label { margin-bottom: 10px; }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .section-header label {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 0;
        }
        .inline-edit { display: flex; gap: 8px; align-items: center; }
        .inline-edit input { flex: 1; }
        .saved-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--status-offer);
          font-size: 0.88rem;
          font-weight: 500;
        }
        .saved-indicator .btn { color: var(--text-secondary); margin-left: auto; }
        .profile-editor { display: flex; flex-direction: column; gap: 14px; }
        .profile-field label { margin-bottom: 4px; font-size: 0.78rem; }
        .profile-row { display: flex; gap: 14px; }
        .profile-actions { display: flex; gap: 8px; margin-top: 4px; }
        .chip-input-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          padding: 6px 10px;
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-md);
          min-height: 36px;
        }
        .chip-input-wrap:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-light);
        }
        .chip-text-input {
          border: none; background: none; padding: 2px 4px; font-size: 0.85rem;
          min-width: 80px; flex: 1; outline: none; width: auto;
        }
        .chip-text-input:focus { box-shadow: none; }
        .checkbox-group { display: flex; gap: 12px; flex-wrap: wrap; }
        .checkbox-item {
          display: flex; align-items: center; gap: 6px; font-size: 0.85rem;
          text-transform: none; font-weight: 400; color: var(--text-primary); cursor: pointer;
        }
        .checkbox-item input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }
        .profile-summary { display: flex; flex-direction: column; gap: 8px; }
        .summary-item {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.88rem; color: var(--status-offer); font-weight: 500;
        }
        .summary-prefs { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
        .summary-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .summary-label {
          font-size: 0.78rem; font-weight: 600; color: var(--text-tertiary);
          text-transform: uppercase; letter-spacing: 0.02em;
        }
        .summary-text { font-size: 0.85rem; color: var(--text-secondary); }
        .error-text { color: var(--status-rejected); font-size: 0.85rem; }
        .save-toast {
          background: var(--status-offer-bg); color: var(--status-offer);
          padding: 6px 12px; border-radius: var(--radius-md); font-size: 0.82rem; font-weight: 500;
          display: inline-block; width: fit-content;
        }
        .input-actions { display: flex; gap: 8px; margin-top: 10px; }
      `}</style>
    </div>
  );
}
