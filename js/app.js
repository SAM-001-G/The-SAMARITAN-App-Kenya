/* ═══════════════════════════════════════════════════════════
   SAMARITAN — app.js  (Kenya Edition)
   Community-Powered Civic Platform

   Location Strategy:
   ─ On load: auto-detect device GPS → reverse geocode via
     Nominatim (free, no API key) → display real place name
   ─ Map: opens centered on user's real location; user can
     tap/click map to pin exact report location
   ─ Report form: auto-fills from GPS + allows map pin override
   ─ SOS: grabs live GPS immediately, no fallback accepted
   ─ All sample data is Kenya-based (Nairobi, Mombasa, Kisumu…)

   Firebase hooks marked [FIREBASE]
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────── */
const State = {
  userLat:   null,
  userLng:   null,
  userPlace: 'Detecting location…',

  reportLat:      null,
  reportLng:      null,
  reportPlace:    null,
  selectedCategory: null,
  reportPinMarker:  null,

  sosType:  null,
  sosLat:   null,
  sosLng:   null,
  sosPlace: null,

  currentFilter:    'all',
  confirmedPosts:   new Set(),
  extraPostsLoaded: false,

  mapInstance:        null,
  reportMapInstance:  null,
  userMarker:         null,
};

/* ──────────────────────────────────────────────────────────
   KENYA SAMPLE DATA
   [FIREBASE] Replace with Firestore real-time listener:
   db.collection('reports').orderBy('timestamp','desc')
     .onSnapshot(snap => renderFeed(snap.docs))
────────────────────────────────────────────────────────── */
const POSTS = [
  {
    id: 1, category: 'corruption',
    title: 'NYS contractor paid twice for same road',
    desc: 'Documents show Sh47M disbursed to Apex Contractors Ltd in March and June for the same Githurai–Kamiti stretch. Road still potholed.',
    location: 'Githurai, Nairobi', time: '18 min ago',
    confirmations: 63, icon: '💰', lat: -1.219, lng: 36.908,
  },
  {
    id: 2, category: 'abandoned',
    title: 'Dispensary construction stalled — 4 years',
    desc: 'Foundations poured in 2020, nothing since. Residents walk 9km to Kajiado County Hospital. Contractor untraceable.',
    location: 'Isinya, Kajiado County', time: '45 min ago',
    confirmations: 107, icon: '🏗️', lat: -1.932, lng: 36.972,
  },
  {
    id: 3, category: 'environment',
    title: 'Nairobi River choked with industrial effluent',
    desc: 'Black oily discharge spotted flowing from Kariobangi Light Industries into the river. Fish kill reported downstream near Mathare.',
    location: 'Kariobangi, Nairobi', time: '1 hr ago',
    confirmations: 218, icon: '🌿', lat: -1.267, lng: 36.876,
  },
  {
    id: 4, category: 'safety',
    title: 'Collapsed footbridge — 3 students injured',
    desc: 'Wooden bridge over drainage channel near Pumwani Primary gave way yesterday morning. No replacement in sight.',
    location: 'Pumwani, Nairobi', time: '2 hrs ago',
    confirmations: 84, icon: '⚠️', lat: -1.282, lng: 36.849,
  },
  {
    id: 5, category: 'public',
    title: 'Huduma Centre closed — no explanation',
    desc: 'Mombasa Huduma Centre shuttered for 11 days. Staff say "system upgrade" but no official notice. Hundreds turned away daily.',
    location: 'Mombasa CBD', time: '3 hrs ago',
    confirmations: 51, icon: '🏛️', lat: -4.043, lng: 39.668,
  },
  {
    id: 6, category: 'corruption',
    title: 'Phantom bursary recipients — Kisumu County',
    desc: 'Over 200 bursary slots allocated to ghost students. Source within education office leaks names linked to officials\' relatives.',
    location: 'Kisumu City', time: '5 hrs ago',
    confirmations: 176, icon: '💰', lat: -0.091, lng: 34.768,
  },
  {
    id: 7, category: 'environment',
    title: 'Plastic waste dumped in Karura Forest',
    desc: 'Truckload of plastic bags and construction debris dumped at the Limuru Road entrance of Karura Forest at night. CCTV footage available.',
    location: 'Karura Forest, Nairobi', time: '6 hrs ago',
    confirmations: 142, icon: '🌿', lat: -1.231, lng: 36.820,
  },
  {
    id: 8, category: 'safety',
    title: 'Exposed live cables — Nakuru town centre',
    desc: 'KPLC cables dangling over Kenyatta Avenue after a matatu hit a pole 3 days ago. Area roped off but cables still live.',
    location: 'Nakuru Town', time: '8 hrs ago',
    confirmations: 39, icon: '⚠️', lat: -0.304, lng: 36.068,
  },
];

