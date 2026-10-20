import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

/* Push. Compiled in only when the Firebase pods are actually installed, on the
   same terms as the conditional Google Services plugin on Android: a checkout
   without them still builds, and dropping GoogleService-Info.plist in is all it
   takes to light this up.

   Without the configure() call below, `getApp()` throws in JS and the adapter
   quietly falls back to socket-only — push would appear to be wired and never
   arrive, which is worse than it plainly not being there. */
#if canImport(FirebaseCore)
import FirebaseCore
#endif

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  /* The name Metro registers the root component under, in one place because
     SceneDelegate is the one that actually mounts it now. */
  static let moduleName = "VIABarberHouse"

  /* Not used by UIKit any more: under the UIScene life cycle the scene owns the
     window and this is never read to present anything. It exists because
     `window` is an optional UIApplicationDelegate requirement that other code
     reads off the delegate, and removing it is not the no-op it looks like.

     react-native-firebase is the one that matters here. Its messaging module
     registers a UIApplicationDidFinishLaunchingNotification observer in +load
     and reaches straight for `delegate.window.rootViewController.view` to find
     the RCTRootView it toggles `isHeadless` on. In Objective-C that reads as a
     plain property access and compiles against the protocol; with nothing
     implementing it the selector is simply unrecognised, and the app dies
     before any JavaScript runs:

       -[GUL_VIABarberHouse.AppDelegate window]: unrecognized selector

     Which fires on every launch on every iOS version — so dropping this
     property swapped a crash on 27 for a crash everywhere.

     Assigned by SceneDelegate once the scene hands over its window, so anything
     reading it afterwards sees the real one rather than a permanent nil. */
  @objc var window: UIWindow?

  /* Built here, used from SceneDelegate. Under the UIScene life cycle the app
     delegate no longer owns a window — the scene does — so this object is all
     that crosses between them, and it has to outlive this method. */
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if canImport(FirebaseCore)
    /* Guarded on the plist as well as the pod: FirebaseApp.configure() raises
       if there is no GoogleService-Info.plist to read, which would take the app
       down at launch rather than leaving push switched off. */
    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
      FirebaseApp.configure()
    }
#endif

    /* Held for the scene: a push that cold-started the app is in here, and the
       scene connects after this returns. */
    self.launchOptions = launchOptions

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    /* No window and no startReactNative() here. Both moved to SceneDelegate —
       see the note there on why iOS 27 requires it. */
    return true
  }

  /* Named to match the single entry in UIApplicationSceneManifest. The app does
     not support multiple windows; this exists because the SDK's launch check
     looks for it alongside the manifest. */
  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
