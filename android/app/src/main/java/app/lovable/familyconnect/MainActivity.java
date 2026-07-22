package app.lovable.familyconnect;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "WhatszakCall";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleCallDeepLink(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleCallDeepLink(intent);
    }

    // The incoming-call notification's Answer/Decline actions open this Activity
    // directly via the whatszak://call deep link (a BroadcastReceiver hop was
    // tried first, but some OEMs — Motorola included — block it from starting an
    // activity while the app is backgrounded/killed). Since nothing else runs in
    // that path, dismissing the ringing notification/service has to happen here,
    // centrally, regardless of which native screen (if any) opened this deep link.
    private void handleCallDeepLink(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        Log.d(TAG, "MainActivity.handleCallDeepLink data=" + data);
        if (data == null || !"whatszak".equals(data.getScheme()) || !"call".equals(data.getHost())) return;

        Log.d(TAG, "MainActivity dismissing notification/ringing for deep link");
        IncomingCallNotifier.dismiss(this);

        String callId = data.getQueryParameter("call_id");
        Intent closeFullScreen = new Intent(IncomingCallNotifier.ACTION_CALL_ENDED);
        closeFullScreen.setPackage(getPackageName());
        if (callId != null) closeFullScreen.putExtra(IncomingCallNotifier.EXTRA_CALL_ID, callId);
        sendBroadcast(closeFullScreen);
    }
}