const EXTRA_POSTS = [
  {
    id: 9, category: 'public',
    title: 'Water rationing — Kibera gets 2hrs/week',
    desc: 'Nairobi Water Company confirms Kibera allocation cut from 3 days to 2 hours per week. No compensation or timeline given.',
    location: 'Kibera, Nairobi', time: '10 hrs ago',
    confirmations: 304, icon: '🏛️', lat: -1.312, lng: 36.787,
  },
  {
    id: 10, category: 'abandoned',
    title: 'SGR feeder road funds disappeared — Voi',
    desc: 'KSh 120M allocated for access roads to Voi SGR station. Two years later: murram track, no grading, no drainage.',
    location: 'Voi, Taita Taveta County', time: '1 day ago',
    confirmations: 233, icon: '🏗️', lat: -3.396, lng: 38.558,
  },
];

/* ──────────────────────────────────────────────────────────
   REVERSE GEOCODING
   Nominatim — free, no API key, 1 req/sec limit
   Converts lat/lng → readable place name
────────────────────────────────────────────────────────── */
function reverseGeocode(lat, lng, callback) {
  const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
    lat + '&lon=' + lng + '&zoom=14&addressdetails=1';

  fetch(url, { headers: { 'Accept-Language': 'en' } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      const a = data.address || {};
      const parts = [
        a.suburb || a.neighbourhood || a.village || a.town || a.road,
        a.city || a.county || a.state_district,
      ].filter(Boolean);
      const place = parts.slice(0, 2).join(', ') ||
        (data.display_name || '').split(',').slice(0, 2).join(',').trim();
      callback(place || (lat.toFixed(4) + ', ' + lng.toFixed(4)));
    })
    .catch(function() {
      callback(lat.toFixed(4) + ', ' + lng.toFixed(4));
    });
}

