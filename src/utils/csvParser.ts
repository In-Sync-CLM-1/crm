export interface ParsedCSVData {
  headers: string[];
  rows: Record<string, any>[];
  identifierColumn: string; // 'phone' or 'email'
  errors: string[];
}

function cleanupCSV(csvText: string): string {
  // Remove BOM if present
  let cleaned = csvText.replace(/^\uFEFF/, '');
  
  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Remove trailing whitespace from lines
  cleaned = cleaned.split('\n')
    .map(line => line.trimEnd())
    .join('\n');
  
  return cleaned.trim();
}

function autoFixCSVLine(line: string, expectedColumnCount: number, headers: string[]): string {
  const values = parseCSVLine(line);
  
  // If column count matches, return as is
  if (values.length === expectedColumnCount) {
    return line;
  }
  
  // If we have more columns than expected, intelligently merge them
  if (values.length > expectedColumnCount) {
    const extraColumns = values.length - expectedColumnCount;
    
    // Smart strategy: Assume first 3 columns (name, email, phone) are correct
    // and company field (index 3) contains the unquoted commas
    // Merge columns from index 3 to (length - remaining fields)
    
    // Find how many columns should come after the company field
    const companyIndex = 3; // 0=name, 1=email, 2=phone, 3=company
    const columnsAfterCompany = expectedColumnCount - companyIndex - 1; // status, source, etc.
    
    if (companyIndex < expectedColumnCount && values.length > expectedColumnCount) {
      const fixed: string[] = [];
      
      // Keep first 3 columns as-is (name, email, phone)
      for (let i = 0; i < companyIndex && i < values.length; i++) {
        fixed.push(values[i]);
      }
      
      // Merge company field (all extra columns + the company column itself)
      const companyEndIndex = values.length - columnsAfterCompany;
      const companyParts = values.slice(companyIndex, companyEndIndex);
      fixed.push(`"${companyParts.join(', ')}"`);
      
      // Add remaining columns (status, source, etc.)
      for (let i = companyEndIndex; i < values.length; i++) {
        fixed.push(values[i]);
      }
      
      return fixed.join(',');
    }
  }
  
  // If we have fewer columns, return as is (user needs to add missing data)
  return line;
}

export function parseCSV(
  csvText: string,
  requireIdentifier: 'phone' | 'email'
): ParsedCSVData {
  const errors: string[] = [];
  
  // Clean up the CSV text
  const cleanedText = cleanupCSV(csvText);
  const lines = cleanedText.split('\n');
  
  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      identifierColumn: '',
      errors: ['CSV file is empty']
    };
  }

  // Parse headers
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  // Find identifier column
  const identifierColumn = headers.find(h => 
    h.toLowerCase() === requireIdentifier ||
    h.toLowerCase() === requireIdentifier + 's' ||
    (requireIdentifier === 'phone' && (h.toLowerCase() === 'phone_number' || h.toLowerCase() === 'mobile'))
  );

  if (!identifierColumn) {
    errors.push(`Required identifier column '${requireIdentifier}' not found in CSV headers`);
    return { headers, rows: [], identifierColumn: '', errors };
  }

  // Parse rows
  const rows: Record<string, any>[] = [];
  const seenIdentifiers = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    let values = parseCSVLine(line);
    
    // Attempt to auto-fix if column count doesn't match
    if (values.length !== headers.length) {
      const fixedLine = autoFixCSVLine(line, headers.length, headers);
      const fixedValues = parseCSVLine(fixedLine);
      
      if (fixedValues.length === headers.length) {
        // Auto-fix successful
        values = fixedValues;
        line = fixedLine;
      } else {
        // Auto-fix failed, report error
        const preview = line.length > 100 ? line.substring(0, 100) + '...' : line;
        const suggestion = values.length > headers.length 
          ? 'Likely cause: Unquoted comma in a field value. Try wrapping fields containing commas in double quotes (e.g., "Company Name, Role").'
          : 'Likely cause: Missing values or incorrect delimiter. Ensure all columns have values or are left empty (e.g., ,,).';
        
        errors.push(
          `Row ${i + 1}: Column count mismatch (expected ${headers.length}, got ${values.length})\n` +
          `  Preview: ${preview}\n` +
          `  Suggestion: ${suggestion}`
        );
        continue;
      }
    }

    const row: Record<string, any> = {};
    headers.forEach((header, idx) => {
      // Trim whitespace from all values
      row[header] = values[idx] ? values[idx].trim() : values[idx];
    });

    // Validate identifier
    const identifier = row[identifierColumn];
    if (!identifier || identifier.trim() === '') {
      errors.push(`Row ${i}: Missing ${requireIdentifier}`);
      continue;
    }

    if (!validateCSVRow(row, requireIdentifier, identifierColumn)) {
      errors.push(`Row ${i}: Invalid ${requireIdentifier} format: ${identifier}`);
      continue;
    }

    // Check for duplicates
    if (seenIdentifiers.has(identifier)) {
      errors.push(`Row ${i}: Duplicate ${requireIdentifier}: ${identifier}`);
    }
    seenIdentifiers.add(identifier);

    rows.push(row);
  }

  return {
    headers,
    rows,
    identifierColumn,
    errors
  };
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values.map(v => v.replace(/^"|"$/g, ''));
}

export function validateCSVRow(
  row: Record<string, any>,
  identifierType: 'phone' | 'email',
  identifierColumn: string
): boolean {
  const value = row[identifierColumn];
  
  if (identifierType === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  } else {
    // Phone validation - accept various formats
    const phoneRegex = /^\+?\(?[0-9]{1,4}\)?[-\s.]?\(?[0-9]{1,4}\)?[-\s.]?[0-9]{1,9}$/;
    return phoneRegex.test(value.replace(/\s/g, ''));
  }
}

export function generateCSVTemplate(
  identifierType: 'phone' | 'email',
  variableColumns: string[]
): string {
  const headers = [identifierType, ...variableColumns];
  const sampleRows = [
    identifierType === 'phone' 
      ? ['+11234567890', ...variableColumns.map(() => 'sample_value')]
      : ['user@example.com', ...variableColumns.map(() => 'sample_value')],
    identifierType === 'phone'
      ? ['+19876543210', ...variableColumns.map(() => 'sample_value')]
      : ['contact@example.com', ...variableColumns.map(() => 'sample_value')]
  ];

  const csvLines = [
    headers.join(','),
    ...sampleRows.map(row => row.join(','))
  ];

  return csvLines.join('\n');
}
