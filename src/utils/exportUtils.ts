/**
 * Utility functions for exporting data to various formats
 */

export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any, row?: any) => string;
}

/**
 * Export data to CSV format
 */
export function exportToCSV(
  data: any[],
  columns: ExportColumn[],
  filename: string
) {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Create CSV header
  const headers = columns.map(col => col.label).join(',');
  
  // Create CSV rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key];
      
      // Apply custom formatting if provided
      if (col.format) {
        value = col.format(value, row);
      }
      
      // Handle null/undefined
      if (value === null || value === undefined) {
        return '';
      }
      
      // Convert to string and escape
      const stringValue = String(value);
      
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    }).join(',');
  }).join('\n');
  
  // Combine header and rows
  const csv = `${headers}\n${rows}`;
  
  // Create blob and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Format date for export
 */
export function formatDateForExport(date: string | Date | null): string {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format number for export
 */
export function formatNumberForExport(value: number | null, decimals: number = 2): string {
  if (value === null || value === undefined) return '';
  return value.toFixed(decimals);
}

/**
 * Format currency for export
 */
export function formatCurrencyForExport(value: number | null): string {
  if (value === null || value === undefined) return '';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
