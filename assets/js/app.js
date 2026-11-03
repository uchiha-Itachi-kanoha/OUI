import dashboard from './pages/dashboard.js';
import tenants from './pages/tenants.js';
import inventory from './pages/inventory.js';
import admin from './pages/admin.js';
import { api } from './api/client.js';
import { fieldsFor, renderFormFields, formObject, renderProfile, escapeHtml } from './ui/fields.js';

const renderers = { dashboard, tenants, inventory, admin };
const pageMount = document.querySelector('#pageMount');
const content = document.querySelector('.content');
const pageStylesheet = document.createElement('link');
pageStylesheet.rel = 'stylesheet';
document.head.append(pageStylesheet);
let page = 'dashboard';
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
let month = localToday().slice(0, 7);
let state = { bootstrap: { schemaVersion: 1, fields: {} }, settings: {}, rooms: [], people: [], rent: [], revenue: [], leaving: [], month };
let toastTimer;

const fallbackFields = {
  room: [
    { key: 'name', label: 'Room name / number', type: 'text', required: true, visibleIn: ['form', 'table', 'profile'], order: 1 },
    { key: 'floor', label: 'Floor', type: 'number', visibleIn: ['form', 'table', 'profile'], order: 2 },
    { key: 'sharingCapacity', label: 'Sharing', type: 'enum', valueType: 'integer', format: 'sharing', options: ['Single sharing', 'Double sharing', 'Triple sharing'], optionValues: [1, 2, 3], required: true, visibleIn: ['form', 'table', 'profile'], order: 3 },
    { key: 'defaultMonthlyRent', label: 'Rent per person / month', type: 'currency', required: true, min: 0, visibleIn: ['form', 'table', 'profile'], order: 4 },
    { key: 'ac', label: 'Air conditioning', type: 'boolean', visibleIn: ['form', 'table', 'profile'] },
    { key: 'attachedBathroom', label: 'Attached bathroom', type: 'boolean', visibleIn: ['form', 'table', 'profile'] },
    { key: 'maintenance', label: 'Under maintenance', type: 'boolean', visibleIn: ['form', 'table', 'profile'] },
    { key: 'notes', label: 'Notes', type: 'textarea', visibleIn: ['form', 'profile'] }
  ],
  person: [
    { key: 'name', label: 'Full name', type: 'text', required: true, visibleIn: ['form', 'table', 'profile'], order: 1 },
    { key: 'phone', label: 'Phone', type: 'phone', required: true, visibleIn: ['form', 'table', 'profile'], order: 2 },
    { key: 'email', label: 'Email', type: 'email', visibleIn: ['form', 'table', 'profile'] },
    { key: 'notes', label: 'Notes', type: 'textarea', visibleIn: ['form', 'profile'] },
    { key: 'id', label: 'Person ID', type: 'number', readOnly: true, visibleIn: ['table', 'profile'] },
    { key: 'roomName', label: 'Current room', type: 'text', readOnly: true, visibleIn: ['table', 'profile'] }
  ]
};

function bootstrapWithFallback(remote) {
  const fields = { ...fallbackFields, ...(remote?.fields || {}) };
  for (const [resource, fallbacks] of Object.entries(fallbackFields)) {
    const known = new Set((remote?.fields?.[resource] || []).map(field => field.key));
    fields[resource] = [...(remote?.fields?.[resource] || []), ...fallbacks.filter(field => !known.has(field.key))];
  }
  return { ...remote, fields };
}

function currentMonth() { return month; }

async function loadData({ initial = false } = {}) {
  if (initial) pageMount.innerHTML = '<div class="api-state"><span class="loader"></span><strong>Connecting to the PG API…</strong><small>Loading rooms, residents, and this month’s rent.</small></div>';
  const [remoteBootstrap, roomRows, peopleRows, rentRows, revenueRows, leavingRows] = await Promise.all([
    api.bootstrap(), api.rooms.list(), api.people.list({ stay: 'current' }),
    api.rent.list({ month: currentMonth() }), api.rent.revenue(currentMonth()), api.people.leaving()
  ]);
  let settings = remoteBootstrap?.property;
  if (!settings) settings = await api.settings();
  state = {
    bootstrap: bootstrapWithFallback(remoteBootstrap),
    month,
    settings: settings || {},
    rooms: Array.isArray(roomRows) ? roomRows : [],
    people: Array.isArray(peopleRows) ? peopleRows : [],
    rent: Array.isArray(rentRows) ? rentRows : [],
    revenue: Array.isArray(revenueRows) ? revenueRows : [],
    leaving: Array.isArray(leavingRows) ? leavingRows : []
  };
  renderPage();
}