/* ──────────────────────────────────────────────────────────
   AUTO-DETECT USER LOCATION (runs immediately on page load)
   1. Request GPS
   2. Reverse geocode → human place name
   3. Update all location fields across the app
────────────────────────────────────────────────────────── */
function detectUserLocation() {
  if (!navigator.geolocation) {
    setKenyaDefaults();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      State.userLat = pos.coords.latitude;
      State.userLng = pos.coords.longitude;

      reverseGeocode(State.userLat, State.userLng, function(place) {
        State.userPlace   = place;
        State.reportLat   = State.userLat;
        State.reportLng   = State.userLng;
        State.reportPlace = place;

        // Update report location strip
        updateReportLocationUI(place, State.userLat, State.userLng);

        // Update SOS page display
        var el = document.getElementById('sos-loc-display');
        if (el) el.textContent = place + ' (' + State.userLat.toFixed(4) + ', ' + State.userLng.toFixed(4) + ')';

        // Update map stat display
        var mapEl = document.getElementById('map-user-loc');
        if (mapEl) mapEl.textContent = place;

        // Centre civic map if open
        if (State.mapInstance) {
          State.mapInstance.setView([State.userLat, State.userLng], 13);
          placeUserMarker(State.userLat, State.userLng);
        }

        // Centre report mini-map if open
        if (State.reportMapInstance) {
          State.reportMapInstance.setView([State.userLat, State.userLng], 14);
          placeReportPin(State.userLat, State.userLng, place);
        }

        showToast('📍 ' + place, 'success');
      });
    },
    function() {
      setKenyaDefaults();
      showToast('Enable GPS for live location', 'warning');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function setKenyaDefaults() {
  State.userLat     = -1.2921;
  State.userLng     = 36.8219;
  State.userPlace   = 'Nairobi, Kenya';
  State.reportLat   = State.userLat;
  State.reportLng   = State.userLng;
  State.reportPlace = State.userPlace;
  updateReportLocationUI(State.userPlace, State.userLat, State.userLng);
  var el = document.getElementById('sos-loc-display');
  if (el) el.textContent = State.userPlace;
  var mapEl = document.getElementById('map-user-loc');
  if (mapEl) mapEl.textContent = State.userPlace;
}

function updateReportLocationUI(place, lat, lng) {
  var txt   = document.getElementById('location-text');
  var strip = document.getElementById('location-strip');
  if (!txt || !strip) return;
  txt.textContent = place + (lat ? ' (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')' : '');
  strip.classList.add('captured');
}

/* ──────────────────────────────────────────────────────────
   NAVIGATION
────────────────────────────────────────────────────────── */
function switchPage(pageName) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });

  var page   = document.getElementById('page-' + pageName);
  var navBtn = document.querySelector('.nav-item[data-page="' + pageName + '"]');

  if (page)   page.classList.add('active');
  if (navBtn) navBtn.classList.add('active');

  if (pageName === 'map'    && !State.mapInstance)        initCivicMap();
  if (pageName === 'report' && !State.reportMapInstance)  initReportMap();
}

/* ──────────────────────────────────────────────────────────
   FEED
   [FIREBASE] Replace with Firestore real-time listener
────────────────────────────────────────────────────────── */
function loadFeed(filter) {
  filter = filter || State.currentFilter;
  State.currentFilter = filter;

  var container = document.getElementById('feed-container');
  container.innerHTML = '';

  var filtered = filter === 'all' ? POSTS : POSTS.filter(function(p) { return p.category === filter; });

  document.getElementById('feed-count').textContent   = filtered.length + ' reports';
  document.getElementById('stat-total').textContent    = POSTS.length + EXTRA_POSTS.length;
  document.getElementById('stat-today').textContent    = 6;
  document.getElementById('stat-verified').textContent = 4;

  filtered.forEach(function(post, i) { container.appendChild(buildCard(post, i)); });
}

function buildCard(post, delay) {
  delay = delay || 0;
  var isConfirmed = State.confirmedPosts.has(post.id);
  var card = document.createElement('article');
  card.className = 'card';
  card.style.animationDelay = (delay * 75) + 'ms';
  card.dataset.id = post.id;

  card.innerHTML =
    '<div class="card-img-placeholder" role="img">' +
      '<span style="font-size:50px">' + post.icon + '</span>' +
    '</div>' +
    '<div class="card-body">' +
      '<div class="card-meta">' +
        '<span class="badge badge-' + post.category + '">' + post.category.toUpperCase() + '</span>' +
        '<span class="card-time">⏱ ' + post.time + '</span>' +
      '</div>' +
      '<h3 class="card-title">' + escapeHtml(post.title) + '</h3>' +
      '<p class="card-desc">' + escapeHtml(post.desc) + '</p>' +
      '<div class="card-location">📍 ' + escapeHtml(post.location) + '</div>' +
      '<div class="card-footer">' +
        '<button class="confirm-btn' + (isConfirmed ? ' confirmed' : '') + '" data-id="' + post.id + '">' +
          (isConfirmed ? '✅ Confirmed' : '👍 Confirm') +
        '</button>' +
        '<span class="confirm-count" id="conf-' + post.id + '">' + post.confirmations + ' confirmations</span>' +
        '<button class="share-btn" data-id="' + post.id + '" title="Share">↗</button>' +
      '</div>' +
    '</div>';

  return card;
}

