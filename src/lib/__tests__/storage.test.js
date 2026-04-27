import { describe, it, expect, beforeEach } from 'vitest';
import {
  getApiKey,
  saveApiKey,
  getProfile,
  saveProfile,
  getResume,
  saveResume,
  getJobs,
  saveJob,
  updateJob,
  deleteJob,
  getStories,
  saveStory,
  updateStory,
  deleteStory,
  reorderStories,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  getChatThreads,
  getChatThread,
  saveChatThread,
  deleteChatThread,
  createChatThread,
  getColumnConfig,
  saveColumnConfig,
  getQABank,
  saveQA,
  updateQA,
  deleteQA,
} from '../storage';

beforeEach(() => {
  localStorage.clear();
});

describe('API Key', () => {
  it('returns empty string when no key is set', () => {
    expect(getApiKey()).toBe('');
  });

  it('saves and retrieves an API key', () => {
    saveApiKey('sk-test-123');
    expect(getApiKey()).toBe('sk-test-123');
  });
});

describe('Profile', () => {
  it('returns default profile when none exists', () => {
    const profile = getProfile();
    expect(profile.resume).toBe('');
    expect(profile.linkedinUrl).toBe('');
    expect(profile.preferences.targetRoles).toEqual([]);
  });

  it('saves and retrieves a profile', () => {
    const profile = {
      resume: 'My resume text',
      linkedinUrl: 'https://linkedin.com/in/test',
      preferences: {
        targetRoles: ['Engineer'],
        targetLocations: ['Remote'],
        salaryMin: '100000',
        workStyles: ['Remote'],
        companySizes: ['Startup'],
        industries: ['Tech'],
        freetext: '',
      },
    };
    saveProfile(profile);
    const retrieved = getProfile();
    expect(retrieved.resume).toBe('My resume text');
    expect(retrieved.preferences.targetRoles).toEqual(['Engineer']);
  });

  it('migrates legacy resume to profile', () => {
    localStorage.setItem('jsc_resume', 'Legacy resume content');
    const profile = getProfile();
    expect(profile.resume).toBe('Legacy resume content');
  });

  it('merges missing preference fields with defaults', () => {
    localStorage.setItem('jsc_profile', JSON.stringify({ resume: 'test', preferences: {} }));
    const profile = getProfile();
    expect(profile.preferences.targetRoles).toEqual([]);
    expect(profile.preferences.workStyles).toEqual([]);
  });
});

describe('Resume (backward compat)', () => {
  it('returns empty string when no resume exists', () => {
    expect(getResume()).toBe('');
  });

  it('saves resume through profile', () => {
    saveResume('Updated resume');
    expect(getResume()).toBe('Updated resume');
    expect(getProfile().resume).toBe('Updated resume');
  });
});

describe('Jobs', () => {
  it('returns empty array when no jobs exist', () => {
    expect(getJobs()).toEqual([]);
  });

  it('saves a job (prepended to list)', () => {
    saveJob({ id: '1', company: 'Acme', role: 'Engineer', status: 'Applied' });
    saveJob({ id: '2', company: 'Beta', role: 'Designer', status: 'Interview' });
    const jobs = getJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0].company).toBe('Beta');
    expect(jobs[1].company).toBe('Acme');
  });

  it('updates a job by id', () => {
    saveJob({ id: '1', company: 'Acme', role: 'Engineer', status: 'Applied' });
    updateJob('1', { status: 'Interview' });
    expect(getJobs()[0].status).toBe('Interview');
  });

  it('does nothing when updating a nonexistent job', () => {
    saveJob({ id: '1', company: 'Acme', role: 'Engineer', status: 'Applied' });
    updateJob('nonexistent', { status: 'Interview' });
    expect(getJobs()).toHaveLength(1);
    expect(getJobs()[0].status).toBe('Applied');
  });

  it('deletes a job by id', () => {
    saveJob({ id: '1', company: 'Acme', role: 'Engineer', status: 'Applied' });
    saveJob({ id: '2', company: 'Beta', role: 'Designer', status: 'Interview' });
    deleteJob('1');
    const jobs = getJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('2');
  });
});

