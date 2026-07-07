package app.lovable.familyconnect;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class WhatszakMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Keep Capacitor's own handling (forwards to JS listeners when the app is alive).
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if ("call".equals(data.get("type")) && !WhatszakApplication.isInForeground()) {
            IncomingCallNotifier.notifyIncomingCall(getApplicationContext(), data);
        }
    }
}