document.getElementById('feed-container').addEventListener('click', function(e) {
  var confirmBtn = e.target.closest('.confirm-btn');
  var shareBtn   = e.target.closest('.share-btn');
  if (confirmBtn) updateConfirmation(Number(confirmBtn.dataset.id), confirmBtn);
  if (shareBtn)   sharePost(Number(shareBtn.dataset.id));
});

/* ──────────────────────────────────────────────────────────
   updateConfirmation()
   [FIREBASE] db.collection('reports').doc(id)
     .update({ confirmations: FieldValue.increment(1) })
────────────────────────────────────────────────────────── */
function updateConfirmation(postId, btn) {
  if (State.confirmedPosts.has(postId)) { showToast('Already confirmed this report', 'warning'); return; }
  State.confirmedPosts.add(postId);
  btn.classList.add('confirmed');
  btn.innerHTML = '✅ Confirmed';

  var post = POSTS.concat(EXTRA_POSTS).find(function(p) { return p.id === postId; });
  if (post) {
    post.confirmations++;
    var el = document.getElementById('conf-' + postId);
    if (el) el.textContent = post.confirmations + ' confirmations';
  }
  showToast('Report confirmed — asante!', 'success');
}

function sharePost(postId) {
  if (navigator.share) {
    navigator.share({ title: 'The Samaritan — Civic Report', url: window.location.href }).catch(function() {});
  } else {
    showToast('Share link copied!', 'success');
  }
}

function loadMorePosts() {
  if (State.extraPostsLoaded) return;
  State.extraPostsLoaded = true;
  var container = document.getElementById('feed-container');
  EXTRA_POSTS.forEach(function(post, i) { container.appendChild(buildCard(post, i)); });
  var btn = document.getElementById('load-more-btn');
  btn.textContent = 'All reports loaded';
  btn.disabled    = true;
  showToast('Loaded more reports', 'success');
}

document.getElementById('filter-bar').addEventListener('click', function(e) {
  var chip = e.target.closest('.trend-chip');
  if (!chip) return;
  document.querySelectorAll('.trend-chip').forEach(function(c) { c.classList.remove('active'); });
  chip.classList.add('active');
  loadFeed(chip.dataset.filter);
});

/* ──────────────────────────────────────────────────────────
   REPORT — MINI MAP (interactive pin)
   User taps map to set exact report location.
   Opens already centred on user's real GPS position.
────────────────────────────────────────────────────────── */
function initReportMap() {
  if (!window.L) return;

  var centerLat = State.userLat || -1.2921;
  var centerLng = State.userLng || 36.8219;

  State.reportMapInstance = L.map('report-map', { zoomControl: true }).setView([centerLat, centerLng], 14);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CartoDB',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(State.reportMapInstance);

  if (State.userLat) placeReportPin(State.userLat, State.userLng, State.userPlace);

  // Tap to repin
  State.reportMapInstance.on('click', function(e) {
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;
    placeReportPin(lat, lng, 'Locating…');
    reverseGeocode(lat, lng, function(place) {
      State.reportLat   = lat;
      State.reportLng   = lng;
      State.reportPlace = place;
      placeReportPin(lat, lng, place);
      updateReportLocationUI(place, lat, lng);
      showToast('📍 Pin set: ' + place, 'success');
    });
  });

  setTimeout(function() { State.reportMapInstance.invalidateSize(); }, 150);
}

function placeReportPin(lat, lng, label) {
  if (!State.reportMapInstance) return;
  if (State.reportPinMarker) State.reportMapInstance.removeLayer(State.reportPinMarker);

  var icon = L.divIcon({
    html: '<div style="display:flex;flex-direction:column;align-items:center;">' +
          '<div style="width:30px;height:30px;background:#ff7a00;border-radius:50% 50% 50% 0;' +
          'transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 0 14px rgba(255,122,0,0.8);"></div></div>',
    className: '', iconSize: [30, 40], iconAnchor: [15, 40],
  });

  State.reportPinMarker = L.marker([lat, lng], { icon })
    .addTo(State.reportMapInstance)
    .bindPopup('<b style="color:#ff7a00">Report Pin</b><br><small>' + escapeHtml(label) + '</small>')
    .openPopup();
}

