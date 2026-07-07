package app.lovable.familyconnect;

import android.app.KeyguardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class IncomingCallActivity extends AppCompatActivity {

    private String callId;
    private String chatId;
    private String callType;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        setContentView(R.layout.activity_incoming_call);

        callId = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID);
        chatId = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CHAT_ID);
        callType = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALL_TYPE);
        String callerName = getIntent().getStringExtra(IncomingCallNotifier.EXTRA_CALLER_NAME);

        TextView nameView = findViewById(R.id.caller_name);
        TextView typeView = findViewById(R.id.call_type_label);
        if (callerName != null) nameView.setText(callerName);
        if ("video".equals(callType)) {
            typeView.setText("Chamada de vídeo recebida");
        }

        Button acceptButton = findViewById(R.id.accept_button);
        Button declineButton = findViewById(R.id.decline_button);

        acceptButton.setOnClickListener(v -> finishWithAction("answer"));
        declineButton.setOnClickListener(v -> finishWithAction("decline"));
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (keyguardManager != null) {
                keyguardManager.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
    }

    private void finishWithAction(String action) {
        IncomingCallNotifier.dismiss(this);

        if (callId != null) {
            Uri.Builder uriBuilder = Uri.parse("whatszak://call")
                .buildUpon()
                .appendQueryParameter("action", action)
                .appendQueryParameter("call_id", callId);
            if (chatId != null) uriBuilder.appendQueryParameter("chat_id", chatId);
            if (callType != null) uriBuilder.appendQueryParameter("call_type", callType);

            Intent deepLink = new Intent(Intent.ACTION_VIEW, uriBuilder.build());
            deepLink.setPackage(getPackageName());
            deepLink.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(deepLink);
        }

        finish();
    }
}
