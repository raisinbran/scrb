import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opus = readFileSync(path.join(root, 'native/windows-capture/scripts/fetch-opus.ps1'), 'utf8');
const hosted = readFileSync(path.join(root, 'scripts/build-win-hosted-tools.ps1'), 'utf8');

describe('pinned Windows capture libopus CMake invocation', () => {
  it('passes the complete 3.5 policy minimum as one native PowerShell argument', () => {
    expect(opus).toContain("'-DCMAKE_POLICY_VERSION_MINIMUM=3.5'");
    expect(opus).not.toMatch(/^\s*-DCMAKE_POLICY_VERSION_MINIMUM=3\.5/m);
  });

  it('selects a generator matching an installed x64 C++ Visual Studio version', () => {
    expect(opus).toContain('-requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64');
    expect(opus).toContain('-property installationVersion');
    expect(opus).toContain("17 { 'Visual Studio 17 2022' }");
    expect(opus).toContain("18 { 'Visual Studio 18 2026' }");
    expect(opus).toContain('Unsupported Visual Studio major version');
    expect(opus).toContain('Selected CMake does not support installed toolchain generator');
    expect(opus).toContain('-G $generator -A x64');
    expect(opus).toContain('--config Release');
  });

  it('runs libopus using CMake from the chosen hosted Visual Studio installation', () => {
    expect(hosted).toContain('$env:SCRB_CMAKE_EXE = $cm');
    expect(hosted).toContain('$savedCmakeExe = $env:SCRB_CMAKE_EXE');
    expect(hosted).toContain('$env:SCRB_CMAKE_EXE = $savedCmakeExe');
    expect(hosted).toContain("Assert-Exit 'pinned capture opus'");
    expect(opus).toContain("$bld = Join-Path $root 'build\\opus'");
  });
});
