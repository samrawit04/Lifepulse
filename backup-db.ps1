<#
.SYNOPSIS
    Automated Backup & Quota Monitor Script for Neon PostgreSQL / LifeOS DB.
.DESCRIPTION
    1. Reads Neon PostgreSQL connection settings from backend/LifeOS.Api/appsettings.Development.json.
    2. Exports timestamped database backups (SQL dump and/or JSON data export) to ./backups/.
    3. Checks database storage size against Neon free-tier quota (500 MB limit).
    4. Warns if storage exceeds warning threshold (default 80% / 400 MB).
    5. Calls the protected admin API using the X-Admin-Key header. The key is read from
       -AdminKey, the LIFEPULSE_ADMIN_KEY environment variable, or Admin:ApiKey in
       appsettings.Development.json (in that order).
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
    [string]$AdminKey = "",
    [switch]$Continuous,
    [int]$IntervalMinutes = 60
)

# -- 1. Read Connection String --------------------------------------------------
$connStr = $ConnectionString

$appSettings = $null
if (Test-Path $AppSettingsPath) {
    try { $appSettings = Get-Content $AppSettingsPath -Raw | ConvertFrom-Json } catch {}
}

if ([string]::IsNullOrWhiteSpace($connStr) -and $appSettings) {
    $connStr = $appSettings.ConnectionStrings.DefaultConnection
}

# Admin key for the protected backup API
if ([string]::IsNullOrWhiteSpace($AdminKey) -and $env:LIFEPULSE_ADMIN_KEY) {
    $AdminKey = $env:LIFEPULSE_ADMIN_KEY
}
if ([string]::IsNullOrWhiteSpace($AdminKey) -and $appSettings -and $appSettings.Admin) {
    $AdminKey = [string]$appSettings.Admin.ApiKey
}
$adminHeaders = @{ "X-Admin-Key" = $AdminKey }

if ([string]::IsNullOrWhiteSpace($connStr) -and $env:ConnectionStrings__DefaultConnection) {
    $connStr = $env:ConnectionStrings__DefaultConnection
}