/* ──────────────────────────────────────────────────────────
   REPORT FORM
────────────────────────────────────────────────────────── */
document.getElementById('cat-grid').addEventListener('click', function(e) {
  var chip = e.target.closest('.cat-chip');
  if (!chip) return;
  document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('selected'); });
  chip.classList.add('selected');
  State.selectedCategory = chip.dataset.cat;
});

document.getElementById('file-upload').addEventListener('change', function() {
  if (!this.files.length) return;
  var file = this.files[0];
  document.getElementById('upload-icon').textContent  = file.type.startsWith('video/') ? '🎥' : '🖼️';
  document.getElementById('upload-label').textContent = file.name;
  document.getElementById('upload-zone').classList.add('has-file');
  showToast('Media attached: ' + file.name, 'success');
});

// Tap location strip → re-grab fresh GPS
document.getElementById('location-strip').addEventListener('click', function() {
  if (!navigator.geolocation) { showToast('GPS not supported', 'warning'); return; }

  document.getElementById('location-text').textContent = 'Acquiring GPS…';
  document.getElementById('location-strip').classList.remove('captured');

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      reverseGeocode(lat, lng, function(place) {
        State.reportLat   = lat;
        State.reportLng   = lng;
        State.reportPlace = place;
        updateReportLocationUI(place, lat, lng);
        if (State.reportMapInstance) {
          State.reportMapInstance.setView([lat, lng], 15);
          placeReportPin(lat, lng, place);
        }
        showToast('📍 Location refreshed: ' + place, 'success');
      });
    },
    function() { showToast('GPS failed — tap the map to pin manually', 'warning'); },
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

/* ──────────────────────────────────────────────────────────
   submitReport()
   [FIREBASE] db.collection('reports').add({ ... })
              + Storage.ref().put(file) for media
────────────────────────────────────────────────────────── */
document.getElementById('submit-report-btn').addEventListener('click', submitReport);

function submitReport() {
  var desc = document.getElementById('report-desc').value.trim();
  var name = document.getElementById('reporter-name').value.trim();

  if (!State.selectedCategory) { showToast('Please select a category', 'warning'); return; }
  if (!desc)                    { showToast('Please add a description', 'warning'); return; }
  if (!State.reportLat)         { showToast('Please set a location on the map', 'warning'); return; }

  document.getElementById('submit-success').classList.add('show');

  var catIcons = { corruption:'💰', abandoned:'🏗️', environment:'🌿', safety:'⚠️', public:'🏛️', other:'📋' };

  var newPost = {
    id:           Date.now(),
    category:     State.selectedCategory,
    title:        name ? 'Report by ' + name : 'Community Report',
    desc:         desc,
    location:     State.reportPlace || (State.reportLat.toFixed(4) + ', ' + State.reportLng.toFixed(4)),
    time:         'Just now',
    confirmations: 0,
    icon:         catIcons[State.selectedCategory] || '📋',
    lat:          State.reportLat,
    lng:          State.reportLng,
  };

  POSTS.unshift(newPost);
  if (State.mapInstance && newPost.lat) addMapMarker(newPost);

  setTimeout(function() {
    document.getElementById('submit-success').classList.remove('show');
    switchPage('feed');
    loadFeed('all');
    resetReportForm();
  }, 2200);
}

function resetReportForm() {
  State.selectedCategory = null;
  document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('selected'); });
  document.getElementById('report-desc').value   = '';
  document.getElementById('reporter-name').value = '';
  document.getElementById('upload-icon').textContent   = '📎';
  document.getElementById('upload-label').textContent  = 'Tap to attach photo or video';
  document.getElementById('upload-zone').classList.remove('has-file');
  document.querySelectorAll('.trend-chip').forEach(function(c) { c.classList.remove('active'); });
  document.querySelector('.trend-chip[data-filter="all"]').classList.add('active');
}

