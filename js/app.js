/* ═══════════════════════════════════════════════════════════
   SAMARITAN — app.js  (Kenya Edition)
   Community-Powered Civic Platform — Supabase + Live News
   ═══════════════════════════════════════════════════════════ */

'use strict';

import { supabase } from './supabase.js';

/* ──────────────────────────────────────────────────────────
   SESSION ID  (anonymous fingerprint for confirmations)
────────────────────────────────────────────────────────── */
function getSessionId() {
  let id = localStorage.getItem('sam_session');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('sam_session', id); }
  return id;
}
const SESSION_ID = getSessionId();

/* ──────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────── */
const State = {
  userLat: null, userLng: null, userPlace: 'Detecting location…',
  reportLat: null, reportLng: null, reportPlace: null,
  selectedCategory: null, reportPinMarker: null,
  sosType: null, sosLat: null, sosLng: null, sosHoldTimeout: null,
  currentFilter: 'all',
  confirmedIds: new Set(JSON.parse(localStorage.getItem('sam_confirmed') || '[]')),
  mapInstance: null, reportMapInstance: null,
  feedItems: [], feedLoading: false,
};

/* ──────────────────────────────────────────────────────────
   SAMPLE FALLBACK DATA
────────────────────────────────────────────────────────── */
const SAMPLE_POSTS = [
  { id: 'sample-1', _type: 'civic', category: 'corruption', title: 'NYS contractor paid twice for same road', desc: 'Documents show Sh47M disbursed to Apex Contractors Ltd in March and June for the same Githurai–Kamiti stretch. Road still potholed.', location: 'Githurai, Nairobi', time: '18 min ago', confirmations: 63, icon: '💰', lat: -1.219, lng: 36.908, url: null },
  { id: 'sample-2', _type: 'civic', category: 'abandoned', title: 'Dispensary construction stalled — 4 years', desc: 'Foundations poured in 2020, nothing since. Residents walk 9km to Kajiado County Hospital. Contractor untraceable.', location: 'Isinya, Kajiado County', time: '45 min ago', confirmations: 107, icon: '🏗️', lat: -1.932, lng: 36.972, url: null },
  { id: 'sample-3', _type: 'civic', category: 'environment', title: 'Nairobi River choked with industrial effluent', desc: 'Black oily discharge spotted flowing from Kariobangi Light Industries into the river. Fish kill reported downstream near Mathare.', location: 'Kariobangi, Nairobi', time: '1 hr ago', confirmations: 218, icon: '🌿', lat: -1.267, lng: 36.876, url: null },
  { id: 'sample-4', _type: 'civic', category: 'safety', title: 'Collapsed footbridge — 3 students injured', desc: 'Wooden bridge over drainage channel near Pumwani Primary gave way yesterday morning. No replacement in sight.', location: 'Pumwani, Nairobi', time: '2 hrs ago', confirmations: 84, icon: '⚠️', lat: -1.282, lng: 36.849, url: null },
  { id: 'sample-5', _type: 'civic', category: 'public', title: 'Huduma Centre closed — no explanation', desc: 'Mombasa Huduma Centre shuttered for 11 days. Staff say "system upgrade" but no official notice. Hundreds turned away daily.', location: 'Mombasa CBD', time: '3 hrs ago', confirmations: 51, icon: '🏛️', lat: -4.043, lng: 39.668, url: null },
  { id: 'sample-6', _type: 'civic', category: 'corruption', title: 'Phantom bursary recipients — Kisumu County', desc: "Over 200 bursary slots allocated to ghost students. Source within education office leaks names linked to officials' relatives.", location: 'Kisumu City', time: '5 hrs ago', confirmations: 176, icon: '💰', lat: -0.091, lng: 34.768, url: null },
];

/* ──────────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────────── */
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function timeAgo(dateStr) {
  if (!dateStr) return 'recently';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function categoryIcon(cat) {
  return { corruption: '💰', abandoned: '🏗️', environment: '🌿', safety: '⚠️', public: '🏛️', other: '📋' }[cat] || '📋';
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.className = ''; }, 3200);
}

