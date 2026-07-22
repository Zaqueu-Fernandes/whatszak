package app.lovable.familyconnect;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

public class CallActionReceiver extends BroadcastReceiver {

    private static final String TAG = "WhatszakCall";

    @Override
    public void onReceive(Context context, Intent intent) {
        String callId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID);
        String callType = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_TYPE);
        Log.d(TAG, "CallActionReceiver.onReceive intentAction=" + intent.getAction() + " callId=" + callId + " callType=" + callType);
        IncomingCallNotifier.dismiss(context);

        if (callId == null) return;

        String action = IncomingCallNotifier.ACTION_ANSWER.equals(intent.getAction()) ? "answer" : "decline";
        Log.d(TAG, "CallActionReceiver resolved action=" + action);

        Uri.Builder uriBuilder = Uri.parse("whatszak://call")
            .buildUpon()
            .appendQueryParameter("action", action)
            .appendQueryParameter("call_id", callId);
        if (callType != null) uriBuilder.appendQueryParameter("call_type", callType);

        Intent deepLink = new Intent(Intent.ACTION_VIEW, uriBuilder.build());
        deepLink.setPackage(context.getPackageName());
        deepLink.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        Log.d(TAG, "CallActionReceiver starting deep link: " + deepLink.getData());
        context.startActivity(deepLink);

        // The full-screen IncomingCallActivity may already be showing behind the
        // notification (auto-launched by the full-screen intent). Since the action
        // was just handled here, close it too so it doesn't linger in the back
        // stack and reappear on a later back-press.
        Intent closeFullScreen = new Intent(IncomingCallNotifier.ACTION_CALL_ENDED);
        closeFullScreen.setPackage(context.getPackageName());
        closeFullScreen.putExtra(IncomingCallNotifier.EXTRA_CALL_ID, callId);
        context.sendBroadcast(closeFullScreen);
    }
}
