# Void Keystrokes - Build script
$ErrorActionPreference = 'Stop'
$ModDir = Split-Path $MyInvocation.MyCommand.Path -Parent

# 1. Find JDK (needs javac.exe)
$javac = $null
$candidates = @("$env:JAVA_HOME\bin\javac.exe","C:\Program Files\Java\jdk-23\bin\javac.exe","C:\Program Files\Java\jdk-25\bin\javac.exe","C:\Program Files\Java\jdk-21\bin\javac.exe","C:\Program Files\Java\jdk-17\bin\javac.exe")
foreach ($c in $candidates) { if (Test-Path $c) { $javac = $c; break } }
if (-not $javac) { Write-Host "No JDK found. Install JDK 21+ from https://adoptium.net" -ForegroundColor Red; exit 1 }
Write-Host "JDK: $javac" -ForegroundColor Green
$env:JAVA_HOME = (Get-Item $javac).Directory.Parent.FullName

# 2. Build
& "$ModDir\gradlew.bat" build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Done
$jar = Get-ChildItem -Path "$ModDir\build\libs" -Filter "keystrokes-*.jar" | Select-Object -First 1
if ($jar) { Write-Host "Mod built: $($jar.FullName)" -ForegroundColor Green }
else { Write-Host "JAR not found in build/libs" -ForegroundColor Red; exit 1 }