/* ──────────────────────────────────────────────────────────
   REVERSE GEOCODING
────────────────────────────────────────────────────────── */
function reverseGeocode(lat, lng, callback) {
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, { headers: { 'Accept-Language': 'en' } })
    .then((r) => r.json())
    .then((data) => {
      const a = data.address || {};
      const parts = [a.suburb || a.neighbourhood || a.village || a.town || a.road, a.city || a.county || a.state_district].filter(Boolean);
      callback(parts.slice(0, 2).join(', ') || (data.display_name || '').split(',').slice(0, 2).join(',').trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    })
    .catch(() => callback(`${lat.toFixed(4)}, ${lng.toFixed(4)}`));
}

/* ──────────────────────────────────────────────────────────
   LOCATION DETECTION
────────────────────────────────────────────────────────── */
function detectUserLocation() {
  if (!navigator.geolocation) { setKenyaDefaults(); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      State.userLat = pos.coords.latitude;
      State.userLng = pos.coords.longitude;
      reverseGeocode(State.userLat, State.userLng, (place) => {
        State.userPlace = place;
        State.reportLat = State.userLat;
        State.reportLng = State.userLng;
        State.reportPlace = place;
        const el = document.getElementById('sos-loc-display');
        if (el) el.textContent = `${place} (${State.userLat.toFixed(4)}, ${State.userLng.toFixed(4)})`;
        updateReportLocationUI(place, State.userLat, State.userLng);
        const mapLoc = document.getElementById('map-user-loc');
        if (mapLoc) mapLoc.textContent = place;
      });
    },
    () => setKenyaDefaults(),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function setKenyaDefaults() {
  State.userLat = -1.2921; State.userLng = 36.8219; State.userPlace = 'Nairobi, Kenya';
  State.reportLat = State.userLat; State.reportLng = State.userLng; State.reportPlace = State.userPlace;
  updateReportLocationUI(State.userPlace, State.userLat, State.userLng);
  const el = document.getElementById('sos-loc-display'); if (el) el.textContent = State.userPlace;
  const mapLoc = document.getElementById('map-user-loc'); if (mapLoc) mapLoc.textContent = State.userPlace;
}

function updateReportLocationUI(place, lat, lng) {
  const txt = document.getElementById('location-text');
  const strip = document.getElementById('location-strip');
  if (!txt || !strip) return;
  txt.textContent = place + (lat ? ` (${lat.toFixed(4)}, ${lng.toFixed(4)})` : '');
  strip.classList.add('captured');
}

/* ──────────────────────────────────────────────────────────
   NEWS FETCH — trigger edge function then read from DB
────────────────────────────────────────────────────────── */
async function triggerNewsFetch() {
  try {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-kenya-news`, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_SUPABASE_ANON_KEY}` },
    });
  } catch { /* silent */ }
}

/* ──────────────────────────────────────────────────────────
   LOAD FEED DATA from Supabase
────────────────────────────────────────────────────────── */
async function fetchFeedData(filter) {
  const [civicRes, newsRes] = await Promise.all([
    supabase.from('civic_reports').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('news_articles').select('*').order('published_at', { ascending: false }).limit(60),
  ]);

  const civicItems = (civicRes.data || []).map((r) => ({
    id: r.id, _type: 'civic', category: r.category,
    title: r.title || r.description.slice(0, 80),
    desc: r.description, location: r.location,
    time: timeAgo(r.created_at), confirmations: r.confirmations || 0,
    icon: categoryIcon(r.category), lat: r.lat, lng: r.lng,
    url: null, imageUrl: r.media_url || null,
  }));

  const newsItems = (newsRes.data || []).map((n) => ({
    id: n.id, _type: 'news', category: n.category,
    title: n.title, desc: n.description,
    location: n.source, time: timeAgo(n.published_at || n.fetched_at),
    confirmations: 0, icon: categoryIcon(n.category),
    lat: null, lng: null, url: n.url,
    imageUrl: n.image_url || null, source: n.source,
  }));

  // Interleave civic reports with news articles
  const merged = [];
  const maxLen = Math.max(civicItems.length, newsItems.length);
  for (let i = 0; i < maxLen; i++) {
    if (civicItems[i]) merged.push(civicItems[i]);
    if (newsItems[i]) merged.push(newsItems[i]);
  }

  const combined = merged.length > 0 ? merged : SAMPLE_POSTS;
  if (filter && filter !== 'all') return combined.filter((p) => p.category === filter);
  return combined;
}