function renderPage() {
  pageMount.innerHTML = renderers[page](state);
  pageMount.querySelector('.view')?.classList.add('active');
  content.className = `content page-${page}`;
  pageStylesheet.href = `assets/css/${page}.css`;
  document.querySelectorAll('.nav [data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  const monthInput = pageMount.querySelector('.month-picker');
  if (monthInput) monthInput.value = month;
  if (page === 'tenants') renderLeaving();
}

function renderLeaving() {
  const mount = document.querySelector('#leavingList');
  if (!mount) return;
  if (!state.leaving.length) { mount.innerHTML = '<div class="empty">No planned move-outs in the next month.</div>'; return; }
  mount.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>RESIDENT</th><th>ROOM</th><th>SHARING</th><th>PLANNED LEAVE</th></tr></thead><tbody>${state.leaving.map(item => `<tr><td><button class="link-button" data-profile-kind="person" data-profile-id="${escapeHtml(item.personId)}">${escapeHtml(item.personName)}</button></td><td>${escapeHtml(item.roomName)}</td><td>${escapeHtml(item.sharingCapacity)}</td><td>${escapeHtml(item.plannedLeaveDate)}</td></tr>`).join('')}</tbody></table></div>`;
}

function navigate(nextPage) {
  if (!renderers[nextPage]) return;
  page = nextPage;
  renderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(message, error = false) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 3800);
}

function showError(error) {
  toast(error.message || 'The API request failed.', true);
}

async function refresh({ stay = true } = {}) {
  try {
    const [roomRows, peopleRows, rentRows, revenueRows, leavingRows] = await Promise.all([
      api.rooms.list(), api.people.list({ stay: 'current' }), api.rent.list({ month: currentMonth() }),
      api.rent.revenue(currentMonth()), api.people.leaving()
    ]);
    state.rooms = roomRows || [];
    state.people = peopleRows || [];
    state.rent = rentRows || [];
    state.revenue = revenueRows || [];
    state.leaving = leavingRows || [];
    state.month = month;
    renderPage();
    if (!stay) window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) { showError(error); }
}

function today() { return localToday(); }

function openModal(kind, { record = null, mode = 'create', extra = '' } = {}) {
  const isPayment = kind === 'payment';
  const resource = kind === 'person' ? 'person' : 'room';
  const fields = document.querySelector('#formFields');
  const title = document.querySelector('#modalTitle');
  const subtitle = document.querySelector('#modalSubtitle');
  const submit = document.querySelector('#submitModal');
  const form = document.querySelector('#entryForm');
  form.dataset.kind = kind;
  form.dataset.mode = mode;
  form.dataset.recordId = record?.id ?? '';
  if (isPayment) {
    title.textContent = `Record rent payment · Person #${record.id}`;
    subtitle.textContent = `Balance due: ₹${Number(record.balance || 0).toLocaleString('en-IN')}. Partial payments are supported.`;
    fields.innerHTML = `<div class="field"><label>Billing month</label><input name="month" type="month" required value="${escapeHtml(month)}"></div><div class="field"><label>Amount (INR)</label><input name="amount" type="number" required min="0.01" max="${Number(record.balance || 0)}" step="0.01" value="${Number(record.balance || 0)}"></div><div class="field"><label>Paid on</label><input name="paidOn" type="date" required value="${today()}"></div><div class="field"><label>Payment note / method</label><input name="note" maxlength="200" placeholder="UPI, cash, bank transfer"></div><div class="field full"><label>Optional screenshot (JPEG, PNG, WebP, PDF; max 5 MB)</label><input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></div>`;
    submit.textContent = 'Record payment';
  } else if (kind === 'move' || kind === 'date-action') {
    title.textContent = kind === 'move' ? 'Update room assignment' : 'Resident stay update';
    subtitle.textContent = kind === 'move' ? 'Select the destination room and stay details.' : 'Enter the date for this stay action.';
    fields.innerHTML = extra;
    submit.textContent = 'Continue';
    submit.disabled = false;
  } else {
    const meta = state.bootstrap;
    title.textContent = `${mode === 'edit' ? 'Edit' : 'Add'} ${resource === 'person' ? 'resident' : 'room'}`;
    subtitle.textContent = mode === 'edit' ? `Backend record ID: ${record?.id}` : `The backend assigns the ${resource} ID.`;
    fields.innerHTML = renderFormFields(meta, resource, record || {});
    if (kind === 'person' && mode === 'create') {
      const freeRooms = state.rooms.filter(room => !room.maintenance && room.status !== 'maintenance' && Number(room.freeSpots) > 0);
      fields.insertAdjacentHTML('beforeend', `<div class="field full"><label>Assign room / bed</label><select name="assignmentRoomId" required>${freeRooms.map(room => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)} · ${room.floor == null ? 'Floor —' : `Floor ${room.floor}`} · ${({ 1: 'Single', 2: 'Double', 3: 'Triple' })[room.sharingCapacity] || room.sharingCapacity}-sharing · ${room.freeSpots} free · ₹${Number(room.defaultMonthlyRent).toLocaleString('en-IN')} per person</option>`).join('')}</select></div><div class="field"><label>Move-in date</label><input name="moveInDate" type="date" required value="${today()}"></div><div class="field"><label>Spots / beds</label><input name="spots" type="number" min="1" value="1" required></div><div class="field full"><label>Agreed monthly rent (INR, optional)</label><input name="agreedRent" type="number" min="0" step="0.01" placeholder="Defaults to room rent × spots"></div>`);
      if (!freeRooms.length) {
        fields.insertAdjacentHTML('beforeend', '<p class="form-empty">There are no rooms with free spots. Create a room or choose a different room status first.</p>');
      } else {
        const roomSelect = fields.querySelector('[name="assignmentRoomId"]');
        const spotsInput = fields.querySelector('[name="spots"]');
        const updateSpotLimit = () => {
          const selected = state.rooms.find(room => String(room.id) === roomSelect.value);
          spotsInput.max = selected?.freeSpots || 1;
          if (Number(spotsInput.value) > Number(spotsInput.max)) spotsInput.value = spotsInput.max;
        };
        roomSelect.addEventListener('change', updateSpotLimit);
        updateSpotLimit();
      }
      submit.disabled = !freeRooms.length;
    } else submit.disabled = false;
    if (extra) fields.insertAdjacentHTML('beforeend', extra);
    submit.textContent = mode === 'edit' ? 'Save changes' : resource === 'person' ? 'Create & move in' : 'Create room';
  }
  document.querySelector('#modalBackdrop').classList.add('open');
  fields.querySelector('input:not([type="file"]),select')?.focus();
}

function closeModal() {
  document.querySelector('#modalBackdrop').classList.remove('open');
  document.querySelector('#entryForm').reset();
}

function uploadButton(kind, id, label) {
  return `<label class="btn compact file-button">${label}<input type="file" hidden data-upload="${kind}" data-record-id="${escapeHtml(id)}" accept="image/jpeg,image/png,image/webp,application/pdf"></label>`;
}

async function showProfile(kind, id) {
  try {
    const profile = kind === 'room' ? await api.rooms.get(id) : await api.people.get(id);
    const backdrop = document.querySelector('#detailBackdrop');
    const body = document.querySelector('#detailBody');
    const title = kind === 'room' ? `Room · ${profile.name || profile.id}` : profile.name || `Person #${profile.id}`;
    document.querySelector('#detailTitle').textContent = title;
    body.innerHTML = renderProfile(profile, state.bootstrap, kind) + (kind === 'person' ? renderPersonActions(profile) : '');
    document.querySelector('#detailEdit').dataset.editKind = kind;
    document.querySelector('#detailEdit').dataset.editId = profile.id;
    document.querySelector('#detailEdit').dataset.editRecord = JSON.stringify(profile);
    document.querySelector('#detailBackdrop').dataset.profileKind = kind;
    document.querySelector('#detailBackdrop').dataset.profileId = profile.id;
    backdrop.classList.add('open');
  } catch (error) { showError(error); }
}

