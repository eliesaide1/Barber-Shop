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
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

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

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "VIABarberHouse",
      in: window,
      launchOptions: launchOptions
    )

    return true
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
