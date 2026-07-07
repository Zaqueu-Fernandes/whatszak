package app.lovable.familyconnect;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;
import androidx.annotation.NonNull;

public class WhatszakApplication extends Application implements Application.ActivityLifecycleCallbacks {

    private static WhatszakApplication instance;
    private int startedActivityCount = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        registerActivityLifecycleCallbacks(this);
    }

    public static boolean isInForeground() {
        return instance != null && instance.startedActivityCount > 0;
    }

    @Override
    public void onActivityStarted(@NonNull Activity activity) {
        startedActivityCount++;
    }

    @Override
    public void onActivityStopped(@NonNull Activity activity) {
        if (startedActivityCount > 0) {
            startedActivityCount--;
        }
    }

    @Override
    public void onActivityCreated(@NonNull Activity activity, Bundle savedInstanceState) {}

    @Override
    public void onActivityResumed(@NonNull Activity activity) {}

    @Override
    public void onActivityPaused(@NonNull Activity activity) {}

    @Override
    public void onActivitySaveInstanceState(@NonNull Activity activity, @NonNull Bundle outState) {}

    @Override
    public void onActivityDestroyed(@NonNull Activity activity) {}
}