/* ──────────────────────────────────────────────────────────
   CONFIRMATIONS from DB
────────────────────────────────────────────────────────── */
async function loadConfirmations() {
  const { data } = await supabase.from('report_confirmations').select('report_id').eq('session_id', SESSION_ID);
  if (data) data.forEach((r) => State.confirmedIds.add(r.report_id));
}

/* ──────────────────────────────────────────────────────────
   FEED RENDER
────────────────────────────────────────────────────────── */
function showSkeletons() {
  const container = document.getElementById('feed-container');
  container.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const sk = document.createElement('div');
    sk.className = 'card skeleton-card';
    sk.innerHTML = `<div class="skeleton" style="height:160px;width:100%"></div><div class="card-body"><div class="skeleton" style="height:12px;width:40%;margin-bottom:10px"></div><div class="skeleton" style="height:16px;width:90%;margin-bottom:6px"></div><div class="skeleton" style="height:12px;width:60%"></div></div>`;
    container.appendChild(sk);
  }
}

function renderFeed(items) {
  const container = document.getElementById('feed-container');
  container.innerHTML = '';
  items.forEach((post, i) => container.appendChild(buildCard(post, i)));
  document.getElementById('feed-count').textContent = `${items.length} reports`;
}

function buildCard(post, delay = 0) {
  const isConfirmed = State.confirmedIds.has(post.id);
  const isNews = post._type === 'news';
  const card = document.createElement('article');
  card.className = 'card';
  card.style.animationDelay = delay * 55 + 'ms';
  card.dataset.id = post.id;

  const mediaHtml = post.imageUrl
    ? `<img class="card-img-real" src="${escapeHtml(post.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="card-img-placeholder" role="img"><span style="font-size:50px">${post.icon}</span></div>`;

  const newsBadge = isNews ? `<span class="badge badge-news">NEWS</span>` : '';
  const sourceRow = isNews && post.source
    ? `<div class="card-location card-source">📡 ${escapeHtml(post.source)}</div>`
    : `<div class="card-location">📍 ${escapeHtml(post.location)}</div>`;

  const actionRow = isNews
    ? `<a class="read-more-btn" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">Read Article ↗</a><button class="share-btn" data-id="${escapeHtml(post.id)}" title="Share">↗</button>`
    : `<button class="confirm-btn${isConfirmed ? ' confirmed' : ''}" data-id="${escapeHtml(post.id)}">${isConfirmed ? '✅ Confirmed' : '👍 Confirm'}</button><span class="confirm-count" id="conf-${escapeHtml(post.id)}">${post.confirmations} confirmations</span><button class="share-btn" data-id="${escapeHtml(post.id)}" title="Share">↗</button>`;

  card.innerHTML = `${mediaHtml}<div class="card-body"><div class="card-meta">${newsBadge}<span class="badge badge-${escapeHtml(post.category)}">${escapeHtml(post.category).toUpperCase()}</span><span class="card-time">⏱ ${escapeHtml(post.time)}</span></div><h3 class="card-title">${escapeHtml(post.title)}</h3><p class="card-desc">${escapeHtml(post.desc)}</p>${sourceRow}<div class="card-footer">${actionRow}</div></div>`;
  return card;
}