function renderPersonActions(profile) {
  return `<div class="profile-actions"><button class="btn" data-profile-action="move-in" data-person-id="${escapeHtml(profile.id)}">Move in</button><button class="btn" data-profile-action="shift" data-person-id="${escapeHtml(profile.id)}">Shift room</button><button class="btn" data-profile-action="notice" data-person-id="${escapeHtml(profile.id)}">Plan move-out</button><button class="btn" data-profile-action="move-out" data-person-id="${escapeHtml(profile.id)}">Move out</button>${profile.identity ? '<button class="btn" data-download-identity="'+escapeHtml(profile.id)+'">Download ID file</button>' : ''}${uploadButton('identity', profile.id, 'Upload / replace ID file')}</div>`;
}

function payloadFromRecord(resource, record) {
  const formFields = fieldsFor(state.bootstrap, resource, [record], 'form');
  return Object.fromEntries(formFields.filter(field => Object.hasOwn(record, field.key)).map(field => [field.key, record[field.key]]));
}

async function submitEntity(form, values) {
  const type = form.dataset.kind;
  const mode = form.dataset.mode;
  const id = form.dataset.recordId;
  if (type === 'payment') {
    const body = { month: values.month, amount: Number(values.amount), paidOn: values.paidOn, note: values.note };
    const file = form.querySelector('[name="screenshot"]').files[0];
    const payment = await api.people.pay(id, body);
    if (file && payment?.id) await api.people.uploadPaymentScreenshot(id, payment.id, file);
    closeModal(); await refresh(); toast(file ? 'Payment and screenshot recorded.' : 'Rent payment recorded.'); return;
  }
  const resource = type;
  const body = formObject(form, state.bootstrap, resource);
  if (resource === 'room') {
    if (mode === 'edit') await api.rooms.update(id, body);
    else await api.rooms.create(body);
    closeModal(); await refresh(); toast(mode === 'edit' ? 'Room updated.' : 'Room created.'); return;
  }
  if (mode === 'edit') {
    await api.people.update(id, body);
    closeModal(); await refresh(); toast('Resident profile updated.'); return;
  }
  const assignmentRoomId = values.assignmentRoomId;
  const person = await api.people.create(body);
  try {
    await api.people.moveIn(person.id, {
      roomId: Number(assignmentRoomId), moveInDate: values.moveInDate,
      spots: Number(values.spots || 1),
      ...(values.agreedRent ? { agreedRent: Number(values.agreedRent) } : {})
    });
    closeModal(); await refresh(); toast('Resident created and moved into the selected room.');
  } catch (error) {
    closeModal(); await refresh(); toast(`Resident #${person.id} was created, but room assignment failed: ${error.message}`, true);
  }
}

