/**
 * Expo config plugin: adds the trainer's Apple Watch app (and its complication) to the iOS build.
 * Registered in app.config.ts only when SPOTTER_WATCH=1, so web exports, Android and today's EAS builds are
 * unchanged. Adapted from the reference app's plugins/withWatchApp.js, with these differences:
 *
 *  - White-label: every name, bundle id, icon, colour and permission prompt comes from the tenant config at
 *    build time (docs/features/watch.md "White-label"). Nothing hard-coded: no team id, no project name.
 *  - Edits the Xcode project through the `xcode` model Expo hands to withXcodeProject (no regex surgery on
 *    pbxproj text), adding objects directly so each target gets its own build files.
 *  - Two watchOS targets: the watch app (single-target watchOS app, watchOS 10) and a WidgetKit extension for
 *    the complication, embedded in the watch app; the watch app is embedded in the iPhone app.
 *  - A small native module (SpotterWatchModule.m) in the iPhone app: WCSession, startWatchApp, mirroring.
 *
 * NOT RUN IN A REAL XCODE BUILD HERE (no macOS). `expo prebuild` on Linux was used to check the generated
 * project parses and contains the targets (see docs/features/watch.md, "Verified").
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject, withInfoPlist, withEntitlementsPlist } = require('expo/config-plugins');
const { watchAccent, colorComponents } = require('./watch/brandTokens');

const WATCH_DIR = 'SpotterWatch'; // source folder (apps/client/watch/SpotterWatch) and its copy under ios/
const APP_TARGET = 'Watch';
const EXT_TARGET = 'Complication';
const ICON_SLOTS = require('./watch/watch-icon-sizes.json').images;

/** Everything per tenant, derived once. */
function watchSpec(config) {
  const tenant = config.extra && config.extra.tenant;
  if (!tenant) throw new Error('[withSpotterWatch] config.extra.tenant is missing');
  const iosId = config.ios && config.ios.bundleIdentifier;
  if (!iosId) throw new Error('[withSpotterWatch] ios.bundleIdentifier is missing');
  const { accent, accentInk } = watchAccent(tenant.brandColor);
  return {
    tenant,
    appName: tenant.appName,
    shortName: (tenant.shortName || tenant.appName).slice(0, 15),
    coachName: tenant.coach.name,
    monogram: tenant.coach.monogram,
    accent,
    accentInk,
    phoneId: iosId,
    watchId: `${iosId}.watchkitapp`,
    extId: `${iosId}.watchkitapp.complication`,
    appGroup: `group.${iosId}.watch`,
    version: config.version || '1.0.0',
    build: (config.ios && config.ios.buildNumber) || '1',
  };
}

