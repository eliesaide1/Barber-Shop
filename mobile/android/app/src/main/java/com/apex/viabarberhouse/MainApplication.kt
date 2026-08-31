package com.apex.viabarberhouse

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createDefaultNotificationChannel()
  }

  /**
   * The channel every push lands in.
   *
   * Naming it in the manifest is only half of it — Firebase checks that the
   * channel actually exists and quietly falls back to one of its own making if
   * it does not, which is the state this app shipped in: notifications arrived
   * in the shade, silently, and never as a heads-up banner.
   *
   * `IMPORTANCE_HIGH` is what makes one float over the screen. It cannot be
   * raised later — Android fixes a channel's importance when it is created and
   * from then on only the user may change it — so this has to be right the
   * first time an install runs, not corrected in a later release.
   *
   * The sound is set explicitly because a channel is silent unless told
   * otherwise, and the server sends `sound: 'default'` expecting to be heard.
   *
   * No SDK version guard: `minSdkVersion` is 26, which is where channels were
   * introduced, so there is no build this runs on that lacks them.
   */
  private fun createDefaultNotificationChannel() {
    val channel =
      NotificationChannel(
        getString(R.string.default_notification_channel_id),
        getString(R.string.default_notification_channel_name),
        NotificationManager.IMPORTANCE_HIGH,
      )
    channel.setSound(
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
      AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .build(),
    )
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }
}
