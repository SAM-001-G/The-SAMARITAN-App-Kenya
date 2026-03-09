/* ═══════════════════════════════════════════════════════════
   SAMARITAN — app.js
   Community-Powered Civic Platform

   Architecture:
   - Fully functional static frontend (GitHub Pages ready)
   - All Firebase integration points marked [FIREBASE]
   - Functions: loadFeed(), submitReport(), triggerSOS(),
                updateConfirmation(), initMap()

   Firebase integration path:
   1. Add firebase SDK scripts to index.html
   2. Replace [FIREBASE] stubs with real SDK calls
   3. Deploy → real-time data flows automatically
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────── */
const State = {
  currentFilter:    'all',
  confirmedPosts:   new Set(),
  capturedLocation: null,
  selectedCategory: null,
  sosType:          null,
  sosLat:           null,
  sosLng:           null,
  mapInstance:      null,
  extraPostsLoaded: false,
};

/* ──────────────────────────────────────────────────────────
   SAMPLE DATA
   [FIREBASE] Replace with: db.collection('reports')
              .orderBy('timestamp','desc').onSnapshot(...)
────────────────────────────────────────────────────────── */
const POSTS = [
  {
    id: 1, category: 'corruption',
    title: 'Tender fraud at Jozi Water Board',
    desc: 'Contractor awarded R4.2M tender without public process. Third time same company selected — suspected kickbacks.',
    location: 'Braamfontein, Johannesburg', time: '12 min ago',
    confirmations: 47, icon: '💰', lat: -26.193, lng: 28.043,
  },
  {
    id: 2, category: 'abandoned',
    title: 'Half-built clinic abandoned for 3 years',
    desc: 'Construction halted after alleged funds were diverted. Community has no health facility within 15km.',
    location: 'Diepsloot Extension 2', time: '38 min ago',
    confirmations: 89, icon: '🏗️', lat: -25.944, lng: 28.013,
  },
  {
    id: 3, category: 'environment',
    title: 'Illegal dumping — chemical waste near school',
    desc: 'Unidentified drums spotted 200m from Riverside Primary. Strong chemical odour reported by residents.',
    location: 'Vosloorus, Ekurhuleni', time: '1 hr ago',
    confirmations: 133, icon: '🌿', lat: -26.352, lng: 28.19,
  },
  {
    id: 4, category: 'safety',
    title: 'Broken traffic lights — major intersection',
    desc: 'N1/Bram Fischer junction lights out for 6 days. Two accidents reported. Municipality unresponsive.',
    location: 'Randburg', time: '2 hrs ago',
    confirmations: 62, icon: '⚠️', lat: -26.076, lng: 27.989,
  },
  {
    id: 5, category: 'public',
    title: 'Home Affairs office closed — no notice',
    desc: 'Residents arrived for ID appointments to find office locked. No official communication or rescheduling.',
    location: 'Soshanguve, Pretoria', time: '3 hrs ago',
    confirmations: 28, icon: '🏛️', lat: -25.518, lng: 28.093,
  },
  {
    id: 6, category: 'corruption',
    title: 'Ghost employees on municipal payroll',
    desc: 'Source confirms 14 names receiving salaries for non-existent roles. Audit committee has been notified.',
    location: 'Tshwane Metro', time: '5 hrs ago',
    confirmations: 211, icon: '💰', lat: -25.746, lng: 28.188,
  },
  {
    id: 7, category: 'environment',
    title: 'River polluted with sewage overflow',
    desc: 'Jukskei River running black near Alex. Broken sewer pipe reported weeks ago — zero municipal response.',
    location: 'Alexandra Township', time: '6 hrs ago',
    confirmations: 97, icon: '🌿', lat: -26.1, lng: 28.107,
  },
  {
    id: 8, category: 'safety',
    title: 'Street lights out — entire block for 2 months',
    desc: 'Residents feel unsafe at night. Multiple muggings since outage began. Log number given, no follow-up.',
    location: 'Meadowlands, Soweto', time: '8 hrs ago',
    confirmations: 55, icon: '⚠️', lat: -26.244, lng: 27.891,
  },
];

