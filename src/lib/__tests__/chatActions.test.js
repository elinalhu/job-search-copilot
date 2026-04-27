import { describe, it, expect, beforeEach } from 'vitest';
import { processActions } from '../chatActions';
import { saveJob, saveStory, saveColumnConfig } from '../storage';

beforeEach(() => {
  localStorage.clear();
});

describe('processActions — parsing', () => {
  it('strips action tags from displayed text', async () => {
    const text = 'Here is your update.\n[[ACTION:update_job:j1:status:Interview]]\nGood luck!';
    const { cleanText } = await processActions(text);
    expect(cleanText).toBe('Here is your update.\n\nGood luck!');
  });

  it('strips multiple action tag types', async () => {
    const text = '[[ACTION:update_job:j1:status:Offer]][[ACTION:refresh_fit:j1]][[ACTION:update_story:s1:title:New]]Done.';
    const { cleanText } = await processActions(text);
    expect(cleanText).toBe('Done.');
  });

  it('returns empty actions array when no tags are present', async () => {
    const { actions } = await processActions('No actions here.');
    expect(actions).toEqual([]);
  });

  it('collapses excessive newlines after stripping tags', async () => {
    const text = 'Before\n\n\n\n[[ACTION:update_job:j1:status:Applied]]\n\n\n\nAfter';
    const { cleanText } = await processActions(text);
    expect(cleanText).not.toMatch(/\n{3,}/);
  });
});

describe('processActions — update_job', () => {
  it('updates a job field', async () => {
    saveJob({ id: 'j1', company: 'Acme', role: 'SWE', status: 'Applied' });
    const text = '[[ACTION:update_job:j1:status:Interview]]';
    const { actions } = await processActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].success).toBe(true);
    expect(actions[0].label).toContain('Acme');
    expect(actions[0].label).toContain('Interview');
  });

  it('fails gracefully when job does not exist', async () => {
    const text = '[[ACTION:update_job:nonexistent:status:Interview]]';
    const { actions } = await processActions(text);
    expect(actions[0].success).toBe(false);
    expect(actions[0].error).toBe('Job not found');
  });

  it('handles custom field updates', async () => {
    saveJob({ id: 'j1', company: 'Acme', role: 'SWE', status: 'Applied', customFields: {} });
    saveColumnConfig({
      hiddenColumns: [],
      customColumns: [{ key: 'custom_stack', label: 'Tech Stack' }],
      columnOrder: [],
    });
    const text = '[[ACTION:update_job:j1:custom_stack:React, Node]]';
    const { actions } = await processActions(text);
    expect(actions[0].success).toBe(true);
    expect(actions[0].label).toContain('Tech Stack');
  });

  it('converts referral field to boolean', async () => {
    saveJob({ id: 'j1', company: 'Acme', role: 'SWE', status: 'Applied' });
    const text = '[[ACTION:update_job:j1:referral:true]]';
    const { actions } = await processActions(text);
    expect(actions[0].success).toBe(true);
  });
});

describe('processActions — update_story', () => {
  it('updates an allowed story field', async () => {
    saveStory({ id: 's1', title: 'Led migration', company: 'Acme', situation: '', task: '', action: '', result: '' });
    const text = '[[ACTION:update_story:s1:title:Led cloud migration]]';
    const { actions } = await processActions(text);
    expect(actions[0].success).toBe(true);
    expect(actions[0].label).toContain('title updated');
  });

  it('rejects disallowed story fields', async () => {
    saveStory({ id: 's1', title: 'Test', company: 'Co', situation: '', task: '', action: '', result: '' });
    const text = '[[ACTION:update_story:s1:tags:new-tag]]';
    const { actions } = await processActions(text);
    expect(actions[0].success).toBe(false);
    expect(actions[0].error).toContain('not editable');
  });

  it('fails gracefully when story does not exist', async () => {
    const text = '[[ACTION:update_story:nonexistent:title:Updated]]';
    const { actions } = await processActions(text);
    expect(actions[0].success).toBe(false);
    expect(actions[0].error).toBe('Story not found');
  });
});

describe('processActions — lookup_jd', () => {
  it('populates lookups for existing jobs', async () => {
    saveJob({ id: 'j1', company: 'Acme', role: 'SWE', jdText: 'Build things' });
    const text = '[[ACTION:lookup_jd:j1]]';
    const { lookups } = await processActions(text);
    expect(lookups).toHaveLength(1);
    expect(lookups[0].company).toBe('Acme');
    expect(lookups[0].jdText).toBe('Build things');
  });

  it('uses fallback text when job has no jdText', async () => {
    saveJob({ id: 'j1', company: 'Beta', role: 'PM' });
    const text = '[[ACTION:lookup_jd:j1]]';
    const { lookups } = await processActions(text);
    expect(lookups[0].jdText).toBe('(No job description stored)');
  });

  it('produces no lookup for nonexistent job', async () => {
    const text = '[[ACTION:lookup_jd:nonexistent]]';
    const { lookups } = await processActions(text);
    expect(lookups).toEqual([]);
  });
});

describe('processActions — fill_column', () => {
  it('fails when job does not exist', async () => {
    const text = '[[ACTION:fill_column:nonexistent:custom_1]]';
    const { actions } = await processActions(text);
    expect(actions[0].success).toBe(false);
    expect(actions[0].error).toBe('Job not found');
  });

  it('fails when column does not exist', async () => {
    saveJob({ id: 'j1', company: 'Acme', role: 'SWE', status: 'Applied' });
    saveColumnConfig({ hiddenColumns: [], customColumns: [], columnOrder: [] });
    const text = '[[ACTION:fill_column:j1:custom_missing]]';
    const { actions } = await processActions(text);
    expect(actions[0].success).toBe(false);
    expect(actions[0].error).toContain('not found');
  });
});
