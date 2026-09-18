#!/usr/bin/env node
/**
 * configure-signing.js
 *
 * Injects a release signing config into the generated Capacitor Android
 * project (android/app/build.gradle) so CI can produce a signed AAB.
 *
 * Credentials are read from the environment at build time, never committed:
 *   KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
 *
 * Idempotent: running it twice is a no-op.
 */
const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (!fs.existsSync(gradlePath)) {
  console.error(`Cannot find ${gradlePath}. Run "npx cap add android" first.`);
  process.exit(1);
}

let src = fs.readFileSync(gradlePath, 'utf8');

if (src.includes('packetdefense-release-signing')) {
  console.log('Signing config already present - nothing to do.');
  process.exit(0);
}

const signingBlock = `
        // packetdefense-release-signing
        release {
            storeFile file(System.getenv("KEYSTORE_PATH") ?: "release.keystore")
            storePassword System.getenv("KEYSTORE_PASSWORD") ?: ""
            keyAlias System.getenv("KEY_ALIAS") ?: ""
            keyPassword System.getenv("KEY_PASSWORD") ?: ""
        }
`;

const beforeSigning = src;
src = src.replace(/signingConfigs\s*\{/, (m) => m + signingBlock);
if (src === beforeSigning) {
  console.error('Could not find a signingConfigs block to patch.');
  process.exit(1);
}

// Point the release build type at the new signing config.
src = src.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{)/,
  '$1\n            signingConfig signingConfigs.release'
);

fs.writeFileSync(gradlePath, src);
console.log('Injected release signing config into android/app/build.gradle');
