package com.konvoi

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class KonvoiForegroundService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    companion object {
        const val ACTION_START = "com.konvoi.action.START_FOREGROUND"
        const val ACTION_STOP = "com.konvoi.action.STOP_FOREGROUND"
        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_MESSAGE = "extra_message"

        private const val CHANNEL_ID = "konvoi_intercom_channel"
        private const val NOTIFICATION_ID = 1001
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            releaseLocks()
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Konvoi Interkom Aktif"
        val message = intent?.getStringExtra(EXTRA_MESSAGE) ?: "Komunikasi suara tetap aktif di latar belakang."

        createNotificationChannel()
        acquireLocks()

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent(this, MainActivity::class.java)
        launchIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(pendingIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    fgsType = fgsType or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }
            }
            try {
                startForeground(NOTIFICATION_ID, notification, fgsType)
            } catch (_: Exception) {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Konvoi Interkom",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifikasi status interkom suara dan koneksi rombongan Konvoi"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun acquireLocks() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = powerManager?.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "Konvoi:IntercomWakeLock"
                )
                wakeLock?.acquire(24 * 60 * 60 * 1000L)
            }
            if (wifiLock == null) {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                @Suppress("DEPRECATION")
                wifiLock = wifiManager?.createWifiLock(
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                    "Konvoi:WifiLock"
                )
                wifiLock?.acquire()
            }
        } catch (_: Exception) {}
    }

    private fun releaseLocks() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            wakeLock = null
            if (wifiLock?.isHeld == true) {
                wifiLock?.release()
            }
            wifiLock = null
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        releaseLocks()
        super.onDestroy()
    }
}