/* ---------- generated files (pure functions, also used by scripts/check-watch-whitelabel.mjs) ---------- */

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function plist(entries) {
  const body = Object.entries(entries)
    .map(([k, v]) => {
      if (typeof v === 'boolean') return `\t<key>${k}</key>\n\t<${v}/>`;
      if (Array.isArray(v)) return `\t<key>${k}</key>\n\t<array>\n${v.map((x) => `\t\t<string>${xml(x)}</string>`).join('\n')}\n\t</array>`;
      if (v && typeof v === 'object') {
        const inner = Object.entries(v).map(([ik, iv]) => `\t\t<key>${ik}</key>\n\t\t<string>${xml(iv)}</string>`).join('\n');
        return `\t<key>${k}</key>\n\t<dict>\n${inner}\n\t</dict>`;
      }
      return `\t<key>${k}</key>\n\t<string>${xml(v)}</string>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>\n`;
}

/** Keys the Swift code reads at run time for the build-time brand (Brand.buildTime in AppGroup.swift). */
function brandKeys(s) {
  return { TenantCoachName: s.coachName, TenantMonogram: s.monogram, TenantAccentInk: s.accentInk, TenantAppGroup: s.appGroup };
}

function watchInfoPlist(s) {
  return plist({
    CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
    CFBundleDisplayName: s.appName,
    CFBundleName: s.shortName,
    CFBundleExecutable: '$(EXECUTABLE_NAME)',
    CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
    CFBundleShortVersionString: '$(MARKETING_VERSION)',
    CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
    WKApplication: true,
    WKCompanionAppBundleIdentifier: s.phoneId,
    WKRunsIndependentlyOfCompanionApp: false,
    WKBackgroundModes: ['workout-processing'],
    UIAppFonts: ['BarlowCondensed-Bold.ttf'],
    // Permission prompts name the trainer's app, never ours (white-label).
    NSHealthShareUsageDescription: `${s.appName} reads your heart rate during sessions so ${s.coachName} can see how you're recovering.`,
    NSHealthUpdateUsageDescription: `${s.appName} saves your sessions to Apple Health as workouts.`,
    ...brandKeys(s),
  });
}

function extInfoPlist(s) {
  return plist({
    CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
    CFBundleDisplayName: s.appName,
    CFBundleName: s.shortName,
    CFBundleExecutable: '$(EXECUTABLE_NAME)',
    CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
    CFBundleShortVersionString: '$(MARKETING_VERSION)',
    CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
    UIAppFonts: ['BarlowCondensed-Bold.ttf'],
    NSExtension: { NSExtensionPointIdentifier: 'com.apple.widgetkit-extension' },
    ...brandKeys(s),
  });
}

function entitlements(s, healthKit) {
  return plist({
    ...(healthKit ? { 'com.apple.developer.healthkit': true } : {}),
    'com.apple.security.application-groups': [s.appGroup],
  });
}

/** Asset catalog: AppIcon at every watchOS size from the tenant's icon, AccentColor from the tenant brand. */
function writeAssets(dir, s, iconDir) {
  const cat = path.join(dir, 'Assets.xcassets');
  fs.rmSync(cat, { recursive: true, force: true });
  fs.mkdirSync(path.join(cat, 'AppIcon.appiconset'), { recursive: true });
  fs.mkdirSync(path.join(cat, 'AccentColor.colorset'), { recursive: true });
  fs.writeFileSync(path.join(cat, 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2));
  if (iconDir) {
    const images = ICON_SLOTS.map(({ px, ...slot }) => {
      const file = `icon-${px}.png`;
      const src = path.join(iconDir, file);
      if (!fs.existsSync(src)) throw new Error(`[withSpotterWatch] Missing ${src}. Run: python3 scripts/make-tenant-icons.py --watch ${s.tenant.slug}`);
      fs.copyFileSync(src, path.join(cat, 'AppIcon.appiconset', file));
      return { filename: file, ...slot, idiom: slot.idiom || 'watch' };
    });
    fs.writeFileSync(path.join(cat, 'AppIcon.appiconset', 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2));
  }
  fs.writeFileSync(
    path.join(cat, 'AccentColor.colorset', 'Contents.json'),
    JSON.stringify({ colors: [{ idiom: 'universal', color: { 'color-space': 'srgb', components: colorComponents(s.accent) } }], info: { author: 'xcode', version: 1 } }, null, 2),
  );
}

/** Writes everything the two watch targets need under ios/SpotterWatch. Returns the Swift files per target. */
function writeWatchSources({ projectRoot, iosDir, spec }) {
  const src = path.join(projectRoot, 'watch', WATCH_DIR);
  const dest = path.join(iosDir, WATCH_DIR);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  const font = require.resolve('@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf', { paths: [projectRoot] });
  fs.copyFileSync(font, path.join(dest, 'BarlowCondensed-Bold.ttf'));
  fs.writeFileSync(path.join(dest, 'Info.plist'), watchInfoPlist(spec));
  fs.writeFileSync(path.join(dest, 'Watch.entitlements'), entitlements(spec, true));
  writeAssets(dest, spec, path.join(projectRoot, 'assets', 'tenants', spec.tenant.slug, 'watch'));
  const ext = path.join(dest, 'Complication');
  fs.writeFileSync(path.join(ext, 'Info.plist'), extInfoPlist(spec));
  fs.writeFileSync(path.join(ext, 'Complication.entitlements'), entitlements(spec, false));
  writeAssets(ext, spec, null);
  return {
    app: [...listSwift(dest, ''), ...listSwift(path.join(dest, 'Shared'), 'Shared/')],
    ext: [...listSwift(ext, 'Complication/'), ...listSwift(path.join(dest, 'Shared'), 'Shared/')],
  };
}

function listSwift(dir, prefix) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.swift')).sort().map((f) => prefix + f) : [];
}

/* ---------- Xcode project ---------- */

const q = (v) => (/^[A-Za-z0-9_./]+$/.test(String(v)) ? String(v) : JSON.stringify(String(v)));

function put(project, section, uuid, obj, comment) {
  const objects = project.hash.project.objects;
  objects[section] = objects[section] || {};
  objects[section][uuid] = obj;
  if (comment) objects[section][`${uuid}_comment`] = comment;
}

function fileRef(project, relPath, type) {
  const uuid = project.generateUuid();
  put(project, 'PBXFileReference', uuid, { isa: 'PBXFileReference', lastKnownFileType: type, name: q(path.basename(relPath)), path: q(`${WATCH_DIR}/${relPath}`), sourceTree: 'SOURCE_ROOT' }, path.basename(relPath));
  return uuid;
}

function buildFile(project, ref, name, phaseName) {
  const uuid = project.generateUuid();
  put(project, 'PBXBuildFile', uuid, { isa: 'PBXBuildFile', fileRef: ref, fileRef_comment: name }, `${name} in ${phaseName}`);
  return { value: uuid, comment: `${name} in ${phaseName}` };
}

function phase(project, isa, name, files, extra = {}) {
  const uuid = project.generateUuid();
  put(project, isa, uuid, { isa, buildActionMask: 2147483647, files, runOnlyForDeploymentPostprocessing: 0, ...extra }, name);
  return { value: uuid, comment: name };
}

function configList(project, targetName, settings) {
  const mk = (name, extra) => {
    const uuid = project.generateUuid();
    const buildSettings = Object.fromEntries(Object.entries({ ...settings, ...extra }).map(([k, v]) => [k, Array.isArray(v) ? v.map(q) : q(v)]));
    put(project, 'XCBuildConfiguration', uuid, { isa: 'XCBuildConfiguration', buildSettings, name }, name);
    return { value: uuid, comment: name };
  };
  const list = project.generateUuid();
  const comment = `Build configuration list for PBXNativeTarget "${targetName}"`;
  put(project, 'XCConfigurationList', list, {
    isa: 'XCConfigurationList',
    buildConfigurations: [mk('Debug', { SWIFT_OPTIMIZATION_LEVEL: '-Onone', SWIFT_ACTIVE_COMPILATION_CONDITIONS: 'DEBUG', DEBUG_INFORMATION_FORMAT: 'dwarf' }), mk('Release', { SWIFT_OPTIMIZATION_LEVEL: '-O', DEBUG_INFORMATION_FORMAT: 'dwarf-with-dsym' })],
    defaultConfigurationIsVisible: 0,
    defaultConfigurationName: 'Release',
  }, comment);
  return { value: list, comment };
}

function addTarget(project, { name, productType, productExt, files, resources, settings }) {
  const productRef = project.generateUuid();
  put(project, 'PBXFileReference', productRef, { isa: 'PBXFileReference', explicitFileType: productExt === 'app' ? 'wrapper.application' : '"wrapper.app-extension"', includeInIndex: 0, path: q(`${name}.${productExt}`), sourceTree: 'BUILT_PRODUCTS_DIR' }, `${name}.${productExt}`);
  const sources = files.map((f) => buildFile(project, fileRef(project, f, 'sourcecode.swift'), path.basename(f), 'Sources'));
  const res = resources.map(([f, type]) => buildFile(project, fileRef(project, f, type), path.basename(f), 'Resources'));
  const target = project.generateUuid();
  const phases = [phase(project, 'PBXSourcesBuildPhase', 'Sources', sources), phase(project, 'PBXFrameworksBuildPhase', 'Frameworks', []), phase(project, 'PBXResourcesBuildPhase', 'Resources', res)];
  put(project, 'PBXNativeTarget', target, {
    isa: 'PBXNativeTarget',
    buildConfigurationList: configList(project, name, settings).value,
    buildConfigurationList_comment: `Build configuration list for PBXNativeTarget "${name}"`,
    buildPhases: phases,
    buildRules: [],
    dependencies: [],
    name: q(name),
    productName: q(name),
    productReference: productRef,
    productReference_comment: `${name}.${productExt}`,
    productType: `"${productType}"`,
  }, name);
  const proj = project.getFirstProject().firstProject;
  proj.targets.push({ value: target, comment: name });
  proj.attributes = proj.attributes || {};
  proj.attributes.TargetAttributes = proj.attributes.TargetAttributes || {};
  proj.attributes.TargetAttributes[target] = { CreatedOnToolsVersion: '15.0' };
  return { target, productRef, name, productExt };
}

/** host gets a dependency on child and a copy-files phase embedding child's product. */
function embed(project, host, child, { phaseName, dstSubfolderSpec, dstPath }) {
  const proxy = project.generateUuid();
  put(project, 'PBXContainerItemProxy', proxy, { isa: 'PBXContainerItemProxy', containerPortal: project.hash.project.rootObject, containerPortal_comment: 'Project object', proxyType: 1, remoteGlobalIDString: child.target, remoteInfo: q(child.name) }, 'PBXContainerItemProxy');
  const dep = project.generateUuid();
  put(project, 'PBXTargetDependency', dep, { isa: 'PBXTargetDependency', target: child.target, target_comment: child.name, targetProxy: proxy, targetProxy_comment: 'PBXContainerItemProxy' }, 'PBXTargetDependency');
  const product = `${child.name}.${child.productExt}`;
  const bf = project.generateUuid();
  put(project, 'PBXBuildFile', bf, { isa: 'PBXBuildFile', fileRef: child.productRef, fileRef_comment: product, settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] } }, `${product} in ${phaseName}`);
  const copy = phase(project, 'PBXCopyFilesBuildPhase', phaseName, [{ value: bf, comment: `${product} in ${phaseName}` }], { dstPath: q(dstPath), dstSubfolderSpec, name: q(phaseName) });
  const t = project.pbxNativeTargetSection()[host];
  t.dependencies.push({ value: dep, comment: 'PBXTargetDependency' });
  t.buildPhases.push(copy);
}

