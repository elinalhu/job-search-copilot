import { getApiKey, getColumnConfig } from './storage';

const MODEL = 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude({ system, messages, maxTokens = 2000, stream = false }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API key not set. Please add your Anthropic API key in settings.');

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  };

  if (stream) {
    body.stream = true;
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }
    return res.body;
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

export async function analyzeJob({ resume, jdText, stories, preferences, customColumns }) {
  const storiesContext = stories.length > 0
    ? `\n\nUser's STAR Stories:\n${stories.map((s, i) => `${i + 1}. [ID: ${s.id}] "${s.title}" - Tags: ${s.tags.join(', ')}\n   S: ${s.situation}\n   T: ${s.task}\n   A: ${s.action}\n   R: ${s.result}`).join('\n\n')}`
    : '';

  let prefsContext = '';
  if (preferences) {
    const parts = [];
    if (preferences.targetRoles?.length) parts.push(`Target roles: ${preferences.targetRoles.join(', ')}`);
    if (preferences.targetLocations?.length) parts.push(`Preferred locations: ${preferences.targetLocations.join(', ')}`);
    if (preferences.salaryMin) parts.push(`Minimum salary: ${preferences.salaryMin}`);
    if (preferences.workStyles?.length) parts.push(`Work style: ${preferences.workStyles.join(', ')}`);
    if (preferences.companySizes?.length) parts.push(`Company size: ${preferences.companySizes.join(', ')}`);
    if (preferences.industries?.length) parts.push(`Industries: ${preferences.industries.join(', ')}`);
    if (preferences.freetext) parts.push(`Other preferences: ${preferences.freetext}`);
    if (parts.length > 0) {
      prefsContext = `\n\nUser's Job Preferences:\n${parts.join('\n')}`;
    }
  }

  let customColsContext = '';
  if (customColumns?.length > 0) {
    const colDescriptions = customColumns.map((c) => {
      if (c.instruction) {
        return `"${c.label}" (key: ${c.key}) — Instruction: ${c.instruction}`;
      }
      return `"${c.label}" (key: ${c.key})`;
    }).join('\n  ');
    customColsContext = `\n\nThe user has custom tracker columns. For each, extract or infer the value from the job description based on the column name and any instruction provided. Include them in the response as "customFields": { "column_key": "value" }.\nCustom columns:\n  ${colDescriptions}`;
  }

  const system = `You are an expert job search coach. Given a resume and job description, return ONLY a valid JSON object (no markdown, no code fences) with this exact structure:
{
  "company": "extracted company name",
  "role": "extracted role title",
  "location": "city/location if mentioned in JD, or empty string",
  "workStyle": "Remote or Hybrid or Onsite if mentioned, or empty string",
  "salaryRange": "salary range if mentioned (e.g. '$150k-$180k'), or empty string",
  "fundingStage": "Best estimate of company funding stage (e.g. 'Seed', 'Series A', 'Series B', 'Series C', 'Series D+', 'Pre-IPO', 'Public', 'Bootstrapped') based on company name and any info in the JD. Use your knowledge. Empty string if truly unknown.",
  "talkingPoints": "A paragraph summary followed by key bullet points formatted with bullet characters (•). Include specific talking points mapping the candidate's experience to the role requirements.",
  "starMatches": [{"storyId": "id from provided stories", "fitScore": 8, "personalizedFraming": "How to frame this story specifically for this role"}],
  "researchBrief": {
    "short": "2-3 paragraph overview with bullet points about the company and role",
    "expanded": "Deeper analysis including company culture, recent news, team structure, competitive landscape, and interview preparation tips"
  },
  "gaps": [{"gap": "Specific gap identified", "howToAddress": "Practical advice on how to talk about or address this gap"}],
  "preferenceFit": {
    "score": 8,
    "matchingFactors": ["What aligns with user preferences"],
    "mismatches": ["What doesn't align with user preferences"],
    "reasoning": "2-3 sentence explanation of why this score was given"
  },
  "customFields": {}
}

Be specific, direct, and practical. Reference actual content from the resume and JD. For starMatches, only include stories that genuinely fit — don't force matches. FitScore is 1-10. Extract location, workStyle, and salaryRange directly from the job description text if present. For preferenceFit, score 1-10 how well this job matches the user's stated preferences. If no preferences are provided, set score to 0 and leave matchingFactors and mismatches empty. For fundingStage, use your knowledge of the company to provide the best estimate.${storiesContext}${prefsContext}${customColsContext}`;

  const text = await callClaude({
    system,
    messages: [
      {
        role: 'user',
        content: `Resume:\n${resume}\n\n---\n\nJob Description:\n${jdText}`,
      },
    ],
    maxTokens: 3500,
  });

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse analysis response. Please try again.');
  }
}