describe('STAR Stories', () => {
  it('returns empty array when no stories exist', () => {
    expect(getStories()).toEqual([]);
  });

  it('saves a story (prepended)', () => {
    saveStory({ id: 's1', title: 'Led migration', tags: ['leadership'] });
    saveStory({ id: 's2', title: 'Built API', tags: ['technical'] });
    const stories = getStories();
    expect(stories).toHaveLength(2);
    expect(stories[0].title).toBe('Built API');
  });

  it('updates a story by id', () => {
    saveStory({ id: 's1', title: 'Led migration', tags: ['leadership'] });
    updateStory('s1', { title: 'Led cloud migration' });
    expect(getStories()[0].title).toBe('Led cloud migration');
  });

  it('does nothing when updating a nonexistent story', () => {
    saveStory({ id: 's1', title: 'Led migration', tags: [] });
    updateStory('nonexistent', { title: 'Updated' });
    expect(getStories()[0].title).toBe('Led migration');
  });

  it('deletes a story by id', () => {
    saveStory({ id: 's1', title: 'Story A', tags: [] });
    saveStory({ id: 's2', title: 'Story B', tags: [] });
    deleteStory('s1');
    expect(getStories()).toHaveLength(1);
    expect(getStories()[0].id).toBe('s2');
  });

  it('reorders stories by id array', () => {
    saveStory({ id: 's1', title: 'A', tags: [] });
    saveStory({ id: 's2', title: 'B', tags: [] });
    saveStory({ id: 's3', title: 'C', tags: [] });
    // Current order: s3, s2, s1 (prepended)
    reorderStories(['s1', 's3', 's2']);
    const stories = getStories();
    expect(stories.map((s) => s.id)).toEqual(['s1', 's3', 's2']);
  });
});

describe('Chat History (legacy)', () => {
  it('returns empty array when no history exists', () => {
    expect(getChatHistory()).toEqual([]);
  });

  it('saves and retrieves chat history', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    saveChatHistory(messages);
    expect(getChatHistory()).toEqual(messages);
  });

  it('clears chat history', () => {
    saveChatHistory([{ role: 'user', content: 'Hello' }]);
    clearChatHistory();
    expect(getChatHistory()).toEqual([]);
  });
});

describe('Chat Threads', () => {
  it('returns empty array when no threads exist', () => {
    expect(getChatThreads()).toEqual([]);
  });

  it('creates a new thread with defaults', () => {
    const thread = createChatThread();
    expect(thread.title).toBe('New conversation');
    expect(thread.messages).toEqual([]);
    expect(thread.id).toBeTruthy();
    expect(getChatThreads()).toHaveLength(1);
  });

  it('creates a thread with a custom title', () => {
    const thread = createChatThread('My Thread');
    expect(thread.title).toBe('My Thread');
  });

  it('retrieves a thread by id', () => {
    const thread = createChatThread('Test');
    expect(getChatThread(thread.id).title).toBe('Test');
  });

  it('returns null for nonexistent thread', () => {
    expect(getChatThread('nonexistent')).toBeNull();
  });

  it('updates an existing thread in place', () => {
    const thread = createChatThread('Original');
    thread.title = 'Updated';
    thread.messages.push({ role: 'user', content: 'Hello' });
    saveChatThread(thread);
    expect(getChatThreads()).toHaveLength(1);
    expect(getChatThread(thread.id).title).toBe('Updated');
    expect(getChatThread(thread.id).messages).toHaveLength(1);
  });

  it('deletes a thread by id', () => {
    const t1 = createChatThread('Thread 1');
    createChatThread('Thread 2');
    deleteChatThread(t1.id);
    expect(getChatThreads()).toHaveLength(1);
    expect(getChatThread(t1.id)).toBeNull();
  });
});

describe('Column Config', () => {
  it('returns default config when none exists', () => {
    const config = getColumnConfig();
    expect(config).toEqual({ hiddenColumns: [], customColumns: [], columnOrder: [] });
  });

  it('saves and retrieves column config', () => {
    const config = {
      hiddenColumns: ['salary'],
      customColumns: [{ key: 'custom_1', label: 'Stack' }],
      columnOrder: ['company', 'role', 'custom_1'],
    };
    saveColumnConfig(config);
    expect(getColumnConfig()).toEqual(config);
  });
});

describe('Q&A Bank', () => {
  it('returns empty array when no QAs exist', () => {
    expect(getQABank()).toEqual([]);
  });

  it('saves a QA (prepended)', () => {
    saveQA({ id: 'q1', question: 'Tell me about yourself', answer: '...' });
    saveQA({ id: 'q2', question: 'Why this role?', answer: '...' });
    const bank = getQABank();
    expect(bank).toHaveLength(2);
    expect(bank[0].id).toBe('q2');
  });

  it('updates a QA by id', () => {
    saveQA({ id: 'q1', question: 'Original', answer: 'A' });
    updateQA('q1', { answer: 'Updated answer' });
    expect(getQABank()[0].answer).toBe('Updated answer');
  });

  it('does nothing when updating a nonexistent QA', () => {
    saveQA({ id: 'q1', question: 'Q', answer: 'A' });
    updateQA('nonexistent', { answer: 'Updated' });
    expect(getQABank()[0].answer).toBe('A');
  });

  it('deletes a QA by id', () => {
    saveQA({ id: 'q1', question: 'Q1', answer: 'A1' });
    saveQA({ id: 'q2', question: 'Q2', answer: 'A2' });
    deleteQA('q1');
    expect(getQABank()).toHaveLength(1);
    expect(getQABank()[0].id).toBe('q2');
  });
});

describe('safeGet error handling', () => {
  it('returns fallback when localStorage contains invalid JSON', () => {
    localStorage.setItem('jsc_jobs', '{invalid json');
    expect(getJobs()).toEqual([]);
  });
});
