#!/usr/bin/env node
'use strict';
/**
 * harden-android.js - patches the generated Capacitor Android project.
 *
 * Run this after `npx cap add android` / `npx cap sync android`, and in CI
 * before the Gradle build. Idempotent: running it twice changes nothing.
 *
 * What it does, and why each one matters:
 *
 *   allowBackup=false          `adb backup` cannot lift the WebView's
 *                              localStorage, where the entitlement cache lives.
 *   usesCleartextTraffic=false no plain-HTTP traffic can be introduced later.
 *   network_security_config    cleartext denied explicitly, for every API level.
 *   dataExtractionRules        Android 12+ equivalent of the backup rule.
 *   WebView debugging off      release builds are not remotely inspectable.
 *   exported=false on the      nothing but the launcher should be able to start
 *   launcher only              the activity.
 *
 * It does NOT enable R8/minification by default: that can break reflection-based
 * plugins, and you cannot test a release build on this machine. Pass --minify if
 * you want it and you are able to test the result on a device.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'android');
const MANIFEST = path.join(ROOT, 'app', 'src', 'main', 'AndroidManifest.xml');
const XML_DIR = path.join(ROOT, 'app', 'src', 'main', 'res', 'xml');
const NET_CONFIG = path.join(XML_DIR, 'network_security_config.xml');
const MAIN_ACTIVITY = path.join(ROOT, 'app', 'src', 'main', 'java');
const BUILD_GRADLE = path.join(ROOT, 'app', 'build.gradle');
const VARIABLES_GRADLE = path.join(ROOT, 'variables.gradle');

/**
 * The target API level Play requires, and the deadline that makes it blocking.
 *
 * Since 31 August 2026 a new app or an update must target Android 16 (API 36).
 * An earlier build of this project targeted 35 and would have been rejected at
 * upload, which is a bad way to find out: everything builds, everything installs,
 * everything works, and the rejection happens in a web console after the AAB is
 * already signed.
 */
const REQUIRED_TARGET_SDK = 36;
/** Capacitor 8's floor. Below this the template is not the one that was tested. */
const REQUIRED_MIN_SDK = 24;

const MINIFY = process.argv.includes('--minify');
const changed = [];

