$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$address = 'http://127.0.0.1:8766'
$status = $null
try {
    $status = Invoke-RestMethod -Uri "$address/api/status" -TimeoutSec 2
} catch {
    $pythonApp = (Get-Command python -ErrorAction Stop).Source
    $pythonWindowless = Join-Path (Split-Path $pythonApp) 'pythonw.exe'
    if (Test-Path -LiteralPath $pythonWindowless) { $pythonApp = $pythonWindowless }
    $arguments = '"' + (Join-Path $appRoot 'server.py') + '"'
    Start-Process -FilePath $pythonApp -ArgumentList $arguments -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $appRoot 'servidor.log') -RedirectStandardError (Join-Path $appRoot 'servidor-error.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        try { $status = Invoke-RestMethod -Uri "$address/api/status" -TimeoutSec 1; break } catch {}
    }
}
if (-not $status) { throw 'No se pudo iniciar la app en el puerto 8766.' }
if ($status.app -ne 'spanstories-glb') { throw 'El puerto 8766 está ocupado por otra aplicación.' }
Start-Process $address