async function toggleMaintenance(id, current) {
  try {
    const room = await api.rooms.get(id);
    const body = payloadFromRecord('room', room);
    body.maintenance = !current;
    await api.rooms.update(id, body);
    await refresh();
    toast(`Room ${room.name} ${body.maintenance ? 'marked for maintenance' : 'restored'}.`);
  } catch (error) { showError(error); }
}

function closeDetail() { document.querySelector('#detailBackdrop').classList.remove('open'); }

function downloadFile({ blob, filename }, fallback) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || fallback;
  anchor.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('click', async event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) navigate(pageButton.dataset.page);
  const modalButton = event.target.closest('[data-modal]');
  if (modalButton) openModal(modalButton.dataset.modal);
  if (event.target.closest('#cancelModal') || event.target.id === 'modalBackdrop') closeModal();
  if (event.target.closest('#detailClose') || event.target.id === 'detailBackdrop') closeDetail();
  const profileButton = event.target.closest('[data-profile-kind]');
  if (profileButton) await showProfile(profileButton.dataset.profileKind, profileButton.dataset.profileId);
  const editButton = event.target.closest('[data-edit-kind]');
  if (editButton) {
    closeDetail();
    openModal(editButton.dataset.editKind, { mode: 'edit', record: JSON.parse(editButton.dataset.editRecord) });
  }
  const paymentButton = event.target.closest('[data-payment-person]');
  if (paymentButton) openModal('payment', { record: { id: paymentButton.dataset.paymentPerson, balance: paymentButton.dataset.paymentBalance } });
  const maintenanceButton = event.target.closest('[data-toggle-maintenance]');
  if (maintenanceButton) await toggleMaintenance(maintenanceButton.dataset.toggleMaintenance, maintenanceButton.dataset.maintenance === 'true');
  const actionButton = event.target.closest('[data-profile-action]');
  if (actionButton) {
    const id = actionButton.dataset.personId;
    const action = actionButton.dataset.profileAction;
    try {
      if (action === 'move-in' || action === 'shift') {
        const choices = state.rooms.filter(room => Number(room.freeSpots) > 0 && !room.maintenance && room.status !== 'maintenance');
        const select = `<div class="field full"><label>Destination room</label><select name="roomId" required>${choices.map(room => `<option value="${room.id}">${escapeHtml(room.name)} · ${room.freeSpots} free · ₹${Number(room.defaultMonthlyRent).toLocaleString('en-IN')}</option>`).join('')}</select></div><div class="field"><label>Move-in date</label><input name="moveInDate" type="date" value="${today()}" required></div><div class="field"><label>Spots</label><input name="spots" type="number" min="1" value="1" required></div><div class="field full"><label>Agreed rent (optional)</label><input name="agreedRent" type="number" min="0" step="0.01"></div>`;
        if (!choices.length) { toast('No room has free spots.', true); return; }
        closeDetail(); openModal('move', { extra: select });
        document.querySelector('#entryForm').dataset.kind = action;
        document.querySelector('#entryForm').dataset.recordId = id;
        const roomSelect = document.querySelector('#formFields [name="roomId"]');
        const spotsInput = document.querySelector('#formFields [name="spots"]');
        const updateSpotLimit = () => {
          const selected = state.rooms.find(room => String(room.id) === roomSelect.value);
          spotsInput.max = selected?.freeSpots || 1;
          if (Number(spotsInput.value) > Number(spotsInput.max)) spotsInput.value = spotsInput.max;
        };
        roomSelect.addEventListener('change', updateSpotLimit);
        updateSpotLimit();
      } else {
        const dateLabel = action === 'notice' ? 'Planned leave date' : 'Leave date';
        closeDetail(); openModal('date-action', { extra: `<div class="field full"><label>${dateLabel}</label><input name="actionDate" type="date" required></div>` });
        document.querySelector('#entryForm').dataset.kind = action;
        document.querySelector('#entryForm').dataset.recordId = id;
        document.querySelector('#modalTitle').textContent = action === 'notice' ? 'Plan move-out' : 'Move resident out';
        document.querySelector('#submitModal').textContent = action === 'notice' ? 'Save leave date' : 'Confirm move-out';
      }
    } catch (error) { showError(error); }
  }
  if (event.target.closest('[data-save-settings]')) {
    try {
      const form = document.querySelector('.page-admin .form-grid');
      const value = Object.fromEntries([...form.querySelectorAll('input')].map(input => [input.name, input.type === 'number' ? Number(input.value) : input.value.trim()]));
      await api.updateSettings({ ...value, currency: value.currency || state.settings.currency || 'INR' });
      await loadData(); toast('Property settings saved.');
    } catch (error) { showError(error); }
  }
  if (event.target.closest('[data-refresh]')) await refresh();
  if (event.target.closest('[data-export-residents]')) exportResidents();
  if (event.target.closest('[data-download-identity]')) {
    try { downloadFile(await api.people.downloadIdentity(event.target.closest('[data-download-identity]').dataset.downloadIdentity), 'identity-file'); }
    catch (error) { showError(error); }
  }
});

