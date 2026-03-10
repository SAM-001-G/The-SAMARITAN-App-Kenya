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
        const a = data.address ||