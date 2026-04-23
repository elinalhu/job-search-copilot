import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    return parsePdf(file);
  } else if (ext === 'docx' || ext === 'doc') {
    return parseDocx(file);
  } else if (ext === 'txt') {
    return file.text();
  }

  throw new Error(`Unsupported file type: .${ext}. Please use PDF, DOCX, or TXT.`);
}

async function parsePdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}

async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
