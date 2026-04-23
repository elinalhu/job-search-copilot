export async function scrapeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error('Failed to fetch URL. The site may be blocking access. Try pasting the job description text directly.');
  }

  const data = await res.json();
  if (!data.contents) {
    throw new Error('No content returned. Try pasting the job description text directly.');
  }

  return extractMainText(data.contents);
}

function extractMainText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove non-content elements
  const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript', '.nav', '.footer', '.header', '.sidebar', '.menu', '.cookie', '.banner', '.ad'];
  removeSelectors.forEach((sel) => {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Try to find main content
  const main = doc.querySelector('main, [role="main"], article, .job-description, .job-details, #job-description, .posting-content, .job-content');
  const container = main || doc.body;

  if (!container) {
    throw new Error('Could not extract text from this page. Try pasting the job description text directly.');
  }

  const text = container.innerText || container.textContent || '';
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length < 50) {
    throw new Error('Extracted text is too short — the site may require JavaScript to load content. Try pasting the job description text directly.');
  }

  return cleaned;
}
