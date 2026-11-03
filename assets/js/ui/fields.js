const humanize = key => String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, char => char.toUpperCase());

export function inferType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value && typeof value === 'object') return Array.isArray(value) ? 'list' : 'object';
  return 'text';
}

export function fieldsFor(bootstrap, resource, records = [], placement = 'table') {
  const configured = bootstrap?.fields?.[resource] || [];
  const byKey = new Map(configured.map(field => [field.key, field]));
  const keys = new Set();
  records.forEach(record => Object.keys(record || {}).forEach(key => keys.add(key)));
  configured.forEach(field => keys.add(field.key));
  const fields = [...keys].map(key => {
    const field = byKey.get(key) || { key, label: humanize(key), type: inferType(records.find(row => row?.[key] != null)?.[key]), readOnly: true };
    return field;
  });
  return fields
    .filter(field => {
      if (placement === 'form') return (field.visibleIn || []).includes('form') && !field.readOnly;
      if (field.visibleIn?.length) return field.visibleIn.includes(placement);
      return true;
    })
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export function formatValue(value, field = {}) {
  if (value == null || value === '') return '—';
  if (field.format === 'sharing') return `${({ 1: 'Single', 2: 'Double', 3: 'Triple' })[Number(value)] || `${value}-person`} sharing`;
  if (field.type === 'currency' && typeof value === 'number') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(item => formatValue(item)).join(', ') || '—';
  if (typeof value === 'object') return Object.entries(value).map(([key, nested]) => `${humanize(key)}: ${formatValue(nested)}`).join(' · ');
  return String(value);
}

export function renderDynamicTable(records, fields, { rowId = 'id', action = '' } = {}) {
  if (!records?.length) return `<div class="empty">No records found.</div>`;
  const columns = fields.length ? fields : fieldsFor(null, '', records);
  return `<div class="table-wrap"><table class="table dynamic-table"><thead><tr>${columns.map(field => `<th>${escapeHtml(field.label)}</th>`).join('')}${action ? '<th>ACTIONS</th>' : ''}</tr></thead><tbody>${records.map(record => `<tr data-record-id="${escapeHtml(record[rowId])}">${columns.map(field => `<td>${renderCell(record[field.key], field)}</td>`).join('')}${action ? `<td>${action(record)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function renderCell(value, field) {
  const formatted = escapeHtml(formatValue(value, field));
  if (field.key === 'id' || /(^id$|Id$)/.test(field.key)) return `<code>${formatted}</code>`;
  if (field.type === 'boolean') return `<span class="status ${value ? '' : 'pending'}">${formatted}</span>`;
  return formatted;
}

export function renderProfile(profile, bootstrap, resource) {
  const fields = fieldsFor(bootstrap, resource, [profile], 'profile');
  const configured = new Set((bootstrap?.fields?.[resource] || []).map(field => field.key));
  const unknownFields = Object.keys(profile).filter(key => !configured.has(key) && !fields.some(field => field.key === key));
  return `<div class="profile-grid">${fields.map(field => `<div class="profile-field"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(formatValue(profile[field.key], field))}</strong></div>`).join('')}${unknownFields.map(key => `<div class="profile-field"><span>${escapeHtml(humanize(key))}</span><strong>${escapeHtml(formatValue(profile[key]))}</strong></div>`).join('')}</div>`;
}

export function renderFormFields(bootstrap, resource, sample = {}) {
  const fields = fieldsFor(bootstrap, resource, [sample], 'form');
  return fields.map(field => {
    const value = sample[field.key] ?? field.default ?? '';
    const required = field.required ? 'required' : '';
    const min = field.min != null ? `min="${field.min}"` : '';
    const max = field.max != null ? `max="${field.max}"` : '';
    const full = field.type === 'textarea' ? 'full' : '';
    let input;
    if (field.type === 'enum') {
      input = `<select name="${escapeAttr(field.key)}" ${required}>${(field.options || []).map((option, index) => { const optionValue = field.optionValues?.[index] ?? option; return `<option value="${escapeAttr(optionValue)}" ${String(optionValue) === String(value) ? 'selected' : ''}>${escapeHtml(option)}</option>`; }).join('')}</select>`;
    } else if (field.type === 'boolean') {
      input = `<select name="${escapeAttr(field.key)}"><option value="true" ${value ? 'selected' : ''}>Yes</option><option value="false" ${!value ? 'selected' : ''}>No</option></select>`;
    } else if (field.type === 'textarea') {
      input = `<textarea name="${escapeAttr(field.key)}" ${required}>${escapeHtml(value)}</textarea>`;
    } else {
      const type = ({ number: 'number', currency: 'number', date: 'date', email: 'email', phone: 'tel' })[field.type] || 'text';
      input = `<input name="${escapeAttr(field.key)}" type="${type}" value="${escapeAttr(value)}" ${required} ${min} ${max}>`;
    }
    return `<div class="field ${full}"><label>${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>${input}</div>`;
  }).join('');
}

export function formObject(form, bootstrap, resource) {
  const fields = fieldsFor(bootstrap, resource, [], 'form');
  const values = new FormData(form);
  return Object.fromEntries(fields.filter(field => values.has(field.key)).map(field => {
    const value = values.get(field.key);
    if (field.type === 'number' || field.type === 'currency' || field.valueType === 'number' || field.valueType === 'integer') return [field.key, value === '' ? null : Number(value)];
    if (field.type === 'boolean') return [field.key, value === 'true'];
    return [field.key, value];
  }));
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value = '') { return escapeHtml(value); }