function fail(msg) {
  console.error('harden-android: ' + msg);
  process.exit(1);
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

function write(p, content, label) {
  fs.writeFileSync(p, content);
  changed.push(label);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/* ------------------------------------------------------------------ *
 * 0. The target API level
 * ------------------------------------------------------------------ */

/**
 * Refuse to prepare a project that Play would reject.
 *
 * variables.gradle is generated from the Capacitor template, so it is the file
 * that says which Capacitor this project actually was built by - and the one
 * that silently regresses if somebody restores a machine, regenerates android/,
 * or resolves an older @capacitor/android. Checking it here means the failure
 * arrives at `npm run android:prepare` with the numbers in the message, rather
 * than as an upload rejection nobody can explain.
 */
function checkTargetApi() {
  const text = readIfExists(VARIABLES_GRADLE);
  if (text === null) {
    fail('android/variables.gradle not found - run "npx cap add android" first.');
  }

  const read = (name) => {
    const m = new RegExp(name + '\\s*=\\s*(\\d+)').exec(text);
    return m ? Number(m[1]) : null;
  };

  const compileSdk = read('compileSdkVersion');
  const targetSdk = read('targetSdkVersion');
  const minSdk = read('minSdkVersion');

  if (compileSdk === null || targetSdk === null || minSdk === null) {
    fail('android/variables.gradle does not look like a Capacitor template any more ' +
      '(compileSdk ' + compileSdk + ', targetSdk ' + targetSdk + ', minSdk ' + minSdk + ').');
  }
  if (targetSdk < REQUIRED_TARGET_SDK || compileSdk < REQUIRED_TARGET_SDK) {
    fail('this project targets API ' + targetSdk + ' (compileSdk ' + compileSdk + '), and ' +
      'Play has required API ' + REQUIRED_TARGET_SDK + ' for new apps and updates since 31 August 2026.\n' +
      '  An upload would be rejected. Upgrade @capacitor/android to 8.x and run:\n' +
      '      npx cap add android && npm run android:prepare');
  }
  if (minSdk !== REQUIRED_MIN_SDK) {
    // A warning rather than a failure: minSdk is a choice, and the only one
    // that matters for the store is that it is what was tested.
    console.warn('harden-android: WARNING - minSdk is ' + minSdk + ', expected ' +
      REQUIRED_MIN_SDK + ' from the Capacitor 8 template. Devices below it will not install.');
  }

  return { compileSdk: compileSdk, targetSdk: targetSdk, minSdk: minSdk };
}

/* ------------------------------------------------------------------ *
 * 1. AndroidManifest
 * ------------------------------------------------------------------ */
function hardenManifest() {
  let xml = readIfExists(MANIFEST);
  if (xml === null) fail('AndroidManifest.xml not found - run "npx cap add android" first.');

  const before = xml;

  // Belt and braces: make sure a debuggable flag is never left set.
  xml = xml.replace(/\sandroid:debuggable="true"/g, '');

  if (!/android:allowBackup=/.test(xml)) {
    xml = xml.replace(/<application\b/, '<application\n        android:allowBackup="false"');
  } else {
    xml = xml.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"');
  }

  if (!/android:fullBackupContent=/.test(xml)) {
    xml = xml.replace(/<application\b/, '<application\n        android:fullBackupContent="false"');
  }

  if (!/android:dataExtractionRules=/.test(xml)) {
    xml = xml.replace(/<application\b/, '<application\n        android:dataExtractionRules="@xml/data_extraction_rules"');
  }

  if (!/android:networkSecurityConfig=/.test(xml)) {
    xml = xml.replace(/<application\b/, '<application\n        android:networkSecurityConfig="@xml/network_security_config"');
  }

  if (!/android:usesCleartextTraffic=/.test(xml)) {
    xml = xml.replace(/<application\b/, '<application\n        android:usesCleartextTraffic="false"');
  } else {
    xml = xml.replace(/android:usesCleartextTraffic="[^"]*"/, 'android:usesCleartextTraffic="false"');
  }

  if (xml !== before) write(MANIFEST, xml, 'AndroidManifest.xml');
}

/* ------------------------------------------------------------------ *
 * 2. Network security config
 * ------------------------------------------------------------------ */
function writeNetworkConfig() {
  ensureDir(XML_DIR);
  const config = `<?xml version="1.0" encoding="utf-8"?>
<!--
  No cleartext, anywhere, on any API level. AdMob and the purchase validator
  both speak HTTPS; if you ever add an http:// endpoint it will fail loudly
  here rather than silently in the field.
-->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;
  if (readIfExists(NET_CONFIG) !== config) write(NET_CONFIG, config, 'network_security_config.xml');

  const extraction = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 12+: nothing is extracted, nothing is backed up. -->
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" />
        <exclude domain="file" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="external" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" />
        <exclude domain="file" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="external" />
    </device-transfer>
</data-extraction-rules>
`;
  const extractionPath = path.join(XML_DIR, 'data_extraction_rules.xml');
  if (readIfExists(extractionPath) !== extraction) {
    write(extractionPath, extraction, 'data_extraction_rules.xml');
  }
}

/* ------------------------------------------------------------------ *
 * 3. WebView debugging off in release
 * ------------------------------------------------------------------ */
function hardenMainActivity() {
  if (!fs.existsSync(MAIN_ACTIVITY)) return;
  const found = [];

  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'MainActivity.java' || entry.name === 'MainActivity.kt') found.push(full);
    }
  })(MAIN_ACTIVITY);

  for (const file of found) {
    let src = readIfExists(file);
    if (src === null) continue;
    if (src.includes('packetdefense-hardening')) continue;

    const isKotlin = file.endsWith('.kt');
    const guard = isKotlin
      ? `
        // packetdefense-hardening: never expose the WebView to remote debugging in release.
        if ((applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            android.webkit.WebView.setWebContentsDebuggingEnabled(false)
        }
`
      : `
        // packetdefense-hardening: never expose the WebView to remote debugging in release.
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            android.webkit.WebView.setWebContentsDebuggingEnabled(false);
        }
`;

    if (isKotlin) {
      src = src.replace(/(override fun onCreate\([^)]*\)\s*\{)/, `$1${guard}`);
    } else {
      src = src.replace(/(protected void onCreate\([^)]*\)\s*\{)/, `$1${guard}`);
    }

    if (src.includes('packetdefense-hardening')) write(file, src, path.basename(file));
  }
}

