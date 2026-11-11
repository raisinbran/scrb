param($csv,$obsPid)
"utc,observer_cpu_s,observer_ws_mb,electron_cpu_s,electron_ws_mb" | Out-File $csv -Encoding ascii
while ($true) { $o = Get-Process -Id $obsPid -ErrorAction SilentlyContinue; $el = Get-Process electron -ErrorAction SilentlyContinue
  "{0},{1},{2},{3},{4}" -f [DateTime]::UtcNow.ToString('o'), [Math]::Round($o.CPU,2), [Math]::Round($o.WorkingSet64/1MB,1), [Math]::Round(($el|Measure CPU -Sum).Sum,2), [Math]::Round(($el|Measure WorkingSet64 -Sum).Sum/1MB,1) | Add-Content $csv -Encoding ascii; Start-Sleep 5 }
