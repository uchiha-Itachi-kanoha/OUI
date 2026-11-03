import { formatValue, escapeHtml } from '../ui/fields.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));

export default function renderDashboard({ rooms, people, rent, revenue, leaving, settings, month: selectedMonth }) {
  const beds = rooms.reduce((sum, room) => sum + Number(room.sharingCapacity || 0), 0);
  const occupied = rooms.reduce((sum, room) => sum + Number(room.occupiedCount || 0), 0);
  const free = rooms.filter(room => !room.maintenance && room.status !== 'maintenance').reduce((sum, room) => sum + Number(room.freeSpots || 0), 0);
  const now = new Date();
  const month = selectedMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthRevenue = revenue.find(line => line.month === month) || revenue[0] || {};
  const expected = monthRevenue.totalDue ?? rent.reduce((sum, line) => sum + Number(line.amountDue || 0), 0);
  const collected = monthRevenue.collected ?? rent.reduce((sum, line) => sum + Number(line.amountPaid || 0), 0);
  const outstanding = monthRevenue.outstanding ?? rent.reduce((sum, line) => sum + Number(line.balance || 0), 0);
  const floors = [...new Set(rooms.map(room => room.floor ?? 0))].sort((a, b) => a - b);
  const floorRows = floors.map(floor => {
    const set = rooms.filter(room => (room.floor ?? 0) === floor);
    const cap = set.reduce((sum, room) => sum + Number(room.sharingCapacity || 0), 0);
    const used = set.reduce((sum, room) => sum + Number(room.occupiedCount || 0), 0);
    return `<div class="floor-row"><strong>${floor === 0 ? 'Ground floor' : `Floor ${floor}`}</strong><span>${set.length} rooms</span><span>${used}/${cap} beds</span><div class="floor-progress"><i style="width:${cap ? Math.round(used / cap * 100) : 0}%"></i></div></div>`;
  }).join('');
  const counts = {
    occupied: rooms.filter(room => room.maintenance ? false : (room.status === 'occupied' || room.occupiedCount >= room.sharingCapacity)).length,
    partial: rooms.filter(room => !room.maintenance && (room.status === 'semi-empty' || (room.occupiedCount > 0 && room.occupiedCount < room.sharingCapacity))).length,
    vacant: rooms.filter(room => !room.maintenance && (room.status === 'empty' || room.freeSpots === room.sharingCapacity)).length,
    maintenance: rooms.filter(room => room.maintenance || room.status === 'maintenance').length
  };
  const rentDueCount = rent.filter(line => Number(line.balance || 0) > 0).length;
  const leavingCount = leaving.length;
  const recent = rent.slice(0, 5).map(line => `<tr><td><button class="link-button" data-profile-kind="person" data-profile-id="${escapeHtml(line.personId)}">${escapeHtml(line.personName || `Person ${line.personId}`)}</button><small><code>Person #${escapeHtml(line.personId)}</code></small></td><td>${escapeHtml(line.roomName || '—')}</td><td>${money(line.amountDue)}</td><td><span class="status ${Number(line.balance) > 0 ? 'pending' : ''}">${escapeHtml(line.status || (Number(line.balance) > 0 ? 'pending' : 'paid'))}</span></td></tr>`).join('');

  return `<section class="view active" id="view-dashboard"><div class="page-heading"><div class="heading-copy"><h1>PG overview <span style="font-size:21px">✳</span></h1><p>${escapeHtml(settings.name || 'PG')} · ${escapeHtml(settings.address || 'Room, bed and rent summary')}</p></div><div class="actions"><button class="btn" data-page="inventory">▦ <span>Manage rooms</span></button><button class="btn primary" data-modal="person">＋ <span>Add resident</span></button></div></div>
    <div class="stats"><article class="stat cyan"><div class="stat-top"><span class="stat-icon">▦</span><span class="stat-tag">${rooms.length} rooms</span></div><div class="stat-label">Beds occupied</div><div class="stat-value">${occupied}<span class="stat-denom"> / ${beds}</span></div><div class="stat-foot">${free} beds free · ${beds ? Math.round(occupied / beds * 100) : 0}% occupancy</div></article>
    <article class="stat violet"><div class="stat-top"><span class="stat-icon">♙</span><span class="stat-tag">Unique people IDs</span></div><div class="stat-label">Current residents</div><div class="stat-value">${people.length}</div><div class="stat-foot">${leavingCount} planned leaves coming up</div></article>
    <article class="stat mint"><div class="stat-top"><span class="stat-icon">₹</span><span class="stat-tag">${escapeHtml(month)}</span></div><div class="stat-label">Rent collected</div><div class="stat-value">${money(collected)}</div><div class="stat-foot">${money(expected)} expected this month</div></article>
    <article class="stat amber"><div class="stat-top"><span class="stat-icon">◷</span><span class="stat-tag">${rentDueCount} rent lines</span></div><div class="stat-label">Rent outstanding</div><div class="stat-value">${money(outstanding)}</div><div class="stat-foot">Due date: day ${settings.rentDueDay || '—'}</div></article></div>
    <div class="row primary-row"><article class="card floor-card"><div class="card-head"><h2 class="card-title">Floor-wise occupancy</h2><button class="text-btn" data-page="inventory">All rooms →</button></div><div class="floor-list">${floorRows || '<div class="empty">No room data returned by the API.</div>'}</div></article>
    <article class="card"><div class="card-head"><div><h2 class="card-title">Room status</h2><p class="subtle">Occupancy and availability from the room API</p></div><button class="btn" data-page="inventory">View rooms →</button></div><div class="room-status-grid"><div><span class="room-status-dot occupied"></span><strong>${counts.occupied}</strong><small>Full</small></div><div><span class="room-status-dot partial"></span><strong>${counts.partial}</strong><small>Partially occupied</small></div><div><span class="room-status-dot vacant"></span><strong>${counts.vacant}</strong><small>Vacant</small></div><div><span class="room-status-dot maintenance"></span><strong>${counts.maintenance}</strong><small>Maintenance</small></div></div><div class="sharing-breakdown"><span>Single <b>${rooms.filter(room => Number(room.sharingCapacity) === 1).length}</b></span><span>Double <b>${rooms.filter(room => Number(room.sharingCapacity) === 2).length}</b></span><span>Triple <b>${rooms.filter(room => Number(room.sharingCapacity) === 3).length}</b></span></div></article></div>
    <article class="card"><div class="card-head"><div><h2 class="card-title">Rent ledger · ${escapeHtml(month)}</h2><p class="subtle">Monthly due, collected, and balances from the rent API.</p></div><button class="text-btn" data-page="tenants">Residents &amp; rent →</button></div>${recent ? `<div class="table-wrap"><table class="table"><thead><tr><th>PERSON</th><th>ROOM</th><th>AMOUNT DUE</th><th>STATUS</th></tr></thead><tbody>${recent}</tbody></table></div>` : '<div class="empty">No rent lines for this month.</div>'}</article>
  </section>`;
}
