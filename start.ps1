$ErrorActionPreference = "Stop"

if (-not $env:GROQ_API_KEY) {
    $secretFile = Join-Path $PSScriptRoot "secret.txt"
    if (Test-Path -LiteralPath $secretFile) {
        $secretLine = Get-Content -LiteralPath $secretFile -Raw
        if ($secretLine -notmatch '^\s*\$env:GROQ_API_KEY\s*=\s*"([^"]+)"\s*$') {
            throw "secret.txt must contain one line in the form: `$env:GROQ_API_KEY = `"your-key`""
        }
        $env:GROQ_API_KEY = $Matches[1]
    }
}

if (-not $env:GROQ_API_KEY) {
    throw "Set GROQ_API_KEY in this PowerShell session or add it to secret.txt, then run start.ps1."
}

$python = Join-Path $PSScriptRoot "pip\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    $python = (Get-Command py.exe -ErrorAction SilentlyContinue).Source
}
if (-not $python) {
    throw "Python was not found. Install Python or create the project's pip virtual environment."
}

& $python (Join-Path $PSScriptRoot "min.py")
exit $LASTEXITCODE
