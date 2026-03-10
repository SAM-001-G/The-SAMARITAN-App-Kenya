/* ═══════════════════════════════════════════════════════════
   SAMARITAN — app.js  (Kenya Edition)
   Community-Powered Civic Platform
   Fully DOM-ready + SOS 2-3 sec hold
══════════════════════════════════════════════════════════ */

'use strict';

document.addEventListener('DOMContentLoaded', function() {

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

    sosHoldTimer: null
  };

  /* ──────────────────────────────────────────────────────────
     KENYA SAMPLE DATA
  ────────────────────────────────────────────────────────── */
  const POSTS = [
    // ... your POSTS array from the previous code
  ];

  const EXTRA_POSTS = [
    // ... your EXTRA_POSTS array
  ];

  /* ──────────────────────────────────────────────────────────
     REVERSE GEOCODING
  ────────────────────────────────────────────────────────── */
  function reverseGeocode(lat, lng, callback) {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
      lat + '&lon=' + lng + '&zoom=14&addressdetails=1';

    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(r => r.json())
      .then(data => {
        const a = data.address || {};
        const parts = [
          a.suburb || a.neighbourhood || a.village || a.town || a.road,
          a.city || a.county || a.state_district,
        ].filter(Boolean);
        const place = parts.slice(0, 2).join(', ') ||
          (data.display_name || '').split(',').slice(0, 2).join(',').trim();
        callback(place || (lat.toFixed(4) + ', ' + lng.toFixed(4)));
      })
      .catch(() => callback(lat.toFixed(4) + ', ' + lng.toFixed(4)));
  }

  /* ──────────────────────────────────────────────────────────
     AUTO-DETECT USER LOCATION
  ────────────────────────────────────────────────────────── */
  function detectUserLocation() {
    if (!navigator.geolocation) {
      setKenyaDefaults();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        State.userLat = pos.coords.latitude;
        State.userLng = pos.coords.longitude;

        reverseGeocode(State.userLat, State.userLng, function(place) {
          State.userPlace   = place;
          State.reportLat   = State.userLat;
          State.reportLng   = State.userLng;
          State.reportPlace = place;

          // Update SOS and report location
          updateReportLocationUI(place, State.userLat, State.userLng);
          var el = document.getElementById('sos-loc-display');
          if (el) el.textContent = place + ' (' + State.userLat.toFixed(4) + ', ' + State.userLng.toFixed(4) + ')';
          showToast('📍 ' + place, 'success');
        });
      },
      () => {
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
  }

  function updateReportLocationUI(place, lat, lng) {
    var txt   = document.getElementById('location-text');
    var strip = document.getElementById('location-strip');
    if (!txt || !strip) return;
    txt.textContent = place + (lat ? ' (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')' : '');
    strip.classList.add('captured');
  }

  /* ──────────────────────────────────────────────────────────
     SOS BUTTON — HOLD TO CALL
  ────────────────────────────────────────────────────────── */
  const sosHeroBtns = document.querySelectorAll('.sos-hero-btn');
  sosHeroBtns.forEach(btn => {
    btn.addEventListener('mousedown', () => startHoldSOS());
    btn.addEventListener('touchstart', () => startHoldSOS());
    btn.addEventListener('mouseup', stopHoldSOS);
    btn.addEventListener('mouseleave', stopHoldSOS);
    btn.addEventListener('touchend', stopHoldSOS);
    btn.addEventListener('touchcancel', stopHoldSOS);
  });

  function startHoldSOS() {
    if (State.sosHoldTimer) return; // prevent multiple
    showToast('Hold for 2–3 seconds to trigger emergency call', 'info');
    State.sosHoldTimer = setTimeout(() => {
      triggerSOSCall();
      State.sosHoldTimer = null;
    }, 2500); // 2.5 seconds
  }

  function stopHoldSOS() {
    if (State.sosHoldTimer) {
      clearTimeout(State.sosHoldTimer);
      State.sosHoldTimer = null;
      showToast('SOS cancelled', 'warning');
    }
  }

  function triggerSOSCall() {
    const emergencyNumber = '999'; // replace if needed
    showToast('Calling emergency: ' + emergencyNumber, 'success');
    window.location.href = 'tel:' + emergencyNumber;
  }

  /* ──────────────────────────────────────────────────────────
     REST OF YOUR EXISTING FUNCTIONS
     feed, map, report form, submitReport, loadMorePosts, etc.
     Copy all remaining code from your previous app.js here
  ────────────────────────────────────────────────────────── */

  detectUserLocation();

});