async function fetchViaProxy(url) {
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    const data = await res.json();
    if (!data.contents) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, 'text/html');
    // Remove scripts/styles/nav
    doc.querySelectorAll('script, style, nav, footer, header, aside').forEach((el) => el.remove());
    return (doc.body?.textContent || '').replace(/\s+/g, ' ').slice(0, 2000).trim();
  } catch {
    return '';
  }
}

export async function lookupFundingStage({ company, jdText }) {
  // Try multiple sources in parallel for better accuracy
  const companySlug = company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  const sources = await Promise.allSettled([
    // 1. Crunchbase organization page
    fetchViaProxy(`https://www.crunchbase.com/organization/${companySlug}`),
    // 2. DuckDuckGo search (less aggressive bot detection than Google)
    fetchViaProxy(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(company + ' series funding round raised crunchbase 2024 2025 2026')}`),
    // 3. Company's own about page
    fetchViaProxy(`https://www.${companySlug}.com/about`),
    // 4. PitchBook search
    fetchViaProxy(`https://pitchbook.com/profiles/${companySlug}`),
  ]);

  const webContext = sources
    .map((r, i) => {
      if (r.status !== 'fulfilled' || !r.value) return '';
      const label = ['Crunchbase', 'DuckDuckGo Search', 'Company Website', 'PitchBook'][i];
      return `[${label}]: ${r.value}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const system = `You are a startup/company research analyst. Determine the funding stage of a company using the web research provided. Return ONLY a valid JSON object (no markdown, no code fences):
{
  "fundingStage": "Seed | Series A | Series B | Series C | Series D | Series E | Series F | Series G+ | Pre-IPO | Public | Bootstrapped | Unknown",
  "confidence": "high | medium | low",
  "reasoning": "Brief explanation citing the specific source (Crunchbase, DuckDuckGo, company website) where you found this info",
  "lastKnownRound": "e.g. 'Series F, $100M raised in March 2025' — be specific with amount and date if available",
  "totalRaised": "e.g. '$500M' or empty string",
  "sources": ["Which sources provided useful info"]
}

IMPORTANT:
- Prioritize web research data over your training data — your training data may be outdated
- If Crunchbase or DuckDuckGo results mention a specific round, trust that over general knowledge
- Use high confidence when web sources explicitly state the funding round
- Use medium when you can infer from multiple signals
- Use low only when no web data is available and you're relying on training data alone
- Be specific about Series letter (D, E, F, G) — don't round down to "Series D+"`;

  const userMsg = webContext
    ? `Company: ${company}\n\nJob Description context:\n${(jdText || '').slice(0, 300)}\n\nWeb Research:\n${webContext}`
    : `Company: ${company}\n\nJob Description context:\n${(jdText || '').slice(0, 300)}\n\n(No web research was available — use your best knowledge but mark confidence as low)`;

  const text = await callClaude({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 500,
  });

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse funding stage response.');
  }
}

export async function refreshPreferenceFit({ jdText, company, role, preferences, trackerValues }) {
  let prefsContext = '';
  if (preferences) {
    const parts = [];
    if (preferences.targetRoles?.length) parts.push(`Target roles: ${preferences.targetRoles.join(', ')}`);
    if (preferences.targetLocations?.length) parts.push(`Preferred locations: ${preferences.targetLocations.join(', ')}`);
    if (preferences.salaryMin) parts.push(`Minimum salary: ${preferences.salaryMin}`);
    if (preferences.workStyles?.length) parts.push(`Work style: ${preferences.workStyles.join(', ')}`);
    if (preferences.companySizes?.length) parts.push(`Company size: ${preferences.companySizes.join(', ')}`);
    if (preferences.industries?.length) parts.push(`Industries: ${preferences.industries.join(', ')}`);
    if (preferences.freetext) parts.push(`Other preferences: ${preferences.freetext}`);
    if (parts.length === 0) throw new Error('No preferences set. Go to Settings to add your preferences first.');
    prefsContext = parts.join('\n');
  } else {
    throw new Error('No preferences set. Go to Settings to add your preferences first.');
  }

  const system = `You are a job search coach. Score how well this job matches the user's stated preferences. Return ONLY a valid JSON object (no markdown, no code fences):
{
  "score": 8,
  "matchingFactors": ["What aligns with preferences"],
  "mismatches": ["What doesn't align"],
  "reasoning": "2-3 sentence explanation of why you gave this score, referencing specific preference criteria and job details."
}

Score 1-10. Be specific — reference actual details from the job and preferences.
IMPORTANT: The "Current tracker values" below are manually curated by the user and should be treated as MORE ACCURATE than what the job description says. If the tracker says "Hybrid" but the JD says "Remote", trust the tracker value.

User's Preferences:
${prefsContext}`;

  let trackerContext = '';
  if (trackerValues) {
    const parts = [];
    if (trackerValues.location) parts.push(`Location: ${trackerValues.location}`);
    if (trackerValues.workStyle) parts.push(`Work Style: ${trackerValues.workStyle}`);
    if (trackerValues.salaryRange) parts.push(`Salary: ${trackerValues.salaryRange}`);
    if (trackerValues.fundingStage) parts.push(`Company Stage: ${trackerValues.fundingStage}`);
    if (trackerValues.customFields) {
      Object.entries(trackerValues.customFields).forEach(([k, v]) => { if (v) parts.push(`${k}: ${v}`); });
    }
    if (parts.length > 0) trackerContext = `\n\nCurrent tracker values (user-curated, take precedence over JD):\n${parts.join('\n')}`;
  }

  const text = await callClaude({
    system,
    messages: [{ role: 'user', content: `Job: ${company} — ${role}${trackerContext}\n\nJob Description:\n${jdText || '(No JD stored)'}` }],
    maxTokens: 1000,
  });

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse fit score response.');
  }
}