if ([string]::IsNullOrWhiteSpace($connStr)) {
    Write-Host "[ERROR] Error: Could not determine connection string. Please pass -ConnectionString or ensure appsettings.Development.json exists." -ForegroundColor Red
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
    Write-Host "===========================================================" -ForegroundColor Cyan
    Write-Host " LifeOS Neon DB Auto-Backup & Quota Monitor" -ForegroundColor Cyan
    Write-Host "===========================================================" -ForegroundColor Cyan
    Write-Host "Host:     $hostName" -ForegroundColor Gray
    Write-Host "Database: $dbName" -ForegroundColor Gray
    Write-Host "User:     $userName" -ForegroundColor Gray

    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $dbSizeBytes = 0
    $dbSizeFormatted = "Unknown"
    $tableCounts = [ordered]@{}
    $backupCreated = $false

    # -- 2. Attempt API Backup Export ------------------------------------------------
    try {
        $status = Invoke-RestMethod -Uri "$ApiBaseUrl/api/admin/backup/status" -Method Get -Headers $adminHeaders -ErrorAction Stop
        # API uses snake_case JSON (database_size_bytes); accept camelCase too
        $sizeBytes = if ($null -ne $status.database_size_bytes) { $status.database_size_bytes } else { $status.databaseSizeBytes }
        $sizeText  = if ($null -ne $status.database_size_formatted) { $status.database_size_formatted } else { $status.databaseSizeFormatted }
        if ($null -ne $sizeBytes) { $dbSizeBytes = [int64]$sizeBytes }
        if ($sizeText) { $dbSizeFormatted = [string]$sizeText }
        $tableCounts = [ordered]@{}
        if ($status.counts) {
            foreach ($prop in $status.counts.PSObject.Properties) { $tableCounts[$prop.Name] = $prop.Value }
        }

        $exportData = Invoke-RestMethod -Uri "$ApiBaseUrl/api/admin/backup/export" -Method Get -Headers $adminHeaders -ErrorAction Stop
        $backupJsonFile = "$backupDir\neon_backup_$timestamp.json"
        $exportData | ConvertTo-Json -Depth 25 | Set-Content -Path $backupJsonFile -Encoding UTF8
        $jsonMB = [math]::Round((Get-Item $backupJsonFile).Length / 1MB, 2)
        Write-Host "[OK] JSON Data Backup created via API: $backupJsonFile ($jsonMB MB)" -ForegroundColor Green
        $backupCreated = $true
    } catch {
        $httpStatus = $null
        if ($_.Exception.Response) { $httpStatus = [int]$_.Exception.Response.StatusCode }
        if ($httpStatus -eq 401) {
            Write-Host "[ERROR] The API rejected the admin key. Check Admin:ApiKey in appsettings.Development.json (or LIFEPULSE_ADMIN_KEY)." -ForegroundColor Red
        } elseif ($httpStatus -eq 503) {
            Write-Host "[ERROR] Admin endpoints are disabled on the API: Admin:ApiKey is not configured there." -ForegroundColor Red
        } elseif ($httpStatus) {
            Write-Host "[ERROR] Backup API returned HTTP $httpStatus. Falling back to CLI tools..." -ForegroundColor Red
        } else {
            Write-Host "[INFO] API server not reachable at $ApiBaseUrl. Start the backend (dotnet run) or install pg_dump. Falling back to CLI tools..." -ForegroundColor Gray
        }
    }

    # -- 3. Attempt pg_dump SQL Export ----------------------------------------------
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
            Write-Host "[OK] SQL Backup created via pg_dump: $sqlFile ($sqlMB MB)" -ForegroundColor Green
            $backupCreated = $true
        } elseif ($dumpOutput -match "version mismatch") {
            Write-Host "[WARN] pg_dump version mismatch detected with Neon server version." -ForegroundColor Yellow
        }
    }

    if (-not $backupCreated) {
        Write-Host "[TIP] To generate backups: Ensure backend server is running ($ApiBaseUrl) or PostgreSQL pg_dump is installed." -ForegroundColor Yellow
    }

    # -- 4. Storage & Quota Health Report -------------------------------------------
    Write-Host "-----------------------------------------------------------" -ForegroundColor Gray
    Write-Host "Quota & Storage Health Report:" -ForegroundColor Cyan

    $usedMB = [math]::Round($dbSizeBytes / 1MB, 2)
    $percentUsed = [math]::Round(($usedMB / $QuotaLimitMB) * 100, 1)
    $statusColor = if ($percentUsed -ge $WarningThresholdPercent) { "Red" } else { "Green" }

    Write-Host "   Database Size: $dbSizeFormatted ($usedMB MB / $QuotaLimitMB MB limit)" -ForegroundColor $statusColor
    Write-Host "   Quota Usage:   $percentUsed% of Neon free tier limit" -ForegroundColor $statusColor

    if ($tableCounts.Count -gt 0) {
        Write-Host "   Table Records:" -ForegroundColor Gray
        foreach ($k in $tableCounts.Keys) {
            Write-Host "     - ${k}: $($tableCounts[$k]) rows" -ForegroundColor Gray
        }
    }

    if ($percentUsed -ge $WarningThresholdPercent) {
        Write-Host ""
        Write-Host "[WARN] WARNING: Database storage ($percentUsed%) has reached the warning threshold ($WarningThresholdPercent%)!" -ForegroundColor Red
        Write-Host "   Back up your data and remove large media attachments or old records before hitting Neon's 500 MB quota." -ForegroundColor Red
    } else {
        Write-Host "[OK] Database storage is healthy within free-tier quota limits." -ForegroundColor Green
    }

    Write-Host "===========================================================" -ForegroundColor Cyan

    if ($Continuous) {
        Write-Host "Continuous mode: Next automatic backup in $IntervalMinutes minute(s)... (Press Ctrl+C to stop)" -ForegroundColor Yellow
        Start-Sleep -Seconds ($IntervalMinutes * 60)
    }

} while ($Continuous)
