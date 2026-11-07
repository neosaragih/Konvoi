package com.konvoi

import android.annotation.SuppressLint
import android.graphics.Color
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * Offline relative-position map.
 *
 * Renders participants on a distance-scaled radar centered on the self marker
 * (or the group centroid). The HTML/JS is fully inline: no tile servers, no
 * CDN, no network access of any kind — Konvoi must keep working with Wi-Fi
 * isolation or no WAN at all.
 */
class KonvoiMapViewManager : SimpleViewManager<WebView>() {

    override fun getName(): String = "KonvoiMapView"

    @SuppressLint("SetJavaScriptEnabled")
    override fun createViewInstance(context: ThemedReactContext): WebView {
        return WebView(context).apply {
            setBackgroundColor(Color.parseColor("#0f172a"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    // Block all navigation: the radar is inline-only.
                    return true
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
        val js = "if (window.updateMarkers) { window.updateMarkers($markersJson); } else { window._pendingMarkers = $markersJson; }"
        view.post {
            view.evaluateJavascript(js, null)
        }
    }

    @ReactProp(name = "centerJson")
    fun setCenterJson(view: WebView, centerJson: String?) {
        if (centerJson == null) return
        val js = "if (window.setCenter) { window.setCenter($centerJson); } else { window._pendingCenter = $centerJson; }"
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
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #radar {
      width: 100%; height: 100%;
      background: #0f172a; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Roboto', 'Segoe UI', sans-serif;
      position: relative;
    }
    .ring {
      position: absolute; border-radius: 50%;
      border: 1px dashed rgba(148, 163, 184, 0.35);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .ring-label {
      position: absolute; transform: translate(-50%, -50%);
      color: rgba(148, 163, 184, 0.85);
      font-size: 10px; background: rgba(15, 23, 42, 0.8);
      padding: 1px 6px; border-radius: 8px;
      pointer-events: none; white-space: nowrap;
    }
    .crosshair {
      position: absolute; transform: translate(-50%, -50%);
      color: rgba(148, 163, 184, 0.4); font-size: 11px;
      pointer-events: none;
    }
    .title {
      position: absolute; top: 8px; left: 10px; z-index: 5;
      color: #38bdf8; font-size: 11px; font-weight: 700; letter-spacing: 1px;
    }
    .scale-note {
      position: absolute; top: 24px; left: 10px; z-index: 5;
      color: #64748b; font-size: 10px;
    }
    .empty {
      position: absolute; inset: 0; display: flex;
      align-items: center; justify-content: center;
      color: #64748b; font-size: 13px; text-align: center;
      padding: 24px;
    }
    .user-marker { position: absolute; transform: translate(-50%, -50%); z-index: 4; }
    .user-pulse {
      position: absolute; left: 50%; top: 50%;
      width: 40px; height: 40px; transform: translate(-50%, -50%);
      background: rgba(26, 115, 232, 0.25); border-radius: 50%;
      animation: pulse 2s infinite ease-out;
    }
    .user-core {
      position: relative; width: 16px; height: 16px;
      background: #1a73e8; border: 3px solid #ffffff; border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    @keyframes pulse {
      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
    }
    .rider { position: absolute; transform: translate(-50%, -50%); z-index: 3; }
    .rider-dot {
      width: 12px; height: 12px; margin: 0 auto;
      background: #0284c7; border: 2px solid #bae6fd; border-radius: 50%;
    }
    .rider-chip {
      margin-top: 4px; background: #ffffff; color: #1e293b;
      padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700;
      border: 1.5px solid #0284c7; white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .rider-meta {
      margin-top: 1px; text-align: center;
      color: #bae6fd; font-size: 9px; white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="radar">
    <div class="title">PETA RADAR OFFLINE</div>
    <div class="scale-note" id="scaleNote"></div>
    <div class="empty" id="empty">Belum ada koordinat GPS. Tekan "Mulai Berbagi Lokasi" untuk memancarkan posisi Anda.</div>
  </div>
  <script>
    var radar = document.getElementById('radar');
    var emptyNote = document.getElementById('empty');
    var scaleNote = document.getElementById('scaleNote');
    var latestMarkers = [];
    var M_PER_DEG_LAT = 111320.0;

    function metersPerDegLon(lat) {
      var c = Math.cos(lat * Math.PI / 180.0);
      return M_PER_DEG_LAT * Math.max(0.2, Math.min(1.0, c));
    }

    function niceRadius(m) {
      var steps = [100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 10000, 20000, 50000];
      for (var i = 0; i < steps.length; i++) {
        if (m <= steps[i]) return steps[i];
      }
      return Math.ceil(m / 50000) * 50000;
    }

    function formatMeters(m) {
      if (m < 1000) return Math.round(m) + ' m';
      return (m / 1000).toFixed(1) + ' km';
    }

    window.updateMarkers = function(list) {
      if (!Array.isArray(list)) return;
      latestMarkers = list;
      render();
    };

    window.setCenter = function() {
      // Centering is derived from markers on an offline radar; kept for the
      // bridge contract so the native side can call it safely.
    };

    function render() {
      radar.innerHTML = '';
      var title = document.createElement('div');
      title.className = 'title'; title.textContent = 'PETA RADAR OFFLINE';
      radar.appendChild(title);
      scaleNote = document.createElement('div');
      scaleNote.className = 'scale-note';
      radar.appendChild(scaleNote);

      var valid = [];
      for (var i = 0; i < latestMarkers.length; i++) {
        var m = latestMarkers[i];
        if (m && typeof m.lat === 'number' && typeof m.lon === 'number') valid.push(m);
      }
      if (valid.length === 0) {
        var note = document.createElement('div');
        note.className = 'empty';
        note.textContent = 'Belum ada koordinat GPS. Tekan "Mulai Berbagi Lokasi" untuk memancarkan posisi Anda.';
        radar.appendChild(note);
        return;
      }
      emptyNote = null;

      var self = null;
      var sumLat = 0, sumLon = 0;
      for (var j = 0; j < valid.length; j++) {
        sumLat += valid[j].lat; sumLon += valid[j].lon;
        if (valid[j].isSelf) self = valid[j];
      }
      var centerLat = self ? self.lat : sumLat / valid.length;
      var centerLon = self ? self.lon : sumLon / valid.length;
      var mPerDegLon = metersPerDegLon(centerLat);

      var maxDist = 0;
      for (var k = 0; k < valid.length; k++) {
        var d = Math.abs(valid[k].lat - centerLat) * M_PER_DEG_LAT +
                Math.abs(valid[k].lon - centerLon) * mPerDegLon;
        if (d > maxDist) maxDist = d;
      }
      var radiusM = niceRadius(maxDist * 1.35 + 40);
      var w = radar.clientWidth || 320;
      var h = radar.clientHeight || 320;
      var px = Math.min(w, h) / 2 - 26;
      var scale = px / radiusM;

      scaleNote.textContent = 'Cincin: ' + formatMeters(radiusM) + ' · skala relatif tanpa peta';

      for (var r = 1; r <= 2; r++) {
        var ring = document.createElement('div');
        var rpx = (radiusM * r / 2) * scale;
        ring.className = 'ring';
        ring.style.width = (rpx * 2) + 'px';
        ring.style.height = (rpx * 2) + 'px';
        ring.style.left = '50%';
        ring.style.top = '50%';
        radar.appendChild(ring);
        var label = document.createElement('div');
        label.className = 'ring-label';
        label.textContent = formatMeters(radiusM * r / 2);
        label.style.left = '50%';
        label.style.top = (h / 2 - rpx) + 'px';
        radar.appendChild(label);
      }
      var cross = document.createElement('div');
      cross.className = 'crosshair';
      cross.textContent = '+';
      cross.style.left = '50%';
      cross.style.top = '50%';
      radar.appendChild(cross);

      for (var n = 0; n < valid.length; n++) {
        var item = valid[n];
        var dx = (item.lon - centerLon) * mPerDegLon * scale;
        var dy = (item.lat - centerLat) * M_PER_DEG_LAT * scale;
        var x = w / 2 + dx;
        var y = h / 2 - dy;

        if (item.isSelf) {
          var um = document.createElement('div');
          um.className = 'user-marker';
          um.style.left = x + 'px';
          um.style.top = y + 'px';
          um.innerHTML = '<div class="user-pulse"></div><div class="user-core"></div>';
          radar.appendChild(um);
          continue;
        }

        var dist = Math.abs(item.lat - centerLat) * M_PER_DEG_LAT +
                   Math.abs(item.lon - centerLon) * mPerDegLon;
        var el = document.createElement('div');
        el.className = 'rider';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        var meta = formatMeters(dist) +
          (typeof item.speed === 'number' && item.speed > 0
            ? ' · ' + Math.round(item.speed * 3.6) + ' km/j' : '');
        el.innerHTML = '<div class="rider-dot"></div>' +
          '<div class="rider-chip"></div>' +
          '<div class="rider-meta"></div>';
        el.children[1].textContent = item.name || 'Pengendara';
        el.children[2].textContent = meta;
        radar.appendChild(el);
      }
    }

    window.addEventListener('resize', render);
    if (window._pendingMarkers) {
      var pending = window._pendingMarkers;
      window._pendingMarkers = null;
      window.updateMarkers(pending);
    }
  </script>
</body>
</html>
"""
    }
}