export async function parseStory(rawText) {
  const system = `You parse interview stories into STAR format. Return ONLY a valid JSON object (no markdown, no code fences):
{
  "title": "Brief descriptive title",
  "company": "Company where this happened (extract from context, or empty string)",
  "situation": "The situation or context",
  "task": "The task or challenge you faced",
  "action": "The actions you took",
  "result": "The results and outcomes",
  "tags": ["relevant", "tags"]
}

Available tags: leadership, technical, cross-functional, data-driven, customer-facing, conflict-resolution, ambiguity, scale, innovation, mentoring, process-improvement, communication`;

  const text = await callClaude({
    system,
    messages: [{ role: 'user', content: rawText }],
    maxTokens: 1500,
  });

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse story. Please try again.');
  }
}

export async function scoreStory(story) {
  const system = `You are a senior hiring manager and interview coach evaluating STAR interview stories. Score the story and provide actionable improvement advice. Return ONLY a valid JSON object (no markdown, no code fences):
{
  "score": 7,
  "reasoning": "2-3 sentences explaining the score from a hiring manager's perspective. What makes this story strong or weak?",
  "strengths": ["Specific strength 1", "Specific strength 2"],
  "improvements": ["Specific, actionable improvement suggestion 1", "Specific improvement 2", "Specific improvement 3"],
  "revisedResult": "An improved version of the Result section that's more impactful (optional, only if the result is weak)"
}

Scoring criteria (1-10):
- 9-10: Exceptional — specific metrics, clear ownership, compelling narrative, strong results
- 7-8: Strong — good structure, some metrics, clear actions, decent results
- 5-6: Adequate — tells a story but lacks specificity, vague results, or missing metrics
- 3-4: Weak — unclear ownership, no metrics, generic actions, unclear outcome
- 1-2: Incomplete — missing major STAR components

Be direct and practical. Focus on what would make a hiring manager remember this story.`;

  const userMsg = `Title: ${story.title || 'Untitled'}
Company: ${story.company || 'Not specified'}

Situation: ${story.situation || '(empty)'}
Task: ${story.task || '(empty)'}
Action: ${story.action || '(empty)'}
Result: ${story.result || '(empty)'}`;

  const text = await callClaude({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 1000,
  });

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to score story. Please try again.');
  }
}