async function loadFeed(filter) {
  if (State.feedLoading) return;
  State.feedLoading = true;
  filter = filter || State.currentFilter;
  State.currentFilter = filter;
  showSkeletons();
  try {
    const items = await fetchFeedData(filter);
    State.feedItems = items;
    renderFeed(items);
    updateStats(items);
  } catch {
    renderFeed(SAMPLE_POSTS);
    showToast('Could not load live data — showing cached reports', 'warning');
  } finally {
    State.feedLoading = false;
  }
}

function updateStats(items) {
  const civicCount = items.filter((i) => i._type === 'civic').length;
  const newsCount = items.filter((i) => i._type === 'news').length;
  document.getElementById('stat-total').textContent = civicCount + newsCount;
  document.getElementById('stat-today').textContent = newsCount;
  document.getElementById('stat-verified').textContent = State.confirmedIds.size;
  const mapStat = document.getElementById('map-stat-active');
  if (mapStat) mapStat.textContent = civicCount;
}

/* ──────────────────────────────────────────────────────────
   CONFIRM & SHARE
────────────────────────────────────────────────────────── */
document.getElementById('feed-container').addEventListener('click', (e) => {
  const confirmBtn = e.target.closest('.confirm-btn');
  const shareBtn = e.target.closest('.share-btn');
  if (confirmBtn) handleConfirm(confirmBtn.dataset.id, confirmBtn);
  if (shareBtn) sharePost(shareBtn.dataset.id);
});

async function handleConfirm(postId, btn) {
  if (State.confirmedIds.has(postId)) { showToast('Already confirmed this report', 'warning'); return; }
  State.confirmedIds.add(postId);
  localStorage.setItem('sam_confirmed', JSON.stringify([...State.confirmedIds]));
  btn.classList.add('confirmed');
  btn.innerHTML = '✅ Confirmed';
  const countEl = document.getElementById(`conf-${postId}`);
  if (countEl) { const c = parseInt(countEl.textContent) || 0; countEl.textContent = `${c + 1} confirmations`; }
  try {
    await supabase.from('report_confirmations').insert({ report_id: postId, session_id: SESSION_ID });
    await supabase.from('civic_reports').update({ confirmations: (await supabase.from('civic_reports').select('confirmations').eq('id', postId).maybeSingle()).data?.confirmations + 1 || 1 }).eq('id', postId);
  } catch { /* optimistic update already applied */ }
  showToast('Report confirmed — asante!', 'success');
  document.getElementById('stat-verified').textContent = State.confirmedIds.size;
}

function sharePost(postId) {
  const post = State.feedItems.find((p) => p.id === postId);
  const shareUrl = (post && post.url) ? post.url : window.location.href;
  if (navigator.share) { navigator.share({ title: 'The Samaritan — Civic Report', url: shareUrl }).catch(() => {}); }
  else { navigator.clipboard?.writeText(shareUrl).catch(() => {}); showToast('Link copied!', 'success'); }
}

/* ──────────────────────────────────────────────────────────
   FILTER CHIPS
────────────────────────────────────────────────────────── */
document.getElementById('filter-bar').addEventListener('click', (e) => {
  const chip = e.target.closest('.trend-chip');
  if (!chip) return;
  document.querySelectorAll('.trend-chip').forEach((c) => c.classList.remove('active'));
  chip.classList.add('active');
  loadFeed(chip.dataset.filter);
});

/* ──────────────────────────────────────────────────────────
   LOAD MORE / REFRESH
────────────────────────────────────────────────────────── */
document.getElementById('load-more-btn').addEventListener('click', async () => {
  const btn = document.getElementById('load-more-btn');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  await triggerNewsFetch();
  await loadFeed(State.currentFilter);
  btn.disabled = false;
  btn.textContent = 'Load More Reports';
  showToast('Feed refreshed with latest news', 'success');
});