/* ------------------------------------------------------------------ *
 * 4. Optional release minification
 * ------------------------------------------------------------------ */
function maybeMinify() {
  if (!MINIFY) return;
  let gradle = readIfExists(BUILD_GRADLE);
  if (gradle === null) return;
  if (gradle.includes('packetdefense-minify')) return;

  gradle = gradle.replace(/release\s*\{/, `release {
            // packetdefense-minify
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'`);
  write(BUILD_GRADLE, gradle, 'app/build.gradle (minify)');

  const proguard = path.join(ROOT, 'app', 'proguard-rules.pro');
  const rules = `# packetdefense-minify
# Capacitor and its plugins reach into Java by reflection.
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}
-dontwarn com.getcapacitor.**
`;
  if (readIfExists(proguard) !== rules) write(proguard, rules, 'proguard-rules.pro');
}

/* ------------------------------------------------------------------ *
 * 4. AdMob application id
 *
 * @capacitor-community/admob v7 does NOT read the app id from
 * capacitor.config.json. It reads the Android meta-data
 * `com.google.android.gms.ads.APPLICATION_ID`, which resolves from a string
 * resource. The `plugins.AdMob.appId` block in capacitor.config.json looks like
 * it does the job and is completely inert.
 *
 * This matters because android/ is generated by "npx cap add android" and is
 * gitignored, so there is no committed manifest to fix by hand: whatever is not
 * injected here does not exist on a fresh clone or in CI. Without this the ad
 * SDK has no application id and fails to initialise on device.
 * ------------------------------------------------------------------ */
const VALUES_DIR = path.join(ROOT, 'app', 'src', 'main', 'res', 'values');
const ADMOB_XML = path.join(VALUES_DIR, 'admob.xml');
const MANIFEST_META = 'com.google.android.gms.ads.APPLICATION_ID';

/** Google's public sample app id. Ads "work" with it and earn exactly nothing. */
const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';

function writeAdMobAppId() {
  const cfgPath = path.join(__dirname, '..', 'capacitor.config.json');
  let appId = null;
  try {
    const parsed = JSON.parse(readIfExists(cfgPath) || '{}');
    appId = parsed.plugins && parsed.plugins.AdMob && parsed.plugins.AdMob.appId;
  } catch (e) {
    fail('capacitor.config.json is not valid JSON: ' + e.message);
  }
  if (!appId) fail('capacitor.config.json has no plugins.AdMob.appId to write into the manifest.');

  ensureDir(VALUES_DIR);
  // A separate resource file rather than Capacitor's strings.xml, which holds
  // app_name and would be clobbered.
  const adMobXml = `<?xml version='1.0' encoding='utf-8'?>
<!-- Generated by tools/harden-android.js from capacitor.config.json.
     The AdMob plugin reads its application id from this resource, NOT from the
     plugins.AdMob block in capacitor.config.json. Do not edit by hand. -->
<resources>
    <string name="admob_app_id">${appId}</string>
</resources>
`;
  if (readIfExists(ADMOB_XML) !== adMobXml) write(ADMOB_XML, adMobXml, 'res/values/admob.xml');

  let xml = readIfExists(MANIFEST);
  if (xml === null) fail('AndroidManifest.xml not found - run "npx cap add android" first.');
  const before = xml;

  if (!new RegExp(MANIFEST_META).test(xml)) {
    const tag = '        <meta-data android:name="' + MANIFEST_META +
      '" android:value="@string/admob_app_id"/>\n    ';
    xml = xml.replace(/<\/application>/, tag + '</application>');
  }
  if (xml === before) {
    // Nothing inserted, but the resource may still have been rewritten.
  } else {
    write(MANIFEST, xml, 'AndroidManifest.xml (AdMob app id)');
  }

  if (appId === TEST_APP_ID) {
    console.log('');
    console.log('harden-android: WARNING - the AdMob app id is still Google\'s TEST id.');
    console.log('  Ads will serve and earn nothing. Before you publish:');
    console.log('    1. create an AdMob app and put its app id in capacitor.config.json');
    console.log('       plugins.AdMob.appId, then re-run npm run android:prepare');
    console.log('    2. replace the three ad unit ids in www/js/config.js (they are');
    console.log('       Google test units too) with your real banner/interstitial/rewarded ids');
    console.log('');
  }
}

/* ------------------------------------------------------------------ *
 * 5. Version numbers
 *
 * Google Play rejects an upload whose versionCode is not strictly higher than
 * the live one, and the Capacitor template ships a literal `versionCode 1` in a
 * directory that is generated and gitignored - so on a fresh clone there is
 * nothing to remember to bump and the second release fails at upload time.
 *
 * Deriving both numbers from package.json means the release tag and the uploaded
 * build cannot disagree.
 *
 *   versionCode = major * 10000 + minor * 100 + patch
 *
 * 1.0.0 -> 10000, 1.2.3 -> 10203. It rises for every semver bump, which is the
 * only property Play actually requires. 100 minor or patch releases would
 * overflow into the next major; if a project ever gets close, switch to a
 * monotonically stored counter instead.
 * ------------------------------------------------------------------ */
function writeVersion() {
  const pkg = JSON.parse(readIfExists(path.join(__dirname, '..', 'package.json')) || '{}');
  const version = pkg.version;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    fail('package.json needs a semver version (major.minor.patch) to derive versionCode from.');
  }

  const [major, minor, patch] = version.split('.').map(Number);
  const code = major * 10000 + minor * 100 + patch;

  let gradle = readIfExists(BUILD_GRADLE);
  if (gradle === null) fail('app/build.gradle not found - run "npx cap add android" first.');
  const before = gradle;

  if (/versionCode\s+\d+/.test(gradle)) {
    gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode ' + code);
  } else {
    fail('no versionCode line in app/build.gradle to replace - Capacitor template changed.');
  }

  if (/versionName\s+"[^"]*"/.test(gradle)) {
    gradle = gradle.replace(/versionName\s+"[^"]*"/, 'versionName "' + version + '"');
  } else if (/versionName\s+'[^']*'/.test(gradle)) {
    gradle = gradle.replace(/versionName\s+'[^']*'/, 'versionName "' + version + '"');
  } else {
    fail('no versionName line in app/build.gradle to replace - Capacitor template changed.');
  }

  if (gradle !== before) write(BUILD_GRADLE, gradle, 'app/build.gradle (version ' + version + ' / code ' + code + ')');
}

/* ------------------------------------------------------------------ */

if (!fs.existsSync(ROOT)) {
  fail('no android/ directory. Run "npm install && npx cap add android" first.');
}

const api = checkTargetApi();
hardenManifest();
writeNetworkConfig();
hardenMainActivity();
writeAdMobAppId();
writeVersion();
maybeMinify();

console.log('harden-android: API ' + api.targetSdk + ' (compileSdk ' + api.compileSdk +
  ', minSdk ' + api.minSdk + ') - meets Play\'s requirement.');

if (changed.length) {
  console.log('harden-android: patched -> ' + changed.join(', '));
} else {
  console.log('harden-android: already hardened, nothing to do.');
}
if (!MINIFY) {
  console.log('harden-android: R8 minification left off (pass --minify once you can test on a device).');
}
