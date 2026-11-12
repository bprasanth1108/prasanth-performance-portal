# setup-ports.ps1
# Run ONCE as Administrator to forward standard ports to Node's unprivileged ports.
# Reads HTTP_PORT and HTTPS_PORT from backend/.env automatically.
# After this, the app is reachable at https://<this-machine-name> (no port number).
#
# Usage:
#   Right-click PowerShell → Run as Administrator
#   cd "C:\Users\Prasanth Kumar B\Documents\jtl-super-app"
#   .\scripts\setup-ports.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile   = Join-Path $ScriptDir "..\backend\.env"

# ── Read ports from .env ──────────────────────────────────────────────────────
$httpPort  = 3001
$httpsPort = 3443

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*HTTP_PORT\s*=\s*(\d+)')  { $httpPort  = [int]$Matches[1] }
    if ($_ -match '^\s*HTTPS_PORT\s*=\s*(\d+)') { $httpsPort = [int]$Matches[1] }
  }
}

$hostname = $env:COMPUTERNAME

Write-Host ""
Write-Host "  Prasanth's Performance Portal — Port Forwarding Setup" -ForegroundColor Cyan
Write-Host "  ──────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "  Machine  : $hostname" -ForegroundColor Gray
Write-Host "  443  -->  $httpsPort  (HTTPS)" -ForegroundColor Gray
Write-Host "  80   -->  $httpPort   (HTTP redirect)" -ForegroundColor Gray
Write-Host ""

# ── Add port proxy rules ──────────────────────────────────────────────────────
Write-Host "  Adding port proxy: 443 → $httpsPort (HTTPS) ..." -ForegroundColor Yellow
netsh interface portproxy add v4tov4 `
    listenport=443 listenaddress=0.0.0.0 `
    connectport=$httpsPort connectaddress=127.0.0.1

Write-Host "  Adding port proxy: 80  → $httpPort (HTTP redirect) ..." -ForegroundColor Yellow
netsh interface portproxy add v4tov4 `
    listenport=80 listenaddress=0.0.0.0 `
    connectport=$httpPort connectaddress=127.0.0.1

# ── Allow inbound through Windows Firewall ────────────────────────────────────
Write-Host "  Adding firewall rules ..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="Prasanth Performance Portal HTTPS" 2>$null | Out-Null
netsh advfirewall firewall delete rule name="Prasanth Performance Portal HTTP"  2>$null | Out-Null
netsh advfirewall firewall add rule name="Prasanth Performance Portal HTTPS" `
    dir=in action=allow protocol=TCP localport=443 | Out-Null
netsh advfirewall firewall add rule name="Prasanth Performance Portal HTTP" `
    dir=in action=allow protocol=TCP localport=80 | Out-Null

# ── Show result ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Current portproxy rules:" -ForegroundColor Green
netsh interface portproxy show v4tov4

Write-Host ""
Write-Host "  Done! Start the backend, then open:" -ForegroundColor Green
Write-Host "  --> https://$hostname" -ForegroundColor Cyan
Write-Host ""
Write-Host "  On first visit: click Advanced → Proceed to $hostname" -ForegroundColor Gray
Write-Host "  (self-signed certificate — expected for LAN use)" -ForegroundColor Gray
Write-Host ""