const EXTRA_POSTS = [
  {
    id: 9, category: 'public',
    title: 'RDP houses allocated to non-qualifying residents',
    desc: 'Beneficiary list manipulated — families with properties receiving government houses while poor wait 15+ years.',
    location: 'Cosmo City, Johannesburg', time: '9 hrs ago',
    confirmations: 174, icon: '🏛️', lat: -26.022, lng: 27.943,
  },
  {
    id: 10, category: 'abandoned',
    title: 'Water pipeline — R12M spent, 0% complete',
    desc: 'Contractor paid in full but site shows no work done. Community still using borehole contaminated by livestock.',
    location: 'Limpopo Province', time: '1 day ago',
    confirmations: 302, icon: '🏗️', lat: -23.5, lng: 29.5,
  },
];

/* ──────────────────────────────────────────────────────────
   NAVIGATION
────────────────────────────────────────────────────────── */
function switchPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + pageName);
  const navBtn = document.querySelector(`.nav-item[data-page="${pageName}"]`);

  if (page)   page.classList.add('active');
  if (navBtn) navBtn.classList.add('active');

  // Lazy-init map only when Map tab is opened
  if (pageName === 'map' && !State.mapInstance) {
    initMap();
  }
}

/* ──────────────────────────────────────────────────────────
   FEED — loadFeed()
   [FIREBASE] Replace POSTS array with Firestore snapshot:
   db.collection('reports')
     .orderBy('timestamp', 'desc')
     .onSnapshot(snapshot => {
       const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
       renderFeed(posts, State.currentFilter);
     });
────────────────────────────────────────────────────────── */
function loadFeed(filter) {
  filter = filter || State.currentFilter;
  State.currentFilter = filter;

  const container = document.getElementById('feed-container');
  container.innerHTML = '';

  const filtered = filter === 'all'
    ? POSTS
    : POSTS.filter(p => p.category === filter);

  // Update counters
  document.getElementById('feed-count').textContent  = filtered.length + ' reports';
  document.getElementById('stat-total').textContent   = POSTS.length + EXTRA_POSTS.length;
  document.getElementById('stat-today').textContent   = 5;
  document.getElementById('stat-verified').textContent = 3;

  filtered.forEach((post, i) => {
    const card = buildCard(post, i);
    container.appendChild(card);
  });
}

/* ──────────────────────────────────────────────────────────
   BUILD CARD DOM ELEMENT
────────────────────────────────────────────────────────── */
function buildCard(post, delay) {
  delay = delay || 0;
  const isConfirmed = State.confirmedPosts.has(post.id);

  const card = document.createElement('article');
  card.className = 'card';
  card.style.animationDelay = (delay * 75) + 'ms';
  card.dataset.id = post.id;

  card.innerHTML = `
    <div class="card-img-placeholder" role="img" aria-label="${post.category} report">
      <span style="font-size:50px" aria-hidden="true">${post.icon}</span>
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span class="badge badge-${post.category}" role="status">${post.category.toUpperCase()}</span>
        <span class="card-time" aria-label="Posted ${post.time}">⏱ ${post.time}</span>
      </div>
      <h3 class="card-title">${escapeHtml(post.title)}</h3>
      <p class="card-desc">${escapeHtml(post.desc)}</p>
      <div class="card-location" aria-label="Location: ${post.location}">📍 ${escapeHtml(post.location)}</div>
      <div class="card-footer">
        <button
          class="confirm-btn${isConfirmed ? ' confirmed' : ''}"
          data-id="${post.id}"
          aria-label="${isConfirmed ? 'Already confirmed' : 'Confirm this report'}"
        >
          ${isConfirmed ? '✅' : '👍'} ${isConfirmed ? 'Confirmed' : 'Confirm'}
        </button>
        <span class="confirm-count" id="conf-${post.id}" aria-live="polite">${post.confirmations} confirmations</span>
        <button class="share-btn" data-id="${post.id}" aria-label="Share report" title="Share">↗</button>
      </div>
    </div>
  `;

  return card;
}

/* ──────────────────────────────────────────────────────────
   FEED — delegated event handling (confirm + share)
────────────────────────────────────────────────────────── */
document.getElementById('feed-container').addEventListener('click', function(e) {
  const confirmBtn = e.target.closest('.confirm-btn');
  const shareBtn   = e.target.closest('.share-btn');

  if (confirmBtn) updateConfirmation(Number(confirmBtn.dataset.id), confirmBtn);
  if (shareBtn)   sharePost(Number(shareBtn.dataset.id));
});

