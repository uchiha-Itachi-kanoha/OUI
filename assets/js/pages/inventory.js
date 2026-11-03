import { fieldsFor, renderDynamicTable, escapeHtml } from '../ui/fields.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));

export default function renderRooms({ rooms, bootstrap }) {
  const beds = rooms.reduce((sum, room) => sum + Number(room.sharingCapacity || 0), 0);
  const occupied = rooms.reduce((sum, room) => sum + Number(room.occupiedCount || 0), 0);
  const availableSpots = rooms.filter(room => !room.maintenance && room.status !== 'maintenance').reduce((sum, room) => sum + Number(room.freeSpots || 0), 0);
  const floors = [...new Set(rooms.map(room => room.floor ?? 0))].sort((a, b) => a - b);
  const maxRent = rooms.reduce((sum, room) => sum + Number(room.defaultMonthlyRent || 0) * Number(room.sharingCapacity || 0), 0);
  const fields = fieldsFor(bootstrap, 'room', rooms, 'table');
  const table = renderDynamicTable(rooms, fields, {
    action: room => `<button class="btn compact" data-profile-kind="room" data-profile-id="${escapeHtml(room.id)}">Profile</button><button class="btn compact" data-toggle-maintenance="${escapeHtml(room.id)}" data-maintenance="${room.maintenance ? 'true' : 'false'}">${room.maintenance ? 'Restore' : 'Maintenance'}</button>`
  });
  return `<section class="view" id="view-inventory"><div class="page-heading"><div class="heading-copy"><h1>Rooms &amp; beds</h1><p>Capacity, floor, rent, occupancy, and room profiles from the API.</p></div><button class="btn primary" data-modal="room">＋ <span>Add room</span></button></div>
    <div class="inventory-stats"><div class="inventory-tile"><small>Total rooms</small><strong>${rooms.length}</strong><span>${floors.length} floors</span></div><div class="inventory-tile"><small>Bed occupancy</small><strong>${occupied} / ${beds}</strong><span>${availableSpots} available spots (excludes maintenance)</span></div><div class="inventory-tile"><small>Rent at full capacity</small><strong>${money(maxRent)}</strong><span>Based on room rent × sharing capacity</span></div></div>
    <article class="card"><div class="toolbar"><label class="search"><span>⌕</span><input class="inventory-search" placeholder="Search room fields..."></label><select class="select floor-filter"><option value="all">All floors</option>${floors.map(floor => `<option value="${floor}">${floor === 0 ? 'Ground floor' : `Floor ${floor}`}</option>`).join('')}</select><select class="select inventory-filter"><option value="all">All room statuses</option><option value="empty">Vacant</option><option value="semi-empty">Partially occupied</option><option value="occupied">Occupied</option><option value="maintenance">Maintenance</option></select><button class="btn" data-refresh>↻ <span>Refresh</span></button></div>${table}</article>
    <p class="data-footnote">Room IDs are assigned by the backend. The UI uses those IDs for profiles, occupancy changes, and resident assignments.</p>
  </section>`;
}
