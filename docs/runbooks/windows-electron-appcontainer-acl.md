# Windows Electron AppContainer filesystem access

This runbook records the BCHEN-W10 startup repair observed on 2026-11-17. The repair grants the standard Windows application-package group read/execute access only to Electron's runtime directory. It does not change Electron's Chromium sandbox or any application security setting.

## Observed failure

The preserved startup stderr at `%TEMP%\scrb-w10-10am-launch-20261117.stderr.txt` reported:

```text
[50128:1117/092107.932:FATAL:electron\shell\browser\win\install_dir_access.cc:52] Sandboxed processes cannot read C:\Users\bchen\scrb-m1-w10-20261117\node_modules\electron\dist: its ACL has an entry for an AppContainer package SID but none for ALL APPLICATION PACKAGES, so Windows denies the sandbox token access. Grant it with: icacls "C:\Users\bchen\scrb-m1-w10-20261117\node_modules\electron\dist" /grant *S-1-15-2-1:(OI)(CI)(RX)
```

The access check failed because the reported directory did not grant **ALL APPLICATION PACKAGES** read/execute permission. The FATAL was observed from a sandboxed Electron launch; a screenshot also showed the app's separate native shared-library warning in front of first-run location onboarding.

The standard host user was `LEAELLIOTT\bchen`. Before the correction, the inspected `dist` ACL had no matching `ALL APPLICATION PACKAGES` ACE. The Electron runtime directory, `icudtl.dat`, its immediate parent, and the user-profile root were inspected. No broad profile or repository permission change was made.

## Preserved ACL and targeted correction

Before applying the grant, the ACL was saved to:

`C:\Users\bchen\AppData\Local\Temp\scrb-electron-acl-canonical-20261117-104612.txt`

From the verified canonical repository, in an ordinary non-administrator PowerShell session, the only permission change was:

```powershell
$dist = Join-Path $repo 'node_modules\electron\dist'
icacls.exe $dist /grant '*S-1-15-2-1:(OI)(CI)(RX)'
```

The SID is the well-known **ALL APPLICATION PACKAGES** group. `(OI)(CI)(RX)` grants read/execute and inheritance to files and subdirectories; it grants no write access. The ACL backup was retained unchanged.

## Verification

After the change, `icacls` showed:

- `node_modules\electron\dist`: `APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(OI)(CI)(RX)`.
- `node_modules\electron\dist\icudtl.dat`: the same grant inherited as `(I)(RX)`.

The Electron executable SHA-256 observed during the repair was `32E357FC856FEADD1E51531F47811D2621483E5A58815EB4999154D7C9BAEA3B`.

The native warning was dismissed in the isolated startup profile, and a fictional New Mexico location was saved through the UI's normal settings handler. Scribe reached its normal Live screen and showed `Ready to record` / `Not recording`. The process later disappeared, but no UI close action was observed. Therefore this is evidence that the warning no longer blocked onboarding, **not** evidence of a normal shutdown.

## Other stderr lines — separate from the ACL cause

The same stderr file also recorded a Windows process-singleton lock-file `Access is denied` error and a Windows credential decryption error (`Key not valid for use in specified state`). Those messages are not part of the ACL FATAL. Their cause and relationship to the launch attempts were not established; they were not fixed by the `dist` ACL grant.

## Shutdown evidence — separate finding

Earlier `CloseMainWindow()` attempts returned false while the native warning was present. After the warning was dismissed and onboarding completed, the recorded Electron process and its listed children were absent, but the available observation did not establish that Scribe closed through its UI or that its normal shutdown handler completed. Do not classify that sequence as a shutdown defect or as a normal-quit pass. Verify a UI-initiated quit separately on a host launch and preserve its exit evidence.

## Prohibited workarounds

- Do not disable Electron or Chromium sandboxing.
- Do not grant Full Control, write access, ownership, or broad access to the repository, profile, or user files.
- Do not reset ACLs or inheritance.
- Do not change Windows security policy, delete the profile, or suppress the separate voice-profile privacy banner.
- Do not interpret the in-app shared-library notice as authorization to modify filesystem permissions.
