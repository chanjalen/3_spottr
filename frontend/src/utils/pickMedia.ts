/**
 * pickMedia.ts — production-grade media picker for iOS + Android.
 *
 * iOS issues handled:
 *   • expo-image-picker v17 changed preferredAssetRepresentationMode default
 *     from .Automatic → .Current, causing crashes on HEVC videos.
 *   • PHPhotosErrorDomain 3164 (PHPhotosErrorNetworkAccessRequired): fired when
 *     a video is iCloud-offloaded and isNetworkAccessAllowed is false. Fixed
 *     natively by shouldDownloadFromNetwork: true (expo-image-picker v17.0.x+).
 *     As a fallback for older patch versions: retry with allowsEditing: true,
 *     which forces iOS to download the asset before returning it.
 *   • expo-file-system v19 deprecated getInfoAsync/copyAsync — use /legacy.
 *
 * Android:
 *   • content:// URIs pass directly to RN's fetch FormData bridge — no copy needed.
 */

import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PickedMedia {
  /** Local file:// URI (iOS) or content:// URI (Android) — safe for fetch FormData. */
  uri: string;
  kind: 'image' | 'video';
  mimeType: string;
  filename: string;
  /** First-frame thumbnail URI generated at pick time (videos only). */
  thumbnailUri?: string;
}

export interface PickMediaOptions {
  allowsMultiple?: boolean;
  maxImageBytes?: number;
  maxVideoBytes?: number;
}

const DEFAULT_MAX_IMAGE = 10 * 1024 * 1024;
const DEFAULT_MAX_VIDEO = 50 * 1024 * 1024;

// ── Main export ──────────────────────────────────────────────────────────────

export async function pickMedia(opts: PickMediaOptions = {}): Promise<PickedMedia[] | null> {
  const {
    allowsMultiple = false,
    maxImageBytes = DEFAULT_MAX_IMAGE,
    maxVideoBytes = DEFAULT_MAX_VIDEO,
  } = opts;

  // ── 1. Permissions ─────────────────────────────────────────────────────────
  // accessPrivileges === 'limited' still returns granted === true on iOS 14+.
  // PHPickerViewController shows all assets regardless of limited access.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Photo Access Required',
      Platform.OS === 'ios'
        ? 'Go to Settings → Privacy & Security → Photos and allow access.'
        : 'Grant photo library permission in app Settings to share media.',
    );
    return null;
  }

  // ── 2. Build picker options ────────────────────────────────────────────────
  const pickerOptions: any = {
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: allowsMultiple,
    allowsEditing: false,
  };

  if (Platform.OS === 'ios') {
    // Restore pre-v17 transcoding behavior: iOS converts HEVC/ProRes to H.264
    // before handing the file to the app. v17 default (.Current) skips this
    // and crashes for HEVC videos.
    pickerOptions.preferredAssetRepresentationMode =
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Automatic;

    // Enables iCloud download inside the picker (PHAssetResourceRequestOptions
    // isNetworkAccessAllowed = true). Added in expo-image-picker v17.0.x patches.
    // Silently ignored if the installed version predates the fix.
    pickerOptions.shouldDownloadFromNetwork = true;
  }

  // ── 3. Launch picker ───────────────────────────────────────────────────────
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (detail.includes('3164')) {
      console.warn('[pickMedia] iCloud-offloaded video — falling back to allowsEditing retry');
      return handleICloudVideo(allowsMultiple, opts);
    }

    console.error('[pickMedia] launchImageLibraryAsync threw:', detail, err);
    Alert.alert(
      'Could not open photo library',
      __DEV__ ? `${detail}\n\n(dev-only)` : 'Please try again.',
    );
    return null;
  }

  if (result.canceled || !result.assets?.length) return null;
  return processAssets(result.assets, maxImageBytes, maxVideoBytes);
}

// ── iCloud fallback ───────────────────────────────────────────────────────────

/**
 * Called when PHPhotosErrorDomain 3164 is thrown (iCloud-offloaded video).
 *
 * Single-asset: shows a brief alert then reopens the picker with
 * allowsEditing: true, which forces iOS to download the asset before handing
 * it to the app. The user taps "Choose" on the trim UI without editing.
 *
 * Multi-asset: allowsEditing cannot be combined with allowsMultiple, so we
 * show an instructional message instead.
 */
