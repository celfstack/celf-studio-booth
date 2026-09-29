# Photo download investigation — September 28, 2026

## Findings

The public site's shared download helper (`https://www.celfstudiobooth.com/assets/download-C1labY3O.js`) contains the same silent cancellation path as the local code before this fix. The current production deployment is `celf-studio-booth-7wf6ro0wg-celfstudio.vercel.app`, created September 16 and marked Ready.

1. Native sharing rejected with `AbortError` returned `cancelled`; neither print nor decoration showed a fallback. A simulated mobile share failure reproduced a tap with no visible result. This is a plausible cause of the reported issue, not confirmation of the affected users' exact failure. The browser uses this error both for dismissal and unavailable sharing destinations. See [MDN's share exceptions](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share#exceptions).
2. The decoration page encodes its PNG after the save tap. Slow work can outlast the browser's transient activation, blocking native sharing. Re-encoding on every retry can repeat this. See [WebKit's User Activation API explanation](https://webkit.org/blog/13862/the-user-activation-api/).
3. Any device with multiple touch points was classified as mobile, including Windows touchscreen laptops, preventing the ordinary direct download attempt there.
4. The preview URL and recovery URL shared one cleanup effect, which could revoke a preview still in use when only the recovery URL changed.

## Changes

- Native share dismissal/failure falls back to a full-size photo with Download file and Open full-size image links.
- Native share success also retains a recovery link; sharing completion is not treated as proof the user saved the image.
- Decoration retry uses the existing prepared PNG directly from a fresh tap, without re-encoding.
- Capability checks and unsupported/throwing sharing implementations fall back safely. Non-cancellation errors log only the error type, without images or invitation details.
- Touchscreen laptops use direct downloading; iPad desktop-mode detection remains.
- Preview and recovery URL lifetimes are independent.

## Verification and limits

The pre-fix automated reproduction failed because no fallback dialog appeared after an AbortError. Post-fix checks passed for print and decoration fallback in Chromium and WebKit, actual PNG download events, prepared-image retry with active user gesture and only one encode, mobile with no native sharing, and a Windows touch-laptop profile. Existing transparent strip/portrait export checks passed too: eight browser scenarios across focused runs. TypeScript and production build passed; targeted lint has only the existing decoration render-revision dependency warning. Both mobile fallback screens were visually checked.

Native share outcomes were simulated; Chromium and WebKit automation cannot certify the native iPhone/Android share sheet or Photos app. No affected-user device details were available. A real-phone check remains useful.

All changes are local. Nothing was deployed or pushed. The public site still needs this fix deployed; the current branch also contains the separately developed Together feature.
