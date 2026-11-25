package com.konvoi

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.net.Inet4Address
import java.net.NetworkInterface

class KonvoiLocationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LocationListener {

    private var locationManager: LocationManager? = null
    private var isListening = false
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun getName(): String = "KonvoiLocationModule"

    private fun getLocationManager(): LocationManager? {
        if (locationManager == null) {
            locationManager = reactContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        }
        return locationManager
    }

    @ReactMethod
    fun startLocationUpdates(minTimeMs: Double, minDistanceM: Double, promise: Promise) {
        mainHandler.post {
            try {
                val lm = getLocationManager()
                if (lm == null) {
                    promise.reject("NO_LOCATION_MANAGER", "LocationManager tidak tersedia.")
                    return@post
                }
                if (isListening) {
                    promise.resolve(true)
                    return@post
                }

                var registered = false
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        minTimeMs.toLong(),
                        minDistanceM.toFloat(),
                        this
                    )
                    registered = true
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        minTimeMs.toLong(),
                        minDistanceM.toFloat(),
                        this
                    )
                    registered = true
                }

                if (registered) {
                    isListening = true
                    val lastGps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    val lastNet = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                    val best = when {
                        lastGps != null && lastNet != null -> if (lastGps.time >= lastNet.time) lastGps else lastNet
                        lastGps != null -> lastGps
                        else -> lastNet
                    }
                    if (best != null) {
                        sendLocationEvent(best)
                    }
                    promise.resolve(true)
                } else {
                    promise.reject("GPS_DISABLED", "GPS atau penyedia lokasi dinonaktifkan di perangkat.")
                }
            } catch (e: SecurityException) {
                promise.reject("PERMISSION_DENIED", "Izin lokasi belum diberikan: ${e.message}")
            } catch (e: Exception) {
                promise.reject("LOCATION_ERROR", e.message ?: "Gagal memulai pembaruan GPS.")
            }
        }
    }

    @ReactMethod
    fun stopLocationUpdates(promise: Promise) {
        mainHandler.post {
            try {
                if (isListening) {
                    getLocationManager()?.removeUpdates(this)
                    isListening = false
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STOP_ERROR", e.message ?: "Gagal menghentikan pembaruan GPS.")
            }
        }
    }

    @ReactMethod
    fun setSpeakerphoneOn(enabled: Boolean, promise: Promise) {
        mainHandler.post {
            try {
                val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                if (audioManager != null) {
                    if (enabled) {
                        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                        audioManager.isSpeakerphoneOn = true
                    } else {
                        audioManager.isSpeakerphoneOn = false
                        audioManager.mode = AudioManager.MODE_NORMAL
                    }
                    promise.resolve(true)
                } else {
                    promise.reject("NO_AUDIO_MANAGER", "AudioManager tidak tersedia.")
                }
            } catch (e: Exception) {
                promise.reject("AUDIO_ERROR", e.message ?: "Gagal mengatur speakerphone.")
            }
        }
    }

    @ReactMethod
    fun scanQrCode(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Aktivitas Android tidak aktif.")
            return
        }
        mainHandler.post {
            try {
                val options = GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .build()
                val scanner = GmsBarcodeScanning.getClient(activity as Context, options)
                scanner.startScan()
                    .addOnSuccessListener { barcode ->
                        promise.resolve(barcode.rawValue ?: "")
                    }
                    .addOnCanceledListener {
                        promise.reject("CANCELLED", "Pemindaian QR dibatalkan.")
                    }
                    .addOnFailureListener { e ->
                        promise.reject("SCAN_FAILED", e.message ?: "Gagal memindai QR code.")
                    }
            } catch (e: Exception) {
                promise.reject("SCANNER_ERROR", e.message ?: "Scanner QR tidak tersedia di perangkat ini.")
            }
        }
    }

    @ReactMethod
    fun startForegroundService(title: String, message: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, KonvoiForegroundService::class.java).apply {
                action = KonvoiForegroundService.ACTION_START
                putExtra(KonvoiForegroundService.EXTRA_TITLE, title)
                putExtra(KonvoiForegroundService.EXTRA_MESSAGE, message)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_ERROR", e.message ?: "Gagal memulai background service.")
        }
    }

    @ReactMethod
    fun stopForegroundService(promise: Promise) {
        try {
            val intent = Intent(reactContext, KonvoiForegroundService::class.java).apply {
                action = KonvoiForegroundService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_ERROR", e.message ?: "Gagal menghentikan background service.")
        }
    }

    @ReactMethod
    fun getLocalIpAddress(promise: Promise) {
        mainHandler.post {
            try {
                var fallback: String? = null
                var preferred: String? = null
                val interfaces = NetworkInterface.getNetworkInterfaces()
                while (interfaces.hasMoreElements()) {
                    val ni = interfaces.nextElement()
                    if (!ni.isUp || ni.isLoopback) continue
                    val name = ni.name.lowercase()
                    // Skip cellular, VPN, and tunnel interfaces so mobile data
                    // never masks the local Wi-Fi or hotspot address.
                    if (name.startsWith("rmnet") ||
                        name.startsWith("ccmni") ||
                        name.startsWith("pdp") ||
                        name.startsWith("tun") ||
                        name.startsWith("tap") ||
                        name.startsWith("ppp") ||
                        name.startsWith("dummy") ||
                        name.startsWith("clat") ||
                        name.startsWith("v4-")
                    ) {
                        continue
                    }
                    val isLanInterface =
                        name.startsWith("swlan") ||
                        name.startsWith("softap") ||
                        name.startsWith("ap") ||
                        name.startsWith("wlan") ||
                        name.startsWith("eth") ||
                        name.startsWith("rndis")
                    val addresses = ni.inetAddresses
                    while (addresses.hasMoreElements()) {
                        val addr = addresses.nextElement()
                        if (addr is Inet4Address && !addr.isLoopbackAddress) {
                            val host = addr.hostAddress ?: continue
                            if (isLanInterface && addr.isSiteLocalAddress) {
                                if (preferred == null) preferred = host
                            } else if (isLanInterface && preferred == null) {
                                preferred = host
                            } else if (addr.isSiteLocalAddress && fallback == null) {
                                fallback = host
                            }
                        }
                    }
                }
                val ip = preferred ?: fallback
                if (ip != null) {
                    promise.resolve(ip)
                } else {
                    promise.reject(
                        "NO_LOCAL_IP",
                        "Alamat IP lokal tidak ditemukan. Aktifkan Wi-Fi atau hotspot."
                    )
                }
            } catch (e: Exception) {
                promise.reject("IP_ERROR", e.message ?: "Gagal membaca alamat IP lokal.")
            }
        }
    }

    @ReactMethod
    fun getNetworkStatus(promise: Promise) {
        mainHandler.post {
            try {
                val wifiManager = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                val wifiEnabled = wifiManager?.isWifiEnabled == true

                var hotspotEnabled = false
                if (wifiManager != null) {
                    try {
                        val method = wifiManager.javaClass.getDeclaredMethod("isWifiApEnabled")
                        method.isAccessible = true
                        hotspotEnabled = (method.invoke(wifiManager) as? Boolean) == true
                    } catch (_: Exception) {
                        // Hidden API may be restricted on some Android versions; fall back to interface scan.
                    }
                }

                if (!hotspotEnabled) {
                    try {
                        val interfaces = NetworkInterface.getNetworkInterfaces()
                        while (interfaces.hasMoreElements()) {
                            val ni = interfaces.nextElement()
                            if (!ni.isUp || ni.isLoopback) continue
                            val name = ni.name.lowercase()
                            val isApInterface =
                                name.startsWith("swlan") ||
                                name.startsWith("softap") ||
                                name.startsWith("ap") ||
                                name.startsWith("rndis") ||
                                (name.startsWith("wlan") && !wifiEnabled)
                            if (!isApInterface) continue
                            val addresses = ni.inetAddresses
                            while (addresses.hasMoreElements()) {
                                val addr = addresses.nextElement()
                                if (addr is Inet4Address && !addr.isLoopbackAddress) {
                                    hotspotEnabled = true
                                    break
                                }
                            }
                            if (hotspotEnabled) break
                        }
                    } catch (_: Exception) {}
                }

                val result = Arguments.createMap().apply {
                    putBoolean("wifiEnabled", wifiEnabled)
                    putBoolean("hotspotEnabled", hotspotEnabled)
                    putBoolean("ready", wifiEnabled || hotspotEnabled)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("NETWORK_STATUS_ERROR", e.message ?: "Gagal memeriksa status Wi-Fi dan hotspot.")
            }
        }
    }

    @ReactMethod
    fun openNetworkSettings(promise: Promise) {
        mainHandler.post {
            try {
                val intent = Intent(Settings.ACTION_WIFI_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
            } catch (_: Exception) {
                try {
                    val fallbackIntent = Intent(Settings.ACTION_WIRELESS_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(fallbackIntent)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject("SETTINGS_ERROR", e.message ?: "Gagal membuka pengaturan jaringan.")
                }
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN built-in NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        // Required for RN built-in NativeEventEmitter
    }

    override fun onLocationChanged(location: Location) {
        sendLocationEvent(location)
    }

    private fun sendLocationEvent(location: Location) {
        try {
            val map = Arguments.createMap().apply {
                putDouble("lat", location.latitude)
                putDouble("lon", location.longitude)
                putDouble("accuracy", location.accuracy.toDouble())
                putDouble("speed", location.speed.toDouble())
                putDouble("heading", location.bearing.toDouble())
                putDouble("altitude", location.altitude)
                putDouble("capturedAt", location.time.toDouble())
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("KonvoiLocationUpdate", map)
        } catch (_: Exception) {}
    }

    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}
}
