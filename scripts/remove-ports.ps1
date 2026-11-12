# remove-ports.ps1
# Removes the port forwarding rules created by setup-ports.ps1.
# Run as Administrator if you want to revert.

Write-Host ""
Write-Host "  Removing port proxy rules ..." -ForegroundColor Yellow
netsh interface portproxy delete v4tov4 listenport=443 listenaddress=0.0.0.0
netsh interface portproxy delete v4tov4 listenport=80  listenaddress=0.0.0.0

Write-Host "  Removing firewall rules ..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="Prasanth Performance Portal HTTPS" | Out-Null
netsh advfirewall firewall delete rule name="Prasanth Performance Portal HTTP"  | Out-Null

Write-Host "  Done. Port forwarding removed." -ForegroundColor Green
Write-Host ""
