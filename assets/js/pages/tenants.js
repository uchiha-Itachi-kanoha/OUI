import { fieldsFor, renderDynamicTable, escapeHtml } from '../ui/fields.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));

export default function renderPeople({ people, rooms, rent, bootstrap, month: selectedMonth }) {
  const date = new Date();
  const month = selectedMonth || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const rentByPerson = new Map(rent.map(line => [String(line.personId), line]));
  const rows = people.map(person => {
    const ledger = rentByPerson.get(String(person.id)) || {};
    return { ...person, month: ledger.month, amountDue: ledger.amountDue, amountPaid: ledger.amountPaid, balance: ledger.balance, rentStatus: ledger.status };
  });
  const dueLines = rent.filter(line => Number(line.balance || 0) > 0);
  const dueAmount = dueLines.reduce((sum, line) => sum + Number(line.balance || 0), 0);
  const expected = rent.reduce((sum, line) => sum + Number(line.amountDue || 0), 0);
  const paid = rent.reduce((sum, line) => sum + Number(line.amountPaid || 0), 0);
  const fields = fieldsFor(bootstrap, 'person', rows, 'table');
  const table = renderDynamicTable(rows, fields, {
    action: person => `<button class="btn compact" data-profile-kind="person" data-profile-id="${escapeHtml(person.id)}">Profile</button>${Number(person.balance || 0) > 0 ? `<button class="btn compact" data-payment-person="${escapeHtml(person.id)}" data-payment-balance="${Number(person.balance)}">Record payment</button>` : '<span class="status">Paid</span>'}`
  });

  return `<section class="view" id="view-tenants"><div class="page-heading"><div class="heading-copy"><h1>Residents</h1><p>People, current room assignments, and the monthly rent ledger.</p></div><button class="btn primary" data-modal="person">＋ <span>Add resident</span></button></div>
    <div class="stats"><article class="stat violet"><div class="stat-label">Current residents</div><div class="stat-value">${people.length}</div><div class="stat-foot">Each profile has a backend person ID</div></article><article class="stat mint"><div class="stat-label">Rent collected</div><div class="stat-value">${money(paid)}</div><div class="stat-foot">Payments recorded this month</div></article><article class="stat amber"><div class="stat-label">Rent outstanding</div><div class="stat-value">${money(dueAmount)}</div><div class="stat-foot">${dueLines.length} rent lines with balance</div></article><article class="stat cyan"><div class="stat-label">Expected rent</div><div class="stat-value">${money(expected)}</div><div class="stat-foot">${rent.length} rent lines this month</div></article></div>
    <article class="card"><div class="toolbar"><label class="search"><span>⌕</span><input class="table-search" placeholder="Search residents and profile fields..."></label><select class="select table-filter"><option value="all">All rent statuses</option><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option></select><input class="month-picker" type="month" value="${month}" aria-label="Rent month"><button class="btn" data-export-residents>↓ <span>Export CSV</span></button></div>${table}</article>
    <article class="card leaving-card"><div class="card-head"><div><h2 class="card-title">Planned move-outs</h2><p class="subtle">Residents with a leave date in the next month.</p></div></div><div id="leavingList" class="leaving-list"></div></article>
  </section>`;
}
