/**
 * Curated list of popular Flutter + iOS open-source repos.
 * The Issue Hunter searches only these repos so every surfaced contribution
 * opportunity is from a recruiter-recognizable, CV-worthy project.
 */

export interface MobileRepo {
  owner: string;
  repo: string;
  framework: "flutter" | "ios";
}

export const POPULAR_FLUTTER_REPOS: MobileRepo[] = [
  { owner: "flutter", repo: "flutter", framework: "flutter" },
  { owner: "flutter", repo: "packages", framework: "flutter" },
  { owner: "rrousselGit", repo: "riverpod", framework: "flutter" },
  { owner: "felangel", repo: "bloc", framework: "flutter" },
  { owner: "flame-engine", repo: "flame", framework: "flutter" },
  { owner: "firebase", repo: "flutterfire", framework: "flutter" },
  { owner: "jonataslaw", repo: "getx", framework: "flutter" },
  { owner: "MaikuB", repo: "flutter_local_notifications", framework: "flutter" },
  { owner: "xvrh", repo: "lottie-flutter", framework: "flutter" },
  { owner: "fluttercommunity", repo: "plus_plugins", framework: "flutter" },
];

export const POPULAR_IOS_REPOS: MobileRepo[] = [
  { owner: "Alamofire", repo: "Alamofire", framework: "ios" },
  { owner: "SnapKit", repo: "SnapKit", framework: "ios" },
  { owner: "realm", repo: "realm-swift", framework: "ios" },
  { owner: "pointfreeco", repo: "swift-composable-architecture", framework: "ios" },
  { owner: "Moya", repo: "Moya", framework: "ios" },
  { owner: "onevcat", repo: "Kingfisher", framework: "ios" },
  { owner: "SDWebImage", repo: "SDWebImage", framework: "ios" },
  { owner: "siteline", repo: "SwiftUI-Introspect", framework: "ios" },
  { owner: "airbnb", repo: "lottie-ios", framework: "ios" },
  { owner: "realm", repo: "SwiftLint", framework: "ios" },
];

export const POPULAR_MOBILE_REPOS: MobileRepo[] = [
  ...POPULAR_FLUTTER_REPOS,
  ...POPULAR_IOS_REPOS,
];
