# Tauri invokes annotated bridge methods through reflection.
-keep class dev.harbor.updater.AndroidUpdaterPlugin { *; }
-keep class dev.harbor.updater.InstallApkArgs { *; }
-keep class dev.harbor.updater.HarborUpdateFileProvider { *; }
-keep class dev.harbor.updater.BackgroundChatArgs { *; }
-keep class dev.harbor.updater.BackgroundChatWorker { *; }
-keep class dev.harbor.updater.WarrenMessagingService { *; }

# Room constructs this generated database by reflection during WorkManager startup.
# R8 must retain its public no-argument constructor in the minified release APK.
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keepclassmembers class * extends androidx.room.RoomDatabase {
    public <init>();
}
