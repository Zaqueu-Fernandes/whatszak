package app.lovable.familyconnect;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.annotation.Nullable;

public class CallRingingService extends Service {

    private static final long TIMEOUT_MS = 45_000;
    private static final long[] VIBRATE_PATTERN = { 0, 1000, 1000 };

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutRunnable = this::stopSelf;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Reuse the exact same CallStyle notification IncomingCallNotifier already
        // posted (same NOTIFICATION_ID) instead of building a plain placeholder here —
        // a second, button-less notification under that id would silently replace the
        // real one and wipe out the Answer/Decline actions.
        String callId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID);
        String chatId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CHAT_ID);
        String callerName = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_NAME);
        String callType = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_TYPE);
        Notification callNotification = IncomingCallNotifier.buildCallNotification(
            this, callId, chatId, callerName, callType
        );
        startForeground(IncomingCallNotifier.NOTIFICATION_ID, callNotification);

        startRingtone();
        startVibration();

        timeoutHandler.removeCallbacks(timeoutRunnable);
        timeoutHandler.postDelayed(timeoutRunnable, TIMEOUT_MS);

        return START_NOT_STICKY;
    }

    private void startRingtone() {
        try {
            Uri ringtoneUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
            if (ringtoneUri == null) return;

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, ringtoneUri);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception e) {
            // If the ringtone can't be played, the vibration + full-screen UI still work.
        }
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(VIBRATE_PATTERN, 1));
        } else {
            vibrator.vibrate(VIBRATE_PATTERN, 1);
        }
    }

    @Override
    public void onDestroy() {
        timeoutHandler.removeCallbacks(timeoutRunnable);
        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
        }
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.cancel(IncomingCallNotifier.NOTIFICATION_ID);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