export async function parseMultipleStories(rawText) {
  const system = `You extract STAR interview stories from conversation transcripts, notes, or freetext. There may be one or many stories in the text. Return ONLY a valid JSON array (no markdown, no code fences) where each element is:
{
  "title": "Brief descriptive title",
  "company": "Company where this happened (extract from context, or empty string)",
  "situation": "The situation or context",
  "task": "The task or challenge",
  "action": "The actions taken",
  "result": "The results and outcomes",
  "tags": ["relevant", "tags"]
}

Available tags: leadership, technical, cross-functional, data-driven, customer-facing, conflict-resolution, ambiguity, scale, innovation, mentoring, process-improvement, communication

Important: Return a JSON ARRAY even if there's only one story. Separate distinct stories — don't merge unrelated experiences into one. Each story should be a complete S/T/A/R.`;

  const text = await callClaude({
    system,
    messages: [{ role: 'user', content: rawText }],
    maxTokens: 4000,
  });

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error('Failed to parse stories from transcript. Please try again.');
  }
}

export async function gradeAnswer({ question, answer, category, resume }) {
  const system = `You are a senior hiring manager grading an interview answer. Be direct, specific, and constructive. Return ONLY a valid JSON object (no markdown, no code fences):
{
  "score": 7,
  "strengths": ["Specific thing done well"],
  "weaknesses": ["Specific area to improve"],
  "suggestedAnswer": "A polished, improved version of the answer that keeps the candidate's authentic voice but is tighter, more structured, and more impactful. Use the STAR format if applicable.",
  "tips": ["Quick tip for delivery or framing"]
}

Scoring (1-10):
- 9-10: Exceptional — structured, specific metrics, compelling narrative, memorable
- 7-8: Strong — clear structure, good examples, some metrics
- 5-6: Adequate — answers the question but lacks specificity or impact
- 3-4: Weak — vague, rambling, or doesn't address the question
- 1-2: Off-topic or non-answer

Consider: structure (STAR if behavioral), specificity, metrics/impact, relevance to question, conciseness, and confidence.`;

  const userMsg = `Question: ${question}
${category ? `Category: ${category}` : ''}

Candidate's Answer:
${answer}

${resume ? `Candidate's background (for context):\n${resume.slice(0, 500)}` : ''}`;

  const text = await callClaude({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 1500,
  });

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to grade answer. Please try again.');
  }
}