function handleICloudVideo(
  allowsMultiple: boolean,
  opts: PickMediaOptions,
): Promise<PickedMedia[] | null> {
  const { maxImageBytes = DEFAULT_MAX_IMAGE, maxVideoBytes = DEFAULT_MAX_VIDEO } = opts;

  // Shared retry logic: reopens picker with allowsEditing: true (forces iCloud download).
  // allowsEditing cannot be combined with allowsMultipleSelection, so this always
  // picks one item at a time regardless of the original allowsMultiple setting.
  const doRetry = (resolve: (v: PickedMedia[] | null) => void) => {
    ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
    } as any)
      .then(async (retryResult) => {
        if (retryResult.canceled || !retryResult.assets?.length) {
          resolve(null);
          return;
        }
        const output = await processAssets(retryResult.assets, maxImageBytes, maxVideoBytes);
        resolve(output);
      })
      .catch((retryErr) => {
        console.error('[pickMedia] iCloud retry failed:', retryErr);
        Alert.alert('Could not load video', 'Please open Photos, tap the video to download it, then try again.');
        resolve(null);
      });
  };

  return new Promise((resolve) => {
    const message = allowsMultiple
      ? 'A video in your selection is stored in iCloud. Tap "Select Again" to pick one item at a time — iOS will download it automatically.'
      : 'This video is stored in iCloud. Tap "Select Again" — iOS will download it automatically.';

    Alert.alert(
      'Video Not on Device',
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Select Again', onPress: () => doRetry(resolve) },
      ],
    );
  });
}

// ── Asset processing ──────────────────────────────────────────────────────────

async function processAssets(
  assets: ImagePicker.ImagePickerAsset[],
  maxImageBytes: number,
  maxVideoBytes: number,
): Promise<PickedMedia[] | null> {
  const output: PickedMedia[] = [];

  for (const asset of assets) {
    const kind: 'image' | 'video' =
      asset.type === 'video' || asset.mimeType?.startsWith('video/') ? 'video' : 'image';

    const limit = kind === 'video' ? maxVideoBytes : maxImageBytes;
    if (asset.fileSize != null && asset.fileSize > limit) {
      Alert.alert(
        'File too large',
        kind === 'video' ? 'Videos must be under 50 MB.' : 'Images must be under 10 MB.',
      );
      return null;
    }

    const mimeType = resolveMimeType(asset.uri, asset.mimeType, kind);

    const uri = Platform.OS === 'ios'
      ? await resolveLocalUriIOS(asset.uri, kind, mimeType)
      : asset.uri;

    if (!uri) {
      Alert.alert(
        kind === 'video' ? 'Video not accessible' : 'Image not accessible',
        kind === 'video'
          ? 'This video could not be read. Please download it in the Photos app and try again.'
          : 'This image could not be read from your library.',
      );
      return null;
    }

    const filename =
      uri.split('/').pop()?.split('?')[0] ??
      `${kind}_${Date.now()}.${kind === 'video' ? 'mov' : 'jpg'}`;

    let thumbnailUri: string | undefined;
    if (kind === 'video') {
      try {
        const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 0 });
        thumbnailUri = thumb.uri;
      } catch {
        // silently skip — black screen is an acceptable fallback
      }
    }

    output.push({ uri, kind, mimeType, filename, thumbnailUri });
  }

  return output.length ? output : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveMimeType(
  uri: string,
  pickerMime: string | null | undefined,
  kind: 'image' | 'video',
): string {
  if (pickerMime) return pickerMime;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (kind === 'video') return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * On iOS: verifies the picker-returned URI is a locally readable file://.
 * With .Automatic mode the picker writes assets to a temp dir, so this is
 * almost always a no-op fast-path. The cache copy is a safety net only.
 *
 * On Android: not called — content:// URIs work natively with fetch FormData.
 */
async function resolveLocalUriIOS(
  uri: string,
  kind: 'image' | 'video',
  mimeType: string,
): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) return uri;
  } catch (infoErr) {
    console.warn('[pickMedia] getInfoAsync failed:', uri, infoErr);
  }

  const cacheDir = FileSystem.cacheDirectory ?? 'file:///tmp/';
  const ext =
    mimeType === 'video/quicktime' ? 'mov' :
    mimeType === 'video/mp4'       ? 'mp4' :
    mimeType === 'image/png'       ? 'png' : 'jpg';
  const dest = `${cacheDir}spottr_${kind}_${Date.now()}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) {
      console.log('[pickMedia] Resolved via cache copy:', dest);
      return dest;
    }
  } catch (copyErr) {
    console.error('[pickMedia] cache copy failed:', uri, copyErr);
  }

  return null;
}