/* ──────────────────────────────────────────────────────────
   SOS
   Always grabs live GPS — refuses to send without it
   [FIREBASE] db.collection('sos_alerts').add({ ... })
────────────────────────────────────────────────────────── */
function openSOSModal(type) {
  State.sosType = type || 'General Emergency';
  document.getElementById('sos-type-display').textContent =
    (type ? type + ' — ' : '') + 'Your live GPS location will be broadcast to the community.';
  document.getElementById('modal-loc-text').textContent = '📡 Acquiring live GPS…';
  document.getElementById('sos-modal').classList.add('open');

  if (!navigator.geolocation) {
    document.getElementById('modal-loc-text').textContent = 'GPS unavailable on this device';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      State.sosLat = pos.coords.latitude;
      State.sosLng = pos.coords.longitude;
      reverseGeocode(State.sosLat, State.sosLng, function(place) {
        State.sosPlace = place;
        document.getElementById('modal-loc-text').textContent =
          place + ' (' + State.sosLat.toFixed(5) + ', ' + State.sosLng.toFixed(5) + ')';
        document.getElementById('sos-loc-display').textContent =
          place + ' · ' + State.sosLat.toFixed(5) + ', ' + State.sosLng.toFixed(5);
      });
    },
    function() {
      // Do NOT silently fall back — user must enable GPS for SOS
      State.sosLat  = null;
      State.sosLng  = null;
      State.sosPlace = null;
      document.getElementById('modal-loc-text').textContent =
        '⚠️ GPS denied — enable location for SOS to work';
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function closeSOSModal() {
  document.getElementById('sos-modal').classList.remove('open');
}

function triggerSOS() {
  if (!State.sosLat) {
    showToast('⚠️ Enable GPS before sending SOS', 'danger');
    return;
  }

  closeSOSModal();
  document.getElementById('sos-status').textContent = '🔴 ALERT SENT — Emergency broadcast active';
  showToast('🚨 Emergency SOS broadcast sent!', 'danger');

  var locationLabel = State.sosPlace
    ? State.sosPlace + ' (' + State.sosLat.toFixed(4) + ', ' + State.sosLng.toFixed(4) + ')'
    : State.sosLat.toFixed(4) + ', ' + State.sosLng.toFixed(4);

  var sosPost = {
    id:           Date.now(),
    category:     'safety',
    title:        '🚨 EMERGENCY SOS — ' + (State.sosType || 'General'),
    desc:         'Emergency alert triggered at ' + locationLabel + '. Community response requested.',
    location:     State.sosPlace || locationLabel,
    time:         'Just now',
    confirmations: 0,
    icon:         '🚨',
    lat:          State.sosLat,
    lng:          State.sosLng,
  };

  POSTS.unshift(sosPost);
  if (State.mapInstance) addMapMarker(sosPost);
}

/* ──────────────────────────────────────────────────────────
   CIVIC MAP
   Centers on user's real GPS, shows user marker + all reports
   [FIREBASE] Load markers from Firestore
────────────────────────────────────────────────────────── */
var CAT_COLORS = {
  corruption:'#ff6666', abandoned:'#ffcc44', environment:'#44dd88',
  safety:'#ff9944', public:'#66aaff', other:'#aaaaaa',
};

function initCivicMap() {
  if (!window.L) { showToast('Map library not loaded', 'warning'); return; }

  var centerLat = State.userLat || -1.2921;
  var centerLng = State.userLng || 36.8219;

  State.mapInstance = L.map('leaflet-map', { zoomControl: false }).setView([centerLat, centerLng], 11);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> © <a href="https://carto.com">CartoDB</a>',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(State.mapInstance);

  L.control.zoom({ position: 'topright' }).addTo(State.mapInstance);

  if (State.userLat) placeUserMarker(State.userLat, State.userLng);

  POSTS.concat(EXTRA_POSTS).forEach(addMapMarker);

  var statEl = document.getElementById('map-stat-active');
  if (statEl) statEl.textContent = POSTS.length;
  var locEl = document.getElementById('map-user-loc');
  if (locEl) locEl.textContent = State.userPlace || 'Detecting…';
}

function placeUserMarker(lat, lng) {
  if (!State.mapInstance) return;
  if (State.userMarker) State.mapInstance.removeLayer(State.userMarker);

  var icon = L.divIcon({
    html: '<div style="width:18px;height:18px;background:#3399ff;border-radius:50%;' +
          'border:3px solid #fff;box-shadow:0 0 0 6px rgba(51,153,255,0.25);"></div>',
    className: '', iconSize: [18, 18], iconAnchor: [9, 9],
  });

  State.userMarker = L.marker([lat, lng], { icon })
    .addTo(State.mapInstance)
    .bindPopup('<b style="color:#3399ff">📍 You are here</b><br><small>' + (State.userPlace || '') + '</small>')
    .openPopup();
}

function addMapMarker(post) {
  if (!State.mapInstance || !post.lat || !post.lng) return;
  var color = CAT_COLORS[post.category] || '#ffffff';

  var icon = L.divIcon({
    html: '<div style="width:28px;height:28px;background:' + color + ';border-radius:50%;' +
          'border:3px solid #0a0a0a;display:flex;align-items:center;justify-content:center;' +
          'font-size:12px;box-shadow:0 0 10px ' + color + '88;">' + post.icon + '</div>',
    className: '', iconSize: [28, 28], iconAnchor: [14, 14],
  });

  L.marker([post.lat, post.lng], { icon })
    .addTo(State.mapInstance)
    .bindPopup('<b style="color:#ff7a00">' + post.title + '</b><br>' +
               '<small style="color:#999">📍 ' + post.location + '</small><br>' +
               '<small>✅ ' + post.confirmations + ' confirmations</small>');
}

/* ──────────────────────────────────────────────────────────
   TOAST
────────────────────────────────────────────────────────── */
var _toastTimer;
function showToast(msg, type) {
  var toast = document.getElementById('toast');
  clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.className   = 'show ' + (type || '');
  _toastTimer = setTimeout(function() { toast.className = ''; }, 3000);
}

/* ──────────────────────────────────────────────────────────
   UTILITY
────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/* ──────────────────────────────────────────────────────────
   EVENT BINDINGS
────────────────────────────────────────────────────────── */
document.getElementById('bottom-nav').addEventListener('click', function(e) {
  var btn = e.target.closest('.nav-item');
  if (btn && btn.dataset.page) switchPage(btn.dataset.page);
});

document.getElementById('load-more-btn').addEventListener('click', loadMorePosts);
document.getElementById('sos-fab').addEventListener('click', function() { openSOSModal(); });
document.getElementById('sos-hero-btn').addEventListener('click', function() { openSOSModal(); });

document.querySelectorAll('.sos-type-card').forEach(function(card) {
  card.addEventListener('click', function() { openSOSModal(this.dataset.type); });
});

document.getElementById('sos-confirm-btn').addEventListener('click', triggerSOS);
document.getElementById('sos-cancel-btn').addEventListener('click', closeSOSModal);
document.getElementById('sos-modal').addEventListener('click', function(e) {
  if (e.target === this) closeSOSModal();
});

document.getElementById('notif-btn').addEventListener('click', function() {
  showToast('3 new reports near you', 'warning');
});
document.getElementById('profile-btn').addEventListener('click', function() {
  showToast('Profile — coming in next release', 'warning');
});

/* ──────────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  loadFeed('all');
  detectUserLocation();  // ← immediately requests GPS on load
});