function mainTargetUuid(project) {
  const section = project.pbxNativeTargetSection();
  return Object.keys(section).find((k) => !k.endsWith('_comment') && String(section[k].productType).includes('com.apple.product-type.application') && !String(section[k].productType).includes('watch') && !['Watch', '"Watch"'].includes(section[k].name));
}

function inherited(project, mainUuid, key) {
  const t = project.pbxNativeTargetSection()[mainUuid];
  const list = project.pbxXCConfigurationList()[t.buildConfigurationList];
  for (const c of list.buildConfigurations) {
    const v = project.pbxXCBuildConfigurationSection()[c.value].buildSettings[key];
    if (v) return String(v).replace(/^"|"$/g, '');
  }
  return null;
}

function addWatchTargets(project, spec, files, projectName) {
  if (Object.values(project.pbxNativeTargetSection()).some((t) => t && (t.name === APP_TARGET || t.name === `"${APP_TARGET}"`))) return; // idempotent
  const main = mainTargetUuid(project);
  if (!main) throw new Error('[withSpotterWatch] iPhone app target not found');
  const team = inherited(project, main, 'DEVELOPMENT_TEAM');
  const common = {
    SDKROOT: 'watchos',
    WATCHOS_DEPLOYMENT_TARGET: '10.0',
    TARGETED_DEVICE_FAMILY: '4',
    SWIFT_VERSION: '5.0',
    CODE_SIGN_STYLE: 'Automatic',
    ...(team ? { DEVELOPMENT_TEAM: team } : {}),
    MARKETING_VERSION: spec.version,
    CURRENT_PROJECT_VERSION: spec.build,
    PRODUCT_NAME: '$(TARGET_NAME)',
    SKIP_INSTALL: 'YES',
    GENERATE_INFOPLIST_FILE: 'NO',
    ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: 'AccentColor',
    LD_RUNPATH_SEARCH_PATHS: '$(inherited) @executable_path/Frameworks',
  };
  const app = addTarget(project, {
    name: APP_TARGET,
    productType: 'com.apple.product-type.application',
    productExt: 'app',
    files: files.app,
    resources: [['Assets.xcassets', 'folder.assetcatalog'], ['BarlowCondensed-Bold.ttf', 'file']],
    settings: {
      ...common,
      INFOPLIST_FILE: `${WATCH_DIR}/Info.plist`,
      CODE_SIGN_ENTITLEMENTS: `${WATCH_DIR}/Watch.entitlements`,
      PRODUCT_BUNDLE_IDENTIFIER: spec.watchId,
      ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
    },
  });
  const ext = addTarget(project, {
    name: EXT_TARGET,
    productType: 'com.apple.product-type.app-extension',
    productExt: 'appex',
    files: files.ext,
    resources: [['Complication/Assets.xcassets', 'folder.assetcatalog'], ['BarlowCondensed-Bold.ttf', 'file']],
    settings: {
      ...common,
      INFOPLIST_FILE: `${WATCH_DIR}/Complication/Info.plist`,
      CODE_SIGN_ENTITLEMENTS: `${WATCH_DIR}/Complication/Complication.entitlements`,
      PRODUCT_BUNDLE_IDENTIFIER: spec.extId,
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      LD_RUNPATH_SEARCH_PATHS: '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks',
    },
  });
  // Complication inside the watch app; the watch app inside the iPhone app.
  embed(project, app.target, ext, { phaseName: 'Embed Foundation Extensions', dstSubfolderSpec: 13, dstPath: '' });
  embed(project, main, app, { phaseName: 'Embed Watch Content', dstSubfolderSpec: 16, dstPath: '$(CONTENTS_FOLDER_PATH)/Watch' });

  // The phone's native module goes into the iPhone app's Sources phase.
  const ref = project.generateUuid();
  put(project, 'PBXFileReference', ref, { isa: 'PBXFileReference', lastKnownFileType: 'sourcecode.c.objc', name: 'SpotterWatchModule.m', path: q(`${projectName}/SpotterWatchModule.m`), sourceTree: 'SOURCE_ROOT' }, 'SpotterWatchModule.m');
  const sourcesPhase = project.pbxNativeTargetSection()[main].buildPhases.find((p) => p.comment === 'Sources');
  const phaseObj = project.hash.project.objects.PBXSourcesBuildPhase[sourcesPhase.value];
  phaseObj.files.push(buildFile(project, ref, 'SpotterWatchModule.m', 'Sources'));

  // Show the sources in Xcode's navigator.
  const group = project.generateUuid();
  const children = Object.entries(project.pbxFileReferenceSection())
    .filter(([k, v]) => !k.endsWith('_comment') && typeof v === 'object' && String(v.path).replace(/"/g, '').startsWith(`${WATCH_DIR}/`))
    .map(([k, v]) => ({ value: k, comment: String(v.name).replace(/"/g, '') }));
  put(project, 'PBXGroup', group, { isa: 'PBXGroup', children, name: q(WATCH_DIR), sourceTree: '"<group>"' }, WATCH_DIR);
  const mainGroup = project.getFirstProject().firstProject.mainGroup;
  project.hash.project.objects.PBXGroup[mainGroup].children.push({ value: group, comment: WATCH_DIR });
}

/* ---------- the plugin ---------- */

function withSpotterWatch(config) {
  const spec = watchSpec(config);
  let files = null;

  // EAS managed credentials provision extra targets only when told about them (to verify on the first build).
  const eas = (config.extra = config.extra || {}).eas || (config.extra.eas = {});
  const exp = (((eas.build = eas.build || {}).experimental = eas.build.experimental || {}).ios = eas.build.experimental.ios || {});
  exp.appExtensions = [
    ...(exp.appExtensions || []).filter((x) => x.targetName !== APP_TARGET && x.targetName !== EXT_TARGET),
    { targetName: APP_TARGET, bundleIdentifier: spec.watchId, entitlements: { 'com.apple.developer.healthkit': true, 'com.apple.security.application-groups': [spec.appGroup] } },
    { targetName: EXT_TARGET, bundleIdentifier: spec.extId, entitlements: { 'com.apple.security.application-groups': [spec.appGroup] } },
  ];

  // iPhone app: App Group (shared with nothing on the phone today, reserved for the brief widget), HealthKit
  // usage already comes from the health plugin. WKCompanionAppBundleIdentifier lives in the watch's plist.
  config = withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.developer.healthkit'] = true;
    return c;
  });
  config = withInfoPlist(config, (c) => {
    // startWatchApp is a HealthKit call: the phone's own prompt names the trainer's app too.
    c.modResults.NSHealthShareUsageDescription = c.modResults.NSHealthShareUsageDescription || `${spec.appName} reads your health data so ${spec.coachName} can see it next to your training.`;
    return c;
  });

  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const iosDir = c.modRequest.platformProjectRoot;
      files = writeWatchSources({ projectRoot: c.modRequest.projectRoot, iosDir, spec });
      fs.copyFileSync(path.join(__dirname, 'watch', 'SpotterWatchModule.m'), path.join(iosDir, c.modRequest.projectName, 'SpotterWatchModule.m'));
      return c;
    },
  ]);

  config = withXcodeProject(config, (c) => {
    const projectRoot = c.modRequest.projectRoot;
    const ext = path.join(projectRoot, 'watch', WATCH_DIR);
    const f = files || {
      app: [...listSwift(ext, ''), ...listSwift(path.join(ext, 'Shared'), 'Shared/')],
      ext: [...listSwift(path.join(ext, 'Complication'), 'Complication/'), ...listSwift(path.join(ext, 'Shared'), 'Shared/')],
    };
    addWatchTargets(c.modResults, spec, f, c.modRequest.projectName);
    return c;
  });
  return config;
}

module.exports = withSpotterWatch;
module.exports.watchSpec = watchSpec;
module.exports.watchInfoPlist = watchInfoPlist;
module.exports.extInfoPlist = extInfoPlist;
module.exports.entitlements = entitlements;