/* ──────────────────────────────────────────────────────────
   updateConfirmation()
   [FIREBASE] Replace with Firestore increment:
   db.collection('reports').doc(postId.toString())
     .update({ confirmations: firebase.firestore.FieldValue.increment(1) });
────────────────────────────────────────────────────────── */
function updateConfirmation(postId, btn) {
  if (State.confirmedPosts.has(postId)) {
    showToast('Already confirmed this report', 'warning');
    return;
  }

  State.confirmedPosts.add(postId);
  btn.classList.add('confirmed');
  btn.innerHTML = '✅ Confirmed';
  btn.setAttribute('aria-label', 'Already confirmed');

  const post = [...POSTS, ...EXTRA_POSTS].find(p => p.id === postId);
  if (post) {
    post.confirmations++;
    const countEl = document.getElementById('conf-' + postId);
    if (countEl) countEl.textContent = post.confirmations + ' confirmations';
  }

  showToast('Report confirmed — thank you!', 'success');
}

function sharePost(postId) {
  // [FIREBASE] Could use dynamic links / share API
  if (navigator.share) {
    navigator.share({
      title: 'The Samaritan — Civic Report',
      text:  'A community report has been filed on The Samaritan platform.',
      url:   window.location.href,
    }).catch(() => {});
  } else {
    showToast('Share link copied!', 'success');
  }
}

/* ──────────────────────────────────────────────────────────
   LOAD MORE
   [FIREBASE] Replace with pagination cursor / next page query
────────────────────────────────────────────────────────── */
function loadMorePosts() {
  if (State.extraPostsLoaded) return;
  State.extraPostsLoaded = true;

  const container = document.getElementById('feed-container');
  EXTRA_POSTS.forEach((post, i) => {
    const card = buildCard(post, i);
    container.appendChild(card);
  });

  const btn = document.getElementById('load-more-btn');
  btn.textContent = 'All reports loaded';
  btn.disabled    = true;

  showToast('Loaded more reports', 'success');
}

/* ──────────────────────────────────────────────────────────
   FILTER BAR
────────────────────────────────────────────────────────── */
document.getElementById('filter-bar').addEventListener('click', function(e) {
  const chip = e.target.closest('.trend-chip');
  if (!chip) return;

  document.querySelectorAll('.trend-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  loadFeed(chip.dataset.filter);
});

/* ──────────────────────────────────────────────────────────
   REPORT — category selection
────────────────────────────────────────────────────────── */
document.getElementById('cat-grid').addEventListener('click', function(e) {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;

  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');
  State.selectedCategory = chip.dataset.cat;
});

/* ──────────────────────────────────────────────────────────
   REPORT — file upload
   [FIREBASE] Replace with Storage upload:
   const ref = firebase.storage().ref('reports/' + Date.now() + '_' + file.name);
   await ref.put(file);
   const url = await ref.getDownloadURL();
────────────────────────────────────────────────────────── */
document.getElementById('file-upload').addEventListener('change', function() {
  if (!this.files.length) return;

  const file = this.files[0];
  const isVideo = file.type.startsWith('video/');

  document.getElementById('upload-icon').textContent  = isVideo ? '🎥' : '🖼️';
  document.getElementById('upload-label').textContent = file.name;
  document.getElementById('upload-zone').classList.add('has-file');

  showToast('Media attached: ' + file.name, 'success');
});

/* ──────────────────────────────────────────────────────────
   REPORT — location capture
   [FIREBASE] Stored as firebase.firestore.GeoPoint(lat, lng)
────────────────────────────────────────────────────────── */
document.getElementById('location-strip').addEventListener('click', captureLocation);

function captureLocation() {
  const strip = document.getElementById('location-strip');
  const txt   = document.getElementById('location-text');

  txt.textContent = 'Acquiring GPS…';

  if (!navigator.geolocation) {
    txt.textContent = 'GPS not supported on this device';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      State.capturedLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      txt.textContent = `${State.capturedLocation.lat.toFixed(5)}, ${State.capturedLocation.lng.toFixed(5)}`;
      strip.classList.add('captured');
      showToast('Location captured!', 'success');
    },
    function() {
      // Fallback: approximate Johannesburg
      State.capturedLocation = { lat: -26.2041, lng: 28.0473 };
      txt.textContent = 'Approx. Johannesburg, ZA (GPS denied)';
      strip.classList.add('captured');
    }
  );
}

/* ──────────────────────────────────────────────────────────
   submitReport()
   [FIREBASE] Add to Firestore 'reports' collection:
   await db.collection('reports').add({
     category:    State.selectedCategory,
     description: desc,
     location:    new firebase.firestore.GeoPoint(lat, lng),
     reporter:    name || 'Anonymous',
     timestamp:   firebase.firestore.FieldValue.serverTimestamp(),
     confirmations: 0,
     mediaUrl:    fileUrl || null,
   });
────────────────────────────────────────────────────────── */
document.getElementById('submit-report-btn').addEventListener('click', submitReport);

