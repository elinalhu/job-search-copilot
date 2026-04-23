const KEYS = {
  API_KEY: 'jsc_api_key',
  RESUME: 'jsc_resume',
  JOBS: 'jsc_jobs',
  STORIES: 'jsc_stories',
  CHAT_HISTORY: 'jsc_chat_history',
  CHAT_THREADS: 'jsc_chat_threads',
  PROFILE: 'jsc_profile',
  COLUMN_CONFIG: 'jsc_column_config',
  QA_BANK: 'jsc_qa_bank',
};

function safeGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// API Key
export function getApiKey() {
  return localStorage.getItem(KEYS.API_KEY) || '';
}
export function saveApiKey(key) {
  localStorage.setItem(KEYS.API_KEY, key);
}

// Profile
const DEFAULT_PROFILE = {
  resume: '',
  linkedinUrl: '',
  preferences: {
    targetRoles: [],
    targetLocations: [],
    salaryMin: '',
    workStyles: [],
    companySizes: [],
    industries: [],
    freetext: '',
  },
};

export function getProfile() {
  const profile = safeGet(KEYS.PROFILE, null);
  if (profile) return { ...DEFAULT_PROFILE, ...profile, preferences: { ...DEFAULT_PROFILE.preferences, ...profile.preferences } };
  // Migrate legacy resume
  const legacyResume = localStorage.getItem(KEYS.RESUME) || '';
  if (legacyResume) {
    const migrated = { ...DEFAULT_PROFILE, resume: legacyResume };
    safeSet(KEYS.PROFILE, migrated);
    return migrated;
  }
  return { ...DEFAULT_PROFILE };
}

export function saveProfile(profile) {
  safeSet(KEYS.PROFILE, profile);
}

// Resume (reads from profile, backward compat)
export function getResume() {
  return getProfile().resume || '';
}
export function saveResume(text) {
  const profile = getProfile();
  profile.resume = text;
  saveProfile(profile);
}

// Jobs
export function getJobs() {
  return safeGet(KEYS.JOBS, []);
}
export function saveJob(job) {
  const jobs = getJobs();
  jobs.unshift(job);
  safeSet(KEYS.JOBS, jobs);
}
export function updateJob(id, updates) {
  const jobs = getJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], ...updates };
    safeSet(KEYS.JOBS, jobs);
  }
}
export function deleteJob(id) {
  const jobs = getJobs().filter((j) => j.id !== id);
  safeSet(KEYS.JOBS, jobs);
}

// STAR Stories
export function getStories() {
  return safeGet(KEYS.STORIES, []);
}
export function saveStory(story) {
  const stories = getStories();
  stories.unshift(story);
  safeSet(KEYS.STORIES, stories);
}
export function updateStory(id, updates) {
  const stories = getStories();
  const idx = stories.findIndex((s) => s.id === id);
  if (idx !== -1) {
    stories[idx] = { ...stories[idx], ...updates };
    safeSet(KEYS.STORIES, stories);
  }
}
export function deleteStory(id) {
  const stories = getStories().filter((s) => s.id !== id);
  safeSet(KEYS.STORIES, stories);
}
export function reorderStories(orderedIds) {
  const stories = getStories();
  const sorted = orderedIds.map((id) => stories.find((s) => s.id === id)).filter(Boolean);
  // Append any stories not in orderedIds (shouldn't happen, but safety)
  stories.forEach((s) => { if (!orderedIds.includes(s.id)) sorted.push(s); });
  safeSet(KEYS.STORIES, sorted);
}

// Chat History (legacy single thread — kept for backward compat)
export function getChatHistory() {
  return safeGet(KEYS.CHAT_HISTORY, []);
}
export function saveChatHistory(messages) {
  safeSet(KEYS.CHAT_HISTORY, messages);
}
export function clearChatHistory() {
  localStorage.removeItem(KEYS.CHAT_HISTORY);
}

// Chat Threads
// Thread: { id, title, createdAt, updatedAt, messages: [] }
export function getChatThreads() {
  return safeGet(KEYS.CHAT_THREADS, []);
}
export function getChatThread(id) {
  return getChatThreads().find((t) => t.id === id) || null;
}
export function saveChatThread(thread) {
  const threads = getChatThreads();
  const idx = threads.findIndex((t) => t.id === thread.id);
  if (idx !== -1) {
    threads[idx] = thread;
  } else {
    threads.unshift(thread);
  }
  safeSet(KEYS.CHAT_THREADS, threads);
}
export function deleteChatThread(id) {
  const threads = getChatThreads().filter((t) => t.id !== id);
  safeSet(KEYS.CHAT_THREADS, threads);
}
export function createChatThread(title) {
  const thread = {
    id: crypto.randomUUID(),
    title: title || 'New conversation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  saveChatThread(thread);
  return thread;
}

// Column Config
// { hiddenColumns: [], customColumns: [], columnOrder: [] }
export function getColumnConfig() {
  return safeGet(KEYS.COLUMN_CONFIG, { hiddenColumns: [], customColumns: [], columnOrder: [] });
}
export function saveColumnConfig(config) {
  safeSet(KEYS.COLUMN_CONFIG, config);
}

// Q&A Bank
export function getQABank() {
  return safeGet(KEYS.QA_BANK, []);
}
export function saveQA(qa) {
  const bank = getQABank();
  bank.unshift(qa);
  safeSet(KEYS.QA_BANK, bank);
}
export function updateQA(id, updates) {
  const bank = getQABank();
  const idx = bank.findIndex((q) => q.id === id);
  if (idx !== -1) {
    bank[idx] = { ...bank[idx], ...updates };
    safeSet(KEYS.QA_BANK, bank);
  }
}
export function deleteQA(id) {
  const bank = getQABank().filter((q) => q.id !== id);
  safeSet(KEYS.QA_BANK, bank);
}