export async function researchAndFillColumn({ company, role, jdText, columnLabel, instruction }) {
  // Try web research for context
  let webContext = '';
  try {
    const searchQuery = instruction
      ? `${company} ${instruction.split(' ').slice(0, 5).join(' ')}`
      : `${company} ${columnLabel}`;
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`)}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data.contents) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');
        doc.querySelectorAll('script, style, nav, footer').forEach((el) => el.remove());
        webContext = (doc.body?.textContent || '').replace(/\s+/g, ' ').slice(0, 1500).trim();
      }
    }
  } catch {}

  const system = `You are a company researcher. Answer a specific question about a company for a job tracker column. Return ONLY the value — a short string suitable for a spreadsheet cell. No JSON, no explanation, just the answer.

${instruction ? `Column instruction: ${instruction}` : `Column: "${columnLabel}" — infer what information is needed from the column name.`}

If you genuinely cannot determine the answer from the available information, respond with just "Unknown".`;

  const userMsg = `Company: ${company}\nRole: ${role}${jdText ? `\n\nJob Description excerpt:\n${jdText.slice(0, 800)}` : ''}${webContext ? `\n\nWeb research:\n${webContext}` : ''}`;

  const text = await callClaude({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 200,
  });

  return text.trim();
}

export async function chat({ messages, resume, jobs, stories, onChunk }) {
  const jobsSummary = jobs.length > 0
    ? `\n\nTracked Jobs:\n${jobs.map((j) => {
      const fit = j.analysis?.preferenceFit;
      const customFields = j.customFields ? Object.entries(j.customFields).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
      return `- [ID:${j.id}] ${j.company} — ${j.role} | Status: ${j.status} | Location: ${j.location || 'N/A'} | Work Style: ${j.workStyle || 'N/A'} | Salary: ${j.salaryRange || 'N/A'} | Stage: ${j.fundingStage || 'N/A'} | Fit Score: ${fit?.score || 'N/A'}${fit?.reasoning ? ` (${fit.reasoning})` : ''}${customFields ? ` | Custom: ${customFields}` : ''}`;
    }).join('\n')}`
    : '';

  const storiesSummary = stories.length > 0
    ? `\n\nSTAR Stories:\n${stories.map((s) => `- [ID:${s.id}] "${s.title}" [${s.tags.join(', ')}]\n  S: ${(s.situation || '').slice(0, 200)}\n  T: ${(s.task || '').slice(0, 200)}\n  A: ${(s.action || '').slice(0, 200)}\n  R: ${(s.result || '').slice(0, 200)}`).join('\n')}`
    : '';

  let system = `You are a supportive, direct job search coach. You know the user's background from their resume and have context on their job search progress.

Be practical and specific. Give actionable advice. When relevant, reference their actual experience, stories, and target roles. Keep responses concise but thorough.

IMPORTANT: You have FIVE tools. USE THEM. Never say you "can't" — you CAN and MUST when the user asks.

TOOL 1 — EDIT any job field:
[[ACTION:update_job:JOB_ID:FIELD_NAME:NEW_VALUE]]
Built-in fields: status, company, role, location, workStyle, salaryRange, notes, fundingStage, referral
Custom fields: use the key exactly as listed (e.g. custom_6d2bf1a7)

TOOL 2 — REFRESH a job's fit score (recalculates from preferences + tracker values):
[[ACTION:refresh_fit:JOB_ID]]

TOOL 3 — RESEARCH AND FILL a custom column for a job (does web research + AI analysis):
[[ACTION:fill_column:JOB_ID:COLUMN_KEY]]
This runs web research and uses the column's AI instruction to populate the value. Use this when the user asks to "run", "fill", "research", or "populate" a custom column. Can include multiple tags for multiple jobs.
Example: [[ACTION:fill_column:abc-123:custom_6d2bf1a7]]
To fill a column for ALL jobs, include one tag per job.

TOOL 4 — EDIT any STAR story field:
[[ACTION:update_story:STORY_ID:FIELD_NAME:NEW_VALUE]]
Fields: title, company, situation, task, action, result

TOOL 5 — LOOK UP a stored job description:
[[ACTION:lookup_jd:JOB_ID]]

You MUST include action tags when the user asks to update, fill, run, research, clear, edit, or change ANY field on jobs or stories. Include multiple tags at once. After the tags, briefly summarize what you changed.

User's Resume:\n${resume || '(No resume provided yet)'}${storiesSummary}${jobsSummary}`;

  // Add custom column info
  const colConfig = getColumnConfig();
  if (colConfig.customColumns?.length > 0) {
    system += `\n\nCustom tracker columns:\n${colConfig.customColumns.map((c) => `- "${c.label}" (key: ${c.key})${c.instruction ? ` — Instruction: ${c.instruction}` : ''}`).join('\n')}`;
  }

  const apiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const stream = await callClaude({
      system,
      messages: apiMessages,
      maxTokens: 2000,
      stream: true,
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              onChunk?.(fullText);
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }
    }

    return fullText;
  } catch (err) {
    // Fallback to non-streaming
    if (err.message?.includes('stream')) {
      const text = await callClaude({
        system,
        messages: apiMessages,
        maxTokens: 2000,
        stream: false,
      });
      onChunk?.(text);
      return text;
    }
    throw err;
  }
}
