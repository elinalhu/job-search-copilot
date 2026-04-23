import { updateJob, getJobs, getColumnConfig, updateStory, getStories, getProfile } from './storage';
import { refreshPreferenceFit, researchAndFillColumn } from './claude';

/**
 * Parse and execute action tags from chat responses.
 * Returns { cleanText, actions, lookups }
 */
export async function processActions(text) {
  const actions = [];
  const lookups = [];

  // Parse job update actions
  for (const match of text.matchAll(/\[\[ACTION:update_job:([^:\]]+):([^:\]]+):(.*?)\]\]/g)) {
    actions.push({ type: 'update_job', jobId: match[1], field: match[2], value: match[3] });
  }

  // Parse story update actions
  for (const match of text.matchAll(/\[\[ACTION:update_story:([^:\]]+):([^:\]]+):(.*?)\]\]/g)) {
    actions.push({ type: 'update_story', storyId: match[1], field: match[2], value: match[3] });
  }

  // Parse refresh fit actions
  for (const match of text.matchAll(/\[\[ACTION:refresh_fit:([^\]]+)\]\]/g)) {
    actions.push({ type: 'refresh_fit', jobId: match[1] });
  }

  // Parse fill column actions: [[ACTION:fill_column:JOB_ID:COLUMN_KEY]]
  for (const match of text.matchAll(/\[\[ACTION:fill_column:([^:\]]+):([^\]]+)\]\]/g)) {
    actions.push({ type: 'fill_column', jobId: match[1], columnKey: match[2] });
  }

  // Parse lookup actions
  for (const match of text.matchAll(/\[\[ACTION:lookup_jd:([^\]]+)\]\]/g)) {
    const jobs = getJobs();
    const job = jobs.find((j) => j.id === match[1]);
    if (job) {
      lookups.push({ jobId: job.id, company: job.company, role: job.role, jdText: job.jdText || '(No job description stored)' });
    }
  }

  // Execute actions
  const results = [];
  for (const action of actions) {
    try {
      if (action.type === 'update_job') {
        const jobs = getJobs();
        const job = jobs.find((j) => j.id === action.jobId);
        if (!job) { results.push({ ...action, success: false, error: 'Job not found' }); continue; }

        if (action.field.startsWith('custom_')) {
          updateJob(action.jobId, { customFields: { ...job.customFields, [action.field]: action.value } });
        } else if (action.field === 'referral') {
          updateJob(action.jobId, { [action.field]: action.value === 'true' || action.value === 'yes' });
        } else {
          updateJob(action.jobId, { [action.field]: action.value });
        }

        let fieldLabel = action.field;
        if (action.field.startsWith('custom_')) {
          const colConfig = getColumnConfig();
          const col = colConfig.customColumns.find((c) => c.key === action.field);
          if (col) fieldLabel = col.label;
        }
        results.push({ ...action, success: true, label: `${job.company}: ${fieldLabel} → ${action.value || '(cleared)'}` });
      }

      else if (action.type === 'update_story') {
        const stories = getStories();
        const story = stories.find((s) => s.id === action.storyId);
        if (!story) { results.push({ ...action, success: false, error: 'Story not found' }); continue; }

        const allowed = ['title', 'company', 'situation', 'task', 'action', 'result'];
        if (!allowed.includes(action.field)) { results.push({ ...action, success: false, error: `Field "${action.field}" not editable` }); continue; }

        updateStory(action.storyId, { [action.field]: action.value });
        results.push({ ...action, success: true, label: `Story "${story.title}": ${action.field} updated` });
      }

      else if (action.type === 'refresh_fit') {
        const jobs = getJobs();
        const job = jobs.find((j) => j.id === action.jobId);
        if (!job) { results.push({ ...action, success: false, error: 'Job not found' }); continue; }

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
          updateJob(job.id, { analysis: { ...job.analysis, preferenceFit: fit } });
          results.push({ ...action, success: true, label: `${job.company}: fit score updated to ${fit.score}/10` });
        } catch (err) {
          results.push({ ...action, success: false, error: `Fit refresh failed: ${err.message}` });
        }
      }

      else if (action.type === 'fill_column') {
        const jobs = getJobs();
        const job = jobs.find((j) => j.id === action.jobId);
        if (!job) { results.push({ ...action, success: false, error: 'Job not found' }); continue; }

        const colConfig = getColumnConfig();
        const col = colConfig.customColumns.find((c) => c.key === action.columnKey);
        if (!col) { results.push({ ...action, success: false, error: `Column "${action.columnKey}" not found` }); continue; }

        try {
          const value = await researchAndFillColumn({
            company: job.company,
            role: job.role,
            jdText: job.jdText,
            columnLabel: col.label,
            instruction: col.instruction,
          });
          updateJob(job.id, { customFields: { ...job.customFields, [action.columnKey]: value } });
          results.push({ ...action, success: true, label: `${job.company}: ${col.label} → ${value}` });
        } catch (err) {
          results.push({ ...action, success: false, error: `Fill failed: ${err.message}` });
        }
      }

      else {
        results.push({ ...action, success: false, error: 'Unknown action type' });
      }
    } catch (err) {
      results.push({ ...action, success: false, error: err.message });
    }
  }

  // Remove all action tags from displayed text
  const cleanText = text
    .replace(/\[\[ACTION:update_job:.*?\]\]/g, '')
    .replace(/\[\[ACTION:update_story:.*?\]\]/g, '')
    .replace(/\[\[ACTION:refresh_fit:.*?\]\]/g, '')
    .replace(/\[\[ACTION:fill_column:.*?\]\]/g, '')
    .replace(/\[\[ACTION:lookup_jd:.*?\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanText, actions: results, lookups };
}
