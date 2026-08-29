<#
.SYNOPSIS
    Automated Backup & Quota Monitor Script for Neon PostgreSQL / LifeOS DB.
.DESCRIPTION
    1. Reads Neon PostgreSQL connection settings from backend/LifeOS.Api/appsettings.Development.json.
    2. Exports timestamped database backups (SQL dump and/or JSON data export) to ./backups/.
    3. Checks database storage size against Neon free-tier quota (500 MB limit).
    4. Warns if storage exceeds warning threshold (default 80% / 400 MB).
.EXAMPLE
    .\backup-db.ps1
    npm run db:backup
    .\backup-db.ps1 -Continuous -IntervalMinutes 60
#>

param (
    [int]$QuotaLimitMB = 500,
    [int]$WarningThresholdPercent = 80,
    [string]$ConnectionString = "",
    [string]$AppSettingsPath = "$PSScriptRoot\backend\LifeOS.Api\appsettings.Development.json",
    [string]$ApiBaseUrl = "http://localhost:5000",
    [switch]$Continuous,
    [int]$IntervalMinutes = 60
)

# ── 1. Read Connection String ──────────────────────────────────────────────────
$connStr = $ConnectionString

if ([string]::IsNullOrWhiteSpace($connStr) -and (Test-Path $AppSettingsPath)) {
    try {
        $json = Get-Content $AppSettingsPath -Raw | ConvertFrom-Json
        $connStr = $json.ConnectionStrings.DefaultConnection
    } catch {}
}

if ([string]::IsNullOrWhiteSpace($connStr) -and $env:ConnectionStrings__DefaultConnection) {
    $connStr = $env:ConnectionStrings__DefaultConnection
}

if ([string]::IsNullOrWhiteSpace($connStr)) {
    Write-Host "❌ Error: Could not determine connection string. Please pass -ConnectionString or ensure appsettings.Development.json exists." -ForegroundColor Red
    exit 1
}

# Parse connection string properties
$dict = @{}
$connStr.Split(';') | ForEach-Object {
    $parts = $_.Split('=', 2)
    if ($parts.Length -eq 2) {
        $dict[$parts[0].Trim().ToLower()] = $parts[1].Trim()
    }
}

$hostName = $dict["host"]
$dbName   = $dict["database"]
$userName = $dict["username"]
$password = $dict["password"]
$port     = if ($dict["port"]) { $dict["port"] } else { "5432" }

# Ensure backups directory exists
$backupDir = "$PSScriptRoot\backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

do {
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host " 🚀 LifeOS Neon DB Auto-Backup & Quota Monitor" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "📍 Host:     $hostName" -ForegroundColor Gray
    Write-Host "📍 Database: $dbName" -ForegroundColor Gray
    Write-Host "📍 User:     $userName" -ForegroundColor Gray

    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $dbSizeBytes = 0
    $dbSizeFormatted = "Unknown"
    $tableCounts = [ordered]@{}
    $backupCreated = $false

    # ── 2. Attempt API Backup Export ────────────────────────────────────────────────
    try {
        $status = Invoke-RestMethod -Uri "$ApiBaseUrl/api/admin/backup/status" -Method Get -ErrorAction Stop
        $dbSizeBytes = [int64]$status.databaseSizeBytes
        $dbSizeFormatted = [string]$status.databaseSizeFormatted
        $tableCounts = $status.counts

        $exportData = Invoke-RestMethod -Uri "$ApiBaseUrl/api/admin/backup/export" -Method Get -ErrorAction Stop
        $backupJsonFile = "$backupDir\neon_backup_$timestamp.json"
        $exportData | ConvertTo-Json -Depth 25 | Set-Content -Path $backupJsonFile -Encoding UTF8
        $jsonMB = [math]::Round((Get-Item $backupJsonFile).Length / 1MB, 2)
        Write-Host "✅ JSON Data Backup created via API: $backupJsonFile ($jsonMB MB)" -ForegroundColor Green
        $backupCreated = $true
    } catch {
        Write-Host "ℹ️ API server not reachable at $ApiBaseUrl. Falling back to CLI tools..." -ForegroundColor Gray
    }

    # ── 3. Attempt pg_dump SQL Export ──────────────────────────────────────────────
    $pgDumpCmd = Get-Command "pg_dump" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
    if (-not $pgDumpCmd) {
        $possiblePaths = @(
            "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
            "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
            "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
            "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe"
        )
        foreach ($p in $possiblePaths) {
            if (Test-Path $p) { $pgDumpCmd = $p; break }
        }
    }

    if ($pgDumpCmd) {
        $sqlFile = "$backupDir\neon_backup_$timestamp.sql"
        $env:PGPASSWORD = $password
        $dumpOutput = & $pgDumpCmd --host=$hostName --port=$port --username=$userName --dbname=$dbName --no-owner --no-privileges --file=$sqlFile 2>&1
        $env:PGPASSWORD = $null

        if ((Test-Path $sqlFile) -and ((Get-Item $sqlFile).Length -gt 0)) {
            $sqlMB = [math]::Round((Get-Item $sqlFile).Length / 1MB, 2)
            Write-Host "✅ SQL Backup created via pg_dump: $sqlFile ($sqlMB MB)" -ForegroundColor Green
            $backupCreated = $true
        } elseif ($dumpOutput -match "version mismatch") {
            Write-Host "⚠️ pg_dump version mismatch detected with Neon server version." -ForegroundColor Yellow
        }
    }

    if (-not $backupCreated) {
        Write-Host "💡 To generate backups: Ensure backend server is running ($ApiBaseUrl) or PostgreSQL pg_dump is installed." -ForegroundColor Yellow
    }

    # ── 4. Storage & Quota Health Report ───────────────────────────────────────────
    Write-Host "-----------------------------------------------------------" -ForegroundColor Gray
    Write-Host "📊 Quota & Storage Health Report:" -ForegroundColor Cyan

    $usedMB = [math]::Round($dbSizeBytes / 1MB, 2)
    $percentUsed = [math]::Round(($usedMB / $QuotaLimitMB) * 100, 1)
    $statusColor = if ($percentUsed -ge $WarningThresholdPercent) { "Red" } else { "Green" }

    Write-Host "   Database Size: $dbSizeFormatted ($usedMB MB / $QuotaLimitMB MB limit)" -ForegroundColor $statusColor
    Write-Host "   Quota Usage:   $percentUsed% of Neon free tier limit" -ForegroundColor $statusColor

    if ($tableCounts -and $tableCounts.Keys -and $tableCounts.Keys.Count -gt 0) {
        Write-Host "   Table Records:" -ForegroundColor Gray
        foreach ($k in $tableCounts.Keys) {
            Write-Host "     - ${k}: $($tableCounts[$k]) rows" -ForegroundColor Gray
        }
    }

    if ($percentUsed -ge $WarningThresholdPercent) {
        Write-Host ""
        Write-Host "⚠️ WARNING: Database storage ($percentUsed%) has reached the warning threshold ($WarningThresholdPercent%)!" -ForegroundColor Red
        Write-Host "   Back up your data and remove large media attachments or old records before hitting Neon's 500 MB quota." -ForegroundColor Red
    } else {
        Write-Host "✅ Database storage is healthy within free-tier quota limits." -ForegroundColor Green
    }

    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

    if ($Continuous) {
        Write-Host "⏳ Continuous mode: Next automatic backup in $IntervalMinutes minute(s)... (Press Ctrl+C to stop)" -ForegroundColor Yellow
        Start-Sleep -Seconds ($IntervalMinutes * 60)
    }

} while ($Continuous)