function submitReport() {
  const desc = document.getElementById('report-desc').value.trim();
  const name = document.getElementById('reporter-name').value.trim();

  if (!State.selectedCategory) {
    showToast('Please select a category', 'warning');
    return;
  }
  if (!desc) {
    showToast('Please add a description', 'warning');
    return;
  }

  // Show success overlay
  const overlay = document.getElementById('submit-success');
  overlay.classList.add('show');

  // Inject new post into local feed simulation
  const catIcons = {
    corruption: '💰', abandoned: '🏗️', environment: '🌿',
    safety: '⚠️', public: '🏛️', other: '📋',
  };

  const newPost = {
    id:           Date.now(),
    category:     State.selectedCategory,
    title:        'New Community Report',
    desc:         desc,
    location:     State.capturedLocation
                    ? `${State.capturedLocation.lat.toFixed(3)}, ${State.capturedLocation.lng.toFixed(3)}`
                    : 'Location not captured',
    time:         'Just now',
    confirmations: 0,
    icon:         catIcons[State.selectedCategory] || '📋',
    lat:          State.capturedLocation ? State.capturedLocation.lat : null,
    lng:          State.capturedLocation ? State.capturedLocation.lng : null,
  };

  POSTS.unshift(newPost);

  // Redirect to feed after brief delay
  setTimeout(function() {
    overlay.classList.remove('show');

    // Switch to Feed page
    switchPage('feed');
    loadFeed('all');

    // Reset filter UI
    document.querySelectorAll('.trend-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.trend-chip[data-filter="all"]').classList.add('active');

    // Reset form
    State.selectedCategory  = null;
    State.capturedLocation  = null;
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
    document.getElementById('report-desc').value         = '';
    document.getElementById('reporter-name').value       = '';
    document.getElementById('location-text').textContent = 'Tap to capture your GPS location';
    document.getElementById('location-strip').classList.remove('captured');
    document.getElementById('upload-icon').textContent   = '📎';
    document.getElementById('upload-label').textContent  = 'Tap to attach photo or video';
    document.getElementById('upload-zone').classList.remove('has-file');
  }, 2200);
}

/* ──────────────────────────────────────────────────────────
   SOS — open/close modal
────────────────────────────────────────────────────────── */
function openSOSModal(type) {
  State.sosType = type || 'General Emergency';

  const modal = document.getElementById('sos-modal');
  const sub   = document.getElementById('sos-type-display');
  const locTxt = document.getElementById('modal-loc-text');

  sub.textContent  = (type ? type + ' — ' : '') + 'This will broadcast your location to the community.';
  locTxt.textContent = 'Acquiring coordinates…';
  modal.classList.add('open');

  // Acquire GPS for SOS
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        State.sosLat = pos.coords.latitude;
        State.sosLng = pos.coords.longitude;
        locTxt.textContent = `${State.sosLat.toFixed(5)}, ${State.sosLng.toFixed(5)}`;
        document.getElementById('sos-loc-display').textContent =
          `${State.sosLat.toFixed(5)}, ${State.sosLng.toFixed(5)}`;
      },
      function() {
        State.sosLat = -26.2041;
        State.sosLng = 28.0473;
        locTxt.textContent = 'Approx. Johannesburg, ZA';
      }
    );
  }
}

function closeSOSModal() {
  document.getElementById('sos-modal').classList.remove('open');
}

/* ──────────────────────────────────────────────────────────
   triggerSOS()
   [FIREBASE] Write to 'sos_alerts' collection:
   await db.collection('sos_alerts').add({
     type:      State.sosType,
     location:  new firebase.firestore.GeoPoint(State.sosLat, State.sosLng),
     timestamp: firebase.firestore.FieldValue.serverTimestamp(),
     resolved:  false,
   });
   // Also trigger Cloud Function for push notifications
────────────────────────────────────────────────────────── */
function triggerSOS() {
  closeSOSModal();

  document.getElementById('sos-status').textContent =
    '🔴 ALERT SENT — Emergency broadcast active';

  showToast('🚨 Emergency SOS broadcast sent!', 'danger');

  // Inject into feed as emergency post
  const sosPost = {
    id:           Date.now(),
    category:     'safety',
    title:        '🚨 EMERGENCY SOS — ' + (State.sosType || 'General'),
    desc:         'Emergency alert triggered. Community response requested. Location broadcast is active.',
    location:     State.sosLat
                    ? `${State.sosLat.toFixed(3)}, ${State.sosLng.toFixed(3)}`
                    : 'Johannesburg',
    time:         'Just now',
    confirmations: 0,
    icon:         '🚨',
    lat:          State.sosLat,
    lng:          State.sosLng,
  };

  POSTS.unshift(sosPost);
}

