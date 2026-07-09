package app.lovable.familyconnect;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import java.util.Map;

public class IncomingCallNotifier {

    public static final String CHANNEL_ID = "calls";
    public static final int NOTIFICATION_ID = 7821;

    public static final String EXTRA_CALL_ID = "call_id";
    public static final String EXTRA_CHAT_ID = "chat_id";
    public static final String EXTRA_CALLER_NAME = "caller_name";
    public static final String EXTRA_CALL_TYPE = "call_type";

    public static final String ACTION_DECLINE = "app.lovable.familyconnect.action.DECLINE_CALL";
    public static final String ACTION_CALL_ENDED = "app.lovable.familyconnect.action.CALL_ENDED";

    public static void notifyIncomingCall(Context context, Map<String, String> data) {
        String callId = data.get("call_id");
        String chatId = data.get("chat_id");
        String callerName = data.get("title") != null ? data.get("title") : "Chamada recebida";
        String callType = data.containsKey("call_type") ? data.get("call_type") : "audio";

        if (callId == null) return;

        ensureChannel(context);

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.notify(NOTIFICATION_ID, buildCallNotification(context, callId, chatId, callerName, callType));

        Intent ringIntent = new Intent(context, CallRingingService.class);
        ringIntent.putExtra(EXTRA_CALL_ID, callId);
        ringIntent.putExtra(EXTRA_CHAT_ID, chatId);
        ringIntent.putExtra(EXTRA_CALLER_NAME, callerName);
        ringIntent.putExtra(EXTRA_CALL_TYPE, callType);
        context.startForegroundService(ringIntent);
    }

    // Builds the exact same rich (CallStyle, Answer/Decline) notification used both
    // to alert the user and to satisfy CallRingingService's own startForeground()
    // requirement. Previously the service posted a second, plain notification under
    // the same NOTIFICATION_ID to keep itself in the foreground, which immediately
    // overwrote this one and silently wiped out the Answer/Decline buttons.
    public static Notification buildCallNotification(
        Context context, String callId, String chatId, String callerName, String callType
    ) {
        ensureChannel(context);

        Intent fullScreenIntent = new Intent(context, IncomingCallActivity.class);
        fullScreenIntent.putExtra(EXTRA_CALL_ID, callId);
        fullScreenIntent.putExtra(EXTRA_CHAT_ID, chatId);
        fullScreenIntent.putExtra(EXTRA_CALLER_NAME, callerName);
        fullScreenIntent.putExtra(EXTRA_CALL_TYPE, callType);
        fullScreenIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            callId.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent declineIntent = new Intent(context, CallActionReceiver.class);
        declineIntent.setAction(ACTION_DECLINE);
        declineIntent.putExtra(EXTRA_CALL_ID, callId);
        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
            context,
            callId.hashCode(),
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Person caller = new Person.Builder()
            .setName(callerName)
            .setImportant(true)
            .build();

        // Android 12+ (and several OEM skins even earlier) expect CallStyle for
        // category=call notifications to render Answer/Decline at all — plain
        // addAction() buttons on a CATEGORY_CALL notification can silently fail
        // to show on the collapsed/expanded views on some launchers.
        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call_notification)
            .setContentTitle(callerName)
            .setContentText(callType.equals("video") ? "Chamada de vídeo recebida" : "Chamada de áudio recebida")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePendingIntent, fullScreenPendingIntent))
            .build();
    }

    public static void dismiss(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.cancel(NOTIFICATION_ID);
        context.stopService(new Intent(context, CallRingingService.class));
    }

    // Called when the other party hangs up (via a "call_ended" push) so the
    // ringing notification/service stop and any open full-screen call UI closes,
    // even though this device never touched Recusar/Atender itself.
    public static void endCall(Context context, String callId) {
        dismiss(context);
        Intent endIntent = new Intent(ACTION_CALL_ENDED);
        endIntent.setPackage(context.getPackageName());
        if (callId != null) {
            endIntent.putExtra(EXTRA_CALL_ID, callId);
        }
        context.sendBroadcast(endIntent);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Chamadas",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Chamadas de áudio e vídeo recebidas");
        channel.setSound(null, null); // ringtone is played by CallRingingService instead
        channel.enableVibration(true);
        channel.enableLights(true);
        manager.createNotificationChannel(channel);
    }
}
