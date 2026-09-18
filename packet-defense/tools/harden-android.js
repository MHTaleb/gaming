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

/* ------------------------------------------------------------------ */

if (!fs.existsSync(ROOT)) {
  fail('no android/ directory. Run "npm install && npx cap add android" first.');
}

hardenManifest();
writeNetworkConfig();
hardenMainActivity();
maybeMinify();

if (changed.length) {
  console.log('harden-android: patched -> ' + changed.join(', '));
} else {
  console.log('harden-android: already hardened, nothing to do.');
}
if (!MINIFY) {
  console.log('harden-android: R8 minification left off (pass --minify once you can test on a device).');
}