document.querySelector('#entryForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const values = Object.fromEntries(new FormData(form));
    if (['person', 'room', 'payment'].includes(form.dataset.kind)) await submitEntity(form, values);
    else if (form.dataset.kind === 'move-in' || form.dataset.kind === 'shift') {
      const id = form.dataset.recordId;
      const payload = { roomId: Number(values.roomId), moveInDate: values.moveInDate, spots: Number(values.spots || 1), ...(values.agreedRent ? { agreedRent: Number(values.agreedRent) } : {}) };
      if (form.dataset.kind === 'shift') await api.people.shift(id, payload); else await api.people.moveIn(id, payload);
      closeModal(); await refresh(); toast('Room assignment updated.');
    } else if (form.dataset.kind === 'notice') {
      await api.people.notice(form.dataset.recordId, { plannedLeaveDate: values.actionDate });
      closeModal(); await refresh(); toast('Planned leave date saved.');
    } else if (form.dataset.kind === 'move-out') {
      await api.people.moveOut(form.dataset.recordId, { leaveDate: values.actionDate });
      closeModal(); await refresh(); toast('Resident moved out.');
    }
  } catch (error) { showError(error); }
});

document.addEventListener('change', async event => {
  if (event.target.matches('.month-picker')) {
    month = event.target.value;
    state.month = month;
    try {
      const [rentRows, revenueRows] = await Promise.all([api.rent.list({ month }), api.rent.revenue(month)]);
      state.rent = rentRows || []; state.revenue = revenueRows || []; renderPage();
    } catch (error) { showError(error); }
  }
  const upload = event.target.closest('[data-upload]');
  if (upload?.files?.[0]) {
    try { await api.people.uploadIdentity(upload.dataset.recordId, upload.files[0]); await showProfile('person', upload.dataset.recordId); toast('Identity file uploaded.'); }
    catch (error) { showError(error); }
  }
  if (event.target.matches('[data-toggle-maintenance]')) await toggleMaintenance(event.target.dataset.toggleMaintenance, event.target.dataset.maintenance === 'true');
});

