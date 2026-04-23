import * as XLSX from 'xlsx';

const STATUS_COLORS = {
  Applied: '4A90D9',
  'Phone Screen': 'D4A843',
  Interview: 'D4783C',
  'Final Round': '8B6AAE',
  Offer: '4A9E6F',
  Rejected: '9E4A4A',
  Pass: '8A8A8A',
};

export function exportCSV(jobs) {
  const headers = ['Fit Score', 'Company', 'Role', 'Status', 'Work Style', 'Location', 'Salary Range', 'Referral', 'Notes', 'Date Added'];
  const rows = jobs.map((j) => [
    j.analysis?.preferenceFit?.score || '',
    j.company,
    j.role,
    j.status,
    j.workStyle || '',
    j.location || '',
    j.salaryRange || '',
    j.referral ? 'Yes' : 'No',
    j.notes || '',
    new Date(j.createdAt).toLocaleDateString(),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  download(csv, 'job-tracker.csv', 'text/csv');
}

export function exportXLSX(jobs) {
  const data = jobs.map((j) => ({
    'Fit Score': j.analysis?.preferenceFit?.score || '',
    Company: j.company,
    Role: j.role,
    Status: j.status,
    'Work Style': j.workStyle || '',
    Location: j.location || '',
    'Salary Range': j.salaryRange || '',
    Referral: j.referral ? 'Yes' : 'No',
    Notes: j.notes || '',
    'Date Added': new Date(j.createdAt).toLocaleDateString(),
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 12 },
    { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 30 }, { wch: 14 },
  ];

  // Color-code status cells (column D, starting at row 2)
  for (let i = 0; i < jobs.length; i++) {
    const cellRef = `D${i + 2}`;
    const cell = ws[cellRef];
    if (cell) {
      const color = STATUS_COLORS[jobs[i].status];
      if (color) {
        cell.s = {
          fill: { fgColor: { rgb: color } },
          font: { color: { rgb: 'FFFFFF' }, bold: true },
        };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Job Tracker');
  XLSX.writeFile(wb, 'job-tracker.xlsx');
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