/* ──────────────────────────────────────────────────────────
   PAGE NAVIGATION
────────────────────────────────────────────────────────── */
function switchPage(pageId) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  document.getElementById(`page-${pageId}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');
  if (pageId === 'map') initMap();
  if (pageId === 'report') initReportMap();
}

document.getElementById('bottom-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (btn) switchPage(btn.dataset.page);
});

/* ──────────────────────────────────────────────────────────
   REPORT FORM
────────────────────────────────────────────────────────── */
document.getElementById('cat-grid').addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  document.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('selected'));
  chip.classList.add('selected');
  State.selectedCategory = chip.dataset.cat;
});

document.getElementById('file-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('upload-zone').classList.add('has-file');
  document.getElementById('upload-icon').textContent = file.type.startsWith('video') ? '🎬' : '🖼️';
  document.getElementById('upload-label').textContent = file.name.length > 30 ? file.name.slice(0, 30) + '…' : file.name;
});

document.getElementById('submit-report-btn').addEventListener('click', async () => {
  const desc = document.getElementById('report-desc').value.trim();
  const name = document.getElementById('reporter-name').value.trim();
  if (!State.selectedCategory) { showToast('Please select a category', 'warning'); return; }
  if (!desc) { showToast('Please describe what you witnessed', 'warning'); return; }
  const btn = document.getElementById('submit-report-btn');
  btn.disabled = true;
  btn.textContent = 'SUBMITTING…';
  try {
    const { error } = await supabase.from('civic_reports').insert({
      category: State.selectedCategory,
      description: desc,
      location: State.reportPlace || State.userPlace,
      lat: State.reportLat, lng: State.reportLng,
      reporter: name || 'Anonymous Reporter',
    });
    if (error) throw error;
    document.getElementById('report-desc').value = '';
    document.getElementById('reporter-name').value = '';
    document.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('selected'));
    State.selectedCategory = null;
    document.getElementById('upload-zone').classList.remove('has-file');
    document.getElementById('upload-icon').textContent = '📎';
    document.getElementById('upload-label').textContent = 'Tap to attach photo or video';
    const overlay = document.getElementById('submit-success');
    overlay.classList.add('show');
    setTimeout(() => { overlay.classList.remove('show'); switchPage('feed'); loadFeed('all'); }, 2500);
  } catch {
    showToast('Failed to submit report. Try again.', 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'SUBMIT REPORT';
  }
});

/* ──────────────────────────────────────────────────────────
   SOS PAGE
────────────────────────────────────────────────────────── */
const sosBtn = document.getElementById('sos-hero-btn');
const EMERGENCY_NUMBER = '999';

sosBtn.addEventListener('mousedown', startHold);
sosBtn.addEventListener('touchstart', startHold, { passive: true });
sosBtn.addEventListener('mouseup', stopHold);
sosBtn.addEventListener('mouseleave', stopHold);
sosBtn.addEventListener('touchend', stopHold);

function startHold() {
  showToast('Hold 2–3s to trigger emergency call', 'info');
  State.sosHoldTimeout = setTimeout(() => { window.location.href = 'tel:' + EMERGENCY_NUMBER; logSosAlert(); }, 2500);
}
function stopHold() {
  if (State.sosHoldTimeout) { clearTimeout(State.sosHoldTimeout); State.sosHoldTimeout = null; }
}
async function logSosAlert() {
  try {
    await supabase.from('sos_alerts').insert({ type: State.sosType || 'General Emergency', lat: State.userLat, lng: State.userLng, location: State.userPlace, status: 'active' });
  } catch { /* non-critical */ }
}

document.querySelector('.sos-type-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.sos-type-card');
  if (!card) return;
  document.querySelectorAll('.sos-type-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  State.sosType = card.dataset.type;
  showToast(`Emergency type: ${State.sosType}`, 'info');
});

document.getElementById('sos-fab').addEventListener('click', () => {
  const modal = document.getElementById('sos-modal');
  const locTxt = document.getElementById('modal-loc-text');
  if (locTxt) locTxt.textContent = State.userPlace || 'Acquiring GPS…';
  modal.classList.add('open');
});
document.getElementById('sos-cancel-btn').addEventListener('click', () => document.getElementById('sos-modal').classList.remove('open'));
document.getElementById('sos-confirm-btn').addEventListener('click', async () => {
  document.getElementById('sos-modal').classList.remove('open');
  await logSosAlert();
  window.location.href = 'tel:' + EMERGENCY_NUMBER;
  showToast('Emergency services alerted!', 'danger');
});

/* ──────────────────────────────────────────────────────────
   LEAFLET MAP
────────────────────────────────────────────────────────── */
function initMap() {
  if (State.mapInstance) return;
  const lat = State.userLat || -1.2921;
  const lng = State.userLng || 36.8219;
  const map = window.L.map('leaflet-map', { zoomControl: true, scrollWheelZoom: false }).setView([lat, lng], 6);
  State.mapInstance = map;
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
  const userIcon = window.L.divIcon({ className: '', html: '<div style="width:14px;height:14px;background:#3399ff;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #3399ff"></div>', iconSize: [14, 14] });
  window.L.marker([lat, lng], { icon: userIcon }).addTo(map).bindPopup('Your location');
  const colors = { corruption: '#ff6666', abandoned: '#ffcc44', environment: '#44dd88', safety: '#ff9944', public: '#66aaff', other: '#aaa' };
  State.feedItems.filter((p) => p.lat && p.lng && p._type === 'civic').forEach((post) => {
    const color = colors[post.category] || '#aaa';
    const icon = window.L.divIcon({ className: '', html: `<div style="width:12px;height:12px;background:${color};border-radius:50%;border:2px solid #000;box-shadow:0 0 6px ${color}44"></div>`, iconSize: [12, 12] });
    window.L.marker([post.lat, post.lng], { icon }).addTo(map).bindPopup(`<strong>${escapeHtml(post.title)}</strong><br>${escapeHtml(post.location)}`);
  });
  document.getElementById('map-user-loc').textContent = State.userPlace || 'Kenya';
}

/* ──────────────────────────────────────────────────────────
   REPORT MINI MAP
────────────────────────────────────────────────────────── */
function initReportMap() {
  if (State.reportMapInstance) return;
  const lat = State.reportLat || -1.2921;
  const lng = State.reportLng || 36.8219;
  const map = window.L.map('report-map', { zoomControl: true, scrollWheelZoom: false }).setView([lat, lng], 13);
  State.reportMapInstance = map;
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
  const pinIcon = window.L.divIcon({ className: '', html: '<div style="font-size:24px;transform:translate(-50%,-100%)">📍</div>', iconSize: [24, 24], iconAnchor: [12, 24] });
  State.reportPinMarker = window.L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
  function onPin(latlng) {
    State.reportLat = latlng.lat; State.reportLng = latlng.lng;
    reverseGeocode(latlng.lat, latlng.lng, (place) => { State.reportPlace = place; updateReportLocationUI(place, latlng.lat, latlng.lng); });
  }
  State.reportPinMarker.on('dragend', (e) => onPin(e.target.getLatLng()));
  map.on('click', (e) => { State.reportPinMarker.setLatLng(e.latlng); onPin(e.latlng); });
}

/* ──────────────────────────────────────────────────────────
   HEADER BUTTONS
────────────────────────────────────────────────────────── */
document.getElementById('notif-btn').addEventListener('click', () => showToast('No new notifications', 'info'));
document.getElementById('profile-btn').addEventListener('click', () => showToast('Profile coming soon', 'info'));
document.getElementById('logo-img').addEventListener('click', () => { switchPage('feed'); loadFeed('all'); });

/* ──────────────────────────────────────────────────────────
   AUTO REFRESH — every 5 minutes
────────────────────────────────────────────────────────── */
setInterval(() => {
  if (document.getElementById('page-feed').classList.contains('active')) {
    triggerNewsFetch().then(() => loadFeed(State.currentFilter));
  }
}, 5 * 60 * 1000);

/* ──────────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  detectUserLocation();
  await loadConfirmations();
  triggerNewsFetch();
  await loadFeed('all');
});
