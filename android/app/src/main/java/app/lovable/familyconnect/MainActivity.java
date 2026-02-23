package app.lovable.familyconnect;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    ensureFirebaseInitialized();
    super.onCreate(savedInstanceState);
  }

  private void ensureFirebaseInitialized() {
    try {
      if (FirebaseApp.getApps(this).isEmpty()) {
        FirebaseOptions options = new FirebaseOptions.Builder()
          .setApiKey("AIzaSyC6OnsbYZXkLJml9BAspouq_BuQcbZsYjk")
          .setApplicationId("1:518347482386:web:570beff4e627cad9d03fcb")
          .setProjectId("whatszak")
          .setGcmSenderId("518347482386")
          .build();

        FirebaseApp.initializeApp(this, options);
      }
    } catch (Exception e) {
      Log.e("MainActivity", "Firebase initialization failed", e);
    }
  }
}
