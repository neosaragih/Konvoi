package com.konvoi

import android.annotation.SuppressLint
import android.graphics.Color
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class KonvoiMapViewManager : SimpleViewManager<WebView>() {

    override fun getName(): String = "KonvoiMapView"

    @SuppressLint("SetJavaScriptEnabled")
    override fun createViewInstance(context: ThemedReactContext): WebView {
        return WebView(context).apply {
            setBackgroundColor(Color.parseColor("#f8fafc"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.builtInZoomControls = false
            settings.displayZoomControls = false

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return false
                }
            }

            loadDataWithBaseURL(
                "https://konvoi.local",
                MAP_HTML,
                "text/html",
                "UTF-8",
                null
            )
        }
    }

    @ReactProp(name = "markersJson")
    fun setMarkersJson(view: WebView, markersJson: String?) {
        if (markersJson == null) return
        val js = "if (window.updateMarkers) { window.updateMarkers($markersJson); }"
        view.post {
            view.evaluateJavascript(js, null)
        }
    }

    @ReactProp(name = "centerJson")
    fun setCenterJson(view: WebView, centerJson: String?) {
        if (centerJson == null) return
        val js = "if (window.setCenter) { window.setCenter($centerJson); }"
        view.post {
            view.evaluateJavascript(js, null)
        }
    }

    companion object {
        const val MAP_HTML = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #map {
      width: 100%; height: 100%;
      background: #f1f5f9; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Roboto', 'Segoe UI', sans-serif;
    }
    .leaflet-container { background: #e2e8f0 !important; font-family: inherit; }

    /* Google Maps style pulsating user dot */
    .user-location-marker {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-dot-pulse {
      position: absolute;
      width: 38px;
      height: 38px;
      background: rgba(26, 115, 232, 0.25);
      border-radius: 50%;
      animation: gmaps-pulse 2s infinite ease-out;
    }
    .user-dot-core {
      position: relative;
      width: 18px;
      height: 18px;
      background: #1a73e8;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      z-index: 2;
    }
    .user-heading-beam {
      position: absolute;
      top: -16px;
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 16px solid rgba(26, 115, 232, 0.45);
      z-index: 1;
    }
    @keyframes gmaps-pulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    /* Google Maps style rider chip marker */
    .rider-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translateY(-8px);
    }
    .rider-chip {
      background: #ffffff;
      color: #1e293b;
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 11px;
      font-weight: 700;
      box-shadow: 0 3px 10px rgba(0,0,0,0.22);
      border: 1.5px solid #0284c7;
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .rider-chip.self {
      border-color: #1a73e8;
      color: #1a73e8;
    }
    .rider-chip-pin {
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 6px solid #0284c7;
      margin-top: -1px;
    }
    .rider-chip.self + .rider-chip-pin {
      border-top-color: #1a73e8;
    }

    /* Google Maps style Floating Controls */
    .gmaps-controls {
      position: absolute;
      right: 14px;
      bottom: 24px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .gmaps-fab {
      width: 44px;
      height: 44px;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #3b82f6;
      font-size: 20px;
      cursor: pointer;
      outline: none;
      transition: background 0.2s, transform 0.1s;
    }
    .gmaps-fab:active {
      transform: scale(0.92);
      background: #f1f5f9;
    }

    .leaflet-control-attribution {
      background: rgba(255, 255, 255, 0.8) !important;
      color: #64748b !important;
      font-size: 9px !important;
      padding: 2px 6px !important;
      border-radius: 4px !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="gmaps-controls">
    <button class="gmaps-fab" id="recenterBtn" title="Lokasi Saya" onclick="recenterSelf()" aria-label="Lokasi Saya">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="7"/>
        <line x1="12" y1="1" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="23"/>
        <line x1="1" y1="12" x2="4" y2="12"/>
        <line x1="20" y1="12" x2="23" y2="12"/>
      </svg>
    </button>
    <button class="gmaps-fab" id="fitAllBtn" title="Semua Pengendara" onclick="fitAllRiders()" aria-label="Semua Pengendara">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    </button>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = null;
    var markersMap = {};
    var circlesMap = {};
    var isInitialized = false;
    var latestMarkers = [];
    var selfCoordinates = null;

    function init() {
      if (typeof L === 'undefined') {
        setTimeout(init, 200);
        return;
      }

      // Initialize map with Google Maps style default center
      map = L.map('map', {
        zoomControl: false,
        attributionControl: true
      }).setView([-6.2088, 106.8456], 15);

      // CartoDB Voyager tiles (OpenStreetMap data with clean, crisp Google Maps appearance)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
      }).addTo(map);

      isInitialized = true;
      if (window._pendingMarkers) {
        window.updateMarkers(window._pendingMarkers);
        window._pendingMarkers = null;
      }
      if (window._pendingCenter) {
        window.setCenter(window._pendingCenter);
        window._pendingCenter = null;
      }
    }

    window.updateMarkers = function(list) {
      if (!isInitialized || !map) {
        window._pendingMarkers = list;
        return;
      }
      if (!Array.isArray(list)) return;
      latestMarkers = list;

      var currentIds = {};
      var bounds = [];

      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (!item || typeof item.lat !== 'number' || typeof item.lon !== 'number') continue;
        currentIds[item.id] = true;
        var lat = item.lat;
        var lon = item.lon;
        bounds.push([lat, lon]);

        var isSelf = !!item.isSelf;
        if (isSelf) {
          selfCoordinates = [lat, lon];
        }
        var name = item.name || (isSelf ? 'Anda' : 'Pengendara');
        var speedText = typeof item.speed === 'number' && item.speed > 0
          ? ' ' + Math.round(item.speed * 3.6) + ' km/j'
          : '';

        var html = '';
        if (isSelf) {
          html = '<div class="user-location-marker">' +
                   '<div class="user-dot-pulse"></div>' +
                   '<div class="user-dot-core"></div>' +
                 '</div>';
        } else {
          html = '<div class="rider-marker">' +
                   '<div class="rider-chip">' +
                     '<span>' + name + speedText + '</span>' +
                   '</div>' +
                   '<div class="rider-chip-pin"></div>' +
                 '</div>';
        }

        var icon = L.divIcon({
          html: html,
          className: '',
          iconSize: isSelf ? [40, 40] : [100, 40],
          iconAnchor: isSelf ? [20, 20] : [50, 36]
        });

        if (markersMap[item.id]) {
          markersMap[item.id].setLatLng([lat, lon]);
          markersMap[item.id].setIcon(icon);
          if (circlesMap[item.id]) {
            circlesMap[item.id].setLatLng([lat, lon]);
            circlesMap[item.id].setRadius(item.accuracy || 12);
          }
        } else {
          var marker = L.marker([lat, lon], { icon: icon }).addTo(map);
          var circle = L.circle([lat, lon], {
            radius: item.accuracy || 12,
            color: isSelf ? '#1a73e8' : '#0284c7',
            fillColor: isSelf ? '#1a73e8' : '#0284c7',
            fillOpacity: 0.12,
            weight: 1
          }).addTo(map);

          markersMap[item.id] = marker;
          circlesMap[item.id] = circle;
        }
      }

      for (var id in markersMap) {
        if (!currentIds[id]) {
          map.removeLayer(markersMap[id]);
          map.removeLayer(circlesMap[id]);
          delete markersMap[id];
          delete circlesMap[id];
        }
      }

      if (bounds.length > 0 && !window._hasFitted) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
        window._hasFitted = true;
      }
    };

    function recenterSelf() {
      if (!map || !selfCoordinates) return;
      map.flyTo(selfCoordinates, 16, { animate: true, duration: 1.2 });
    }

    function fitAllRiders() {
      if (!map || latestMarkers.length === 0) return;
      var bounds = [];
      for (var i = 0; i < latestMarkers.length; i++) {
        var m = latestMarkers[i];
        if (m && typeof m.lat === 'number' && typeof m.lon === 'number') {
          bounds.push([m.lat, m.lon]);
        }
      }
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
      }
    }

    window.setCenter = function(data) {
      if (!isInitialized || !map) {
        window._pendingCenter = data;
        return;
      }
      if (data && typeof data.lat === 'number' && typeof data.lon === 'number') {
        map.flyTo([data.lat, data.lon], data.zoom || 16, { animate: true });
      }
    };

    window.onload = init;
  </script>
</body>
</html>
"""
    }
}