document.addEventListener('input', event => {
  if (event.target.matches('.table-search')) {
    const term = event.target.value.toLowerCase();
    const status = document.querySelector('.table-filter')?.value || 'all';
    document.querySelectorAll('.dynamic-table tbody tr').forEach(row => {
      row.hidden = !row.textContent.toLowerCase().includes(term) || (status !== 'all' && !row.textContent.toLowerCase().includes(status));
    });
  }
  if (event.target.matches('.inventory-search')) filterRooms();
});

document.addEventListener('change', event => {
  if (event.target.matches('.table-filter')) document.querySelector('.table-search')?.dispatchEvent(new Event('input', { bubbles: true }));
  if (event.target.matches('.inventory-filter, .floor-filter')) filterRooms();
});

function filterRooms() {
  const term = document.querySelector('.inventory-search')?.value.toLowerCase() || '';
  const status = document.querySelector('.inventory-filter')?.value || 'all';
  const floor = document.querySelector('.floor-filter')?.value || 'all';
  document.querySelectorAll('.dynamic-table tbody tr').forEach((row, index) => {
    const room = state.rooms.find(item => String(item.id) === row.dataset.recordId) || state.rooms[index];
    const occupied = Number(room?.occupiedCount || 0), capacity = Number(room?.sharingCapacity || 0);
    const computedStatus = room?.maintenance ? 'maintenance' : occupied === 0 ? 'empty' : occupied >= capacity ? 'occupied' : 'semi-empty';
    row.hidden = !row.textContent.toLowerCase().includes(term) || (status !== 'all' && computedStatus !== status) || (floor !== 'all' && String(room?.floor ?? 0) !== floor);
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeModal(); closeDetail(); }
  if (event.key === 'Enter' && event.target.id === 'globalSearch' && event.target.value.trim()) {
    navigate('tenants');
    const search = event.target.value.toLowerCase();
    document.querySelectorAll('.dynamic-table tbody tr').forEach(row => row.hidden = !row.textContent.toLowerCase().includes(search));
  }
});

document.querySelector('#modalBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
document.querySelector('#detailBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeDetail(); });

function exportResidents() {
  const fields = fieldsFor(state.bootstrap, 'person', state.people, 'table');
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [fields.map(field => quote(field.key)).join(','), ...state.people.map(person => fields.map(field => quote(person[field.key])).join(','))];
  const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  const link = document.createElement('a'); link.href = url; link.download = 'pg-residents.csv'; link.click(); URL.revokeObjectURL(url);
}

loadData({ initial: true }).catch(error => {
  pageMount.innerHTML = `<div class="api-state api-error"><strong>Couldn’t load the PG workspace</strong><p>${escapeHtml(error.message)}</p><button class="btn primary" id="retryApi">Retry connection</button><small>API base URL: ${escapeHtml(window.APP_CONFIG?.apiBaseUrl || 'http://localhost:8080')}</small></div>`;
  pageMount.querySelector('#retryApi').addEventListener('click', () => loadData({ initial: true }).catch(loadFailure));
  function loadFailure(failure) { pageMount.innerHTML = `<div class="api-state api-error"><strong>Couldn’t load the PG workspace</strong><p>${escapeHtml(failure.message)}</p><button class="btn primary" id="retryApi">Retry connection</button></div>`; pageMount.querySelector('#retryApi').addEventListener('click', () => loadData({ initial: true }).catch(loadFailure)); }
});