/* ──────────────────────────────────────────────────────────
   MAP — initMap()
   [FIREBASE] Replace marker data with Firestore query:
   db.collection('reports').get().then(snapshot => {
     snapshot.docs.forEach(doc => {
       const data = doc.data();
       if (data.location) addMarker(data.location.latitude, data.location.longitude, data);
     });
   });
────────────────────────────────────────────────────────── */
function initMap() {
  if (!window.L) {
    showToast('Map library not loaded', 'warning');
    return;
  }

  State.mapInstance = L.map('leaflet-map', { zoomControl: false })
    .setView([-26.2041, 28.0473], 10);

  // Dark CartoDB tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> © <a href="https://carto.com">CartoDB</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(State.mapInstance);

  L.control.zoom({ position: 'topright' }).addTo(State.mapInstance);

  const CAT_COLORS = {
    corruption:  '#ff6666',
    abandoned:   '#ffcc44',
    environment: '#44dd88',
    safety:      '#ff9944',
    public:      '#66aaff',
    other:       '#aaaaaa',
  };

  // Plot all posts with coordinates
  [...POSTS, ...EXTRA_POSTS].forEach(function(post) {
    if (!post.lat || !post.lng) return;

    const color = CAT_COLORS[post.category] || '#ffffff';

    const icon = L.divIcon({
      html: `<div style="
        width:28px;height:28px;
        background:${color};
        border-radius:50%;
        border:3px solid #0a0a0a;
        display:flex;align-items:center;justify-content:center;
        font-size:12px;
        box-shadow:0 0 10px ${color}88;
      ">${post.icon}</div>`,
      className:  '',
      iconSize:   [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker([post.lat, post.lng], { icon })
      .addTo(State.mapInstance)
      .bindPopup(`
        <b style="color:#ff7a00">${post.title}</b><br>
        <small style="color:#999">${post.location}</small><br>
        <small>✅ ${post.confirmations} confirmations</small>
      `);
  });
}

/* ──────────────────────────────────────────────────────────
   TOAST NOTIFICATIONS
────────────────────────────────────────────────────────── */
let _toastTimer;

function showToast(msg, type) {
  const toast = document.getElementById('toast');
  clearTimeout(_toastTimer);

  toast.textContent = msg;
  toast.className   = 'show ' + (type || '');

  _toastTimer = setTimeout(function() {
    toast.className = '';
  }, 2800);
}

/* ──────────────────────────────────────────────────────────
   UTILITY
────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ──────────────────────────────────────────────────────────
   EVENT BINDING
────────────────────────────────────────────────────────── */

// Bottom nav
document.getElementById('bottom-nav').addEventListener('click', function(e) {
  const btn = e.target.closest('.nav-item');
  if (btn && btn.dataset.page) switchPage(btn.dataset.page);
});

// Load more button
document.getElementById('load-more-btn').addEventListener('click', loadMorePosts);

// FAB SOS button
document.getElementById('sos-fab').addEventListener('click', function() {
  openSOSModal();
});

// SOS hero button (on SOS page)
document.getElementById('sos-hero-btn').addEventListener('click', function() {
  openSOSModal();
});

// SOS type cards
document.querySelectorAll('.sos-type-card').forEach(function(card) {
  card.addEventListener('click', function() {
    openSOSModal(this.dataset.type);
  });
});

// SOS modal confirm
document.getElementById('sos-confirm-btn').addEventListener('click', triggerSOS);

// SOS modal cancel
document.getElementById('sos-cancel-btn').addEventListener('click', closeSOSModal);

// SOS modal backdrop tap
document.getElementById('sos-modal').addEventListener('click', function(e) {
  if (e.target === this) closeSOSModal();
});

// Header notification button
document.getElementById('notif-btn').addEventListener('click', function() {
  showToast('3 new reports near you', 'warning');
});

// Header profile button
document.getElementById('profile-btn').addEventListener('click', function() {
  showToast('Profile — coming in next release', 'warning');
});

/* ──────────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  loadFeed('all');
});
