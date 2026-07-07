package app.lovable.familyconnect;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

public class CallActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String callId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID);
        IncomingCallNotifier.dismiss(context);

        if (callId == null) return;

        Uri uri = Uri.parse("whatszak://call")
            .buildUpon()
            .appendQueryParameter("action", "decline")
            .appendQueryParameter("call_id", callId)
            .build();

        Intent deepLink = new Intent(Intent.ACTION_VIEW, uri);
        deepLink.setPackage(context.getPackageName());
        deepLink.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(deepLink);
    }
}
