package com.konvoi

import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

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
                    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                    audioManager.isSpeakerphoneOn = enabled
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
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Aktivitas Android tidak aktif.")
            return
        }
        mainHandler.post {
            try {
                val options = GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .build()
                val scanner = GmsBarcodeScanning.getClient(activity, options)
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
